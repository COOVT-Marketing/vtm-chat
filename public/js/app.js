let currentUser = null;
let channels = [];
let activeChannel = null;
let socket = null;
let pendingAttachment = null;
let typingTimeout = null;
let replyingTo = null; // { id, authorName, body, kind }

// ---------------- Voice recording state ----------------
let mediaRecorder = null;
let recordedChunks = [];
let recordStartedAt = null;
let recordTimerInterval = null;

const QUICK_EMOJI = ['👍', '❤️', '😂', '🎉', '👀', '🙏'];

const els = {
  shell: document.getElementById('chat-shell'),
  meName: document.getElementById('me-name'),
  channelList: document.getElementById('channel-list'),
  groupList: document.getElementById('group-list'),
  dmList: document.getElementById('dm-list'),
  channelTitle: document.getElementById('channel-title'),
  adminLink: document.getElementById('admin-link'),
  callBtn: document.getElementById('call-btn'),
  stream: document.getElementById('message-stream'),
  typingIndicator: document.getElementById('typing-indicator'),
  composer: document.getElementById('composer'),
  composerRow: document.getElementById('composer-row'),
  composerAttachment: document.getElementById('composer-attachment'),
  replyPreview: document.getElementById('reply-preview'),
  messageInput: document.getElementById('message-input'),
  sendBtn: document.getElementById('send-btn'),
  attachBtn: document.getElementById('attach-btn'),
  fileInput: document.getElementById('file-input'),
  micBtn: document.getElementById('mic-btn'),
  voiceRecorder: document.getElementById('voice-recorder'),
  recTimer: document.getElementById('rec-timer'),
  recCancelBtn: document.getElementById('rec-cancel-btn'),
  recStopBtn: document.getElementById('rec-stop-btn'),
  themeToggleBtn: document.getElementById('theme-toggle-btn'),
  logoutBtn: document.getElementById('logout-btn'),
  newChannelBtn: document.getElementById('new-channel-btn'),
  newGroupBtn: document.getElementById('new-group-btn'),
  newDmBtn: document.getElementById('new-dm-btn'),
  modalBackdrop: document.getElementById('modal-backdrop'),
  modalContent: document.getElementById('modal-content'),
};

const callEls = {
  incomingToast: document.getElementById('incoming-call'),
  incomingName: document.getElementById('incoming-call-name'),
  acceptBtn: document.getElementById('accept-call-btn'),
  rejectBtn: document.getElementById('reject-call-btn'),
  callOverlay: document.getElementById('call-overlay'),
  callWithName: document.getElementById('call-with-name'),
  callStatus: document.getElementById('call-status'),
  localVideo: document.getElementById('local-video'),
  remoteVideo: document.getElementById('remote-video'),
  hangupBtn: document.getElementById('hangup-btn'),
  toggleMicBtn: document.getElementById('toggle-mic-btn'),
  toggleCamBtn: document.getElementById('toggle-cam-btn'),
};

init();

async function init() {
  try {
    currentUser = await api.me();
  } catch (err) {
    window.location.href = '/login';
    return;
  }

  els.shell.style.display = 'flex';
  els.meName.textContent = currentUser.displayName;
  if (currentUser.role === 'SUPERADMIN') els.adminLink.style.display = 'inline';

  syncThemeButton();

  channels = await api.getChannels();
  renderChannelList();
  if (channels.length > 0) selectChannel(channels[0]);

  connectSocket();
  bindEvents();
  VTMCall.init(socket, callEls, () => {});
}

function connectSocket() {
  socket = io({ withCredentials: true });

  socket.on('message:new', (msg) => {
    if (activeChannel && msg.channel_id === activeChannel.id) {
      appendMessage(msg);
      scrollToBottom();
    }
  });

  socket.on('message:deleted', ({ messageId, channelId }) => {
    if (activeChannel && channelId === activeChannel.id) removeMessageFromDom(messageId);
  });

  socket.on('message:reaction:added', ({ messageId, emoji }) => bumpReaction(messageId, emoji, +1));
  socket.on('message:reaction:removed', ({ messageId, emoji }) => bumpReaction(messageId, emoji, -1));

  socket.on('typing:start', ({ userId }) => {
    if (userId === currentUser.id) return;
    els.typingIndicator.textContent = 'Someone is typing…';
    clearTimeout(window.__typingClear);
    window.__typingClear = setTimeout(() => (els.typingIndicator.textContent = ''), 3000);
  });
}

