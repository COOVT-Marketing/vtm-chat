(() => {
'use strict';
window.VTM_BUILD = '3.1';                       // index.html is se check karta hai ke app.js purani to nahi reh gayi
const { SUPABASE_URL, SUPABASE_ANON_KEY, EMAIL_DOMAIN } = window.VTM_CONFIG;
const solo = new URLSearchParams(location.search).has('solo');   // ?solo = sirf is tab ka alag login (2nd account test karne ke liye)
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, solo ? { auth: { storage: sessionStorage, storageKey: 'vtm-solo-auth' } } : undefined);
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = { me: null, users: {}, rooms: {}, msgs: {}, more: {}, unread: {}, active: null, reply: null, file: null, online: new Set(), mode: 'login', react: {}, pins: {}, foreign: new Set(), maxId: 0, seen: new Set(), rtDown: false, rtTries: 0, ch: null, typing: {}, mentions: {}, voice: null, rate: 1, rec: null };
const coarse = matchMedia('(pointer:coarse)').matches;

/* ---------- helpers ---------- */
/* ---------- icons: custom SVG, follow theme colours (no emoji) ---------- */
const svg = (d, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const I = {
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  back: svg('<path d="M15 5l-7 7 7 7"/>', 'ic'),
  reply: svg('<path d="M9 14L4 9l5-5"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>'),
  trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5"/>'),
  more: svg('<path d="M22 11v1a10 10 0 1 1-9-10M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01M16 5h6M19 2v6"/>'),
  ban: svg('<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>', 'ic'),
  chev: svg('<path d="M6 9l6 6 6-6"/>', 'ic'),
  copy: svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>'),
  clip: svg('<path d="M21.4 11.1l-8.5 8.5a5.5 5.5 0 0 1-7.8-7.8l8.5-8.5a3.7 3.7 0 0 1 5.2 5.2l-8.5 8.5a1.8 1.8 0 0 1-2.6-2.6l7.8-7.8"/>', 'ic'),
};
I.pin = svg('<path d="M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>');
I.cam = svg('<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>');
I.mic = svg('<path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z"/><path d="M19 11a7 7 0 0 1-14 0M12 18v3"/>');
I.play = svg('<path d="M8 5v14l11-7z"/>', 'play');
I.pause = svg('<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>', 'pause');
const TICK1 = svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 'tk');
const TICK2 = svg('<path d="M2 12.5l4.5 4.5L16 7.5"/><path d="M9.5 16.5l.5.5L21 7.5"/>', 'tk');
I.eye = svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>');
const RX = {
  like: { label: 'Like', c: '#4ea1ff', d: '<path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.3a2 2 0 0 0 2-1.7l1.4-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>' },
  love: { label: 'Love', c: '#ff5d73', d: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21.3l7.8-7.8 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>' },
  haha: { label: 'Haha', c: '#ffc83d', d: '<circle cx="12" cy="12" r="10"/><path d="M7.5 13h9a4.5 4.5 0 0 1-9 0zM9 9h.01M15 9h.01"/>' },
  wow:  { label: 'Wow', c: '#ffa23d', d: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="16" r="2.2"/><path d="M9 9h.01M15 9h.01"/>' },
  sad:  { label: 'Sad', c: '#8aa7ff', d: '<circle cx="12" cy="12" r="10"/><path d="M8 16s1.5-2 4-2 4 2 4 2M9 9h.01M15 9h.01"/>' },
  done: { label: 'Done', c: '#37d67a', d: '<circle cx="12" cy="12" r="10"/><path d="M7.5 12.5l3 3 6-7"/>' },
  fire: { label: 'Fire', c: '#ff8a3d', d: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>' },
  star: { label: 'Important', c: '#f5c542', d: '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>' },
};
const LEGACY = { '👍': 'like', '❤️': 'love', '❤': 'love', '😂': 'haha', '😮': 'wow', '😢': 'sad', '🙏': 'done' };   // purani reactions naye icons mein dikhengi
const rkey = e => RX[e] ? e : (LEGACY[e] || e);
const rIcon = k => RX[k] ? `<svg class="ri" style="color:${RX[k].c}" viewBox="0 0 24 24" aria-hidden="true">${RX[k].d}</svg>` : esc(k);
const rLabel = k => RX[k] ? RX[k].label : k;
const user = id => S.users[id] || { id, display_name: 'Someone', username: '?' };
const hue = s => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
const initials = n => n.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
const imgTag = u => u ? `<img src="${esc(u)}" alt="" loading="lazy" onerror="this.remove()">` : '';   // photo na khule to initials dikhte rehte hain
const avatar = (u, cls = '') => `<span class="av ${cls}" style="background:hsl(${hue(u.id)} 38% 40%)">${esc(initials(u.display_name))}${imgTag(u.avatar_url)}</span>`;
const groupAv = (r, cls = '') => `<span class="av ${cls}" style="background:hsl(${hue(r.id)} 38% 40%)">#${imgTag(r.avatar_url)}</span>`;
const other = r => user(r.members.find(id => id !== S.me.id) || S.me.id);
const title = r => r.type === 'dm' ? other(r).display_name : r.name;
const hm = t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const sameDay = (a, b) => a.toDateString() === b.toDateString();
const short = t => { const d = new Date(t); return sameDay(d, new Date()) ? hm(t) : d.toLocaleDateString([], { day: 'numeric', month: 'short' }); };
const dayLabel = d => { const n = new Date(); if (sameDay(d, n)) return 'Today'; n.setDate(n.getDate() - 1); return sameDay(d, n) ? 'Yesterday' : d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' }); };
const linkify = t => esc(t).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
const mentionsMe = m => m.user_id !== S.me.id && (m.mention_all || (m.mentions || []).includes(S.me.id));
const reEsc = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const linkHtml = h => h.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
function richText(m) {                 // text escape -> @mentions highlight -> links
  let t = esc(m.body);
  const names = (m.mentions || []).map(id => S.users[id]).filter(Boolean).map(u => u.display_name);
  if (m.mention_all) names.push('all');
  if (names.length) {
    const re = new RegExp('@(' + names.sort((a, b) => b.length - a.length).map(n => reEsc(esc(n))).join('|') + ')(?![\\w])', 'gi');
    t = t.replace(re, x => `<span class="mention ${m.mention_all && x.toLowerCase() === '@all' ? 'all' : ''} ${(m.mentions || []).includes(S.me.id) && x.toLowerCase() === '@' + esc(S.me.display_name).toLowerCase() ? 'me' : ''}">${x}</span>`);
  }
  return linkHtml(t);
}
const isVoice = m => !!m.file_url && (m.file_type || '').startsWith('audio/');
function fmtSecs(n) { n = Math.max(0, Math.round(n || 0)); return Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0'); }
const preview = m => m.deleted_at ? 'This message was deleted' : (m.body || (isVoice(m) ? 'Voice message (' + fmtSecs(m.file_secs) + ')' : 'Attachment: ' + (m.file_name || 'file')));
let toastT; const toast = t => { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 3500); };

/* ---------- theme ---------- */
const setTheme = t => { document.documentElement.dataset.theme = t; localStorage.setItem('vtm-theme', t); };
setTheme(localStorage.getItem('vtm-theme') || 'dark');
$('#themeBtn').onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');

/* ---------- sound + notifications + badges ---------- */
let ac, swReg;
const unlock = () => { if (!ac && navigator.userActivation && !navigator.userActivation.hasBeenActive) return; try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); ac.resume && ac.resume(); } catch {} };
addEventListener('click', unlock); addEventListener('keydown', unlock);
function ding() {
  if (!ac || ac.state !== 'running') return;
  const t = ac.currentTime;
  [880, 1175].forEach((f, i) => {
    const o = ac.createOscillator(), g = ac.createGain(), s = t + i * .12;
    o.frequency.value = f; g.gain.setValueAtTime(.0001, s);
    g.gain.exponentialRampToValueAtTime(.18, s + .02); g.gain.exponentialRampToValueAtTime(.0001, s + .25);
    o.connect(g); g.connect(ac.destination); o.start(s); o.stop(s + .3);
  });
}
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(r => swReg = r).catch(() => {});
  navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.room && S.rooms[e.data.room]) openRoom(e.data.room); });
}
const logoImg = new Image(); logoImg.src = 'images/icon-192.png?v=2'; logoImg.onload = () => updateBadges();
function updateBadges() {
  const t = Object.values(S.unread).reduce((a, b) => a + b, 0);
  document.title = (t ? `(${t}) ` : '') + 'VTM Chat';
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  if (logoImg.complete) x.drawImage(logoImg, 0, 0, 64, 64);
  if (t) {
    x.fillStyle = '#ff4d3d'; x.beginPath(); x.arc(42, 22, 21, 0, 7); x.fill();
    x.fillStyle = '#fff'; x.font = 'bold 26px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(t > 99 ? '99+' : t, 42, 23);
  }
  $('#favicon').href = c.toDataURL('image/png');
  try { Promise.resolve(t ? navigator.setAppBadge && navigator.setAppBadge(t) : navigator.clearAppBadge && navigator.clearAppBadge()).catch(() => {}); } catch {}
}
async function notifyAway(head, body, tag, room, silent) {
  const away = document.hidden || !document.hasFocus();
  if (!away || !('Notification' in window) || Notification.permission !== 'granted') return;
  const opts = { body, icon: 'images/icon-192.png?v=2', badge: 'images/icon-192.png?v=2', tag, data: { room }, silent: !!silent };
  try { const reg = swReg || await navigator.serviceWorker.ready; await reg.showNotification(head, opts); }
  catch { try { new Notification(head, opts); } catch {} }
}
async function alertUser(m) {
  ding();
  const r = S.rooms[m.room_id], u = user(m.user_id);
  notifyAway(mentionsMe(m) && r ? `${u.display_name} mentioned you in ${r.name}` : r && r.type === 'group' ? `${u.display_name} · ${r.name}` : u.display_name, preview(m), 'm' + m.id, m.room_id);
}
// message delete hone par purani OS notification ko "deleted" notice se badal do
async function retract(m) {
  try {
    const reg = swReg || await navigator.serviceWorker.ready;
    const old = await reg.getNotifications({ tag: 'm' + m.id });
    if (!old.length) return;
    old.forEach(n => n.close());
    notifyAway(user(m.user_id).display_name, 'This message was deleted', 'd' + m.id, m.room_id, true);
  } catch {}
}
function banner() {
  const b = $('#notifBanner'), p = 'Notification' in window ? Notification.permission : 'unsupported';
  b.hidden = p === 'granted' || p === 'unsupported';
  b.querySelector('span').textContent = p === 'denied' ? 'Notifications are blocked. Please allow them in the browser site settings.' : 'Are you on another tab/window? Do you want a message alert there too?';
  b.querySelector('button').hidden = p === 'denied';
}
$('#notifBanner button').onclick = () => { unlock(); Notification.requestPermission().then(banner); };

