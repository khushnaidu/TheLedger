export const STATUSES = ['BACKLOG', 'TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'];

export const STATUS_CONFIG = {
  BACKLOG: { label: 'Backlog', color: '#8a7e72', stamp: false },
  TODO: { label: 'To Do', color: '#1a1714', stamp: false },
  IN_PROGRESS: { label: 'In Progress', color: '#c41e1e', stamp: true },
  REVIEW: { label: 'Review', color: '#4a433c', stamp: false },
  DONE: { label: 'Done', color: '#1a1714', stamp: true },
};

export const PRIORITY_CONFIG = {
  CRITICAL: { label: 'Critical', color: '#c41e1e', weight: 4 },
  HIGH: { label: 'High', color: '#1a1714', weight: 3 },
  MEDIUM: { label: 'Medium', color: '#4a433c', weight: 2 },
  LOW: { label: 'Low', color: '#8a7e72', weight: 1 },
};

export const PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
