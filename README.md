# VTM Chat — Professional Edition

Self-hosted team chat for Vocal Tech Marketing — channels, private groups, DMs, replies, reactions, voice messages, and 1:1 video calling. Zero licensing cost; runs as a single Node process with SQLite, no Docker/Postgres/Redis required.

## ⚠️ Read this before deploying

**Do not deploy this to Vercel, Netlify, or any serverless platform.** This app needs one long-running process (for the SQLite file and Socket.io connections) — serverless platforms spin up fresh, stateless instances per request, which silently wipes your database and breaks login, admin access, and real-time messaging. See "Where to host it" below for what actually works.

**Video calling and voice messages require HTTPS in production.** Browsers block microphone/camera access (`getUserMedia`) on any origin that isn't `https://` or `localhost`. If you're testing on plain HTTP on a remote server, calls and voice recording will fail with a permissions error — this isn't a bug, it's a browser security requirement. The Cloudflare Tunnel setup below gives you HTTPS automatically.

---

## What's new in this version

- **Groups**: private, invite-only channels. When a group is created, every Superadmin is added as a normal, visible member — shown in the member list like anyone else, counted in the member count. Nothing about their presence is hidden. Public `#channels` are untouched by this; admins access those (and DMs) through the audit-logged admin console instead of forced membership.
- **Replies**: click reply on any message to quote it; the quoted snippet shows above the new message.
- **Delete**: message authors can delete their own messages. Superadmins can delete any message — logged to the audit trail, same disclosed-access principle as reads.
- **Reactions**: hover a message to reveal a quick-react button with an emoji picker.
- **Voice messages**: mic button records audio in-browser (MediaRecorder API) and sends it as a playable voice note.
- **1:1 video calling**: WebRTC peer-to-peer, signaled over the existing Socket.io connection. See limitations below.
- **Clean URLs**: `/login`, `/register`, `/admin` instead of `.html` paths.
- **Logo + visual polish**: sidebar branding, hover states, reply/reaction/delete UI, call overlay.

### Honest limitations (things a "proper MS Teams/Skype" would also need, not included here)

- **Video calling is 1:1 only, peer-to-peer.** Group video calls need a media server (SFU) — meshing more than 2-3 peers directly gets expensive on bandwidth/CPU fast. Not included; would be a separate project (e.g. integrating LiveKit or mediasoup).
- **No TURN server**, so calls between two people both behind strict/symmetric NATs (some corporate networks, some VPNs) may fail to connect directly. A small self-hosted Coturn instance or a paid TURN provider would fix this if you hit it.
- **No message editing** (delete + resend works for now; edit-in-place isn't built).
- **No @mentions or push notifications.**
- **No SSO** — email/password only.

None of these are hard to add later; flagging them now so "professional chat app" doesn't imply more than what's actually shipped.

---

## Where to host it (persistent process required)

- **Your own VICIdial server / any spare box** — free, since you already run it.
- **Oracle Cloud "Always Free" tier** — genuinely free forever VPS (4 ARM CPUs, 24GB RAM).
- **Render.com / Railway** — cheap (~$1–7/mo) with a persistent disk. Skip their free tiers for this app — free-tier disks are ephemeral and will wipe your database on redeploy, same problem as Vercel.

The rest of this guide assumes a VPS/server you control.

## 1. Install Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # v20+
```

## 2. Deploy the code

```bash
scp -r vtm-chat-free/ youruser@your-server-ip:/opt/vtm-chat
ssh youruser@your-server-ip
cd /opt/vtm-chat
npm install
```

## 3. Configure environment

```bash
cp .env.example .env
nano .env
```

Set:
```
JWT_SECRET=<run: openssl rand -hex 32>
CLIENT_ORIGIN=https://chat.vocaltechmarketing.com
SUPERADMIN_EMAIL=admin@vocaltechmarketing.com
SUPERADMIN_PASSWORD=<strong password>
SUPERADMIN_NAME=Shayan Abbas
```

## 4. Seed the database

```bash
npm run seed
```

Creates the superadmin account and `#general`. If you promoted a different account to superadmin previously via a manual DB edit, that's fine too — `npm run seed` only creates an account if `SUPERADMIN_EMAIL` doesn't already exist.

## 5. Run it with PM2

```bash
sudo npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # follow the printed instructions
```

## 6. Expose it at chat.vocaltechmarketing.com via Cloudflare Tunnel (free HTTPS)

```bash
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb

cloudflared tunnel login
cloudflared tunnel create vtm-chat
cloudflared tunnel route dns vtm-chat chat.vocaltechmarketing.com
```

`/etc/cloudflared/config.yml`:
```yaml
tunnel: vtm-chat
credentials-file: /root/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: chat.vocaltechmarketing.com
    service: http://localhost:3000
  - service: http_status:404
```

```bash
sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

This gives you real HTTPS at the edge (required for calls/mic access) without managing a certificate yourself.

## 7. Verify

- `https://chat.vocaltechmarketing.com` → dark-mode login, logo visible
- Log in as superadmin → `/admin` should load (not redirect)
- Register a second test account, create a group with it → confirm the admin shows up in the member list
- Try: send a message, reply to it, react to it, delete it, record a voice note, and — from two different browsers/devices — start a 1:1 video call

## Backups

```bash
cp data/vtm-chat.db backups/vtm-chat-$(date +%F).db
```

## Updating

```bash
cd /opt/vtm-chat
git pull   # or re-upload
npm install
pm2 restart vtm-chat
```

## Legal note on admin access

Full audit-logged access to channels/DMs, plus visible auto-join to private groups, is disclosed monitoring — not hidden. Before rolling this out to real staff, it's worth having employment counsel confirm what notice satisfies your jurisdiction's requirements (this isn't legal advice, just a step worth doing before go-live).