/* ---------- auth ---------- */
const authErr = t => $('#authErr').textContent = t || '';
function setMode(m) {
  S.mode = m; $('#auth').classList.toggle('signup', m === 'signup');
  $('#authTitle').textContent = m === 'login' ? 'Welcome back' : 'Create Account';
  $('#authSub').textContent = m === 'login' ? 'Sign in to your account' : 'New Account with the invite code!';
  $('#authBtn').textContent = m === 'login' ? 'Sign in' : 'Sign up';
  $('#authSwitch').textContent = m === 'login' ? 'Need an account? Sign up' : 'Already have an account? Sign in';
  $('#fPass').autocomplete = m === 'login' ? 'current-password' : 'new-password'; authErr('');
}
$('#authSwitch').onclick = () => setMode(S.mode === 'login' ? 'signup' : 'login');
$('#authForm').onsubmit = async e => {
  e.preventDefault(); authErr();
  const u = $('#fUser').value.trim().toLowerCase(), password = $('#fPass').value;
  if (!/^[a-z0-9._-]{3,20}$/.test(u)) return authErr('Username 3-20 characters: a-z, 0-9, . _ -');
  const email = `${u}@${EMAIL_DOMAIN}`, btn = $('#authBtn'); btn.disabled = true;
  const r = S.mode === 'login'
    ? await sb.auth.signInWithPassword({ email, password })
    : await sb.auth.signUp({ email, password, options: { data: { display_name: $('#fName').value.trim() || u, invite: $('#fInvite').value.trim() } } });
  btn.disabled = false;
  if (r.error) return authErr(S.mode === 'login' ? 'Incorrect username or password.' : 'Sign-up failed: The invite code is incorrect, or the username already exists.');
  if (!r.data.session) return authErr('Select "Confirm Email" in Subbase (see the step in the guide).');
  boot(r.data.session.user);
};
$('#logout').onclick = async () => { await sb.auth.signOut(); location.hash = ''; location.reload(); };

/* ---------- boot / data ---------- */
async function refreshUsers() {
  const { data } = await sb.from('profiles').select('*');
  S.users = Object.fromEntries((data || []).map(p => [p.id, p]));
}
async function loadRooms() {
  const RSEL = 'id,name,type,created_by,created_at,room_members(user_id,last_read_at)';
  let [{ data: mine, error: e1 }, { data: un }, { data: pins }] = await Promise.all([
    sb.from('room_members').select(`rooms(${RSEL.replace('created_at,', 'created_at,avatar_url,')})`).eq('user_id', S.me.id),
    sb.rpc('unread_counts'),
    sb.from('chat_pins').select('room_id,pinned_at')]);
  if (e1) ({ data: mine } = await sb.from('room_members').select(`rooms(${RSEL})`).eq('user_id', S.me.id));   // SQL abhi update na hui ho to purana tareeqa
  S.pins = Object.fromEntries((pins || []).map(p => [p.room_id, p.pinned_at]));
  const rs = (mine || []).map(x => x.rooms).filter(Boolean);
  S.unread = {}; S.mentions = {}; (un || []).forEach(r => { S.unread[r.room_id] = Number(r.n); if (Number(r.m)) S.mentions[r.room_id] = Number(r.m); });
  const lasts = await Promise.all(rs.map(r => sb.from('messages').select('*').eq('room_id', r.id).order('created_at', { ascending: false }).limit(1)));
  rs.forEach((r, i) => { r.members = r.room_members.map(m => m.user_id); r.last = (lasts[i].data || [])[0] || null; r.reads = Object.fromEntries(r.room_members.map(m => [m.user_id, m.last_read_at])); if (r.last && r.last.id > S.maxId) S.maxId = r.last.id; S.rooms[r.id] = r; });
  renderRooms(); updateBadges();
}
async function boot(authUser) {
  await refreshUsers(); S.me = S.users[authUser.id];
  if (!S.me) { await sb.auth.signOut(); $('#auth').hidden = false; return authErr('Profile not found. Sign Up again!.'); }
  if (S.me.approved === false) return showPending();
  $('#auth').hidden = true; $('#app').hidden = false;
  $('#meAv').innerHTML = avatar(S.me); $('#admBtn').hidden = !S.me.is_admin; $('#meName').textContent = S.me.display_name;
  console.info('VTM Chat build 3.1'); updatePending();
  const { data: mx } = await sb.from('messages').select('id').order('id', { ascending: false }).limit(1); S.maxId = (mx && mx[0] && mx[0].id) || 0;
  await loadRooms(); subscribe(); presence(); banner();
  const h = (location.hash.match(/room=([\w-]+)/) || [])[1];
  if (h && S.rooms[h]) openRoom(h); else if (!coarse && S.rooms['00000000-0000-0000-0000-000000000001']) openRoom('00000000-0000-0000-0000-000000000001');
}
function presence() {
  const ch = sb.channel('presence', { config: { presence: { key: S.me.id } } });
  ch.on('presence', { event: 'sync' }, () => { S.online = new Set(Object.keys(ch.presenceState())); renderRooms(); if (S.active) header(); if (A.open && A.tab === 'users' && !A.view) drawAdmin(); })
    .subscribe(st => { if (st === 'SUBSCRIBED') ch.track({ at: Date.now() }); });
}
// lamba khula rehne wale tab ka login-token expire ho jata hai aur realtime chup-chaap band ho jata hai: pehle token taza karo
async function rtAuth() { try { const { data } = await sb.auth.getSession(); if (data.session) sb.realtime.setAuth(data.session.access_token); } catch {} }
const connBanner = down => { $('#conn').hidden = !down; };
const RT_RETRY = window.VTM_CONFIG.RT_RETRY_MS || 12000, TYPING_MS = window.VTM_CONFIG.TYPING_MS || 4500, MIN_VOICE_MS = window.VTM_CONFIG.MIN_VOICE_MS ?? 700, MAX_VOICE_S = 300, RT_BANNER = window.VTM_CONFIG.RT_BANNER_MS || 6000;
async function subscribe() {
  if (subscribe.busy) return; subscribe.busy = true;
  try {
  clearTimeout(S.rtT); await rtAuth();
  const old = S.ch; S.ch = null;
  if (old) { try { await sb.removeChannel(old); } catch {} }      // pehle purana POORI tarah band, phir naya
  const ch = sb.channel('db-' + Math.random().toString(36).slice(2, 8)); S.ch = ch;   // har baar alag naam (same naam purane ki "leave" se naye ko gira deta tha)
  ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, p => onMsg(p.new))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, p => onUpdate(p.new))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'room_members', filter: `user_id=eq.${S.me.id}` }, async () => { await refreshUsers(); await loadRooms(); })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'room_members' }, p => { const r = S.rooms[p.new.room_id]; if (r && !r.members.includes(p.new.user_id)) { r.members.push(p.new.user_id); r.reads = r.reads || {}; r.reads[p.new.user_id] = p.new.last_read_at; if (S.active === r.id) header(); } })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'room_members' }, p => { const r = S.rooms[p.new.room_id]; if (!r) return; r.reads = r.reads || {}; r.reads[p.new.user_id] = p.new.last_read_at; if (p.new.room_id === S.active) renderMsgs(); })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'profiles' }, p => {
      S.users[p.new.id] = p.new; usersChanged();
      if (S.me.is_admin && p.new.approved === false) { const n = `${p.new.display_name} is waiting for approval`; toast(n); ding(); notifyAway('New signup', n, 'su' + p.new.id, null); }
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, p => {
      const u = S.users[p.new.id]; if (u) Object.assign(u, p.new); else S.users[p.new.id] = p.new;
      if (p.new.id === S.me.id) { if (p.new.approved === false) return location.reload(); Object.assign(S.me, p.new); }
      usersChanged();
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms' }, p => { const r = S.rooms[p.new.id]; if (!r) return; r.name = p.new.name; r.avatar_url = p.new.avatar_url; renderRooms(); if (S.active === r.id) header(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'typing_status' }, p => onTyping(p.new))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, p => onReact(p))
    .subscribe((status, err) => {
      if (ch !== S.ch) return;                                    // purane channel ki late awaaz ignore
      console.info('realtime:', status, err || '');
      if (status === 'SUBSCRIBED') { S.rtTries = 0; clearTimeout(S.rtT); clearTimeout(S.rtB); connBanner(false); if (S.rtDown) { S.rtDown = false; resync(); } }
      else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
        // supabase-js khud dobara judta hai; hum tab dakhal dete hain jab wo grace time mein na jude (aur har baar zyada intezar)
        S.rtDown = true; clearTimeout(S.rtB); S.rtB = setTimeout(() => connBanner(true), RT_BANNER);
        clearTimeout(S.rtT); S.rtT = setTimeout(subscribe, Math.min(60000, RT_RETRY * 2 ** S.rtTries++));
      }
    });
  } finally { subscribe.busy = false; }
}
const viewing = id => S.active === id && !document.hidden;
async function onMsg(m) {
  if (S.seen.has(m.id)) return; S.seen.add(m.id); if (m.id > S.maxId) S.maxId = m.id;
  if (S.typing[m.room_id] && S.typing[m.room_id][m.user_id]) { delete S.typing[m.room_id][m.user_id]; setTimeout(renderTyping, 0); }   // message aa gaya = typing khatam
  if (!S.users[m.user_id]) await refreshUsers();
  if (!S.rooms[m.room_id]) {
    if (S.me.is_admin) {   // admin ko sab rooms ke messages milte hain; jo room uska nahi, wo sirf console mein dikhta hai
      if (S.foreign.has(m.room_id)) return adminLive(m);
      const { data } = await sb.from('room_members').select('room_id').eq('room_id', m.room_id).eq('user_id', S.me.id);
      if (!(data && data.length)) { S.foreign.add(m.room_id); return adminLive(m); }
    }
    await loadRooms(); if (m.user_id !== S.me.id) alertUser(m); return;
  }
  adminLive(m);
  const list = S.msgs[m.room_id]; if (list && !list.some(x => x.id === m.id)) list.push(m);
  S.rooms[m.room_id].last = m;
  if (m.user_id !== S.me.id) {
    if (viewing(m.room_id)) { markRead(m.room_id); if (!document.hasFocus()) alertUser(m); }
    else { S.unread[m.room_id] = (S.unread[m.room_id] || 0) + 1; if (mentionsMe(m)) S.mentions[m.room_id] = (S.mentions[m.room_id] || 0) + 1; alertUser(m); }
  }
  if (m.room_id === S.active) renderMsgs(m.user_id === S.me.id);
  renderRooms(); updateBadges();
}
function onUpdate(m) {
  const list = S.msgs[m.room_id], i = list ? list.findIndex(x => x.id === m.id) : -1;
  const was = i > -1 ? list[i] : null, fresh = m.deleted_at && !(was && was.deleted_at);
  if (i > -1) list[i] = m;
  const r = S.rooms[m.room_id]; if (r && r.last && r.last.id === m.id) r.last = m;
  if (fresh && r) { retract(m); if (m.user_id !== S.me.id && S.unread[m.room_id] > 0) { S.unread[m.room_id]--; updateBadges(); } }
  if (fresh) adminDeleted(m);
  if (m.room_id === S.active) renderMsgs(); renderRooms();
}
// NOTE: Supabase queries sirf tab chalti hain jab await/.then ho. Pehle yahan await nahi tha, isi wajah se "read" server tak pahunchta hi nahi tha.
async function markRead(id) {
  if (S.unread[id] || S.mentions[id]) { S.unread[id] = 0; delete S.mentions[id]; updateBadges(); renderRooms(); }
  const { error } = await sb.rpc('mark_read', { r: id });
  if (error) { console.error('mark_read failed:', error); if (!markRead.warned) { markRead.warned = true; toast('Could not save read status: ' + error.message); } }
}
const refocus = () => { if (S.active && viewing(S.active) && S.unread[S.active]) markRead(S.active); };
addEventListener('focus', refocus); document.addEventListener('visibilitychange', refocus);