function bindEvents() {
  els.themeToggleBtn.addEventListener('click', toggleTheme);
  els.logoutBtn.addEventListener('click', async () => {
    await api.logout();
    window.location.href = '/login';
  });

  els.sendBtn.addEventListener('click', sendMessage);
  els.messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMessage();
    if (e.key === 'Escape') clearReply();
  });
  els.messageInput.addEventListener('input', () => {
    if (!activeChannel) return;
    socket.emit('typing:start', { channelId: activeChannel.id });
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => socket.emit('typing:stop', { channelId: activeChannel.id }), 1500);
  });

  els.attachBtn.addEventListener('click', () => els.fileInput.click());
  els.fileInput.addEventListener('change', handleFileSelect);

  els.micBtn.addEventListener('click', startVoiceRecording);
  els.recCancelBtn.addEventListener('click', cancelVoiceRecording);
  els.recStopBtn.addEventListener('click', stopAndSendVoiceRecording);

  els.newChannelBtn.addEventListener('click', showNewChannelModal);
  els.newGroupBtn.addEventListener('click', showNewGroupModal);
  els.newDmBtn.addEventListener('click', showNewDmModal);
  els.modalBackdrop.addEventListener('click', (e) => {
    if (e.target === els.modalBackdrop) closeModal();
  });

  els.callBtn.addEventListener('click', () => {
    if (!activeChannel || activeChannel.type !== 'DM') return;
    const other = activeChannel.members.find((m) => m.userId !== currentUser.id);
    if (other) VTMCall.startCall(other.userId, other.displayName);
  });
}

// ---------------- Sidebar ----------------
function renderChannelList() {
  const publicChannels = channels.filter((c) => c.type === 'CHANNEL' && !c.isPrivate);
  const groups = channels.filter((c) => c.type === 'GROUP_DM' || (c.type === 'CHANNEL' && c.isPrivate));
  const dms = channels.filter((c) => c.type === 'DM');

  els.channelList.innerHTML = publicChannels
    .map((c) => channelItemHtml(c, `# ${escapeHtml(c.name)}`))
    .join('') || emptyNavHtml();

  els.groupList.innerHTML = groups
    .map((c) => channelItemHtml(c, `${escapeHtml(c.name)}<span class="channel-meta">${c.memberCount} members</span>`))
    .join('') || emptyNavHtml();

  els.dmList.innerHTML = dms
    .map((c) => {
      const other = c.members.find((m) => m.userId !== currentUser.id);
      const label = other?.displayName || 'Direct message';
      return channelItemHtml(c, escapeHtml(label));
    })
    .join('') || emptyNavHtml();

  document.querySelectorAll('.channel-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const channel = channels.find((c) => c.id === btn.dataset.id);
      if (channel) selectChannel(channel);
    });
  });
}

function channelItemHtml(c, innerHtml) {
  return `<button class="channel-item${c.id === activeChannel?.id ? ' active' : ''}" data-id="${c.id}">${innerHtml}</button>`;
}

function emptyNavHtml() {
  return '';
}

async function selectChannel(channel) {
  if (activeChannel) socket?.emit('channel:leave', activeChannel.id);
  activeChannel = channel;
  clearReply();
  renderChannelList();

  if (channel.type === 'CHANNEL') {
    els.channelTitle.textContent = channel.isPrivate ? `🔒 ${channel.name}` : `# ${channel.name}`;
  } else if (channel.type === 'GROUP_DM') {
    els.channelTitle.textContent = `${channel.name} · ${channel.memberCount} members`;
  } else {
    const other = channel.members.find((m) => m.userId !== currentUser.id);
    els.channelTitle.textContent = other?.displayName || 'Direct message';
  }

  els.callBtn.style.display = channel.type === 'DM' ? 'flex' : 'none';
  els.composer.style.display = 'flex';
  els.stream.innerHTML = '';

  const messages = await api.getMessages(channel.id);
  messages.forEach(appendMessage);
  scrollToBottom();

  socket.emit('channel:join', channel.id);
  socket.emit('message:read', { channelId: channel.id });
}

