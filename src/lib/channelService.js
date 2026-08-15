const db = require('../lib/db');
const { makeId } = require('../lib/id');

// ---------------------------------------------------------------------
// DESIGN NOTE ON ADMIN AUTO-JOIN:
// When a private group (isPrivate=true, or type GROUP_DM) is created, every
// SUPERADMIN is added as a normal channel_members row — same as any other
// member. This means: they show up in the member list, they count toward
// the member count everyone sees, and their presence is NOT hidden or
// spoofed in any way. This is different from a "stealth" implementation
// (which would fake the member count / suppress the admin's read receipts
// to hide their presence from the team) — here it's simply company policy
// that admins sit in every group, same as e.g. an IT admin being added to
// every shared mailbox. Public #channels are untouched by this — admins
// already have full audit-logged access to those via the audit path
// (see auditService.js) without needing a membership row at all.
// ---------------------------------------------------------------------

function getAllSuperadminIds() {
  return db.prepare(`SELECT id FROM users WHERE role = 'SUPERADMIN' AND is_active = 1`).all().map((r) => r.id);
}

function createChannel({ name, type, isPrivate, createdById, memberIds = [] }) {
  const channelId = makeId('chn');
  let uniqueMemberIds = Array.from(new Set([createdById, ...memberIds]));

  // Visible admin auto-join: only for private groups, not public #channels.
  if (isPrivate || type === 'GROUP_DM') {
    uniqueMemberIds = Array.from(new Set([...uniqueMemberIds, ...getAllSuperadminIds()]));
  }

  const insertChannel = db.prepare(
    `INSERT INTO channels (id, name, type, is_private, created_by) VALUES (?, ?, ?, ?, ?)`
  );
  const insertMember = db.prepare(
    `INSERT INTO channel_members (id, channel_id, user_id) VALUES (?, ?, ?)`
  );

  const tx = db.transaction(() => {
    insertChannel.run(channelId, name, type, isPrivate ? 1 : 0, createdById);
    for (const uid of uniqueMemberIds) {
      insertMember.run(makeId('mem'), channelId, uid);
    }
  });
  tx();

  return getChannelWithMembers(channelId);
}

function getChannelWithMembers(channelId) {
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
  if (!channel) return null;
  const members = db
    .prepare(
      `SELECT cm.user_id as userId, u.id, u.display_name as displayName, u.avatar_url as avatarUrl, u.role as role
       FROM channel_members cm JOIN users u ON u.id = cm.user_id WHERE cm.channel_id = ?`
    )
    .all(channelId);
  return { ...serializeChannel(channel), members };
}

function serializeChannel(c) {
  return {
    id: c.id,
    name: c.name,
    type: c.type,
    isPrivate: !!c.is_private,
    createdById: c.created_by,
    createdAt: c.created_at,
  };
}

function getUserChannels(userId) {
  const channels = db
    .prepare(
      `SELECT c.* FROM channels c
       JOIN channel_members cm ON cm.channel_id = c.id
       WHERE cm.user_id = ?
       ORDER BY c.created_at DESC`
    )
    .all(userId);

  return channels.map((c) => {
    const members = db
      .prepare(
        `SELECT cm.user_id as userId, u.display_name as displayName, u.avatar_url as avatarUrl, u.role as role
         FROM channel_members cm JOIN users u ON u.id = cm.user_id WHERE cm.channel_id = ?`
      )
      .all(c.id);
    return { ...serializeChannel(c), members, memberCount: members.length };
  });
}

function isMember(channelId, userId) {
  const row = db
    .prepare('SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?')
    .get(channelId, userId);
  return !!row;
}

function getOrCreateDM(userId, otherUserId) {
  const existing = db
    .prepare(
      `SELECT c.id FROM channels c
       WHERE c.type = 'DM'
       AND EXISTS (SELECT 1 FROM channel_members WHERE channel_id = c.id AND user_id = ?)
       AND EXISTS (SELECT 1 FROM channel_members WHERE channel_id = c.id AND user_id = ?)
       LIMIT 1`
    )
    .get(userId, otherUserId);

  if (existing) return getChannelWithMembers(existing.id);

  // 1:1 DMs are NOT auto-joined by admins — that would make every private
  // conversation a group, which isn't what "admin joins groups" means.
  // Admins still have full audit-logged read access to DMs via the audit
  // path if ever needed for compliance; see auditService.js.
  const channelId = makeId('chn');
  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO channels (id, name, type, is_private, created_by) VALUES (?, 'dm', 'DM', 1, ?)`).run(
      channelId, userId
    );
    db.prepare(`INSERT INTO channel_members (id, channel_id, user_id) VALUES (?, ?, ?)`).run(makeId('mem'), channelId, userId);
    db.prepare(`INSERT INTO channel_members (id, channel_id, user_id) VALUES (?, ?, ?)`).run(makeId('mem'), channelId, otherUserId);
  });
  tx();

  return getChannelWithMembers(channelId);
}

module.exports = {
  createChannel,
  getUserChannels,
  isMember,
  getOrCreateDM,
  getChannelWithMembers,
  serializeChannel,
  getAllSuperadminIds,
};