/* ---------- reliability: realtime toot jaye tab bhi message/notification na ruke ---------- */
async function resync() {
  if (!S.me) return;
  await rtAuth(); await loadRooms();
  if (S.active) { await loadMsgs(S.active); renderMsgs(); if (viewing(S.active)) markRead(S.active); }
}
async function poll() {                 // har 15 sec: naye messages + seen ticks (realtime ka backup)
  if (!S.me || poll.busy) return; poll.busy = true;
  try {
    poll.n = (poll.n || 0) + 1; if (poll.n % 4 === 0) await syncUsers();   // har ~1 minute: users ki list dobara
    const { data, error } = await sb.from('messages').select('*').gt('id', S.maxId).order('id', { ascending: true }).limit(100);
    if (!error) for (const m of data || []) await onMsg(m);
    const r = S.rooms[S.active];
    if (r) {
      const { data: rm } = await sb.from('room_members').select('user_id,last_read_at').eq('room_id', r.id);
      let changed = false; r.reads = r.reads || {};
      (rm || []).forEach(x => { if (r.reads[x.user_id] !== x.last_read_at) { r.reads[x.user_id] = x.last_read_at; changed = true; } });
      if (changed) renderMsgs();
    }
  } catch (e) { console.warn('poll failed:', e.message || e); }
  poll.busy = false;
}
function showPending() {
  $('#auth').hidden = true; $('#app').hidden = true; $('#pending').hidden = false;
  const check = async () => { const { data } = await sb.from('profiles').select('approved').eq('id', S.me.id).maybeSingle(); if (data && data.approved) location.reload(); };
  $('#pendCheck').onclick = async () => { await check(); toast('Not approved yet. We will let you in as soon as an admin approves.'); };
  $('#pendOut').onclick = async () => { await sb.auth.signOut(); location.reload(); };
  clearInterval(showPending.t); showPending.t = setInterval(check, 8000);
}
function updatePending() { const n = Object.values(S.users).filter(u => u.approved === false).length; $('#admBtn').dataset.n = S.me.is_admin ? n : 0; }
function usersChanged() {                 // naya user aaye / naam, photo ya approval badle to bina reload ke screen update ho
  if (S.users[S.me.id]) { Object.assign(S.me, S.users[S.me.id]); S.users[S.me.id] = S.me; }
  refreshIdentity(); updatePending();
  if (A.open && A.tab === 'users' && !A.view) drawAdmin();
  if (!$('#modal').hidden && $('#gname') && S.modalDraw) S.modalDraw();
}
async function syncUsers() {
  const sig = () => Object.values(S.users).map(u => [u.id, u.approved, u.display_name, u.avatar_url, u.is_admin].join()).sort().join('|');
  const before = sig(); await refreshUsers();
  const me = S.users[S.me.id]; if (me) { Object.assign(S.me, me); S.users[S.me.id] = S.me; }
  if (S.me.approved === false) return location.reload();
  if (sig() !== before) usersChanged();
}
setInterval(poll, 15000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) resync(); });
addEventListener('online', resync);
// dusra account isi browser mein login ho jaye to is tab ki pehchan na bigre
sb.auth.onAuthStateChange((ev, session) => {
  if (ev === 'SIGNED_OUT' && S.me) location.reload();
  else if (session && S.me && session.user.id !== S.me.id) { toast('Another account signed in on this browser. Switching…'); setTimeout(() => location.reload(), 900); }
  else if (ev === 'TOKEN_REFRESHED' && session) { try { sb.realtime.setAuth(session.access_token); } catch {} }
});

/* ---------- rendering ---------- */
function renderRooms() {
  const q = $('#q').value.toLowerCase(), act = r => new Date(r.last ? r.last.created_at : r.created_at);
  const all = Object.values(S.rooms).filter(r => title(r).toLowerCase().includes(q));
  const pinned = all.filter(r => S.pins[r.id]).sort((a, b) => new Date(S.pins[b.id]) - new Date(S.pins[a.id]));
  const rest = all.filter(r => !S.pins[r.id]).sort((a, b) => act(b) - act(a));
  const item = r => {
    const n = S.unread[r.id] || 0, l = r.last, dm = r.type === 'dm', o = dm && other(r), pin = !!S.pins[r.id];
    const pv = l ? (l.user_id === S.me.id && !l.deleted_at ? 'You: ' : '') + preview(l) : 'No messages yet';
    return `<button class="room ${n ? 'unread' : ''} ${r.id === S.active ? 'active' : ''}" data-room="${r.id}">
      <span class="avw">${dm ? avatar(o) : groupAv(r)}${dm && S.online.has(o.id) ? '<i class="dot"></i>' : ''}</span>
      <span class="rbody"><span class="rtop"><span class="rname">${esc(title(r))}</span><time>${l ? short(l.created_at) : ''}</time></span>
      <span class="rbot"><span class="rprev ${typingText(r) ? 'typing' : ''}">${esc(typingText(r) || pv)}</span>${n ? `${S.mentions[r.id] ? '<b class="at" title="You were mentioned">@</b>' : ''}<b class="cnt" aria-label="${n} unread">${n > 99 ? '99+' : n}</b>` : pin ? `<span class="pin-ic">${I.pin}</span>` : ''}</span></span>
      <span class="room-pin ${pin ? 'on' : ''}" data-pin="${r.id}" role="button" aria-label="${pin ? 'Unpin chat' : 'Pin chat'}" title="${pin ? 'Unpin' : 'Pin to top'}">${I.pin}</span></button>`;
  };
  const html = (pinned.length ? `<div class="grp-h">Pinned</div>${pinned.map(item).join('')}${rest.length ? '<div class="grp-h">Chats</div>' : ''}` : '') + rest.map(item).join('');
  $('#roomList').innerHTML = html || '<p class="muted pad">No chat found</p>';
}
async function togglePin(id) {
  const was = !!S.pins[id];
  if (was) delete S.pins[id]; else S.pins[id] = new Date().toISOString();
  renderRooms();
  const { error } = was ? await sb.from('chat_pins').delete().eq('room_id', id).eq('user_id', S.me.id) : await sb.from('chat_pins').upsert({ room_id: id, user_id: S.me.id });
  if (error) { toast('Could not ' + (was ? 'unpin' : 'pin') + ' this chat'); if (was) S.pins[id] = new Date().toISOString(); else delete S.pins[id]; renderRooms(); }
}
$('#q').oninput = renderRooms;
$('#roomList').onclick = e => {
  const p = e.target.closest('[data-pin]'); if (p) { e.stopPropagation(); return togglePin(p.dataset.pin); }
  const b = e.target.closest('[data-room]'); if (b && Date.now() - lpFired > 700) openRoom(b.dataset.room);
};