// ---------------- Messages ----------------
function appendMessage(msg) {
  const isOwn = (msg.author_id || msg.authorId) === currentUser.id;
  const authorName = msg.authorName || msg.author?.displayName || '';
  const createdAt = msg.created_at || msg.createdAt;
  const canDelete = isOwn || currentUser.role === 'SUPERADMIN';

  const row = document.createElement('div');
  row.className = `msg-row${isOwn ? ' own' : ''}`;
  row.dataset.messageId = msg.id;

  const initial = authorName?.[0]?.toUpperCase() || '?';
  const time = new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  let bodyHtml = '';
  if (msg.kind === 'VOICE' && msg.attachments?.[0]) {
    bodyHtml = `<div class="voice-message"><audio controls src="${msg.attachments[0].url}"></audio></div>`;
  } else {
    if (msg.body) bodyHtml += `<div class="msg-bubble">${escapeHtml(msg.body)}</div>`;
    (msg.attachments || []).forEach((att) => {
      const mime = att.mime_type || att.mimeType;
      if (/^image\//.test(mime)) {
        bodyHtml += `<div class="msg-attachment"><img src="${att.url}" alt="${escapeHtml(att.file_name || att.fileName)}"/></div>`;
      } else {
        bodyHtml += `<div class="msg-attachment"><a class="file-link" href="${att.url}" target="_blank" rel="noreferrer">📎 ${escapeHtml(att.file_name || att.fileName)}</a></div>`;
      }
    });
  }

  const replyHtml = msg.replyTo
    ? `<div class="reply-quote"><span class="reply-quote-name">${escapeHtml(msg.replyTo.authorName)}</span>${escapeHtml(msg.replyTo.kind === 'VOICE' ? '🎤 Voice message' : (msg.replyTo.body || ''))}</div>`
    : '';

  row.innerHTML = `
    <div class="avatar">${initial}</div>
    <div class="msg-body-wrap">
      <div class="msg-content-group">
        <div class="msg-meta"><span class="name">${escapeHtml(authorName)}</span><span>${time}</span></div>
        ${replyHtml}
        ${bodyHtml}
        <div class="msg-hover-actions">
          <button class="hover-action-btn react-trigger" type="button" title="React" aria-label="React">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
          </button>
          <button class="hover-action-btn reply-trigger" type="button" title="Reply" aria-label="Reply">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 00-4-4H4"/></svg>
          </button>
          ${canDelete ? `<button class="hover-action-btn delete-trigger" type="button" title="Delete" aria-label="Delete">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          </button>` : ''}
        </div>
        <div class="reaction-picker" data-picker>
          ${QUICK_EMOJI.map((e) => `<button type="button" class="reaction-picker-emoji" data-emoji="${e}">${e}</button>`).join('')}
        </div>
      </div>
      <div class="msg-reactions" data-reactions></div>
    </div>
  `;

  els.stream.appendChild(row);
  wireMessageActions(row, msg);
  (msg.reactions || []).forEach((r) => bumpReaction(msg.id, r.emoji, +1));
}

function wireMessageActions(row, msg) {
  const messageId = msg.id;
  const picker = row.querySelector('[data-picker]');

  picker.querySelectorAll('.reaction-picker-emoji').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      socket.emit('message:react', { messageId, emoji: btn.dataset.emoji });
      picker.classList.remove('open');
    });
  });

  row.querySelector('.react-trigger').addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.reaction-picker.open').forEach((p) => p !== picker && p.classList.remove('open'));
    picker.classList.toggle('open');
  });

  row.querySelector('.reply-trigger').addEventListener('click', (e) => {
    e.stopPropagation();
    setReplyTarget(msg);
  });

  const deleteBtn = row.querySelector('.delete-trigger');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!confirm('Delete this message?')) return;
      socket.emit('message:delete', { messageId }, (res) => {
        if (res?.error) alert(res.error);
      });
    });
  }

  document.addEventListener('click', (e) => {
    if (!row.contains(e.target)) picker.classList.remove('open');
  });
}

function removeMessageFromDom(messageId) {
  const row = document.querySelector(`[data-message-id="${messageId}"]`);
  row?.remove();
}

