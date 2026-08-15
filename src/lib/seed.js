require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./db');
const { makeId } = require('./id');

async function main() {
  const email = process.env.SUPERADMIN_EMAIL;
  const password = process.env.SUPERADMIN_PASSWORD;
  const displayName = process.env.SUPERADMIN_NAME || 'System Admin';

  if (!email || !password) {
    console.error('SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD must be set in .env');
    process.exit(1);
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    console.log(`Superadmin already exists: ${email}`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const adminId = makeId('usr');

  db.prepare(
    `INSERT INTO users (id, email, password_hash, display_name, role) VALUES (?, ?, ?, ?, 'SUPERADMIN')`
  ).run(adminId, email, passwordHash, displayName);

  const channelId = makeId('chn');
  db.prepare(
    `INSERT INTO channels (id, name, type, is_private, created_by) VALUES (?, 'general', 'CHANNEL', 0, ?)`
  ).run(channelId, adminId);

  db.prepare(
    `INSERT INTO channel_members (id, channel_id, user_id) VALUES (?, ?, ?)`
  ).run(makeId('mem'), channelId, adminId);

  console.log(`Superadmin created: ${email}`);
  console.log(`Default channel created: #general`);
}

main();