const typingNames = id => Object.entries(S.typing[id] || {}).filter(([, t]) => t > Date.now()).map(([u]) => user(u).display_name.split(' ')[0]);
function typingText(r) {
  const n = typingNames(r.id); if (!n.length) return '';
  return r.type === 'dm' ? 'typing…' : n.length === 1 ? `${n[0]} is typing…` : n.length === 2 ? `${n[0]} and ${n[1]} are typing…` : `${n.length} people are typing…`;
}
function renderTyping() { renderRooms(); if (S.active) header(); }
function onTyping(row) {
  if (!row || row.user_id === S.me.id || !S.rooms[row.room_id]) return;
  (S.typing[row.room_id] = S.typing[row.room_id] || {})[row.user_id] = Date.now() + TYPING_MS;
  renderTyping(); clearTimeout(onTyping.t); onTyping.t = setTimeout(renderTyping, TYPING_MS + 200);
}
function header() {
  const r = S.rooms[S.active]; if (!r) return;
  $('#membersBtn').hidden = r.type !== 'group';
  $('#hName').textContent = title(r);
  $('#hAv').innerHTML = r.type === 'dm' ? avatar(other(r)) : groupAv(r);
  $('#hSub').textContent = r.type === 'dm' ? (S.online.has(other(r).id) ? 'Online' : '@' + other(r).username) : r.members.map(id => user(id).display_name).join(', ');
  const tt = typingText(r), te = $('#typing');
  if (tt) $('#hSub').textContent = tt;
  $('#hSub').classList.toggle('typing', !!tt);
  te.hidden = !tt; te.innerHTML = tt ? `<span class="dots"><i></i><i></i><i></i></span><span>${esc(tt)}</span>` : '';
}
function voiceHtml(m) {
  return `<div class="voice" data-vid="${m.id}"><button class="v-play" data-v="play" aria-label="Play voice message">${I.play}${I.pause}</button><div class="v-bar" data-v="seek" role="slider" aria-label="Seek"><i></i></div><span class="v-time">${fmtSecs(m.file_secs)}</span><button class="v-speed" data-v="speed" aria-label="Playback speed">${S.rate}×</button></div>`;
}
const vMsg = id => (S.msgs[S.active] || []).find(x => x.id === id);
function voiceUI() {
  const v = S.voice; if (!v) return;
  const el = document.querySelector(`.voice[data-vid="${v.id}"]`); if (!el) return;
  const a = v.audio, dur = v.secs || a.duration || 1;
  el.classList.toggle('playing', !a.paused);
  el.querySelector('.v-bar i').style.width = Math.min(100, a.currentTime / dur * 100) + '%';
  el.querySelector('.v-time').textContent = fmtSecs(a.paused && !a.currentTime ? dur : a.currentTime);
}
function playVoice(id, at) {
  const m = vMsg(id); if (!m) return; let v = S.voice;
  if (!v || v.id !== id) {
    if (v) {                                                            // pehli awaaz band, naya shuru
      v.audio.pause(); v.audio.currentTime = 0;
      const old = document.querySelector(`.voice[data-vid="${v.id}"]`), om = vMsg(v.id); S.voice = null;
      if (old) { old.classList.remove('playing'); old.querySelector('.v-bar i').style.width = '0'; old.querySelector('.v-time').textContent = fmtSecs(om && om.file_secs); }
    }
    const audio = new Audio(m.file_url); audio.preload = 'metadata'; audio.playbackRate = S.rate;
    v = S.voice = { id, audio, secs: m.file_secs };
    ['timeupdate', 'play', 'pause'].forEach(ev => audio.addEventListener(ev, voiceUI));
    audio.addEventListener('ended', () => { audio.currentTime = 0; voiceUI(); });
  }
  if (at != null) v.audio.currentTime = at;
  if (v.audio.paused) v.audio.play().catch(() => toast('Could not play this voice message')); else if (at == null) v.audio.pause();
}
async function sendVoice(blob, secs, mime, room) {
  try {
    const ext = /mp4/.test(mime) ? 'm4a' : /ogg/.test(mime) ? 'ogg' : 'webm', type = mime.split(';')[0];
    const path = `voice/${S.me.id}-${Date.now()}.${ext}`;
    const up = await sb.storage.from('attachments').upload(path, blob, { contentType: type });
    if (up.error) throw up.error;
    const url = sb.storage.from('attachments').getPublicUrl(path).data.publicUrl;
    const { data, error } = await sb.from('messages').insert({ room_id: room, user_id: S.me.id, body: '', reply_to: S.reply && S.active === room ? S.reply.id : null, file_url: url, file_name: 'Voice message', file_type: type, file_secs: secs }).select().single();
    if (error) throw error;
    S.reply = null; extras(); onMsg(data); markRead(room);
  } catch (e) { toast('Voice message failed: ' + (e.message || e)); }
}
async function startRec() {
  if (S.rec || !S.active) return;
  if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) || !window.MediaRecorder) return toast('Voice recording is not supported in this browser');
  let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { return toast('Microphone access is blocked. Allow it from the address bar and try again.'); }
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find(t => MediaRecorder.isTypeSupported(t)) || '';
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined), chunks = [];
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  const r = S.rec = { rec, stream, chunks, room: S.active, t0: Date.now(), mime: rec.mimeType || mime || 'audio/webm' };
  r.timer = setInterval(() => { const sec = (Date.now() - r.t0) / 1000; $('#recTime').textContent = fmtSecs(sec); if (sec >= MAX_VOICE_S) stopRec(true); }, 250);
  rec.start(250); $('#recTime').textContent = '0:00'; $('.composer').classList.add('recording'); $('#recBar').hidden = false;
}
function stopRec(send) {
  const r = S.rec; if (!r) return; S.rec = null; clearInterval(r.timer);
  $('.composer').classList.remove('recording'); $('#recBar').hidden = true;
  r.rec.onstop = async () => {
    r.stream.getTracks().forEach(t => t.stop());
    if (!send) return;
    const ms = Date.now() - r.t0; if (ms < MIN_VOICE_MS) return toast('Recording was too short');
    await sendVoice(new Blob(r.chunks, { type: r.mime.split(';')[0] }), Math.max(1, Math.round(ms / 1000)), r.mime, r.room);
  };
  try { r.rec.stop(); } catch { r.stream.getTracks().forEach(t => t.stop()); }
}
$('#micBtn').onclick = startRec; $('#recCancel').onclick = () => stopRec(false); $('#recSend').onclick = () => stopRec(true);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.rec) { e.stopPropagation(); stopRec(false); } }, true);
function readInfo(m, room) {
  const others = room.members.filter(id => id !== S.me.id), t = new Date(m.created_at);
  return { others, seen: others.filter(id => room.reads && room.reads[id] && new Date(room.reads[id]) >= t) };
}
function ticks(m, room) {              // WhatsApp/Teams jaisa: ek tick = sent, double tick = seen (blue = sab ne dekha)
  if (m.user_id !== S.me.id) return '';
  const { others, seen } = readInfo(m, room); if (!others.length) return '';
  const all = seen.length === others.length, dm = room.type === 'dm';
  const title = all ? (dm ? 'Seen' : 'Seen by everyone') : seen.length ? 'Seen by ' + seen.map(id => user(id).display_name).join(', ') : 'Sent';
  return `<span class="tick ${all ? 'seen' : ''}" title="${esc(title)}" aria-label="${esc(title)}">${(dm ? all : seen.length) ? TICK2 : TICK1}</span>`;
}
function showSeen(m) {
  const r = S.rooms[m.room_id], { others, seen } = readInfo(m, r), mm = $('#modal'); mm.hidden = false;
  const row = (id, ok) => `<div class="person" style="cursor:default">${avatar(user(id), 'sm')}<span class="grow"><b>${esc(user(id).display_name)}</b><small>${ok ? 'Seen' : 'Not seen yet'}</small></span><span class="tick ${ok ? 'seen' : ''}">${ok ? TICK2 : TICK1}</span></div>`;
  mm.innerHTML = `<div class="sheet" role="dialog"><header><b>Seen by ${seen.length} of ${others.length}</b><button class="icon-btn" data-x>${I.x}</button></header><div id="plist">${seen.map(id => row(id, true)).join('')}${others.filter(id => !seen.includes(id)).map(id => row(id, false)).join('')}</div></div>`;
  mm.onclick = e => { if (e.target === mm || e.target.closest('[data-x]')) mm.hidden = true; };
}
function rxHtml(mid) {
  const g = {}; for (const [uid, e] of Object.entries(S.react[mid] || {})) (g[e] = g[e] || []).push(uid);
  const ks = Object.keys(g); if (!ks.length) return '';
  return '<div class="rx">' + ks.map(e => `<button class="pill ${g[e].includes(S.me.id) ? 'me' : ''}" data-rx="${esc(e)}" title="${esc(rLabel(e) + ': ' + g[e].map(id => user(id).display_name).join(', '))}">${rIcon(e)}${g[e].length > 1 ? `<i>${g[e].length}</i>` : ''}</button>`).join('') + '</div>';
}
function msgHtml(m, mine, u, cont, room) {
  const grp = room.type === 'group';
  const head = !mine && grp ? (cont ? '<span class="av-sp"></span>' : avatar(u, 'sm')) : '';
  const who = !mine && grp && !cont ? `<b class="who">${esc(u.display_name)}</b>` : '';
  if (m.deleted_at) return `<div class="row ${mine ? 'mine' : ''} ${cont ? 'cont' : ''}" data-id="${m.id}">${head}<div class="bub del">${who}<span class="ban">${I.ban}</span><span>${mine ? 'You deleted this message' : 'This message was deleted'}</span><time>${hm(m.created_at)}</time></div></div>`;
  const rp = m.reply_to && (S.msgs[m.room_id] || []).find(x => x.id === m.reply_to);
  const quote = m.reply_to ? `<div class="quote"><b>${rp ? esc(user(rp.user_id).display_name) : 'Message'}</b><span>${rp ? esc(preview(rp)) : '…'}</span></div>` : '';
  const file = !m.file_url ? '' : isVoice(m) ? voiceHtml(m) : (m.file_type || '').startsWith('image/')
    ? `<a href="${esc(m.file_url)}" target="_blank" rel="noopener"><img class="pic" src="${esc(m.file_url)}" loading="lazy" alt=""></a>`
    : `<a class="filechip" href="${esc(m.file_url)}" target="_blank" rel="noopener">${I.clip} ${esc(m.file_name || 'file')}</a>`;
  return `<div class="row ${mine ? 'mine' : ''} ${cont ? 'cont' : ''}" data-id="${m.id}">${head}
    <div class="bub ${mentionsMe(m) ? 'to-me' : ''}">${who}${quote}${file}${m.body ? `<div class="txt">${richText(m)}</div>` : ''}<time>${hm(m.created_at)}${ticks(m, room)}</time>${rxHtml(m.id)}
    <button class="bub-menu" data-act="menu" aria-label="Message options" title="Options (or right-click)">${I.chev}</button></div></div>`;
}
function renderMsgs(stick) {
  const box = $('#msgs'), list = S.msgs[S.active] || [], room = S.rooms[S.active];
  const near = box.scrollHeight - box.scrollTop - box.clientHeight < 140;
  let html = S.more[S.active] ? '<button class="older" id="older">Load previous messages</button>' : '', prev = null;
  for (const m of list) {
    const d = new Date(m.created_at);
    if (!prev || !sameDay(prev.d, d)) html += `<div class="day"><span>${dayLabel(d)}</span></div>`;
    const cont = prev && prev.uid === m.user_id && sameDay(prev.d, d) && d - prev.d < 300000;
    html += msgHtml(m, m.user_id === S.me.id, user(m.user_id), cont, room);
    prev = { uid: m.user_id, d };
  }
  box.innerHTML = html || '<p class="muted pad">No messages yet. Say hello.</p>'; voiceUI();
  if (stick || near) box.scrollTop = box.scrollHeight;
}
async function loadMsgs(id, before) {
  let q = sb.from('messages').select('*').eq('room_id', id).order('created_at', { ascending: false }).limit(50);
  if (before) q = q.lt('created_at', before);
  const { data } = await q, rows = (data || []).reverse();
  S.msgs[id] = before ? [...rows, ...S.msgs[id]] : rows; S.more[id] = (data || []).length === 50;
  await loadReactions(rows.map(x => x.id));
}
async function openRoom(id) {
  S.active = id; S.reply = null; S.file = null; extras();
  $('#empty').hidden = true; $('#chat').hidden = false; $('#app').classList.add('chat-open');
  history.replaceState(null, '', '#room=' + id); header();
  if (!S.msgs[id]) await loadMsgs(id);
  if (S.active !== id) return;
  renderMsgs(true); markRead(id); renderRooms(); if (!coarse) $('#ta').focus();
}
$('#back').onclick = () => { $('#app').classList.remove('chat-open'); S.active = null; renderRooms(); };
$('#msgs').onclick = async e => {
  if (e.target.id === 'older') {
    const box = $('#msgs'), h = box.scrollHeight; await loadMsgs(S.active, S.msgs[S.active][0].created_at); renderMsgs(); box.scrollTop = box.scrollHeight - h; return;
  }
  const vb = e.target.closest('[data-v]');
  if (vb) {
    const vid = Number(vb.closest('.voice').dataset.vid), k = vb.dataset.v;
    if (k === 'play') playVoice(vid);
    else if (k === 'speed') { S.rate = S.rate === 1 ? 1.5 : S.rate === 1.5 ? 2 : 1; if (S.voice) S.voice.audio.playbackRate = S.rate; document.querySelectorAll('.v-speed').forEach(b => b.textContent = S.rate + '×'); }
    else if (k === 'seek') { const r = vb.getBoundingClientRect(), m = vMsg(vid), dur = (m && m.file_secs) || (S.voice && S.voice.audio.duration) || 1; playVoice(vid, Math.max(0, Math.min(1, (e.clientX - r.left) / (r.width || 1))) * dur); }
    return;
  }
  const row = e.target.closest('.row'), pill = e.target.closest('[data-rx]'), mb = e.target.closest('[data-act=menu]');
  if (pill && row) return react(Number(row.dataset.id), pill.dataset.rx);
  if (mb && row) { const m = rowMsg(row), r = mb.getBoundingClientRect(); if (m) ctxMenu(r.left, r.bottom + 4, m); }
};

