import { MARX_FACE, FRIEDMAN_FACE } from '../../lib/theme';

// Two men keep this book and they do not agree about it. Everything the UI
// needs to render either one lives here, so adding a third clerk later is a
// new key rather than a sweep through the components. The personas themselves
// are server-side in routes/finance.js — nothing here reaches the model.
//
// The split is by heading, not by feature: Marx presides over the money that
// leaves before you get a say, Friedman over the money you chose to spend.
// See groups.js for which heading belongs to whom, and ADR-0008 for why.

export const CLERKS = {
  friedman: {
    id: 'friedman',
    name: 'Milton Friedman',
    short: 'Friedman',
    initial: 'F',
    role: 'on what you chose',
    face: FRIEDMAN_FACE,
    ink: '#1f3f6e',
    greeting: 'Friedman. I have the discretionary side of this book, which is the interesting half. Tell me what you bought and I will draft it, or ask me what the figures are doing.',
    placeholder: 'spent 62.41 at trader joes…',
    thinking: ['Checking the price…', 'Reading the preference…', 'Adjusting for inflation…', 'Smoothing it out…'],
    peek: 'A word about that?',
  },
  marx: {
    id: 'marx',
    name: 'Karl Marx',
    short: 'Marx',
    initial: 'M',
    role: 'on what was taken',
    face: MARX_FACE,
    ink: '#c4341f',
    greeting: 'Marx. I keep the side of this book you did not agree to. Rent, subscriptions, interest, fees. Tell me what moved and I will draft it, or ask me where it went.',
    placeholder: 'rent 2400 on the first…',
    thinking: ['Counting the hours…', 'Reading the arrangement…', 'Finding the landlord…', 'Totalling what was taken…'],
    peek: 'We should talk.',
  },
};

export const CLERK_IDS = ['friedman', 'marx'];

// Friedman opens the door because he is the one who says hello. Marx is one
// click away and presides over half the plate regardless.
export const DEFAULT_CLERK = 'friedman';

export const clerkOf = (id) => CLERKS[id] || CLERKS[DEFAULT_CLERK];
