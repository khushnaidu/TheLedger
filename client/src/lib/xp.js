const STORAGE_KEY = 'ledger_xp';

const XP_PER_PRIORITY = {
  CRITICAL: 50,
  HIGH: 30,
  MEDIUM: 20,
  LOW: 10,
};

// XP needed per level (cumulative thresholds)
const LEVELS = [
  { level: 1, title: 'Intern', xp: 0 },
  { level: 2, title: 'Filing Clerk', xp: 50 },
  { level: 3, title: 'Junior Archivist', xp: 150 },
  { level: 4, title: 'Archivist', xp: 300 },
  { level: 5, title: 'Senior Archivist', xp: 500 },
  { level: 6, title: 'Records Officer', xp: 800 },
  { level: 7, title: 'Chief of Records', xp: 1200 },
  { level: 8, title: 'Ledger Master', xp: 1800 },
  { level: 9, title: 'Bureau Director', xp: 2500 },
  { level: 10, title: 'Grand Archivist', xp: 3500 },
];

export function getXPState() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return { xp: data.xp || 0, ticketsCounted: data.ticketsCounted || [] };
  } catch {
    return { xp: 0, ticketsCounted: [] };
  }
}

function saveXPState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function getLevelInfo(xp) {
  let current = LEVELS[0];
  let next = LEVELS[1];
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (xp >= LEVELS[i].xp) {
      current = LEVELS[i];
      next = LEVELS[i + 1] || null;
      break;
    }
  }
  const progress = next
    ? (xp - current.xp) / (next.xp - current.xp)
    : 1;
  return { ...current, xp, nextXp: next?.xp || current.xp, progress };
}

// Award XP for a completed ticket (only once per ticket)
export function awardXP(ticketId, priority) {
  const state = getXPState();
  if (state.ticketsCounted.includes(ticketId)) return null; // already counted

  const earned = XP_PER_PRIORITY[priority] || 10;
  const oldLevel = getLevelInfo(state.xp);
  const newXp = state.xp + earned;
  const newLevel = getLevelInfo(newXp);

  // Keep only last 500 ticket IDs to prevent unbounded growth
  const ticketsCounted = [...state.ticketsCounted, ticketId].slice(-500);
  saveXPState({ xp: newXp, ticketsCounted });

  return {
    earned,
    totalXp: newXp,
    leveledUp: newLevel.level > oldLevel.level,
    level: newLevel,
  };
}

export function getTotalXP() {
  return getXPState().xp;
}