/* ---------- right-click menu (Teams jaisa): reactions + Reply / Copy / Delete ---------- */
const rowMsg = row => (S.msgs[S.active] || []).find(x => x.id === Number(row.dataset.id));
const closeCtx = () => { $('#ctx').hidden = true; };
function ctxMenu(x, y, m) {
  const c = $('#ctx'), cur = (S.react[m.id] || {})[S.me.id];
  c.dataset.mid = m.id; c.dataset.sel = String(getSelection() || '').trim();
  c.innerHTML = `<div class="rrow">${Object.keys(RX).map(k => `<button data-k="${k}" class="${cur === k ? 'on' : ''}" title="${rLabel(k)}" aria-label="${rLabel(k)}">${rIcon(k)}</button>`).join('')}</div>
    <div class="menu"><button class="item" data-i="reply">${I.reply}<span>Reply</span></button>
    ${m.user_id === S.me.id && S.rooms[m.room_id].members.length > 1 ? `<button class="item" data-i="info">${I.eye}<span>Seen by</span></button>` : ''}
    ${m.body ? `<button class="item" data-i="copy">${I.copy}<span>Copy text</span></button>` : ''}
    ${m.user_id === S.me.id || S.me.is_admin ? `<button class="item danger" data-i="del">${I.trash}<span>Delete</span></button>` : ''}</div>`;
  c.hidden = false;
  const w = c.offsetWidth, h = c.offsetHeight;
  c.style.left = Math.max(8, Math.min(x, innerWidth - w - 8)) + 'px';
  c.style.top = Math.max(8, Math.min(y, innerHeight - h - 8)) + 'px';
}
$('#msgs').addEventListener('contextmenu', e => {
  const row = e.target.closest('.row[data-id]'); if (!row || e.target.closest('a')) return;
  const m = rowMsg(row); if (!m || m.deleted_at) return;
  e.preventDefault(); ctxMenu(e.clientX, e.clientY, m);
});
// phone/tablet: message ko dabaye rakhein (long-press)
let lpT, lpFired = 0; const lpStop = () => clearTimeout(lpT);
$('#msgs').addEventListener('touchstart', e => {
  const row = e.target.closest('.row[data-id]'); if (!row || e.target.closest('a')) return;
  const t = e.touches[0]; lpStop();
  lpT = setTimeout(() => { const m = rowMsg(row); if (m && !m.deleted_at) { lpFired = Date.now(); if (navigator.vibrate) navigator.vibrate(12); ctxMenu(t.clientX, t.clientY, m); } }, 480);
}, { passive: true });
['touchmove', 'touchend', 'touchcancel'].forEach(ev => $('#msgs').addEventListener(ev, lpStop, { passive: true }));
function roomMenu(x, y, r) {
  const c = $('#ctx'), pin = !!S.pins[r.id], n = S.unread[r.id] || 0;
  c.dataset.room = r.id; delete c.dataset.mid;
  c.innerHTML = `<div class="menu"><button class="item" data-ri="pin">${I.pin}<span>${pin ? 'Unpin chat' : 'Pin chat to top'}</span></button>${n ? `<button class="item" data-ri="read">${I.eye}<span>Mark as read</span></button>` : ''}</div>`;
  c.hidden = false; const w = c.offsetWidth, h = c.offsetHeight;
  c.style.left = Math.max(8, Math.min(x, innerWidth - w - 8)) + 'px'; c.style.top = Math.max(8, Math.min(y, innerHeight - h - 8)) + 'px';
}
$('#roomList').addEventListener('contextmenu', e => { const b = e.target.closest('[data-room]'); const r = b && S.rooms[b.dataset.room]; if (!r) return; e.preventDefault(); roomMenu(e.clientX, e.clientY, r); });
$('#roomList').addEventListener('touchstart', e => {
  const b = e.target.closest('[data-room]'); if (!b) return; const t = e.touches[0]; lpStop();
  lpT = setTimeout(() => { const r = S.rooms[b.dataset.room]; if (r) { lpFired = Date.now(); if (navigator.vibrate) navigator.vibrate(12); roomMenu(t.clientX, t.clientY, r); } }, 480);
}, { passive: true });
['touchmove', 'touchend', 'touchcancel'].forEach(ev => $('#roomList').addEventListener(ev, lpStop, { passive: true }));
$('#ctx').onclick = async e => {
  const ri = e.target.closest('[data-ri]');
  if (ri) { const rid = $('#ctx').dataset.room; closeCtx(); if (ri.dataset.ri === 'pin') togglePin(rid); else markRead(rid); return; }
  const c = $('#ctx'), k = e.target.closest('[data-k]'), it = e.target.closest('[data-i]'); if (!k && !it) return;
  const id = Number(c.dataset.mid), sel = c.dataset.sel, m = (S.msgs[S.active] || []).find(x => x.id === id); closeCtx(); if (!m) return;
  if (k) return react(id, k.dataset.k);
  if (it.dataset.i === 'reply') { S.reply = m; extras(); $('#ta').focus(); }
  else if (it.dataset.i === 'info') showSeen(m);
  else if (it.dataset.i === 'copy') { try { await navigator.clipboard.writeText(sel || m.body); toast('Copied'); } catch { toast('Could not copy'); } }
  else if (it.dataset.i === 'del' && await confirmDelete()) {
    const { data, error } = await sb.from('messages').update({ deleted_at: new Date().toISOString() }).eq('id', id).select().single();
    if (error) toast('Not deleted'); else onUpdate(data);
  }
};
document.addEventListener('click', e => { if (Date.now() - lpFired < 700) return; if (!e.target.closest('#ctx')) closeCtx(); }, true);
document.addEventListener('contextmenu', e => { if (!e.target.closest('#msgs .row[data-id]') && !e.target.closest('#roomList') && !e.target.closest('#ctx')) closeCtx(); }, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#ctx').hidden) { e.stopPropagation(); closeCtx(); } }, true);
$('#msgs').addEventListener('scroll', closeCtx, { passive: true });
addEventListener('resize', closeCtx); addEventListener('blur', closeCtx);

/* ---------- themed confirm dialog (browser ka default popup nahi) ---------- */
function confirmBox({ title, text, ok = 'Delete', icon = I.trash }) {
  return new Promise(res => {
    const m = $('#modal'); m.hidden = false;
    m.innerHTML = `<div class="sheet confirm" role="alertdialog" aria-labelledby="cTitle"><div class="c-ico">${icon}</div><h3 id="cTitle">${esc(title)}</h3><p>${esc(text)}</p><div class="c-btns"><button class="btn ghost" data-no>Cancel</button><button class="btn danger" data-yes>${esc(ok)}</button></div></div>`;
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } };
    const done = v => { m.hidden = true; m.onclick = null; document.removeEventListener('keydown', key, true); res(v); };
    document.addEventListener('keydown', key, true);
    m.onclick = e => { if (e.target === m || e.target.closest('[data-no]')) done(false); else if (e.target.closest('[data-yes]')) done(true); };
    m.querySelector('[data-no]').focus();
  });
}

const confirmDelete = () => confirmBox({ title: 'Delete message?', text: "This message will be removed for everyone in this chat. This can't be undone." });

/* ---------- reactions ---------- */
async function loadReactions(ids) {
  if (!ids.length) return;
  const { data } = await sb.from('reactions').select('message_id,user_id,emoji').in('message_id', ids);
  (data || []).forEach(r => { (S.react[r.message_id] = S.react[r.message_id] || {})[r.user_id] = rkey(r.emoji); });
}
function setReact(mid, uid, emoji) {
  const r = S.react[mid] = S.react[mid] || {};
  if (emoji) r[uid] = rkey(emoji); else delete r[uid];
  if ((S.msgs[S.active] || []).some(x => x.id === mid)) renderMsgs();
}
async function react(mid, emoji) {
  const cur = (S.react[mid] || {})[S.me.id];
  if (cur === emoji) {
    setReact(mid, S.me.id, null);
    const { error } = await sb.from('reactions').delete().eq('message_id', mid).eq('user_id', S.me.id);
    if (error) { toast('Reaction failed'); setReact(mid, S.me.id, emoji); }
  } else {
    setReact(mid, S.me.id, emoji);
    const { error } = await sb.from('reactions').upsert({ message_id: mid, user_id: S.me.id, emoji });
    if (error) { toast('Reaction failed'); setReact(mid, S.me.id, cur || null); }
  }
}
function onReact(p) {
  const row = p.eventType === 'DELETE' ? p.old : p.new; if (!row || !row.message_id) return;
  const had = (S.react[row.message_id] || {})[row.user_id]; if (row.emoji) row.emoji = rkey(row.emoji);
  if (p.eventType === 'DELETE') setReact(row.message_id, row.user_id, null);
  else { setReact(row.message_id, row.user_id, row.emoji); reactAlert(row, had); }
  if (A.open && A.view) drawList();
}
function reactAlert(row, had) {
  if (row.user_id === S.me.id || had === row.emoji) return;
  const m = Object.values(S.msgs).flat().find(x => x.id === row.message_id);
  if (!m || m.user_id !== S.me.id || m.deleted_at || viewing(m.room_id)) return;
  ding(); notifyAway(`${user(row.user_id).display_name} reacted: ${rLabel(row.emoji)}`, preview(m), 'r' + row.message_id + row.user_id, m.room_id);
}

/* ---------- composer ---------- */
function toggleMic() { $('.composer').classList.toggle('empty', !ta.value.trim() && !S.file); }
function extras() {
  toggleMic();
  const rb = $('#replyBar'), fp = $('#filePrev');
  rb.hidden = !S.reply; fp.hidden = !S.file;
  if (S.reply) { rb.innerHTML = `<div><b>${esc(user(S.reply.user_id).display_name)}</b> · ${esc(preview(S.reply))}</div><button class="icon-btn" data-x="reply" aria-label="Cancel reply">${I.x}</button>`; }
  if (S.file) { fp.innerHTML = `<div>${I.clip} ${esc(S.file.name)} (${(S.file.size / 1024).toFixed(0)} KB)</div><button class="icon-btn" data-x="file" aria-label="Remove file">${I.x}</button>`; }
}
$('#replyBar').onclick = e => { if (e.target.closest('[data-x]')) { S.reply = null; extras(); } };
$('#filePrev').onclick = e => { if (e.target.closest('[data-x]')) { S.file = null; $('#file').value = ''; extras(); } };
function pickFile(f) { if (!f) return; if (f.size > 10 * 1024 * 1024) return toast('The file must be smaller than 10 MB.'); S.file = f; extras(); }
$('#file').onchange = e => pickFile(e.target.files[0]);
const ta = $('#ta');
const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'; };
let lastPing = 0, lastPingRoom = null;
function typingPing() {                  // likhte waqt har ~2.5 sec mein ek baar doosron ko batao
  if (!S.active || !ta.value.trim()) return;
  const now = Date.now(); if (S.active === lastPingRoom && now - lastPing < 2500) return;
  lastPing = now; lastPingRoom = S.active; sb.rpc('typing', { r: S.active }).then(() => {}, () => {});
}
ta.oninput = () => { grow(); typingPing(); toggleMic(); updateMention(); };
function mentionInfo(body, room) {
  if (room.type !== 'group') return { mentions: [], all: false };
  let work = body.toLowerCase(); const ids = [];
  room.members.filter(id => id !== S.me.id).map(id => user(id)).sort((a, b) => b.display_name.length - a.display_name.length).forEach(u => {
    const needle = '@' + u.display_name.toLowerCase(); let i = work.indexOf(needle);
    while (i > -1) {
      const next = work[i + needle.length];
      if (!next || !/\w/.test(next)) { ids.push(u.id); work = work.slice(0, i) + ' '.repeat(needle.length) + work.slice(i + needle.length); break; }
      i = work.indexOf(needle, i + 1);
    }
  });
  return { mentions: [...new Set(ids)], all: /(^|\s)@all(?![\w])/i.test(body) };
}
const closeMention = () => { S.mn = null; $('#mention').hidden = true; };
function updateMention() {
  const r = S.rooms[S.active]; if (!r || r.type !== 'group') return closeMention();
  const pos = ta.selectionStart, hit = ta.value.slice(0, pos).match(/(^|\s)@([^\s@]*)$/); if (!hit) return closeMention();
  const q = hit[2].toLowerCase();
  const all = [{ id: 'all', name: 'all', sub: 'Notify everyone in this group' }, ...r.members.filter(id => id !== S.me.id).map(id => user(id)).map(u => ({ id: u.id, name: u.display_name, sub: '@' + u.username, u }))];
  const list = all.filter(x => !q || x.name.toLowerCase().includes(q) || (x.u && x.u.username.toLowerCase().startsWith(q))).slice(0, 6);
  if (!list.length) return closeMention();
  S.mn = { list, i: 0, start: pos - hit[2].length - 1, pos }; drawMention();
}
function drawMention() {
  const box = $('#mention'), mn = S.mn; if (!mn) return;
  box.innerHTML = mn.list.map((x, k) => `<button class="mn-item ${k === mn.i ? 'on' : ''}" data-k="${k}" role="option">${x.u ? avatar(x.u, 'sm') : `<span class="av sm mn-all">@</span>`}<span class="grow"><b>${esc(x.id === 'all' ? '@all' : x.name)}</b><small>${esc(x.sub)}</small></span></button>`).join('');
  box.hidden = false; box.style.bottom = ($('.composer').offsetHeight + 8) + 'px';
}
function pickMention(k) {
  const mn = S.mn; if (!mn) return; const x = mn.list[k], ins = '@' + x.name + ' ';
  ta.value = ta.value.slice(0, mn.start) + ins + ta.value.slice(mn.pos);
  const c = mn.start + ins.length; ta.focus(); ta.setSelectionRange(c, c); closeMention(); grow(); toggleMic();
}
$('#mention').onmousedown = e => { e.preventDefault(); const b = e.target.closest('[data-k]'); if (b) pickMention(Number(b.dataset.k)); };
ta.onclick = updateMention; ta.onblur = () => setTimeout(closeMention, 150);
ta.onkeydown = e => {
  if (S.mn) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); S.mn.i = (S.mn.i + (e.key === 'ArrowDown' ? 1 : S.mn.list.length - 1)) % S.mn.list.length; return drawMention(); }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); return pickMention(S.mn.i); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return closeMention(); }
  } if (e.key === 'Enter' && !e.shiftKey && !coarse) { e.preventDefault(); send(); } };
