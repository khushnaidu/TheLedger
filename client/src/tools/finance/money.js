// Money is counted in whole cents on the client and sent as fixed
// two-decimal strings. Never sum Decimal-as-float — 0.1 + 0.2 has no
// business anywhere near a ledger.

export const cents = (v) => Math.round(Number(v || 0) * 100);

export const fromCents = (c) => (c / 100).toFixed(2);

// 1234.5 → "1,234.50"
export function fmt(v) {
  const n = Number(v || 0);
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// the foot of the column reads plainly: 1,234.50 CR / (1,234.50) DR
export function foot(c) {
  const s = fmt(Math.abs(c) / 100);
  return c < 0 ? `(${s})` : s;
}

// "08.19" — the book writes dates short
export function shortDate(iso) {
  const d = new Date(iso);
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`;
}

export const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// "2026-08" → "AUG 2026"
export function monthLabel(month) {
  const [y, m] = month.split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

export function shiftMonth(month, by) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

export const todayIso = () => new Date().toISOString().slice(0, 10);

const pad = (n) => String(n).padStart(2, '0');

// A ledger is written fast, so the date cell takes "8.19" and fills the
// year in from the page you are on. Full dates are accepted too. A native
// date input was tried first and is far too wide for the column.
export function parseDayInput(text, year) {
  const s = String(text ?? '').trim();
  let y = year;
  let mo;
  let d;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) [, y, mo, d] = m;
  else if ((m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/.exec(s))) {
    [, mo, d, y] = m;
    if (String(y).length === 2) y = `20${y}`;
  } else if ((m = /^(\d{1,2})[./-](\d{1,2})$/.exec(s))) [, mo, d] = m;
  else return null;
  if (Number(mo) < 1 || Number(mo) > 12 || Number(d) < 1 || Number(d) > 31) return null;
  const iso = `${y}-${pad(mo)}-${pad(d)}`;
  const check = new Date(`${iso}T00:00:00Z`);
  // rejects 02.31 and friends — the roll-over changes the month
  return check.getUTCMonth() + 1 === Number(mo) ? iso : null;
}

// ISO → the "08.19" the column expects
export const dayInput = (iso) => (iso ? `${iso.slice(5, 7)}.${iso.slice(8, 10)}` : '');

// the starter shelf of categories — the picker learns the rest from the book
export const STARTER_CATEGORIES = [
  'groceries', 'dining', 'rent', 'utilities', 'transit', 'health',
  'subscriptions', 'shopping', 'fun', 'travel', 'school', 'salary', 'refund',
];
