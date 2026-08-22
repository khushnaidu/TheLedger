const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('ledger_token');
}

// The entrance ceremony is tied to the session, not the tab's history, so
// dropping the token always resets it — see ENTERED_KEY in App.jsx.
export const ENTERED_KEY = 'ledger_entered';

export function setToken(token) {
  if (token) {
    localStorage.setItem('ledger_token', token);
  } else {
    localStorage.removeItem('ledger_token');
    try { sessionStorage.removeItem(ENTERED_KEY); } catch { /* private mode */ }
  }
}

export function isAuthenticated() {
  return !!getToken();
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { headers, ...options });

  if (res.status === 401) {
    setToken(null);
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export const api = {
  // Auth
  register: (data) => request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data) => request('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  forgotPassword: (email) => request('/auth/forgot', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (data) => request('/auth/reset', { method: 'POST', body: JSON.stringify(data) }),
  getMe: () => request('/auth/me'),

  // Tickets
  getTickets: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/tickets${qs ? `?${qs}` : ''}`);
  },
  getTicket: (id) => request(`/tickets/${id}`),
  createTicket: (data) => request('/tickets', { method: 'POST', body: JSON.stringify(data) }),
  updateTicket: (id, data) => request(`/tickets/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteTicket: (id) => request(`/tickets/${id}`, { method: 'DELETE' }),
  moveTicket: (id, data) => request(`/tickets/${id}/move`, { method: 'PATCH', body: JSON.stringify(data) }),

  // Categories
  getCategories: () => request('/categories'),
  createCategory: (data) => request('/categories', { method: 'POST', body: JSON.stringify(data) }),
  updateCategory: (id, data) => request(`/categories/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteCategory: (id) => request(`/categories/${id}`, { method: 'DELETE' }),

  // Labels
  getLabels: () => request('/labels'),
  createLabel: (data) => request('/labels', { method: 'POST', body: JSON.stringify(data) }),
  updateLabel: (id, data) => request(`/labels/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteLabel: (id) => request(`/labels/${id}`, { method: 'DELETE' }),

  // Stats
  getStats: () => request('/stats'),

  // Wall calendar events
  getEvents: (month) => request(`/events?month=${month}`),
  createEvent: (data) => request('/events', { method: 'POST', body: JSON.stringify(data) }),
  updateEvent: (id, data) => request(`/events/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteEvent: (id) => request(`/events/${id}`, { method: 'DELETE' }),
  searchGiphy: (q) => request(`/events/giphy/search?q=${encodeURIComponent(q)}`),

  // Calendar feed subscriptions (Google secret ICS / Apple public share)
  getFeeds: () => request('/feeds'),
  addFeed: (data) => request('/feeds', { method: 'POST', body: JSON.stringify(data) }),
  deleteFeed: (id) => request(`/feeds/${id}`, { method: 'DELETE' }),
  syncFeeds: (force = false) => request('/feeds/sync-all', { method: 'POST', body: JSON.stringify({ force }) }),

  // Ledgervision custom channels
  getChannels: () => request('/channels'),
  addChannel: (data) => request('/channels', { method: 'POST', body: JSON.stringify(data) }),
  deleteChannel: (id) => request(`/channels/${id}`, { method: 'DELETE' }),

  // Partner face-off
  getPartner: () => request('/partner'),
  invitePartner: (email) => request('/partner/invite', { method: 'POST', body: JSON.stringify({ email }) }),
  acceptPartner: () => request('/partner/accept', { method: 'POST' }),
  unlinkPartner: () => request('/partner', { method: 'DELETE' }),
  getFaceoff: () => request('/partner/faceoff'),
  leavePartnerNote: (body) => request('/partner/notes', { method: 'POST', body: JSON.stringify({ body }) }),

  // AI Assistant
  generateTicket: (data) => request('/ai/generate-ticket', { method: 'POST', body: JSON.stringify(data) }),
  createTicketsFromGus: (data) => request('/ai/create-tickets', { method: 'POST', body: JSON.stringify(data) }),

  // Notebooks (the study)
  getNotebooks: () => request('/notebooks'),
  createNotebook: (data) => request('/notebooks', { method: 'POST', body: JSON.stringify(data) }),
  getNotebook: (id) => request(`/notebooks/${id}`),
  updateNotebook: (id, data) => request(`/notebooks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteNotebook: (id) => request(`/notebooks/${id}`, { method: 'DELETE' }),
  addNotebookPage: (id) => request(`/notebooks/${id}/pages`, { method: 'POST' }),
  saveNotebookPage: (id, pageId, content) =>
    request(`/notebooks/${id}/pages/${pageId}`, { method: 'PATCH', body: JSON.stringify({ content }) }),
  deleteNotebookPage: (id, pageId) => request(`/notebooks/${id}/pages/${pageId}`, { method: 'DELETE' }),

  // Blob image upload — the SDK handshake can't carry our auth header,
  // so the JWT rides along as clientPayload (verified server-side)
  uploadNotebookImage: async (file) => {
    const { upload } = await import('@vercel/blob/client');
    const token = getToken();
    const { userId } = JSON.parse(atob(token.split('.')[1]));
    const safeName = file.name.replace(/[^\w.-]+/g, '_').slice(-60) || 'photo';
    try {
      const blob = await upload(`notebooks/${userId}/${safeName}`, file, {
        access: 'public',
        handleUploadUrl: '/api/uploads',
        clientPayload: token,
      });
      return blob.url;
    } catch (err) {
      // Only claim this when the server actually said so. Matching a bare
      // "token" swallowed every upload failure — the Blob SDK says "client
      // token" whenever the handshake is refused for any reason — and
      // reported it as unconfigured storage.
      if (/BLOB_READ_WRITE_TOKEN|storage not configured/i.test(err.message || '')) {
        throw new Error('Photo storage is not set up yet — create a Blob store on the Vercel project (Storage → Create → Blob), then add BLOB_READ_WRITE_TOKEN to server/.env for local dev.');
      }
      throw err;
    }
  },

  // Reading Room (the study)
  getCollections: () => request('/research/collections'),
  createCollection: (name) => request('/research/collections', { method: 'POST', body: JSON.stringify({ name }) }),
  updateCollection: (id, name) => request(`/research/collections/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  deleteCollection: (id) => request(`/research/collections/${id}`, { method: 'DELETE' }),
  getPapers: () => request('/research/papers'),
  createPaper: (data) => request('/research/papers', { method: 'POST', body: JSON.stringify(data) }),
  getPaper: (id) => request(`/research/papers/${id}`),
  updatePaper: (id, data) => request(`/research/papers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deletePaper: (id) => request(`/research/papers/${id}`, { method: 'DELETE' }),
  clearPaperPages: (id) => request(`/research/papers/${id}/pages`, { method: 'DELETE' }),
  postPaperPages: (id, pages) => request(`/research/papers/${id}/pages`, { method: 'POST', body: JSON.stringify({ pages }) }),
  createAnnotation: (paperId, data) =>
    request(`/research/papers/${paperId}/annotations`, { method: 'POST', body: JSON.stringify(data) }),
  updateAnnotation: (paperId, annId, data) =>
    request(`/research/papers/${paperId}/annotations/${annId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteAnnotation: (paperId, annId) =>
    request(`/research/papers/${paperId}/annotations/${annId}`, { method: 'DELETE' }),
  askJane: (data) => request('/research/chat', { method: 'POST', body: JSON.stringify(data) }),

  // The Accounts (the household book)
  getEntries: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/finance/entries${qs ? `?${qs}` : ''}`);
  },
  createEntry: (data) => request('/finance/entries', { method: 'POST', body: JSON.stringify(data) }),
  postEntries: (entries) => request('/finance/entries/batch', { method: 'POST', body: JSON.stringify({ entries }) }),
  updateEntry: (id, data) => request(`/finance/entries/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteEntry: (id) => request(`/finance/entries/${id}`, { method: 'DELETE' }),
  getFinanceSummary: (month) => request(`/finance/summary${month ? `?month=${month}` : ''}`),
  getTrend: () => request('/finance/trend'),
  recategorize: (ids, category) =>
    request('/finance/entries/bulk', { method: 'PATCH', body: JSON.stringify({ ids, category }) }),
  sortCategories: (descriptions) =>
    request('/finance/categorize', { method: 'POST', body: JSON.stringify({ descriptions }) }),
  askVera: (messages) => request('/finance/vera', { method: 'POST', body: JSON.stringify({ messages }) }),

  // PDF upload rides the same Blob handshake under papers/<userId>/
  uploadPaperPdf: async (file) => {
    const { upload } = await import('@vercel/blob/client');
    const token = getToken();
    const { userId } = JSON.parse(atob(token.split('.')[1]));
    const safeName = file.name.replace(/[^\w.-]+/g, '_').slice(-60) || 'paper.pdf';
    try {
      const blob = await upload(`papers/${userId}/${safeName}`, file, {
        access: 'public',
        handleUploadUrl: '/api/uploads',
        clientPayload: token,
        // Some machines hand a .pdf to the file input as octet-stream or with
        // no type at all, and the server's allowlist is exact — which failed
        // the upload for one user and nobody else. The extension is already
        // checked before we get here, so state the type outright.
        contentType: 'application/pdf',
      });
      return blob.url;
    } catch (err) {
      // Only claim this when the server actually said so. Matching a bare
      // "token" swallowed every upload failure — the Blob SDK says "client
      // token" whenever the handshake is refused for any reason — and
      // reported it as unconfigured storage.
      if (/BLOB_READ_WRITE_TOKEN|storage not configured/i.test(err.message || '')) {
        throw new Error('File storage is not set up yet — create a Blob store on the Vercel project (Storage → Create → Blob), then add BLOB_READ_WRITE_TOKEN to server/.env for local dev.');
      }
      throw err;
    }
  },
};
