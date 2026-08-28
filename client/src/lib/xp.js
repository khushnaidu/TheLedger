import { LEVEL_TITLES } from './theme';

// XP is the ACCOUNT'S, kept on the server (User.xp) and paid out by the
// tickets API whenever a ticket reaches DONE by any road — board drag,
// the detail page, a clerk. The old localStorage ledger pinned readers
// at 0 XP forever (per-browser, and blind to every completion that
// didn't happen as a board drag). This module now only knows the level
// table and how to dress a server award for the announcement event.

const LEVEL_XP = [0, 50, 150, 300, 500, 800, 1200, 1800, 2500, 3500];

export function getLevelInfo(xp) {
  const titles = LEVEL_TITLES;

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

// Dress a server xpAward ({earned, totalXp}) as the gus-xp-gained
// event detail the sidebar and Gus already understand.
export function xpEventDetail(xpAward) {
  const level = getLevelInfo(xpAward.totalXp);
  const before = getLevelInfo(xpAward.totalXp - xpAward.earned);
  return {
    earned: xpAward.earned,
    totalXp: xpAward.totalXp,
    leveledUp: level.level > before.level,
    level,
  };
}
