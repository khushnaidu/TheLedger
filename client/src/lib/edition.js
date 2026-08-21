// Two editions of the ledger share one codebase:
//  - "personal": the original — private photos, the dedication, the miis
//  - "public":   neutral art only, safe to show anyone
// The edition is chosen at sign-in: entering the special code unlocks
// the personal one; everything else gets public. It lives in localStorage
// so a refresh keeps the edition until sign-out.

const EDITION_KEY = 'ledger_edition';
const SPECIAL_CODE = 'BIBBLE';

export function resolveEdition(code) {
  return (code || '').trim().toUpperCase() === SPECIAL_CODE ? 'personal' : 'public';
}

export function setEdition(edition) {
  localStorage.setItem(EDITION_KEY, edition);
}

export function clearEdition() {
  localStorage.removeItem(EDITION_KEY);
}

export function isPersonal() {
  return localStorage.getItem(EDITION_KEY) === 'personal';
}