ta.onpaste = e => { const f = [...(e.clipboardData.files || [])][0]; if (f) { e.preventDefault(); pickFile(f); } };
$('#sendBtn').onclick = send;
async function send() {
  const body = ta.value.trim(); if ((!body && !S.file) || !S.active) return;
  const btn = $('#sendBtn'); btn.disabled = true;
  try {
    let f = {};
    if (S.file) {
      const path = `${S.me.id}/${Date.now()}-${S.file.name.replace(/[^\w.\-]+/g, '_')}`;
      const up = await sb.storage.from('attachments').upload(path, S.file, { contentType: S.file.type || undefined });
      if (up.error) throw up.error;
      f = { file_url: sb.storage.from('attachments').getPublicUrl(path).data.publicUrl, file_name: S.file.name, file_type: S.file.type };
    }
    const mi = mentionInfo(body, S.rooms[S.active]), extra = (mi.mentions.length || mi.all) ? { mentions: mi.mentions, mention_all: mi.all } : {};   // sirf tab bhejo jab mention ho
    const { data, error } = await sb.from('messages').insert({ room_id: S.active, user_id: S.me.id, body, reply_to: S.reply ? S.reply.id : null, ...f, ...extra }).select().single();
    if (error) throw error;
    ta.value = ''; grow(); S.reply = null; S.file = null; $('#file').value = ''; extras();
    onMsg(data); markRead(S.active); lastPing = 0;
  } catch (e) { toast('Send fail: ' + (e.message || e)); }
  btn.disabled = false; if (!coarse) ta.focus();
}

/* ---------- new chat modal ---------- */
$('#newBtn').onclick = () => {
  const m = $('#modal'); let tab = 'dm', role = 'all'; const sel = new Set();
  const people = () => Object.values(S.users).filter(u => u.id !== S.me.id && u.approved !== false).sort((a, b) => a.display_name.localeCompare(b.display_name));
  m.hidden = false;
  m.innerHTML = `<div class="sheet" role="dialog" aria-label="New chat"><header><b>New chat</b><button class="icon-btn" data-x>${I.x}</button></header>
    <div class="tabs"><button class="on" data-tab="dm">Direct message</button><button data-tab="grp">New group</button></div>
    <input id="gname" placeholder="Group Name" hidden><div class="chips" id="chips" hidden><button class="on" data-role="all">Everyone</button><button data-role="admin">Admins</button><button data-role="staff">Employees</button><button data-all>Select all shown</button></div><input id="mq" placeholder="Search logs…"><div id="plist"></div><button class="btn" id="mgo" hidden>Create group</button></div>`;
  const shown = () => people().filter(u => tab === 'dm' || role === 'all' || (role === 'admin') === !!u.is_admin);
  const count = () => { $('#mgo').textContent = sel.size ? `Create group (${sel.size})` : 'Create group'; };
  const draw = () => {
    const q = $('#mq').value.toLowerCase(); count();
    $('#plist').innerHTML = shown().filter(u => (u.display_name + u.username).toLowerCase().includes(q)).map(u =>
      `<label class="person" data-u="${u.id}">${avatar(u, 'sm')}<span class="grow"><b>${esc(u.display_name)}</b><small>@${esc(u.username)}</small></span>${tab === 'grp' ? `<input type="checkbox" ${sel.has(u.id) ? 'checked' : ''}>` : ''}</label>`).join('') || '<p class="muted pad">No one was found. If others sign up, they will appear here.</p>';
  };
  draw(); $('#mq').oninput = draw; S.modalDraw = draw;
  m.onclick = async e => {
    if (e.target === m || e.target.closest('[data-x]')) { m.hidden = true; return; }
    const t = e.target.closest('[data-tab]');
    if (t) { tab = t.dataset.tab; m.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b === t)); $('#gname').hidden = $('#chips').hidden = $('#mgo').hidden = tab !== 'grp'; draw(); return; }
    const rc = e.target.closest('[data-role]');
    if (rc) { role = rc.dataset.role; m.querySelectorAll('[data-role]').forEach(b => b.classList.toggle('on', b === rc)); draw(); return; }
    if (e.target.closest('[data-all]')) { const q = $('#mq').value.toLowerCase(), list = shown().filter(u => (u.display_name + u.username).toLowerCase().includes(q)), all = list.every(u => sel.has(u.id)); list.forEach(u => all ? sel.delete(u.id) : sel.add(u.id)); draw(); return; }
    const p = e.target.closest('[data-u]');
    if (p && tab === 'dm') {
      e.preventDefault(); const { data, error } = await sb.rpc('start_dm', { other: p.dataset.u });
      if (error) return toast('Chat not opened'); await loadRooms(); m.hidden = true; openRoom(data);
    } else if (p) { const id = p.dataset.u; setTimeout(() => { p.querySelector('input').checked ? sel.add(id) : sel.delete(id); count(); }, 0); }
    if (e.target.id === 'mgo') {
      const name = $('#gname').value.trim(); if (!name) return toast('Enter the group name'); if (!sel.size) return toast('Select at least one member');
      const { data, error } = await sb.rpc('create_group', { gname: name, members: [...sel] });
      if (error) return toast('Group not created!'); await loadRooms(); m.hidden = true; openRoom(data);
    }
  };
};
addEventListener('keydown', e => { if (e.key === 'Escape') $('#modal').hidden = true; });

/* ---------- photos: profile + group ---------- */
function cropImage(file) {                 // drag + zoom karke chunein ke photo ka kaunsa hissa dikhna chahiye
  return new Promise(resolve => {
    const el = $('#crop'), C = 220, PAD = 20, V = C + PAD * 2, OUT = 256, url = URL.createObjectURL(file), img = new Image();
    let s = 1, smin = 1, x = 0, y = 0, nw = 0, nh = 0, drag = null;
    const clamp = () => { x = Math.min(PAD, Math.max(PAD + C - nw * s, x)); y = Math.min(PAD, Math.max(PAD + C - nh * s, y)); };
    const paint = () => { clamp(); img.style.width = nw * s + 'px'; img.style.height = nh * s + 'px'; img.style.transform = `translate(${x}px,${y}px)`; };
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); close(null); } };
    const close = v => { el.hidden = true; el.innerHTML = ''; el.onclick = null; document.removeEventListener('keydown', key, true); URL.revokeObjectURL(url); resolve(v); };
    el.hidden = false;
    el.innerHTML = `<div class="crop-box" role="dialog" aria-label="Adjust photo"><header><b>Adjust photo</b><button class="icon-btn" data-c="no" aria-label="Cancel">${I.x}</button></header>
      <p class="crop-hint">Drag the photo to choose the part you want, and use the slider to zoom.</p>
      <div class="crop-stage" style="width:${V}px;height:${V}px"><div class="crop-mask" style="inset:${PAD}px"></div></div>
      <input type="range" class="crop-zoom" aria-label="Zoom" min="1" max="4" step="0.01" value="1">
      <div class="c-btns"><button class="btn ghost" data-c="no">Cancel</button><button class="btn" data-c="ok">Apply</button></div></div>`;
    const stage = el.querySelector('.crop-stage'), zoom = el.querySelector('.crop-zoom');
    img.className = 'crop-img'; img.draggable = false; stage.prepend(img);
    const setZoom = ns => {                // zoom karte waqt circle ka beech wala hissa apni jagah rehta hai
      ns = Math.min(smin * 4, Math.max(smin, ns)); const cx = (PAD + C / 2 - x) / s, cy = (PAD + C / 2 - y) / s;
      s = ns; x = PAD + C / 2 - cx * s; y = PAD + C / 2 - cy * s; zoom.value = s; paint();
    };
    img.onload = () => {
      nw = img.naturalWidth; nh = img.naturalHeight; smin = C / Math.min(nw, nh); s = smin;
      x = PAD - (nw * s - C) / 2; y = PAD - (nh * s - C) / 2;
      zoom.min = smin; zoom.max = smin * 4; zoom.step = smin / 100; zoom.value = s; paint();
    };
    img.onerror = () => { toast('Could not read that image'); close(null); };
    stage.onpointerdown = e => { drag = { px: e.clientX, py: e.clientY, x, y }; try { stage.setPointerCapture(e.pointerId); } catch {} };
    stage.onpointermove = e => { if (!drag) return; x = drag.x + e.clientX - drag.px; y = drag.y + e.clientY - drag.py; paint(); };
    stage.onpointerup = stage.onpointercancel = () => { drag = null; };
    stage.onwheel = e => { e.preventDefault(); setZoom(s * (e.deltaY < 0 ? 1.08 : 0.92)); };
    zoom.oninput = () => setZoom(parseFloat(zoom.value));
    document.addEventListener('keydown', key, true);
    el.onclick = e => {
      const b = e.target.closest('[data-c]'); if (!b) { if (e.target === el) close(null); return; }
      if (b.dataset.c === 'no') return close(null);
      const c = document.createElement('canvas'); c.width = c.height = OUT;
      c.getContext('2d').drawImage(img, (PAD - x) / s, (PAD - y) / s, C / s, C / s, 0, 0, OUT, OUT);
      c.toBlob(bl => close(bl), 'image/jpeg', 0.88);
    };
    img.src = url;
  });
}
async function uploadAvatar(blob, tag) {
  const path = `avatars/${tag}-${Date.now()}.jpg`;
  const up = await sb.storage.from('attachments').upload(path, blob, { contentType: 'image/jpeg' });
  if (up.error) throw up.error;
  return sb.storage.from('attachments').getPublicUrl(path).data.publicUrl;
}
function refreshIdentity() {
  $('#meAv').innerHTML = avatar(S.me); $('#meName').textContent = S.me.display_name;
  renderRooms(); if (S.active) { header(); renderMsgs(); }
}
function openProfile() {
  const m = $('#modal'); let blob = null, removed = false, prev = null;
  const draw = () => {
    const u = { ...S.me, avatar_url: blob ? prev : removed ? null : S.me.avatar_url };
    $('#pfPrev').innerHTML = avatar(u, 'lg'); $('#pfRm').hidden = !u.avatar_url;
  };
  m.hidden = false;
  m.innerHTML = `<div class="sheet" role="dialog" aria-label="Edit profile"><header><b>Your profile</b><button class="icon-btn" data-x>${I.x}</button></header>
    <div class="pf"><button class="pf-av" data-pick aria-label="Change photo"><span id="pfPrev"></span><span class="pf-cam">${I.cam}</span></button>
      <div class="pf-btns"><button class="btn sm ghost" data-pick>Upload photo</button><button class="btn sm ghost" id="pfRm" data-rm>Remove photo</button></div></div>
    <label class="fl">Display name<input id="pfName" maxlength="40" value="${esc(S.me.display_name)}"></label>
    <small>@${esc(S.me.username)} · ${S.me.is_admin ? 'Admin' : 'Member'}</small>
    <button class="btn" data-save>Save changes</button><input type="file" id="pfFile" accept="image/*" hidden></div>`;
  draw();
  m.onchange = async e => {
    if (e.target.id !== 'pfFile' || !e.target.files[0]) return;
    const f = e.target.files[0]; e.target.value = '';
    const b = await cropImage(f); if (!b) return;
    blob = b; prev = URL.createObjectURL(b); removed = false; draw();
  };
  m.onclick = async e => {
    if (e.target === m || e.target.closest('[data-x]')) { m.hidden = true; return; }
    if (e.target.closest('[data-pick]')) return $('#pfFile').click();
    if (e.target.closest('[data-rm]')) { blob = null; removed = true; return draw(); }
    const save = e.target.closest('[data-save]'); if (!save) return;
    save.disabled = true;
    try {
      let url = S.me.avatar_url || null;
      if (blob) url = await uploadAvatar(blob, S.me.id); else if (removed) url = null;
      const name = $('#pfName').value.trim() || S.me.display_name;
      const { error } = await sb.from('profiles').update({ display_name: name, avatar_url: url }).eq('id', S.me.id);
      if (error) throw error;
      Object.assign(S.me, { display_name: name, avatar_url: url }); S.users[S.me.id] = S.me;
      refreshIdentity(); m.hidden = true; toast('Profile updated');
    } catch (err) { toast('Could not save: ' + (err.message || err)); save.disabled = false; }
  };
}
$('.me').addEventListener('click', e => { if (!e.target.closest('#logout, #admBtn')) openProfile(); });

