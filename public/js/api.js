const API_BASE = '/api';

async function apiRequest(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed: ${res.status}`);
  return data;
}

const api = {
  register: (body) => apiRequest('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body) => apiRequest('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  logout: () => apiRequest('/auth/logout', { method: 'POST' }),
  me: () => apiRequest('/auth/me'),
  setTheme: (themePref) => apiRequest('/auth/me/theme', { method: 'PATCH', body: JSON.stringify({ themePref }) }),

  getChannels: () => apiRequest('/channels'),
  createChannel: (body) => apiRequest('/channels', { method: 'POST', body: JSON.stringify(body) }),
  getOrCreateDM: (userId) => apiRequest(`/channels/dm/${userId}`, { method: 'POST' }),
  getMessages: (channelId) => apiRequest(`/channels/${channelId}/messages`),
  getDirectory: () => apiRequest('/channels/users/directory'),

  uploadFile: async (file, extra = {}) => {
    const formData = new FormData();
    formData.append('file', file);
    Object.entries(extra).forEach(([k, v]) => formData.append(k, v));
    const res = await fetch(`${API_BASE}/uploads`, { method: 'POST', credentials: 'include', body: formData });
    if (!res.ok) throw new Error('Upload failed');
    return res.json();
  },

  admin: {
    getUsers: () => apiRequest('/admin/users'),
    getAllChannels: () => apiRequest('/admin/channels'),
    getChannelMessages: (channelId) => apiRequest(`/admin/channels/${channelId}/messages`),
    search: (q) => apiRequest(`/admin/search?q=${encodeURIComponent(q)}`),
    getAuditLog: () => apiRequest('/admin/audit-log'),
  },
};