function bumpReaction(messageId, emoji, delta) {
  const row = document.querySelector(`[data-message-id="${messageId}"]`);
  if (!row) return;
  const container = row.querySelector('[data-reactions]');
  let pill = container.querySelector(`[data-emoji="${emoji}"]`);
  const current = pill ? parseInt(pill.dataset.count, 10) : 0;
  const next = current + delta;

  if (next <= 0) {
    pill?.remove();
    return;
  }

  if (!pill) {
    pill = document.createElement('button');
    pill.className = 'reaction-pill';
    pill.dataset.emoji = emoji;
    pill.addEventListener('click', () => socket.emit('message:react', { messageId, emoji }));
    container.appendChild(pill);
  }
  pill.dataset.count = next;
  pill.textContent = `${emoji} ${next}`;
}

// ---------------- Reply ----------------
function setReplyTarget(msg) {
  replyingTo = {
    id: msg.id,
    authorName: msg.authorName || msg.author?.displayName || '',
    body: msg.kind === 'VOICE' ? '🎤 Voice message' : msg.body || '',
  };
  els.replyPreview.style.display = 'flex';
  els.replyPreview.innerHTML = `
    <div class="reply-preview-content">
      <span class="reply-preview-name">Replying to ${escapeHtml(replyingTo.authorName)}</span>
      <span class="reply-preview-body">${escapeHtml(replyingTo.body)}</span>
    </div>
    <button type="button" id="cancel-reply-btn" class="link-btn">Cancel</button>
  `;
  document.getElementById('cancel-reply-btn').addEventListener('click', clearReply);
  els.messageInput.focus();
}

function clearReply() {
  replyingTo = null;
  els.replyPreview.style.display = 'none';
  els.replyPreview.innerHTML = '';
}

// ---------------- Sending ----------------
async function sendMessage() {
  const body = els.messageInput.value.trim();
  if (!body && !pendingAttachment) return;
  if (!activeChannel) return;

  socket.emit(
    'message:send',
    {
      channelId: activeChannel.id,
      body,
      attachments: pendingAttachment ? [pendingAttachment] : [],
      replyToId: replyingTo?.id || null,
    },
    (res) => {
      if (res?.error) alert(res.error);
    }
  );

  els.messageInput.value = '';
  pendingAttachment = null;
  els.composerAttachment.style.display = 'none';
  els.fileInput.value = '';
  clearReply();
}

async function handleFileSelect(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    pendingAttachment = await api.uploadFile(file);
    els.composerAttachment.style.display = 'flex';
    els.composerAttachment.innerHTML = `📎 ${escapeHtml(pendingAttachment.fileName)} <button id="remove-attachment">remove</button>`;
    document.getElementById('remove-attachment').addEventListener('click', () => {
      pendingAttachment = null;
      els.composerAttachment.style.display = 'none';
      els.fileInput.value = '';
    });
  } catch (err) {
    alert('Upload failed: ' + err.message);
  }
}

// ---------------- Voice recording ----------------
async function startVoiceRecording() {
  if (!activeChannel) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };
    mediaRecorder.onstop = () => stream.getTracks().forEach((t) => t.stop());
    mediaRecorder.start();

    recordStartedAt = Date.now();
    els.composerRow.style.display = 'none';
    els.voiceRecorder.style.display = 'flex';
    els.recTimer.textContent = '0:00';
    recordTimerInterval = setInterval(() => {
      const secs = Math.floor((Date.now() - recordStartedAt) / 1000);
      els.recTimer.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    }, 250);
  } catch (err) {
    alert('Could not access microphone: ' + err.message);
  }
}

function stopRecordingInternal() {
  clearInterval(recordTimerInterval);
  els.voiceRecorder.style.display = 'none';
  els.composerRow.style.display = 'flex';
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
}

function cancelVoiceRecording() {
  stopRecordingInternal();
  recordedChunks = [];
  mediaRecorder = null;
}

async function stopAndSendVoiceRecording() {
  if (!mediaRecorder) return;
  const durationSeconds = Math.round((Date.now() - recordStartedAt) / 1000);

  const finalize = async () => {
    const blob = new Blob(recordedChunks, { type: 'audio/webm' });
    const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
    try {
      const uploaded = await api.uploadFile(file, { durationSeconds });
      socket.emit(
        'message:send',
        { channelId: activeChannel.id, body: null, attachments: [uploaded], kind: 'VOICE', replyToId: replyingTo?.id || null },
        (res) => {
          if (res?.error) alert(res.error);
        }
      );
      clearReply();
    } catch (err) {
      alert('Failed to send voice message: ' + err.message);
    }
    recordedChunks = [];
    mediaRecorder = null;
  };

  mediaRecorder.addEventListener('stop', finalize, { once: true });
  stopRecordingInternal();
}