/* ---------- group members / add members ---------- */
function openMembers() {
  const r = S.rooms[S.active]; if (!r || r.type !== 'group') return;
  const m = $('#modal'), can = S.me.is_admin || r.created_by === S.me.id; let role = 'all'; const sel = new Set();
  const shell = html => { m.hidden = false; m.innerHTML = `<div class="sheet" role="dialog">${html}</div>`; };
  const rows = () => {
    const q = ($('#mq') ? $('#mq').value : '').toLowerCase();
    return Object.values(S.users).filter(u => u.approved !== false && !r.members.includes(u.id) && (role === 'all' || (role === 'admin') === !!u.is_admin) && (u.display_name + u.username).toLowerCase().includes(q));
  };
  const count = () => { $('#mgo').textContent = sel.size ? `Add ${sel.size} member${sel.size > 1 ? 's' : ''}` : 'Add members'; };
  const drawP = () => {
    $('#plist').innerHTML = rows().map(u => `<label class="person" data-u="${u.id}">${avatar(u, 'sm')}<span class="grow"><b>${esc(u.display_name)}</b><small>@${esc(u.username)}${u.is_admin ? ' · Admin' : ''}</small></span><input type="checkbox" ${sel.has(u.id) ? 'checked' : ''}></label>`).join('') || '<p class="muted pad">Everyone is already in this group.</p>';
    count();
  };
  const setGroupPhoto = async file => {
    try {
      let url = '';
      if (file) { const b = await cropImage(file); if (!b) return; url = await uploadAvatar(b, 'g-' + r.id); }
      const { error } = await sb.rpc('set_group_avatar', { rid: r.id, url });
      if (error) throw error;
      r.avatar_url = url || null; list(); renderRooms(); if (S.active === r.id) header(); toast(file ? 'Group photo updated' : 'Group photo removed');
    } catch (err) { toast('Could not update: ' + (err.message || err)); }
  };
  const list = () => shell(`<header><b># ${esc(r.name)} · ${r.members.length} members</b><button class="icon-btn" data-x>${I.x}</button></header>
    <div class="pf"><span class="pf-av static">${groupAv(r, 'lg')}</span>${can ? `<div class="pf-btns"><button class="btn sm ghost" data-gpick>${r.avatar_url ? 'Change group photo' : 'Add group photo'}</button>${r.avatar_url ? '<button class="btn sm ghost" data-grm>Remove photo</button>' : ''}</div><input type="file" id="gFile" accept="image/*" hidden>` : ''}</div>
    <div id="plist">${r.members.map(user).map(u => `<div class="person" style="cursor:default">${avatar(u, 'sm')}<span class="grow"><b>${esc(u.display_name)}${u.id === S.me.id ? ' (you)' : ''}</b><small>@${esc(u.username)}${u.is_admin ? ' · Admin' : ''}</small></span></div>`).join('')}</div>
    ${can ? '<button class="btn" data-add>+ Add members</button>' : '<small>Only the group creator or an admin can add members.</small>'}`);
  const addView = () => {
    shell(`<header><b>Add to ${esc(r.name)}</b><button class="icon-btn" data-x>${I.x}</button></header>
      <div class="chips"><button class="on" data-role="all">Everyone</button><button data-role="admin">Admins</button><button data-role="staff">Employees</button><button data-all>Select all shown</button></div>
      <input id="mq" placeholder="Search…"><div id="plist"></div><button class="btn" id="mgo">Add members</button>`);
    $('#mq').oninput = drawP; drawP();
  };
  m.onclick = async e => {
    if (e.target === m || e.target.closest('[data-x]')) { m.hidden = true; return; }
    if (e.target.closest('[data-gpick]')) return $('#gFile').click();
    if (e.target.closest('[data-grm]')) return setGroupPhoto(null);
    if (e.target.closest('[data-add]')) return addView();
    const rc = e.target.closest('[data-role]');
    if (rc) { role = rc.dataset.role; m.querySelectorAll('[data-role]').forEach(b => b.classList.toggle('on', b === rc)); return drawP(); }
    if (e.target.closest('[data-all]')) { const l = rows(), all = l.every(u => sel.has(u.id)); l.forEach(u => all ? sel.delete(u.id) : sel.add(u.id)); return drawP(); }
    const p = e.target.closest('[data-u]');
    if (p) { const id = p.dataset.u; setTimeout(() => { p.querySelector('input').checked ? sel.add(id) : sel.delete(id); count(); }, 0); return; }
    if (e.target.id === 'mgo') {
      if (!sel.size) return toast('Select at least one person');
      const ids = [...sel], { error } = await sb.rpc('add_group_members', { rid: r.id, members: ids });
      if (error) return toast(error.message || 'Could not add members');
      ids.forEach(id => r.members.includes(id) || r.members.push(id)); header(); m.hidden = true;
      sb.from('messages').insert({ room_id: r.id, user_id: S.me.id, body: `${S.me.display_name} added ${ids.map(id => user(id).display_name).join(', ')} to the group` }).select().single().then(x => x.data && onMsg(x.data));
      toast(`${ids.length} member${ids.length > 1 ? 's' : ''} added`);
    }
  };
  m.onchange = e => { if (e.target.id === 'gFile' && e.target.files[0]) { const f = e.target.files[0]; e.target.value = ''; setGroupPhoto(f); } };
  list();
}
$('#membersBtn').onclick = openMembers;

