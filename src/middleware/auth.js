const { verifyToken } = require('../lib/jwt');
const db = require('../lib/db');

function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ error: true, message: 'Not authenticated', code: 401 });

    const payload = verifyToken(token);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub);
    if (!user || !user.is_active) {
      return res.status(401).json({ error: true, message: 'Not authenticated', code: 401 });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: true, message: 'Invalid or expired session', code: 401 });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ error: true, message: 'Forbidden', code: 403 });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
