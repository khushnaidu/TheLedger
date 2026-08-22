import { lazy } from 'react';

// ── the hub registry ─────────────────────────────────────────
// Single source of truth for the paper's sections and every tool
// in them. Sidebar nav and App routes both render from here —
// adding a tool = one entry below + one client/src/tools/<id>/ dir
// (+ one route line in server/src/app.js if it has an API).
//
// Tool flags: `end` (NavLink exact match), `personalOnly` (only in
// the personal edition).

export const SECTIONS = [
  { id: 'desk', label: 'The Desk' },
  { id: 'study', label: 'The Study' },
  { id: 'classifieds', label: 'The Classifieds' },
  { id: 'accounts', label: 'The Accounts' },
  { id: 'parlor', label: 'The Parlor' },
];

export const TOOLS = [
  // ── the desk ──
  { id: 'dashboard', name: 'Command Center', route: '/', end: true, section: 'desk',
    Component: lazy(() => import('../pages/Dashboard')) },
  { id: 'board', name: 'Board', route: '/board', section: 'desk',
    Component: lazy(() => import('../pages/Board')) },
  { id: 'archive', name: 'Archive', route: '/list', section: 'desk',
    Component: lazy(() => import('../pages/ListView')) },
  // ── the study ──
  { id: 'notebooks', name: 'Notebooks', route: '/notebooks', section: 'study',
    Component: lazy(() => import('./notebooks/NotebooksShelf')) },
  { id: 'research', name: 'Reading Room', route: '/research', section: 'study',
    Component: lazy(() => import('./research/ReadingRoom')) },
  // ── the accounts ──
  { id: 'finance', name: 'The Book', route: '/finance', section: 'accounts',
    Component: lazy(() => import('./finance/Overview')) },
  // ── the parlor ──
  { id: 'wall', name: 'My Wall', route: '/wall', section: 'parlor',
    Component: lazy(() => import('../pages/MyWall')) },
  { id: 'faceoff', name: 'Face-Off', route: '/faceoff', section: 'parlor',
    Component: lazy(() => import('../pages/FaceOff')) },
];

// Routes with no nav row — detail/editor pages reached from a tool.
export const HIDDEN_ROUTES = [
  { route: '/tickets/new', Component: lazy(() => import('../pages/CreateTicket')) },
  { route: '/tickets/:id', Component: lazy(() => import('../pages/TicketDetail')) },
  { route: '/notebooks/:id', Component: lazy(() => import('./notebooks/NotebookReader')) },
  { route: '/research/:paperId', Component: lazy(() => import('./research/PaperReader')) },
  { route: '/finance/lines', Component: lazy(() => import('./finance/LedgerLines')) },
];
