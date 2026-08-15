const express = require('express');
const { z } = require('zod');
const db = require('../lib/db');
const { requireAuth } = require('../middleware/auth');
const channelService = require('../lib/channelService');

const router = express.Router();

const createChannelSchema = z.object({
  name: z.string().min(1).max(80),
  type: z.enum(['CHANNEL', 'GROUP_DM']).default('CHANNEL'),
  isPrivate: z.boolean().default(false),
  memberIds: z.array(z.string()).default([]),
});

router.get('/', requireAuth, (req, res) => {
  res.json(channelService.getUserChannels(req.user.id));
});

router.post('/', requireAuth, (req, res) => {
  const parsed = createChannelSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: true, message: 'Invalid input', code: 400, details: parsed.error.flatten() });
  }
  const channel = channelService.createChannel({ ...parsed.data, createdById: req.user.id });
  res.status(201).json(channel);
});

router.post('/dm/:userId', requireAuth, (req, res) => {
  const otherUserId = req.params.userId;
  if (otherUserId === req.user.id) {
    return res.status(400).json({ error: true, message: 'Cannot DM yourself', code: 400 });
  }
  const channel = channelService.getOrCreateDM(req.user.id, otherUserId);
  res.status(201).json(channel);
});

router.get('/:id/messages', requireAuth, (req, res) => {
  const channelId = req.params.id;
  if (!channelService.isMember(channelId, req.user.id)) {
    return res.status(403).json({ error: true, message: 'Not a member of this channel', code: 403 });
  }
  res.json(loadMessages(channelId));
});

function loadMessages(channelId) {
  const messages = db
    .prepare(
      `SELECT m.*, u.display_name as authorName, u.avatar_url as authorAvatar FROM messages m
       JOIN users u ON u.id = m.author_id
       WHERE m.channel_id = ? AND m.deleted_at IS NULL
       ORDER BY m.created_at ASC LIMIT 200`
    )
    .all(channelId);

  const messageIds = messages.map((m) => m.id);
  const placeholders = messageIds.map(() => '?').join(',');

  const attachments = messageIds.length
    ? db.prepare(`SELECT * FROM attachments WHERE message_id IN (${placeholders})`).all(...messageIds)
    : [];
  const reactions = messageIds.length
    ? db.prepare(`SELECT * FROM reactions WHERE message_id IN (${placeholders})`).all(...messageIds)
    : [];

  const replyIds = [...new Set(messages.map((m) => m.reply_to_id).filter(Boolean))];
  const replySources = replyIds.length
    ? db
        .prepare(
          `SELECT m.id, m.body, m.kind, u.display_name as authorName FROM messages m
           JOIN users u ON u.id = m.author_id WHERE m.id IN (${replyIds.map(() => '?').join(',')})`
        )
        .all(...replyIds)
    : [];
  const replyMap = Object.fromEntries(replySources.map((r) => [r.id, r]));

  return messages.map((m) => ({
    ...m,
    attachments: attachments.filter((a) => a.message_id === m.id),
    reactions: reactions.filter((r) => r.message_id === m.id),
    replyTo: m.reply_to_id ? replyMap[m.reply_to_id] || null : null,
  }));
}

router.get('/users/directory', requireAuth, (req, res) => {
  const users = db
    .prepare('SELECT id, display_name as displayName, avatar_url as avatarUrl, role FROM users WHERE id != ? AND is_active = 1')
    .all(req.user.id);
  res.json(users);
});

module.exports = router;
