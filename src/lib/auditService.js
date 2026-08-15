const db = require('../lib/db');
const { makeId } = require('../lib/id');

function logAction(actorId, action, targetType, targetId, metadata) {
  db.prepare(
    `INSERT INTO audit_log (id, actor_id, action, target_type, target_id, metadata) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(makeId('aud'), actorId, action, targetType, targetId, metadata ? JSON.stringify(metadata) : null);
}

function auditGetChannelMessages(actorId, channelId) {
  logAction(actorId, 'VIEW_CHANNEL', 'channel', channelId);
  return db
    .prepare(
      `SELECT m.*, u.display_name as authorName FROM messages m
       JOIN users u ON u.id = m.author_id
       WHERE m.channel_id = ? AND m.deleted_at IS NULL
       ORDER BY m.created_at ASC`
    )
    .all(channelId);
}

function auditSearchAllMessages(actorId, query) {
  logAction(actorId, 'SEARCH', 'global', 'all', { query });
  return db
    .prepare(
      `SELECT m.*, u.display_name as authorName, c.name as channelName FROM messages m
       JOIN users u ON u.id = m.author_id
       JOIN channels c ON c.id = m.channel_id
       WHERE m.body LIKE ? AND m.deleted_at IS NULL
       ORDER BY m.created_at DESC LIMIT 200`
    )
    .all(`%${query}%`);
}

function auditListAllChannels(actorId) {
  logAction(actorId, 'LIST_CHANNELS', 'global', 'all');
  return db
    .prepare(
      `SELECT c.*, u.display_name as creatorName,
        (SELECT COUNT(*) FROM channel_members WHERE channel_id = c.id) as memberCount,
        (SELECT COUNT(*) FROM messages WHERE channel_id = c.id) as messageCount
       FROM channels c JOIN users u ON u.id = c.created_by
       ORDER BY c.created_at DESC`
    )
    .all();
}

function getAuditLog(limit = 200) {
  return db
    .prepare(
      `SELECT a.*, u.display_name as actorName, u.email as actorEmail FROM audit_log a
       JOIN users u ON u.id = a.actor_id
       ORDER BY a.created_at DESC LIMIT ?`
    )
    .all(limit);
}

module.exports = { logAction, auditGetChannelMessages, auditSearchAllMessages, auditListAllChannels, getAuditLog };
