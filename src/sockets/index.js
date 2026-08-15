const db = require('../lib/db');
const { makeId } = require('../lib/id');
const socketAuthMiddleware = require('./socketAuth');
const channelService = require('../lib/channelService');

function registerSocketHandlers(io) {
  io.use(socketAuthMiddleware);

  io.on('connection', (socket) => {
    const userId = socket.user.id;
    const isAdmin = socket.user.role === 'SUPERADMIN';
    socket.join(`user:${userId}`);

    socket.on('channel:join', (channelId) => {
      if (!channelService.isMember(channelId, userId)) {
        return socket.emit('error', { message: 'Not a member of this channel' });
      }
      socket.join(channelId);
    });

    socket.on('channel:leave', (channelId) => socket.leave(channelId));

    // ---------------- Messaging ----------------
    socket.on('message:send', ({ channelId, body, attachments = [], replyToId = null, kind = 'TEXT' }, ack) => {
      try {
        if (!channelService.isMember(channelId, userId)) {
          return ack?.({ error: 'Not a member of this channel' });
        }
        if (!body?.trim() && attachments.length === 0) return ack?.({ error: 'Empty message' });

        if (replyToId) {
          const parent = db.prepare('SELECT channel_id FROM messages WHERE id = ?').get(replyToId);
          if (!parent || parent.channel_id !== channelId) replyToId = null;
        }

        const messageId = makeId('msg');
        const tx = db.transaction(() => {
          db.prepare(
            `INSERT INTO messages (id, channel_id, author_id, body, reply_to_id, kind) VALUES (?, ?, ?, ?, ?, ?)`
          ).run(messageId, channelId, userId, body?.trim() || null, replyToId, kind);

          for (const a of attachments) {
            db.prepare(
              `INSERT INTO attachments (id, message_id, url, file_name, mime_type, size_bytes, duration_seconds) VALUES (?, ?, ?, ?, ?, ?, ?)`
            ).run(makeId('att'), messageId, a.url, a.fileName, a.mimeType, a.sizeBytes, a.durationSeconds || null);
          }
        });
        tx();

        const message = db.prepare(`SELECT * FROM messages WHERE id = ?`).get(messageId);
        const author = db.prepare('SELECT display_name, avatar_url FROM users WHERE id = ?').get(userId);
        const atts = db.prepare('SELECT * FROM attachments WHERE message_id = ?').all(messageId);

        let replyTo = null;
        if (replyToId) {
          replyTo = db
            .prepare(
              `SELECT m.id, m.body, m.kind, u.display_name as authorName FROM messages m
               JOIN users u ON u.id = m.author_id WHERE m.id = ?`
            )
            .get(replyToId);
        }

        const payload = {
          ...message,
          authorName: author.display_name,
          authorAvatar: author.avatar_url,
          attachments: atts,
          reactions: [],
          replyTo,
        };

        io.to(channelId).emit('message:new', payload);
        ack?.({ ok: true, message: payload });
      } catch (err) {
        console.error('message:send error', err);
        ack?.({ error: 'Failed to send message' });
      }
    });

    // Soft-delete: message author, or any superadmin, may delete.
    // Superadmin deletions are audit-logged (same disclosed-access
    // principle as reads) rather than silently indistinguishable from the
    // author deleting their own message.
    socket.on('message:delete', ({ messageId }, ack) => {
      try {
        const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
        if (!message) return ack?.({ error: 'Message not found' });

        const isOwn = message.author_id === userId;
        if (!isOwn && !isAdmin) return ack?.({ error: 'Not authorized to delete this message' });

        db.prepare(`UPDATE messages SET deleted_at = datetime('now') WHERE id = ?`).run(messageId);

        if (!isOwn && isAdmin) {
          db.prepare(
            `INSERT INTO audit_log (id, actor_id, action, target_type, target_id) VALUES (?, ?, 'DELETE_MESSAGE', 'message', ?)`
          ).run(makeId('aud'), userId, messageId);
        }

        io.to(message.channel_id).emit('message:deleted', { messageId, channelId: message.channel_id });
        ack?.({ ok: true });
      } catch (err) {
        console.error('message:delete error', err);
        ack?.({ error: 'Failed to delete message' });
      }
    });

    socket.on('message:react', ({ messageId, emoji }) => {
      try {
        const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
        if (!message) return;
        if (!channelService.isMember(message.channel_id, userId)) return;

        const existing = db
          .prepare('SELECT id FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?')
          .get(messageId, userId, emoji);

        if (existing) {
          db.prepare('DELETE FROM reactions WHERE id = ?').run(existing.id);
          io.to(message.channel_id).emit('message:reaction:removed', { messageId, userId, emoji });
        } else {
          db.prepare('INSERT INTO reactions (id, message_id, user_id, emoji) VALUES (?, ?, ?, ?)').run(
            makeId('rxn'), messageId, userId, emoji
          );
          io.to(message.channel_id).emit('message:reaction:added', { messageId, userId, emoji });
        }
      } catch (err) {
        console.error('message:react error', err);
      }
    });

    socket.on('message:read', ({ channelId }) => {
      if (!channelService.isMember(channelId, userId)) return;
      db.prepare(
        `UPDATE channel_members SET last_read_at = datetime('now') WHERE channel_id = ? AND user_id = ?`
      ).run(channelId, userId);
      socket.to(channelId).emit('presence:read', { userId, channelId, at: new Date().toISOString() });
    });

    socket.on('typing:start', ({ channelId }) => socket.to(channelId).emit('typing:start', { userId, channelId }));
    socket.on('typing:stop', ({ channelId }) => socket.to(channelId).emit('typing:stop', { userId, channelId }));

    // ---------------- WebRTC call signaling ----------------
    // Thin relay: the server never inspects call contents, just forwards
    // signaling payloads between the two participants' personal rooms.
    // Uses a public STUN server (configured client-side) for NAT traversal;
    // no TURN relay is included, so calls between peers behind strict/
    // symmetric NATs (common on some corporate networks) may not connect.
    socket.on('call:signal', ({ toUserId, data }) => {
      if (!toUserId || !data) return;
      io.to(`user:${toUserId}`).emit('call:signal', {
        fromUserId: userId,
        fromName: socket.user.display_name,
        data,
      });
    });

    socket.on('disconnect', () => {
      // Presence cleanup hook point if you add online/offline indicators later
    });
  });
}

module.exports = registerSocketHandlers;
