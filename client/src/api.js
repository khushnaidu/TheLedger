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

// ── the blob shelf ───────────────────────────────────────────
// JWT segments are base64url; atob speaks plain base64. Whether a given
// token happens to contain '-' or '_' is luck of the encoding, so
// translate before decoding — the bare-atob version of this worked for
// every token that happened to draw a clean alphabet, and no other.
function tokenPayload(token) {
  const seg = (token || '').split('.')[1] || '';
  return JSON.parse(atob(seg.replace(/-/g, '+').replace(/_/g, '/')));
}

// One door to the blob store. The SDK flattens every handshake refusal
// into "Failed to retrieve the client token", so the handshake question
// is asked FIRST through request(), which speaks the house's language:
// a dead session walks to /login like every other call, and a real
// refusal arrives with the server's own words. Only then does the SDK
// do the actual carry — after a passing preflight, a failure can only
// be the browser-to-storage leg, and the error finally says so.
async function uploadToShelf(shelf, fallbackName, file, contentType) {
  const { upload } = await import('@vercel/blob/client');
  const token = getToken();
  const { userId } = tokenPayload(token);
  const safeName = (file.name || '').replace(/[^\w.-]+/g, '_').slice(-60) || fallbackName;
  const pathname = `${shelf}/${userId}/${safeName}`;
  try {
    await request('/uploads', {
      method: 'POST',
      body: JSON.stringify({
        type: 'blob.generate-client-token',
        payload: { pathname, callbackUrl: `${window.location.origin}/api/uploads`, clientPayload: token, multipart: false },
      }),
    });
  } catch (err) {
    if (/BLOB_READ_WRITE_TOKEN|storage not configured/i.test(err.message || '')) {
      throw new Error('File storage is not set up on this deployment — create a Blob store on the Vercel project (Storage → Create → Blob), then add BLOB_READ_WRITE_TOKEN to server/.env for local dev.');
    }
    throw err;
  }
  try {
    const blob = await upload(pathname, file, {
      access: 'public',
      handleUploadUrl: '/api/uploads',
      clientPayload: token,
      ...(contentType ? { contentType } : {}),
    });
    return blob.url;
  } catch {
    throw new Error('The desk cleared this upload, but your browser could not deliver the file to storage (vercel.com) — an ad blocker, VPN, or network filter is likely standing in the door.');
  }
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
  // the sparring ring (ADR-0014) — its own bout, kind 'leetcode'
  getSparBout: () => request('/partner/spar'),
  inviteSpar: (email) => request('/partner/spar/invite', { method: 'POST', body: JSON.stringify({ email }) }),
  acceptSpar: () => request('/partner/spar/accept', { method: 'POST' }),
  unlinkSpar: () => request('/partner/spar', { method: 'DELETE' }),
  getProblems: () => request('/partner/problems'),
  logProblem: (data) => request('/partner/problems', { method: 'POST', body: JSON.stringify(data) }),
  deleteProblem: (id) => request(`/partner/problems/${id}`, { method: 'DELETE' }),
  uploadProofImage: (file) => uploadToShelf('proofs', 'proof.png', file),
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

  // Blob uploads — the SDK handshake can't carry our auth header, so the
  // JWT rides along as clientPayload (verified server-side); uploadToShelf
  // holds the shared door and the shared failure language.
  uploadNotebookImage: (file) => uploadToShelf('notebooks', 'photo', file),

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

  // The Gymnasium (the study)
  getDrills: () => request('/practice/drills'),
  createDrill: (data) => request('/practice/drills', { method: 'POST', body: JSON.stringify(data) }),
  getDrill: (id) => request(`/practice/drills/${id}`),
  updateDrill: (id, data) => request(`/practice/drills/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteDrill: (id) => request(`/practice/drills/${id}`, { method: 'DELETE' }),
  askAda: (data) => request('/practice/chat', { method: 'POST', body: JSON.stringify(data) }),

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
  // how many lines in the whole book still have no category
  getLooseCount: () => request('/finance/loose'),
  // same day, amount, kind and description — twins a second import let in
  getDuplicates: () => request('/finance/duplicates'),
  strikeDuplicates: () => request('/finance/duplicates/strike', { method: 'POST' }),
  // total and irreversible; the server refuses without the exact phrase
  resetBook: (confirm) =>
    request('/finance/entries/all', { method: 'DELETE', body: JSON.stringify({ confirm }) }),
  recategorize: (ids, category) =>
    request('/finance/entries/bulk', { method: 'PATCH', body: JSON.stringify({ ids, category }) }),
  sortCategories: (descriptions) =>
    request('/finance/categorize', { method: 'POST', body: JSON.stringify({ descriptions }) }),
  // who is 'marx' | 'friedman'; the two keep separate transcripts client-side
  askClerk: (who, messages) =>
    request('/finance/chat', { method: 'POST', body: JSON.stringify({ who, messages }) }),
  // one heading's worth of commentary. `both` runs the contested pair, where
  // Marx answers Friedman rather than the two of them talking past each other.
  getRemark: (body) => request('/finance/remark', { method: 'POST', body: JSON.stringify(body) }),

  // The Rewrite Desk — masters stored, tailored copies never touch the server
  // (the jobs wire was retired 2026-08; see ADR-0010)
  // The Application Log — paste a posting, it files itself (ADR-0012)
  getApplications: () => request('/jobs/applications'),
  fileApplication: (raw) => request('/jobs/applications', { method: 'POST', body: JSON.stringify({ raw }) }),
  updateApplication: (id, data) => request(`/jobs/applications/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteApplication: (id) => request(`/jobs/applications/${id}`, { method: 'DELETE' }),
  getResumes: () => request('/jobs/resumes'),
  addResume: (data) => request('/jobs/resumes', { method: 'POST', body: JSON.stringify(data) }),
  updateResume: (id, data) => request(`/jobs/resumes/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteResume: (id) => request(`/jobs/resumes/${id}`, { method: 'DELETE' }),
  tailorResume: (data) => request('/jobs/tailor', { method: 'POST', body: JSON.stringify(data) }),
  // contentType stated outright: some machines hand .docx over as
  // octet-stream and the server allowlist is exact (same lesson as PDFs)
  uploadResumeDocx: (file) =>
    uploadToShelf('resumes', 'resume.docx', file, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),

  // PDF upload rides the same Blob handshake under papers/<userId>/
  uploadPaperPdf: (file) => uploadToShelf('papers', 'paper.pdf', file, 'application/pdf'),
};
