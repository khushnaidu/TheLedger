const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('ledger_token');
}

export function setToken(token) {
  if (token) localStorage.setItem('ledger_token', token);
  else localStorage.removeItem('ledger_token');
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

  // AI Assistant
  generateTicket: (data) => request('/ai/generate-ticket', { method: 'POST', body: JSON.stringify(data) }),
  createTicketsFromGus: (data) => request('/ai/create-tickets', { method: 'POST', body: JSON.stringify(data) }),
};
