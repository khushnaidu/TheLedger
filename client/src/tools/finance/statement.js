// Statements are parsed here, in the browser. The server never sees one,
// only clean rows — same posture as the Reading Room's PDF text extraction
// (ADR-0005, ADR-0007).
//
// Banks export whatever they feel like. This reads comma files, Excel
// copy-paste (tabs), pipe tables, and the fixed-width text dumps that come
// out of a "download as text" button, which are columns held apart by runs
// of spaces. Whatever cannot be read is reported, never silently dropped.

// RFC-ish: quoted fields, doubled quotes, CRLF, trailing newline
function splitCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const lines = (text) => text.split(/\r?\n/).filter((l) => l.trim() !== '');

// How consistently does this separator cut the file? A real delimiter
// produces the same column count on most lines; a stray comma inside a
// merchant name does not.
function score(rawLines, cut) {
  const counts = rawLines.map((l) => cut(l).length).filter((n) => n > 1);
  if (counts.length < Math.max(2, rawLines.length * 0.5)) return { hits: 0 };
  const tally = new Map();
  for (const n of counts) tally.set(n, (tally.get(n) || 0) + 1);
  const [cols, hits] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
  return { hits, cols };
}

const CUTS = {
  // Excel copy-paste is tab separated, and tabs are never accidental
  tab: (l) => l.split('\t'),
  pipe: (l) => l.split('|').map((c) => c.trim()),
  // a text dump holds its columns apart with runs of spaces
  spaces: (l) => l.trim().split(/\s{2,}/),
};

function detect(text) {
  const rawLines = lines(text);
  if (!rawLines.length) return { kind: 'none', rows: [] };

  const candidates = Object.entries(CUTS)
    .map(([kind, cut]) => ({ kind, cut, ...score(rawLines, cut) }))
    .filter((c) => c.hits > 0);

  const csvRows = splitCsv(text);
  const csv = score(rawLines, (l) => splitCsv(l)[0] || []);
  if (csv.hits > 0) candidates.push({ kind: 'comma', cut: null, ...csv });

  if (!candidates.length) return { kind: 'none', rows: [] };

  // tabs beat everything, then whichever separator was most consistent
  const tab = candidates.find((c) => c.kind === 'tab');
  const best = tab || candidates.sort((a, b) => b.hits - a.hits || b.cols - a.cols)[0];

  const rows = best.kind === 'comma'
    ? csvRows
    : rawLines.map(best.cut);

  return { kind: best.kind, rows: rows.map((r) => r.map((f) => String(f ?? '').trim())) };
}

const HEADER_HINTS = {
  date: [/^(transaction[ _]?|posting[ _]?|post[ _]?)?date$/i, /posted/i, /^date/i],
  description: [/description/i, /particulars/i, /payee/i, /merchant/i, /memo/i, /^name$/i, /details/i, /transaction/i],
  amount: [/^amount$/i, /amount/i, /^value$/i],
  debit: [/debit/i, /withdraw/i, /^out$/i, /charge/i],
  credit: [/credit/i, /deposit/i, /^in$/i],
  category: [/category/i, /^type$/i, /class/i],
};

const looksLikeHeader = (row) => {
  const hits = Object.values(HEADER_HINTS)
    .filter((hints) => row.some((cell) => cell && hints.some((re) => re.test(cell)))).length;
  // a header names at least a date and one money column
  return hits >= 2 && !row.some((cell) => /^\$?-?[\d,]+\.\d{2}$/.test(cell));
};

// Banks print account numbers and "Statement period" lines above the table.
// Find the real header so that preamble never lands in the book.
export function parseStatement(text) {
  const { kind, rows } = detect(text);
  if (!rows.length) return { rows: [], headerIndex: -1, preamble: 0, kind };

  let headerIndex = -1;
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    if (looksLikeHeader(rows[i])) { headerIndex = i; break; }
  }

  const body = headerIndex === -1 ? rows : rows.slice(headerIndex);
  return { rows: body, headerIndex: headerIndex === -1 ? -1 : 0, preamble: Math.max(0, headerIndex), kind };
}

const matchColumn = (headers, hints) =>
  headers.findIndex((h) => hints.some((re) => re.test(h)));

// Best guess at which column is what. Everything stays user-editable.
export function guessMapping(headers) {
  const pick = (k) => {
    const i = matchColumn(headers, HEADER_HINTS[k]);
    return i === -1 ? null : i;
  };
  const debit = pick('debit');
  const credit = pick('credit');
  return {
    date: pick('date'),
    description: pick('description'),
    amount: pick('amount'),
    category: pick('category'),
    debit,
    credit,
    // banks either give one signed column or a debit/credit pair
    layout: debit !== null && credit !== null ? 'pair' : 'signed',
    // in a signed column most banks write money out as a negative
    negativeIsExpense: true,
  };
}

