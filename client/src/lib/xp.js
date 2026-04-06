import { getTheme, LEVEL_TITLES } from './theme';

const STORAGE_KEY = 'ledger_xp';

const XP_PER_PRIORITY = {
  CRITICAL: 50,
  HIGH: 30,
  MEDIUM: 20,
  LOW: 10,
};

const LEVEL_XP = [0, 50, 150, 300, 500, 800, 1200, 1800, 2500, 3500];

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
  const theme = getTheme();
  const titles = LEVEL_TITLES[theme] || LEVEL_TITLES.ledger;

  let levelIdx = 0;
  for (let i = LEVEL_XP.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_XP[i]) {
      levelIdx = i;
      break;
    }
  }

  const currentXp = LEVEL_XP[levelIdx];
  const nextXp = LEVEL_XP[levelIdx + 1] || currentXp;
  const progress = nextXp > currentXp ? (xp - currentXp) / (nextXp - currentXp) : 1;

  return {
    level: levelIdx + 1,
    title: titles[levelIdx] || titles[titles.length - 1],
    xp,
    nextXp,
    progress,
  };
}

export function awardXP(ticketId, priority) {
  const state = getXPState();
  if (state.ticketsCounted.includes(ticketId)) return null;

  const earned = XP_PER_PRIORITY[priority] || 10;
  const oldLevel = getLevelInfo(state.xp);
  const newXp = state.xp + earned;
  const newLevel = getLevelInfo(newXp);

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
