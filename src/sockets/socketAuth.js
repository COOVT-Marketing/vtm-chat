const cookie = require('cookie');
const { verifyToken } = require('../lib/jwt');
const db = require('../lib/db');

function socketAuthMiddleware(socket, next) {
  try {
    const rawCookie = socket.handshake.headers.cookie;
    if (!rawCookie) return next(new Error('unauthorized'));

    const parsed = cookie.parse(rawCookie);
    const token = parsed.token;
    if (!token) return next(new Error('unauthorized'));

    const payload = verifyToken(token);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub);
    if (!user || !user.is_active) return next(new Error('unauthorized'));

    socket.user = user;
    next();
  } catch (err) {
    next(new Error('unauthorized'));
  }
}

module.exports = socketAuthMiddleware;
