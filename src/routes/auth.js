const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const rateLimit = require('express-rate-limit');
const db = require('../lib/db');
const { makeId } = require('../lib/id');
const { signToken } = require('../lib/jwt');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: true, message: 'Too many login attempts, try again later', code: 429 },
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(2).max(50),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/', // must be explicit — otherwise the default path derives from
             // /api/auth/login and the cookie never reaches other routes
};

function toPublicUser(u) {
  return {
    id: u.id,
    email: u.email,
    displayName: u.display_name,
    role: u.role,
    themePref: u.theme_pref,
    avatarUrl: u.avatar_url,
  };
}

router.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: true, message: 'Invalid input', code: 400, details: parsed.error.flatten() });
  }
  const { email, password, displayName } = parsed.data;

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return res.status(409).json({ error: true, message: 'Email already registered', code: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const userId = makeId('usr');
  db.prepare(
    `INSERT INTO users (id, email, password_hash, display_name, role) VALUES (?, ?, ?, ?, 'USER')`
  ).run(userId, email, passwordHash, displayName);

  const general = db.prepare(`SELECT id FROM channels WHERE name = 'general' AND type = 'CHANNEL' LIMIT 1`).get();
  if (general) {
    db.prepare(`INSERT INTO channel_members (id, channel_id, user_id) VALUES (?, ?, ?)`).run(
      makeId('mem'), general.id, userId
    );
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const token = signToken(user);
  res.cookie('token', token, COOKIE_OPTS);
  res.status(201).json(toPublicUser(user));
});

router.post('/login', loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: true, message: 'Invalid input', code: 400 });
  const { email, password } = parsed.data;

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !user.is_active) {
    return res.status(401).json({ error: true, message: 'Invalid credentials', code: 401 });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: true, message: 'Invalid credentials', code: 401 });

  const token = signToken(user);
  res.cookie('token', token, COOKIE_OPTS);
  res.json(toPublicUser(user));
});

router.post('/logout', (req, res) => {
  res.clearCookie('token', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' });
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json(toPublicUser(req.user));
});

router.patch('/me/theme', requireAuth, (req, res) => {
  const theme = String(req.body.themePref || '').toUpperCase();
  if (!['DARK', 'LIGHT'].includes(theme)) {
    return res.status(400).json({ error: true, message: 'Invalid theme', code: 400 });
  }
  db.prepare('UPDATE users SET theme_pref = ? WHERE id = ?').run(theme, req.user.id);
  res.json({ themePref: theme });
});

module.exports = router;
