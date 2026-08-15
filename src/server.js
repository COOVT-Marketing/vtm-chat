require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { Server } = require('socket.io');

// Auto-run seed script on server boot to create/grant Admin role
try {
  const seed = require('./lib/seed');
  if (typeof seed === 'function') {
    seed();
  }
  console.log('[SEED] Admin initialization executed successfully.');
} catch (err) {
  console.error('[SEED ERROR] Failed to run seed script:', err.message);
}

const authRoutes = require('./routes/auth');
const channelRoutes = require('./routes/channels');
const uploadRoutes = require('./routes/uploads');
const adminRoutes = require('./routes/admin');
const registerSocketHandlers = require('./sockets');

const app = express();
const server = http.createServer(app);

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || '*';
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../uploads');
const PUBLIC_DIR = path.join(__dirname, '../public');

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use('/uploads', express.static(UPLOAD_DIR));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/admin', adminRoutes);

// Static assets (css/js/images) + index.html at "/"
app.use(express.static(PUBLIC_DIR));

// Clean URLs: /login, /register, /admin instead of *.html
app.get('/login', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'register.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin.html')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({
    error: true,
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message,
    code: err.status || 500,
  });
});

const io = new Server(server, {
  cors: { origin: '*', credentials: true },
});
registerSocketHandlers(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`VTM Chat running on :${PORT}`));