/* ---------- admin console ---------- */
const A = { open: false, tab: 'users', rooms: {}, stats: {}, rstats: {}, feed: [], audit: {}, filter: { user: '', q: '' }, view: null, vmsgs: [], t: null };
const ago = t => { if (!t) return 'never'; const s = (Date.now() - new Date(t)) / 1000; return s < 60 ? 'just now' : s < 3600 ? Math.floor(s / 60) + 'm ago' : s < 86400 ? Math.floor(s / 3600) + 'h ago' : new Date(t).toLocaleDateString([], { day: 'numeric', month: 'short' }); };
const full = t => new Date(t).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const roomLabel = r => !r ? 'Unknown chat' : r.type === 'dm' ? r.members.map(id => user(id).display_name).join(' ↔ ') : '# ' + r.name;
async function loadAll() {
  const [a, b, c] = await Promise.all([sb.from('rooms').select('id,name,type,created_by,created_at,room_members(user_id)'), sb.rpc('admin_stats'), sb.rpc('admin_rooms')]);
  A.rooms = Object.fromEntries((a.data || []).map(r => [r.id, { ...r, members: r.room_members.map(x => x.user_id) }]));
  A.stats = Object.fromEntries((b.data || []).map(x => [x.user_id, x]));
  A.rstats = Object.fromEntries((c.data || []).map(x => [x.room_id, x]));
}
async function auditFor(list) {
  const ids = list.filter(m => m.deleted_at && !A.audit[m.id]).map(m => m.id); if (!ids.length) return;
  const { data } = await sb.from('message_audit').select('*').in('message_id', ids);
  (data || []).forEach(a => A.audit[a.message_id] = a);
}
async function loadFeed() {
  let q = sb.from('messages').select('*').order('created_at', { ascending: false }).limit(100);
  if (A.filter.user) q = q.eq('user_id', A.filter.user);
  if (A.filter.q) q = q.ilike('body', '%' + A.filter.q.replace(/[%_,()]/g, ' ') + '%');
  const { data } = await q; A.feed = data || [];
  await Promise.all([auditFor(A.feed), loadReactions(A.feed.map(m => m.id))]);
}
async function openView(id) {
  A.view = id;
  const { data } = await sb.from('messages').select('*').eq('room_id', id).order('created_at', { ascending: false }).limit(200);
  A.vmsgs = (data || []).reverse();
  await Promise.all([auditFor(A.vmsgs), loadReactions(A.vmsgs.map(m => m.id))]);
  drawAdmin(); $('#admBody').scrollTop = $('#admBody').scrollHeight;
}
async function openAdmin() {
  A.open = true; $('#admin').hidden = false; $('#admBody').innerHTML = '<p class="muted pad">Loading…</p>';
  await refreshUsers(); await loadAll(); if (A.tab === 'feed') await loadFeed(); drawAdmin();
}
function pendHtml(pend) {
  if (!pend.length) return '';
  return `<div class="adm-pending"><h4>Waiting for approval · ${pend.length}</h4><div class="adm-list">${pend.map(u => `<div class="adm-user"><span class="avw">${avatar(u)}</span><span class="grow"><b>${esc(u.display_name)}</b><small>@${esc(u.username)} · signed up ${ago(u.created_at)}</small></span><span class="adm-btns"><button class="btn sm" data-a="approve" data-uid="${u.id}">Approve</button><button class="btn sm ghost" data-a="reject" data-uid="${u.id}">Reject</button></span></div>`).join('')}</div></div>`;
}
function admUsers() {
  const all = Object.values(S.users), pend = all.filter(u => u.approved === false);
  const us = all.filter(u => u.approved !== false).sort((a, b) => new Date((A.stats[b.id] || {}).last_at || 0) - new Date((A.stats[a.id] || {}).last_at || 0));
  const sum = k => us.reduce((n, u) => n + Number((A.stats[u.id] || {})[k] || 0), 0);
  return `${pendHtml(pend)}<div class="adm-cards"><div><b>${us.length}</b><span>Users</span></div><div><b>${S.online.size}</b><span>Online now</span></div><div><b>${sum('last24')}</b><span>Messages · 24h</span></div><div><b>${sum('total')}</b><span>Total messages</span></div></div>
  <div class="adm-list">${us.map(u => { const s = A.stats[u.id] || {}, on = S.online.has(u.id); return `<div class="adm-user"><span class="avw">${avatar(u)}${on ? '<i class="dot"></i>' : ''}</span>
    <span class="grow"><b>${esc(u.display_name)}</b>${u.is_admin ? ' <em class="badge">Admin</em>' : ''}<small>@${esc(u.username)} · ${on ? 'online' : 'last message ' + ago(s.last_at)}</small><small>${s.total || 0} total · ${s.last24 || 0} in 24h · ${s.deleted || 0} deleted</small></span>
    <span class="adm-btns"><button class="btn sm ghost" data-a="feedu" data-uid="${u.id}">Messages</button>${u.id !== S.me.id ? `<button class="btn sm ghost" data-a="role" data-uid="${u.id}" data-flag="${u.is_admin ? 0 : 1}">${u.is_admin ? 'Remove admin' : 'Make admin'}</button>` : ''}${u.id !== S.me.id ? `<button class="btn sm ghost" data-a="revoke" data-uid="${u.id}">Revoke access</button>` : ''}</span></div>`; }).join('')}</div>`;
}
function admMsg(m, open) {
  const a = A.audit[m.id], u = user(m.user_id), d = !!m.deleted_at;
  const txt = d ? (a ? esc(a.body || '') + (a.file_name ? ` <span class="chip">${I.clip} ${esc(a.file_name)}</span>` : '') : '<i>(original unavailable)</i>')
    : (m.body ? linkify(m.body) : '') + (m.file_url ? (isVoice(m) ? ` <audio controls preload="none" src="${esc(m.file_url)}"></audio>` : ` <a class="chip" href="${esc(m.file_url)}" target="_blank" rel="noopener">${I.clip} ${esc(m.file_name || 'file')}</a>`) : '');
  const rx = Object.entries(S.react[m.id] || {}).map(([uid, e]) => `<span class="pill" title="${esc(user(uid).display_name)}">${rIcon(rkey(e))}</span>`).join('');
  return `<div class="adm-msg ${d ? 'del' : ''} ${open ? 'link' : ''}" ${open ? `data-a="room" data-room="${m.room_id}"` : ''}>
    <div class="adm-h">${avatar(u, 'sm')}<b>${esc(u.display_name)}</b>${open ? `<span class="to">→ ${esc(roomLabel(A.rooms[m.room_id]))}</span>` : ''}<time>${full(m.created_at)}</time></div>
    <div class="adm-t">${txt || '&nbsp;'}</div>
    ${d ? `<span class="tag">${I.ban} Deleted by user · original visible to admins only</span>` : ''}${rx ? `<div class="rx">${rx}</div>` : ''}
    ${!open && !d ? `<button class="btn sm ghost" data-a="del" data-id="${m.id}">Delete message</button>` : ''}</div>`;
}
function drawAdmin() {
  document.querySelectorAll('#admTabs button').forEach(b => b.classList.toggle('on', b.dataset.t === A.tab && !A.view));
  const body = $('#admBody');
  if (A.view) body.innerHTML = `<div class="adm-bar"><button class="btn sm ghost" data-a="back">${I.back} Back</button><b>${esc(roomLabel(A.rooms[A.view]))}</b><small>Read-only admin view</small></div><div id="admList" class="adm-list"></div>`;
  else if (A.tab === 'users') { body.innerHTML = admUsers(); return; }
  else if (A.tab === 'feed') body.innerHTML = `<div class="adm-filters"><select id="fUserSel"><option value="">All users</option>${Object.values(S.users).map(u => `<option value="${u.id}" ${A.filter.user === u.id ? 'selected' : ''}>${esc(u.display_name)}</option>`).join('')}</select><input id="fSearch" placeholder="Search message text…" value="${esc(A.filter.q)}"><button class="btn sm" data-a="refresh">Refresh</button></div><div id="admList" class="adm-list"></div>`;
  else body.innerHTML = '<div id="admList" class="adm-list"></div>';
  drawList();
}
function drawList() {
  const el = $('#admList'); if (!el) return;
  if (A.view) { el.innerHTML = A.vmsgs.map(m => admMsg(m, false)).join('') || '<p class="muted pad">No messages.</p>'; return; }
  if (A.tab === 'feed') { el.innerHTML = A.feed.map(m => admMsg(m, true)).join('') || '<p class="muted pad">No messages found.</p>'; return; }
  const rs = Object.values(A.rooms).sort((a, b) => new Date((A.rstats[b.id] || {}).last_at || b.created_at) - new Date((A.rstats[a.id] || {}).last_at || a.created_at));
  el.innerHTML = rs.map(r => { const s = A.rstats[r.id] || {}; return `<button class="adm-room" data-a="room" data-room="${r.id}"><span class="av" style="background:hsl(${hue(r.id)} 38% 40%)">${r.type === 'dm' ? '@' : '#'}</span><span class="grow"><b>${esc(roomLabel(r))}</b><small>${r.type === 'dm' ? 'Direct message' : r.members.length + ' members'} · ${s.n || 0} messages · last ${ago(s.last_at)}</small></span></button>`; }).join('') || '<p class="muted pad">No chats yet.</p>';
}
async function adminLive(m) {
  if (!(S.me && S.me.is_admin && A.open)) return;
  if (!A.rooms[m.room_id]) await loadAll();
  if (A.view === m.room_id) { if (!A.vmsgs.some(x => x.id === m.id)) A.vmsgs.push(m); }
  else if (!A.view && A.tab === 'feed') { if ((!A.filter.user || A.filter.user === m.user_id) && !A.filter.q && !A.feed.some(x => x.id === m.id)) A.feed.unshift(m); }
  else if (!A.view) { clearTimeout(A.t); A.t = setTimeout(async () => { await loadAll(); drawAdmin(); }, 1500); return; }
  drawList();
}
async function adminDeleted(m) {
  if (!(S.me.is_admin && A.open)) return;
  await auditFor([m]); [A.feed, A.vmsgs].forEach(l => { const i = l.findIndex(x => x.id === m.id); if (i > -1) l[i] = m; }); drawList();
}
$('#admBtn').onclick = openAdmin;
$('#admin').onclick = async e => {
  const t = e.target.closest('[data-t]');
  if (t) { A.tab = t.dataset.t; A.view = null; if (A.tab === 'feed') await loadFeed(); drawAdmin(); return; }
  const a = e.target.closest('[data-a]'); if (!a) return; const k = a.dataset.a;
  if (k === 'close') { A.open = false; $('#admin').hidden = true; }
  else if (k === 'back') { A.view = null; drawAdmin(); }
  else if (k === 'refresh') { await loadFeed(); drawList(); }
  else if (k === 'room') await openView(a.dataset.room);
  else if (k === 'feedu') { A.filter = { user: a.dataset.uid, q: '' }; A.tab = 'feed'; A.view = null; await loadFeed(); drawAdmin(); }
  else if (k === 'approve' || k === 'revoke' || k === 'reject') {
    const u = user(a.dataset.uid);
    if (k !== 'approve') {
      const yes = await confirmBox(k === 'reject'
        ? { title: 'Reject this signup?', text: `${u.display_name}'s account will be deleted. They can sign up again with the invite code.`, ok: 'Reject', icon: I.x }
        : { title: 'Revoke access?', text: `${u.display_name} will lose access to the chat until you approve them again.`, ok: 'Revoke', icon: I.ban });
      if (!yes) return;
    }
    const { error } = k === 'reject' ? await sb.rpc('reject_user', { uid: u.id }) : await sb.rpc('set_approved', { uid: u.id, flag: k === 'approve' });
    if (error) return toast(error.message);
    await refreshUsers(); await loadAll(); usersChanged();
    toast(k === 'approve' ? `${u.display_name} approved` : k === 'reject' ? 'Signup rejected' : 'Access revoked');
  }
  else if (k === 'role') {
    const { error } = await sb.rpc('set_admin', { uid: a.dataset.uid, flag: a.dataset.flag === '1' });
    if (error) return toast(error.message); await refreshUsers(); drawAdmin();
  } else if (k === 'del' && await confirmDelete()) {
    const { data, error } = await sb.from('messages').update({ deleted_at: new Date().toISOString() }).eq('id', Number(a.dataset.id)).select().single();
    if (error) toast('Not deleted'); else onUpdate(data);
  }
};
$('#admin').addEventListener('change', async e => { if (e.target.id === 'fUserSel') { A.filter.user = e.target.value; await loadFeed(); drawList(); } });
let fT; $('#admin').addEventListener('input', e => { if (e.target.id === 'fSearch') { clearTimeout(fT); fT = setTimeout(async () => { A.filter.q = e.target.value.trim(); await loadFeed(); drawList(); }, 350); } });
addEventListener('keydown', e => { if (e.key === 'Escape' && A.open && $('#modal').hidden) { A.open = false; $('#admin').hidden = true; } });

$('#readAll').onclick = async () => {
  const ids = Object.keys(S.unread).filter(id => S.unread[id] > 0);
  if (!ids.length) return toast('Nothing unread');
  const res = await Promise.all(ids.map(id => sb.rpc('mark_read', { r: id })));
  const bad = res.find(r => r.error);
  if (bad) { console.error('mark_read failed:', bad.error); return toast('Could not save: ' + bad.error.message); }
  const { data } = await sb.rpc('unread_counts');            // server se dobara poochho: sach mein save hua?
  S.unread = {}; S.mentions = {}; (data || []).forEach(r => { S.unread[r.room_id] = Number(r.n); if (Number(r.m)) S.mentions[r.room_id] = Number(r.m); });
  renderRooms(); updateBadges();
  if (Object.keys(S.unread).length) { console.table(data); toast('Saved, but the server still counts unread messages. Check Console.'); }
  else toast('All chats marked as read');
};

/* ---------- start ---------- */
setMode('login');
(async () => {
  const { data } = await sb.auth.getSession();
  if (data.session) boot(data.session.user); else $('#auth').hidden = false;
})();
})();
