// Peer-to-peer 1:1 video calling. Signaling (offer/answer/ICE candidates)
// is relayed through the existing Socket.io connection via a single
// 'call:signal' event; the server never inspects the payload, just forwards
// it to the other user's personal room.
//
// Uses a public Google STUN server for NAT traversal. There's no TURN relay
// configured, so two peers who are both behind strict/symmetric NATs (some
// corporate firewalls, some VPNs) may fail to connect directly — that's a
// real limitation of a free/self-hosted setup, not a bug. Adding a TURN
// server (e.g. a small Coturn instance, or a paid service like Twilio's)
// would fix that if it comes up.
const VTMCall = (() => {
  const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];

  let socket = null;
  let pc = null;
  let localStream = null;
  let currentPeerId = null;
  let currentPeerName = null;
  let pendingInvite = null; // { fromUserId, fromName, offer }
  let onStateChange = () => {};

  const els = {};

  function init(socketInstance, elements, stateChangeCb) {
    socket = socketInstance;
    Object.assign(els, elements);
    onStateChange = stateChangeCb || (() => {});

    socket.on('call:signal', ({ fromUserId, fromName, data }) => {
      if (data.type === 'invite') handleInvite(fromUserId, fromName, data.offer);
      else if (data.type === 'answer') handleAnswer(data.answer);
      else if (data.type === 'ice') handleRemoteIce(data.candidate);
      else if (data.type === 'reject') handleRemoteReject();
      else if (data.type === 'end') handleRemoteEnd();
    });

    els.acceptBtn.addEventListener('click', acceptIncoming);
    els.rejectBtn.addEventListener('click', rejectIncoming);
    els.hangupBtn.addEventListener('click', hangup);
    els.toggleMicBtn.addEventListener('click', toggleMic);
    els.toggleCamBtn.addEventListener('click', toggleCam);
  }

  function send(toUserId, data) {
    socket.emit('call:signal', { toUserId, data });
  }

  function createPeerConnection(peerId) {
    const conn = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    conn.onicecandidate = (e) => {
      if (e.candidate) send(peerId, { type: 'ice', candidate: e.candidate });
    };
    conn.ontrack = (e) => {
      els.remoteVideo.srcObject = e.streams[0];
      setStatus('Connected');
    };
    conn.onconnectionstatechange = () => {
      if (['disconnected', 'failed', 'closed'].includes(conn.connectionState)) {
        cleanupIfActive(peerId);
      }
    };
    return conn;
  }

  async function getLocalStream() {
    return navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  }

  async function startCall(toUserId, toName) {
    try {
      localStream = await getLocalStream();
    } catch (err) {
      alert('Could not access camera/microphone: ' + err.message);
      return;
    }
    currentPeerId = toUserId;
    currentPeerName = toName;

    pc = createPeerConnection(toUserId);
    localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));

    els.localVideo.srcObject = localStream;
    showOverlay(toName, 'Calling…');

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    send(toUserId, { type: 'invite', offer });
  }

  function handleInvite(fromUserId, fromName, offer) {
    if (currentPeerId) {
      // Already on a call — auto-decline
      socket.emit('call:signal', { toUserId: fromUserId, data: { type: 'reject' } });
      return;
    }
    pendingInvite = { fromUserId, fromName, offer };
    els.incomingName.textContent = fromName;
    els.incomingToast.style.display = 'flex';
  }

  async function acceptIncoming() {
    if (!pendingInvite) return;
    const { fromUserId, fromName, offer } = pendingInvite;
    els.incomingToast.style.display = 'none';
    pendingInvite = null;

    try {
      localStream = await getLocalStream();
    } catch (err) {
      alert('Could not access camera/microphone: ' + err.message);
      socket.emit('call:signal', { toUserId: fromUserId, data: { type: 'reject' } });
      return;
    }

    currentPeerId = fromUserId;
    currentPeerName = fromName;
    pc = createPeerConnection(fromUserId);
    localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
    els.localVideo.srcObject = localStream;

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    send(fromUserId, { type: 'answer', answer });

    showOverlay(fromName, 'Connecting…');
  }

  function rejectIncoming() {
    if (!pendingInvite) return;
    socket.emit('call:signal', { toUserId: pendingInvite.fromUserId, data: { type: 'reject' } });
    els.incomingToast.style.display = 'none';
    pendingInvite = null;
  }

  async function handleAnswer(answer) {
    if (!pc) return;
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
  }

  async function handleRemoteIce(candidate) {
    if (!pc) return;
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.warn('Failed to add ICE candidate', err);
    }
  }

  function handleRemoteReject() {
    setStatus('Call declined');
    setTimeout(cleanup, 1200);
  }

  function handleRemoteEnd() {
    setStatus('Call ended');
    setTimeout(cleanup, 800);
  }

  function hangup() {
    if (currentPeerId) send(currentPeerId, { type: 'end' });
    cleanup();
  }

  function cleanupIfActive(peerId) {
    if (currentPeerId === peerId) cleanup();
  }

  function cleanup() {
    if (pc) {
      pc.close();
      pc = null;
    }
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
      localStream = null;
    }
    currentPeerId = null;
    currentPeerName = null;
    els.localVideo.srcObject = null;
    els.remoteVideo.srcObject = null;
    els.callOverlay.style.display = 'none';
    onStateChange({ active: false });
  }

  function showOverlay(name, status) {
    els.callWithName.textContent = name;
    setStatus(status);
    els.callOverlay.style.display = 'flex';
    onStateChange({ active: true });
  }

  function setStatus(text) {
    els.callStatus.textContent = text;
  }

  function toggleMic() {
    if (!localStream) return;
    const track = localStream.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    els.toggleMicBtn.classList.toggle('off', !track.enabled);
  }

  function toggleCam() {
    if (!localStream) return;
    const track = localStream.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    els.toggleCamBtn.classList.toggle('off', !track.enabled);
  }

  return { init, startCall };
})();
