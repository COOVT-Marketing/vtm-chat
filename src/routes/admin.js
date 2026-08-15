const express = require('express');
const db = require('../lib/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const auditService = require('../lib/auditService');

const router = express.Router();

router.use(requireAuth, requireRole('SUPERADMIN'));

router.get('/users', (req, res) => {
  const users = db
    .prepare('SELECT id, email, display_name as displayName, role, is_active as isActive, created_at as createdAt FROM users ORDER BY created_at DESC')
    .all();
  res.json(users);
});

router.patch('/users/:id/deactivate', (req, res) => {
  db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(req.params.id);
  auditService.logAction(req.user.id, 'DEACTIVATE_USER', 'user', req.params.id);
  res.json({ ok: true });
});

router.patch('/users/:id/role', (req, res) => {
  const role = req.body.role;
  if (!['USER', 'SUPERADMIN'].includes(role)) {
    return res.status(400).json({ error: true, message: 'Invalid role', code: 400 });
  }
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
  auditService.logAction(req.user.id, 'CHANGE_ROLE', 'user', req.params.id, { newRole: role });
  res.json({ ok: true });
});

router.get('/channels', (req, res) => {
  res.json(auditService.auditListAllChannels(req.user.id));
});

router.get('/channels/:id/messages', (req, res) => {
  res.json(auditService.auditGetChannelMessages(req.user.id, req.params.id));
});

router.get('/search', (req, res) => {
  const q = String(req.query.q || '');
  if (q.length < 2) return res.status(400).json({ error: true, message: 'Query too short', code: 400 });
  res.json(auditService.auditSearchAllMessages(req.user.id, q));
});

router.get('/audit-log', (req, res) => {
  res.json(auditService.getAuditLog(200));
});

module.exports = router;
