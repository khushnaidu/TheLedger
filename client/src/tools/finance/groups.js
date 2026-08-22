// Eleven thin slices is not a pie, it is a barcode. Categories roll up into
// a handful of headings a person actually thinks in, and the plate is drawn
// from those. Matching is on the category name Vera already assigned, so this
// stays deterministic — no second model call to decide what a chart looks like.

export const GROUPS = [
  {
    id: 'roof',
    photo: '/art/pie/roof.webp',
    ink: '#1f3f6e',
    screen: 'stipple',
    label: 'Roof over it',
    match: [/rent/, /mortgage/, /utilit/, /electric/, /^gas$|^pge$/, /water/, /internet/, /phone/, /insurance/, /hoa/],
  },
  {
    id: 'table',
    photo: '/art/pie/table.webp',
    ink: '#c4341f',
    screen: 'dots',
    label: 'The table',
    match: [/grocer/, /dining/, /restaurant/, /coffee/, /food/, /takeout/, /bar$|^bars$/, /alcohol/],
  },
  {
    id: 'moving',
    photo: '/art/pie/moving.webp',
    ink: '#1c7a6e',
    screen: 'hatch',
    label: 'Getting about',
    match: [/transit/, /fuel|petrol|gasoline/, /^gas$/, /parking/, /uber|lyft|rideshare/, /car|auto/, /flight|airline/, /train/],
  },
  {
    id: 'keeping',
    photo: '/art/pie/keeping.webp',
    ink: '#6a4a96',
    screen: 'hatchb',
    label: 'Keeping going',
    match: [/health/, /pharmac/, /medical|doctor|dentist/, /fitness|gym/, /grooming|haircut/, /laundry/, /household|home/, /childcare/, /pet/],
  },
  {
    id: 'standing',
    photo: '/art/pie/standing.webp',
    ink: '#b3861f',
    screen: 'horz',
    label: 'Standing orders',
    match: [/subscription/, /streaming/, /membership/, /recurring/, /saas|software/],
  },
  {
    id: 'pleasure',
    photo: '/art/pie/pleasure.webp',
    ink: '#b83a72',
    screen: 'vert',
    label: 'For pleasure',
    match: [/fun/, /entertain/, /shopping/, /travel|holiday|vacation/, /hobby|hobbies/, /game|gaming/, /book/, /gift/],
  },
  {
    id: 'owed',
    photo: '/art/pie/owed.webp',
    ink: '#3f7a35',
    screen: 'cross',
    label: 'Owed elsewhere',
    match: [/school|tuition|course/, /loan|debt|credit card/, /tax/, /fee|fees/, /charity|donation/, /savings|invest/],
  },
];

const OTHER = { id: 'other', photo: '/art/pie/other.webp', ink: '#6f6f6f', screen: 'ink', label: 'Unaccounted' };

export function groupOf(category) {
  const c = String(category || '').toLowerCase();
  for (const g of GROUPS) if (g.match.some((re) => re.test(c))) return g;
  return OTHER;
}

// Each heading owns a photographed pie, plus a spot colour and screen to fall
// back on if the image is missing. All three are fixed per heading rather than
// handed out by rank — a wedge you learn to recognise in one month should look
// the same in the next.
//
// The photos in /art/pie are normalised: square, pie centred, radius exactly
// half the width. That is what lets the plate place them with no per-file
// constants. Re-cut any replacement the same way.

// entries → slices, largest first, each carrying the lines behind it so a
// click has something to open without going back to the server
export function buildSlices(entries) {
  const bucket = new Map();
  let total = 0;
  for (const e of entries) {
    if (e.kind !== 'expense') continue;
    const g = groupOf(e.category);
    if (!bucket.has(g.id)) bucket.set(g.id, { ...g, cents: 0, lines: [], categories: new Map() });
    const slot = bucket.get(g.id);
    const c = Math.round(Number(e.amount) * 100);
    slot.cents += c;
    slot.lines.push(e);
    slot.categories.set(e.category, (slot.categories.get(e.category) || 0) + c);
    total += c;
  }
  const slices = [...bucket.values()]
    .map((s) => ({
      ...s,
      total: s.cents / 100,
      share: total ? s.cents / total : 0,
      categories: [...s.categories.entries()]
        .map(([name, cents]) => ({ name, total: cents / 100 }))
        .sort((a, b) => b.total - a.total),
      lines: s.lines.sort((a, b) => Number(b.amount) - Number(a.amount)),
    }))
    .sort((a, b) => b.cents - a.cents);
  return { slices, total: total / 100 };
}