// ---------------- Misc ----------------
function scrollToBottom() {
  els.stream.scrollTop = els.stream.scrollHeight;
}

function syncThemeButton() {
  const theme = document.documentElement.getAttribute('data-theme');
  els.themeToggleBtn.textContent = theme === 'dark' ? '🌙 Dark' : '☀️ Light';
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  syncThemeButton();
  api.setTheme(next.toUpperCase()).catch(() => {});
}

// ---------------- Modals ----------------
function showNewChannelModal() {
  els.modalContent.innerHTML = `
    <h1>New channel</h1>
    <p class="subtitle">Create a public team channel — anyone can join</p>
    <div class="field">
      <label>Channel name</label>
      <input type="text" id="modal-channel-name" placeholder="e.g. medicare-team" />
    </div>
    <button class="btn-primary" id="modal-create-btn">Create channel</button>
  `;
  els.modalBackdrop.classList.add('open');
  document.getElementById('modal-create-btn').addEventListener('click', async () => {
    const name = document.getElementById('modal-channel-name').value.trim();
    if (!name) return;
    const channel = await api.createChannel({ name, type: 'CHANNEL', isPrivate: false });
    channels.push({ ...channel, memberCount: channel.members.length });
    renderChannelList();
    closeModal();
    selectChannel(channel);
  });
}

async function showNewGroupModal() {
  const directory = await api.getDirectory();
  els.modalContent.innerHTML = `
    <h1>New group</h1>
    <p class="subtitle">Private group for a project or team</p>
    <p class="modal-note">Admins are automatically included in private groups for oversight — visible in the member list, same as any other member.</p>
    <div class="field">
      <label>Group name</label>
      <input type="text" id="modal-group-name" placeholder="e.g. Q3 Launch Team" />
    </div>
    <div class="field">
      <label>Members</label>
      <div class="member-picker">
        ${directory.map((u) => `
          <label class="member-picker-row">
            <input type="checkbox" value="${u.id}" />
            <span>${escapeHtml(u.displayName)}${u.role === 'SUPERADMIN' ? ' <span class="badge-admin">Admin</span>' : ''}</span>
          </label>
        `).join('') || '<p style="color:var(--text-secondary); font-size:13px;">No other users yet.</p>'}
      </div>
    </div>
    <button class="btn-primary" id="modal-create-group-btn">Create group</button>
  `;
  els.modalBackdrop.classList.add('open');
  document.getElementById('modal-create-group-btn').addEventListener('click', async () => {
    const name = document.getElementById('modal-group-name').value.trim();
    if (!name) return;
    const memberIds = Array.from(document.querySelectorAll('.member-picker input:checked')).map((el) => el.value);
    const channel = await api.createChannel({ name, type: 'GROUP_DM', isPrivate: true, memberIds });
    channels.push({ ...channel, memberCount: channel.members.length });
    renderChannelList();
    closeModal();
    selectChannel(channel);
  });
}

async function showNewDmModal() {
  const directory = await api.getDirectory();
  els.modalContent.innerHTML = `
    <h1>New direct message</h1>
    <p class="subtitle">Start a conversation</p>
    <div class="field">
      <label>Teammate</label>
      <select id="modal-user-select" class="modal-select">
        ${directory.map((u) => `<option value="${u.id}">${escapeHtml(u.displayName)}</option>`).join('')}
      </select>
    </div>
    <button class="btn-primary" id="modal-dm-btn">Start DM</button>
  `;
  els.modalBackdrop.classList.add('open');
  document.getElementById('modal-dm-btn').addEventListener('click', async () => {
    const userId = document.getElementById('modal-user-select').value;
    const channel = await api.getOrCreateDM(userId);
    if (!channels.find((c) => c.id === channel.id)) channels.push(channel);
    renderChannelList();
    closeModal();
    selectChannel(channel);
  });
}

function closeModal() {
  els.modalBackdrop.classList.remove('open');
  els.modalContent.innerHTML = '';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
