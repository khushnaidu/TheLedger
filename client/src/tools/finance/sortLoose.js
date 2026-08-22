import { api } from '../../api';

// Putting names to loose lines. A statement gives you "SAFEWAY #1842 SAN JOSE
// CA", never "groceries", so a fresh import lands entirely uncategorized and
// the plate is one grey wedge. Reading merchant names is the one part of this
// that wants a model; applying the answer is plain arithmetic.
//
// Both ceilings below are the server's, not guesses. Exceed either and the
// request is refused outright, which on a year of statements means the tail
// of the book silently keeps its grey.

export const NAME_BATCH = 120; // POST /categorize refuses more per call
export const ID_BATCH = 1000; // PATCH /entries/bulk refuses more per call
const FETCH_CAP = 5000; // GET /entries will not return more than this

// The server trims and clips a description before using it as a map key, so
// the lookup has to agree exactly or every long merchant name misses and the
// line stays loose for no visible reason.
export const nameKey = (d) => String(d ?? '').trim().slice(0, 160);

// distinct descriptions → { category } , in batches the server will accept
export async function readNames(descriptions, onProgress) {
  const names = [...new Set(descriptions.map(nameKey).filter(Boolean))];
  const map = {};
  let truncated = false;
  let placed = 0; // names the sorter could actually put a category to
  const sample = [];
  for (let i = 0; i < names.length; i += NAME_BATCH) {
    onProgress?.({ phase: 'reading', done: i, total: names.length });
    const res = await api.sortCategories(names.slice(i, i + NAME_BATCH));
    Object.assign(map, res.map);
    placed += res.placed ?? 0;
    if (res.truncated) truncated = true;
    if (!sample.length && res.sample) sample.push(...res.sample);
  }
  onProgress?.({ phase: 'reading', done: names.length, total: names.length });
  return { map, names: names.length, placed, truncated, sample };
}

// one PATCH per category rather than one per line, chunked so a year of
// groceries does not exceed the bulk ceiling in a single call
async function fileLines(rows, map, onProgress) {
  const byCategory = new Map();
  for (const e of rows) {
    const cat = map[nameKey(e.description)];
    if (!cat || cat === 'uncategorized') continue;
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat).push(e.id);
  }
  const total = [...byCategory.values()].reduce((a, ids) => a + ids.length, 0);
  let filed = 0;
  for (const [cat, ids] of byCategory) {
    for (let i = 0; i < ids.length; i += ID_BATCH) {
      const { count } = await api.recategorize(ids.slice(i, i + ID_BATCH), cat);
      filed += count;
      onProgress?.({ phase: 'filing', done: filed, total });
    }
  }
  return { filed, categories: byCategory.size };
}

// The whole book, not whichever month happens to be on screen. A year of
// statements imported in one go is the case this exists for, and the caller
// that only sorted the visible month left eleven months grey.
export async function sortBook(onProgress) {
  const rows = await api.getEntries({
    month: 'all',
    category: 'uncategorized',
    limit: FETCH_CAP,
  });
  if (!rows.length) return { found: 0, filed: 0, names: 0, categories: 0, left: 0, more: false };

  const { map, names, placed, truncated, sample } = await readNames(rows.map((e) => e.description), onProgress);
  const { filed, categories } = await fileLines(rows, map, onProgress);

  return {
    found: rows.length,
    filed,
    names,
    placed,
    categories,
    left: rows.length - filed,
    // the fetch itself was capped, so there is more grey past this pass
    more: rows.length === FETCH_CAP,
    truncated,
    sample,
  };
}

// What to tell the user afterwards, in the book's register.
//
// "Could not place any of them" is true but useless, because it covers two
// completely different problems with completely different fixes. Either the
// sorter could not name the descriptions, or it named them and the filing
// failed. Only the first is usually the user's to act on, and when it happens
// the cause is nearly always that the import took the wrong column, so the
// report shows what it actually read.
export function sortReport(r) {
  if (!r.found) return 'Every line in the book already has a category.';

  if (!r.filed) {
    if (r.placed === 0 && r.names > 0) {
      const eg = (r.sample || []).slice(0, 3).map((s) => `"${s}"`).join(', ');
      return `None of the ${r.names} descriptions could be read as a merchant. This is what the book has: ${eg}. If that is not shop names, the import took the wrong column and these lines need reimporting, not resorting.`;
    }
    return `Read ${r.names} names and placed ${r.placed}, but nothing would file. Something is wrong at the desk, not with the statement.`;
  }

  const bits = [`${r.filed} of ${r.found} lines filed under ${r.categories} ${r.categories === 1 ? 'category' : 'categories'}`];
  if (r.left) bits.push(`${r.left} could not be read and stay loose`);
  if (r.truncated) bits.push('one batch ran long and its tail was skipped, press again');
  if (r.more) bits.push(`${FETCH_CAP} was the most that could be read at once, press again for the rest`);
  return `${bits.join('. ')}.`;
}