// When there is no header row, guess by looking at the data itself.
export function guessMappingFromData(rows) {
  const sample = rows.slice(0, 12);
  const width = Math.max(...sample.map((r) => r.length));
  const looksDate = (v) => /^\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}$/.test(v);
  const looksMoney = (v) => /^\(?[$£€]?-?[\d,]+\.\d{2}\)?-?$/.test(v);
  const rate = (fn, col) => sample.filter((r) => fn(String(r[col] ?? '').trim())).length / sample.length;

  let date = null;
  let amount = null;
  let description = null;
  for (let c = 0; c < width; c++) {
    if (date === null && rate(looksDate, c) > 0.6) date = c;
    else if (rate(looksMoney, c) > 0.6) amount = amount === null ? c : amount;
    else if (description === null && rate((v) => v.length > 3 && !looksMoney(v), c) > 0.6) description = c;
  }
  return {
    date, description, amount, category: null, debit: null, credit: null,
    layout: 'signed', negativeIsExpense: true,
  };
}

const NUM = /-?[\d,]*\.?\d+/;

function toAmount(raw) {
  let s = String(raw ?? '').trim();
  if (!s) return null;
  // banks mark money out three different ways, sometimes in one file
  const bracketed = /^\(.*\)$/.test(s);
  const trailingMinus = /-\s*$/.test(s);
  const debitTag = /\b(dr|debit)\b/i.test(s);
  const creditTag = /\b(cr|credit)\b/i.test(s);
  s = s.replace(/\b(dr|cr|debit|credit)\b/gi, '').replace(/[()$£€\s]/g, '');
  const m = NUM.exec(s.replace(/,/g, ''));
  if (!m) return null;
  let n = parseFloat(m[0]);
  if (!Number.isFinite(n) || n === 0) return null;
  if (bracketed || trailingMinus || debitTag) n = -Math.abs(n);
  else if (creditTag) n = Math.abs(n);
  return n;
}

// Banks disagree about dates. Try ISO, then US, then let the browser try.
// Anything that lands outside living memory is treated as unreadable.
function toDate(raw) {
  const s = String(raw ?? '').trim();
  let y;
  let mo;
  let d;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) [, y, mo, d] = m;
  else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(s))) {
    [, mo, d, y] = m;
    if (String(y).length === 2) y = `20${y}`;
    // a first field over 12 can only be a day, so the file is D/M/Y
    if (Number(mo) > 12) [mo, d] = [d, mo];
  } else {
    const parsed = new Date(s);
    if (Number.isNaN(parsed.getTime())) return null;
    y = parsed.getFullYear(); mo = parsed.getMonth() + 1; d = parsed.getDate();
  }
  const year = Number(y);
  if (year < 1990 || year > new Date().getFullYear() + 1) return null;
  const iso = `${year}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return Number.isNaN(new Date(`${iso}T00:00:00Z`).getTime()) ? null : iso;
}

// A statement imported twice must not double the book. The key is the line
// itself, readable rather than hashed so a collision is impossible, with an
// occurrence suffix so two identical coffees both survive.
function keyFor(row, seen) {
  const base = `csv:${row.date}:${row.kind === 'income' ? '+' : '-'}${row.amount}:${row.description
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)}`;
  const n = (seen.get(base) || 0) + 1;
  seen.set(base, n);
  return n === 1 ? base.slice(0, 120) : `${base.slice(0, 114)}#${n}`;
}

// rows (no header) + mapping → { entries, skipped }
export function mapRows(rows, mapping, fallbackCategory = 'uncategorized') {
  const entries = [];
  const skipped = [];
  const seen = new Map();
  const cell = (r, i) => (i === null || i === undefined ? '' : r[i] ?? '');

  rows.forEach((r, i) => {
    const date = toDate(cell(r, mapping.date));
    if (!date) { skipped.push({ row: i, text: r.join(' · ').slice(0, 90), reason: 'no readable date' }); return; }

    let value = null;
    let kind = 'expense';
    if (mapping.layout === 'pair') {
      const out = toAmount(cell(r, mapping.debit));
      const inn = toAmount(cell(r, mapping.credit));
      if (out !== null) { value = Math.abs(out); kind = 'expense'; }
      else if (inn !== null) { value = Math.abs(inn); kind = 'income'; }
    } else {
      const signedValue = toAmount(cell(r, mapping.amount));
      if (signedValue !== null) {
        value = Math.abs(signedValue);
        const negative = signedValue < 0;
        kind = (negative === mapping.negativeIsExpense) ? 'expense' : 'income';
      }
    }
    if (value === null) {
      skipped.push({ row: i, text: r.join(' · ').slice(0, 90), reason: 'no readable amount' });
      return;
    }

    const entry = {
      kind,
      amount: value.toFixed(2),
      date,
      description: String(cell(r, mapping.description)).slice(0, 160),
      category: (String(cell(r, mapping.category)).trim().toLowerCase() || fallbackCategory).slice(0, 32),
      source: 'csv',
    };
    entry.externalKey = keyFor(entry, seen);
    entries.push(entry);
  });

  return { entries, skipped };
}
