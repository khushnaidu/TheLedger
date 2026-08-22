import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import StatementImport from './StatementImport';
import ClerkDrawer from './ClerkDrawer';
import PiePlate from './PiePlate';
import { buildSlices } from './groups';
import { CLERKS, CLERK_IDS, DEFAULT_CLERK, clerkOf } from './clerks';
import { sortBook, sortReport } from './sortLoose';
import ResetBook from './ResetBook';
import { fmt, monthLabel, shiftMonth, shortDate, todayIso, MONTHS } from './money';

// A leaf out of the book: punched paper, a printed plate of where the money
// went over whichever stretch you pick, and the lines behind any slice you
// press. The sheet itself lives at /finance/lines.

const thisMonth = () => todayIso().slice(0, 7);
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const GRAINS = [['month', 'Month'], ['year', 'Year'], ['all', 'All time']];
const LINE_CAP = 5000; // matches the server's ceiling
const DETAIL_CAP = 50; // an all-time slice can hold thousands; the sheet is for that

function Swatch({ id, photo, ink, screen }) {
  if (photo) {
    return (
      <svg className="fin-swatch" viewBox="0 0 16 16" aria-hidden="true">
        <defs><clipPath id={`fin-sw-${id}`}><circle cx="8" cy="8" r="7.4" /></clipPath></defs>
        <circle cx="8" cy="8" r="7.4" fill="#fefefc" />
        <image href={photo} x="0.6" y="0.6" width="14.8" height="14.8" clipPath={`url(#fin-sw-${id})`} />
        <circle cx="8" cy="8" r="7.4" fill="none" stroke="#111" strokeWidth="0.9" />
      </svg>
    );
  }
  return (
    <svg className="fin-swatch" viewBox="0 0 14 14" aria-hidden="true">
      {/* paper under the ink, so the swatch still reads on the black bar */}
      <rect x="0.5" y="0.5" width="13" height="13" fill="#fefefc" />
      <rect x="0.5" y="0.5" width="13" height="13" fill={ink} opacity="0.82" />
      <rect x="0.5" y="0.5" width="13" height="13" fill={`url(#fin-${screen})`} opacity="0.26" />
      <rect x="0.5" y="0.5" width="13" height="13" fill="none" stroke="#111" strokeWidth="1" />
    </svg>
  );
}

// A remark costs a model call, so it is fetched once per heading per period
// and held for the life of the page. Re-opening a slice you already opened
// must not bill for the same sentence twice.
const REMARKS = new Map();

// Who the money actually went to, folded by name. A merchant that appears
// twelve times for the same figure is a subscription whether or not anybody
// filed it as one, and that recurrence is the single most useful thing a
// clerk can be told about a heading. Descriptions are normalised loosely so
// "NETFLIX.COM" and "NETFLIX.COM  #4471" fold together.
function merchantsIn(lines) {
  const fold = new Map();
  for (const e of lines) {
    const raw = String(e.description || '').trim();
    if (!raw) continue;
    const key = raw.toUpperCase().replace(/[#*]?\d{3,}/g, '').replace(/\s+/g, ' ').trim().slice(0, 40) || raw;
    if (!fold.has(key)) fold.set(key, { name: raw.slice(0, 40), n: 0, total: 0 });
    const m = fold.get(key);
    m.n += 1;
    m.total += Number(e.amount) || 0;
  }
  return [...fold.values()].sort((a, b) => b.total - a.total).slice(0, 12);
}

function Remark({ slice, period }) {
  const key = `${slice.id}:${period}:${Math.round(slice.total * 100)}`;
  const cached = REMARKS.get(key);
  const [fetched, setFetched] = useState(null);

  useEffect(() => {
    if (cached) return undefined;
    let live = true;
    api.getRemark({
      who: slice.steward,
      both: slice.steward === 'both',
      label: slice.label,
      period,
      total: slice.total,
      share: slice.share,
      lines: slice.lines.length,
      top: slice.categories.slice(0, 5).map((c) => ({ name: c.name, total: c.total })),
      // The actual merchants behind the wedge. Without these a remark can
      // only describe the total, which reads as "the shopping line is doing
      // a lot of work and the book does not show what it contains" — true,
      // useless, and the same sentence for every heading. The client already
      // holds these lines, so specificity costs nothing but payload.
      merchants: merchantsIn(slice.lines),
      biggest: slice.lines.slice(0, 5).map((e) => ({
        date: String(e.date).slice(0, 10),
        description: e.description,
        amount: Number(e.amount),
      })),
    })
      .then((d) => {
        const got = { remarks: d.remarks || [] };
        REMARKS.set(key, got);
        if (live) setFetched({ key, ...got });
      })
      // a clerk with nothing to say is not an error worth a red banner on
      // a chart, so this fails quietly and the slice just opens
      .catch(() => { if (live) setFetched({ key, remarks: [] }); });
    return () => { live = false; };
  }, [key, cached, slice, period]);

  const shown = cached || (fetched?.key === key ? fetched : null);

  if (!shown) {
    const waiting = slice.steward === 'both'
      ? 'Both of them are looking at this one…'
      : `${clerkOf(slice.steward).short} is looking at it…`;
    return <p className="fin-remark-wait">{waiting}</p>;
  }
  if (!shown.remarks.length) return null;

  return (
    <div className={`fin-remarks ${shown.remarks.length > 1 ? 'fin-remarks-two' : ''}`}>
      {shown.remarks.length > 1 && <p className="t-label fin-remarks-head">The desks disagree</p>}
      {shown.remarks.map((r) => {
        const c = clerkOf(r.who);
        return (
          <div key={r.who} className="fin-remark">
            <img className="fin-remark-face" src={c.face} alt="" />
            <div className="fin-remark-say">
              <span className="fin-remark-who" style={{ color: c.ink }}>{c.short}</span>
              <p>{r.message}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Strip({ bars, here, onPick }) {
  const peak = Math.max(1, ...bars.map((b) => Number(b.expense)));
  return (
    <div className="fin-year">
      {bars.map((b) => {
        const out = Number(b.expense);
        const isMonth = b.key.includes('-');
        return (
          <button
            key={b.key}
            className={`fin-yr-col ${b.key === here ? 'fin-yr-on' : ''}`}
            onClick={() => onPick(b.key)}
            title={`${isMonth ? monthLabel(b.key) : b.key} · out ${fmt(out)} · in ${fmt(b.income)}`}
          >
            <span className="fin-yr-stack">
              <i className="fin-yr-out" style={{ height: `${(out / peak) * 100}%` }} />
            </span>
            <span className="fin-yr-tick">
              {isMonth ? MONTHS[Number(b.key.slice(5)) - 1][0] : b.key.slice(2)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function Overview() {
  const navigate = useNavigate();
  const [grain, setGrain] = useState('month');
  const [month, setMonth] = useState(thisMonth);
  const [year, setYear] = useState(() => todayIso().slice(0, 4));
  const [entries, setEntries] = useState([]);
  const [trend, setTrend] = useState(null);
  const [active, setActive] = useState(null);
  const [importing, setImporting] = useState(false);
  // which clerk's desk is open, or null. The peek at the right edge decides
  // who by which head you poke, so this is set from the event too.
  const [consult, setConsult] = useState(null);
  const [lastClerk, setLastClerk] = useState(DEFAULT_CLERK);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  // lines with no category anywhere in the book, not just this period — a
  // year imported at once shows up here as one grey wedge and the fix is
  // the same regardless of which month you happen to be looking at
  const [loose, setLoose] = useState(0);
  const [sorting, setSorting] = useState('');
  const [sorted, setSorted] = useState('');
  // twins let in by importing two overlapping exports — externalKey cannot
  // catch those, so the book has to be able to find them after the fact
  const [dupes, setDupes] = useState(null);
  const [resetting, setResetting] = useState(false);
  const [bookLines, setBookLines] = useState(0);

  useEffect(() => {
    const open = (e) => {
      const who = CLERK_IDS.includes(e.detail?.who) ? e.detail.who : DEFAULT_CLERK;
      setConsult(who);
      setLastClerk(who);
    };
    window.addEventListener('clerk-consult', open);
    return () => window.removeEventListener('clerk-consult', open);
  }, []);

  // month → [1st, next 1st) · year → [Jan 1, next Jan 1) · all → no bounds
  const range = useMemo(() => {
    if (grain === 'month') return { from: `${month}-01`, to: `${shiftMonth(month, 1)}-01` };
    if (grain === 'year') return { from: `${year}-01-01`, to: `${Number(year) + 1}-01-01` };
    return { month: 'all' };
  }, [grain, month, year]);

  // guarded so that paging quickly cannot let an older response land on
  // top of a newer one
  useEffect(() => {
    let live = true;
    Promise.all([
      api.getEntries({ ...range, limit: LINE_CAP }),
      api.getTrend(),
      api.getLooseCount(),
      api.getDuplicates(),
    ])
      .then(([rows, t, uncat, dup]) => {
        if (!live) return;
        setEntries(rows);
        setTrend(t);
        setLoose(uncat.count);
        setDupes(dup);
        setBookLines(t.months.reduce((a, m) => a + (m.n || 0), 0));
        setActive(null);
        setError('');
      })
      .catch((err) => { if (live) setError(err.message); });
    return () => { live = false; };
  }, [range, reload]);

  // the whole period is already here, so pressing a slice costs nothing
  const { slices, total } = useMemo(() => buildSlices(entries), [entries]);
  const inTotal = entries.filter((e) => e.kind === 'income').reduce((a, e) => a + Number(e.amount), 0);
  const net = inTotal - total;
  const truncated = entries.length >= LINE_CAP;

  const bars = useMemo(() => {
    if (!trend) return [];
    if (grain === 'all') return trend.years;
    const found = new Map(trend.months.map((m) => [m.key, m]));
    const start = grain === 'year' ? `${year}-01` : shiftMonth(month, -11);
    return Array.from({ length: 12 }, (_, i) => {
      const key = shiftMonth(start, i);
      return found.get(key) || { key, expense: '0.00', income: '0.00' };
    });
  }, [trend, grain, month, year]);

  const pickBar = (key) => {
    if (key.includes('-')) { setGrain('month'); setMonth(key); }
    else { setGrain('year'); setYear(key); }
  };

  const label = grain === 'month' ? monthLabel(month) : grain === 'year' ? year : 'The book entire';
  const plate = grain === 'month'
    ? `Plate ${ROMAN[Number(month.slice(5)) - 1]}`
    : grain === 'year' ? 'Annual plate' : 'Master plate';

  const step = (by) => {
    if (grain === 'month') setMonth(shiftMonth(month, by));
    else setYear(String(Number(year) + by));
  };

  const atEnd = grain === 'month' ? month >= thisMonth() : year >= todayIso().slice(0, 4);

  // A year of statements arrives with every line uncategorized, which draws
  // as one grey wedge covering most of the plate. This is the way out of
  // that, offered where the grey actually is.
  const sortLoose = async () => {
    if (sorting) return;
    setSorting('Reading the names…');
    setSorted('');
    try {
      const report = await sortBook(({ phase, done, total }) => {
        setSorting(phase === 'reading'
          ? `Reading the names… ${done} of ${total}`
          : `Filing… ${done} of ${total}`);
      });
      setSorted(sortReport(report));
      setReload((n) => n + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setSorting('');
    }
  };

  const strikeDupes = async () => {
    if (sorting) return;
    setSorting('Striking the extras…');
    try {
      const { struck, groups } = await api.strikeDuplicates();
      setSorted(struck
        ? `${struck} duplicate ${struck === 1 ? 'line' : 'lines'} struck across ${groups} ${groups === 1 ? 'group' : 'groups'}. The earliest of each was kept.`
        : 'No duplicates left to strike.');
      setReload((n) => n + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setSorting('');
    }
  };

  const postBatch = async (rows) => {
    const out = await api.postEntries(rows);
    setReload((n) => n + 1);
    return out;
  };

  const toSheet = (params = {}) =>
    navigate(`/finance/lines?${new URLSearchParams({
      month: grain === 'month' ? month : 'all', ...params,
    })}`);

  return (
    <div className="fin-page">
      <h1 className="t-display">The Accounts</h1>
      <div className="meta-strip mt-2">
        <span>Household book</span>
        <span>Two clerks, one book</span>
        <span>{entries.length}{truncated ? '+' : ''} lines on this plate</span>
      </div>

      <div className="rule mt-4" />

      <div className="fin-controls">
        <div className="fin-grain">
          {GRAINS.map(([id, text]) => (
            <button key={id} className={grain === id ? 'fin-grain-on' : ''} onClick={() => setGrain(id)}>
              {text}
            </button>
          ))}
        </div>

        {grain !== 'all' && (
          <div className="fin-monthnav">
            <button onClick={() => step(-1)} title="Back">‹</button>
            <span className="fin-monthlabel">{label}</span>
            <button onClick={() => step(1)} disabled={atEnd} title="Forward">›</button>
          </div>
        )}

        <span className="fin-controls-gap" />
        <button className="btn-ghost" onClick={() => toSheet()}>The sheet</button>
        <button className="btn-ghost" onClick={() => setImporting(true)}>Import statement</button>
        {!!bookLines && (
          <button className="fin-linkish fin-startover" onClick={() => setResetting(true)}>Start over</button>
        )}
        <button
          className={consult ? 'btn-black fin-ask' : 'btn-ghost fin-ask'}
          onClick={() => setConsult(lastClerk)}
          title="Both of them keep this book"
        >
          <img src={CLERKS.marx.face} alt="" />
          <img src={CLERKS.friedman.face} alt="" />
          Ask a clerk
        </button>
      </div>

      {error && <p className="fin-error mb-4">{error}</p>}

      {(!!loose || sorting || sorted) && (
        <div className="fin-loosebar">
          <span className="t-label">
            {sorting || sorted || `${loose} ${loose === 1 ? 'line has' : 'lines have'} no category, so ${loose === 1 ? 'it sits' : 'they sit'} in Unaccounted`}
          </span>
          {!!loose && !sorting && (
            <button className="btn-ghost" onClick={sortLoose}>Sort all {loose}</button>
          )}
        </div>
      )}

      {!!dupes?.extra && !sorting && (
        <div className="fin-loosebar fin-dupebar">
          <span className="t-label">
            {dupes.extra} duplicate {dupes.extra === 1 ? 'line' : 'lines'} across {dupes.groupCount}{' '}
            {dupes.groupCount === 1 ? 'group' : 'groups'}, same day, amount and description
          </span>
          <button className="btn-ghost" onClick={() => toSheet({ month: 'all' })}>Look first</button>
          <button className="btn-ghost" onClick={strikeDupes}>Strike the extras</button>
        </div>
      )}

      {truncated && (
        <p className="fin-error mb-4">
          Only the most recent {LINE_CAP} lines are on this plate. Narrow the period for an exact total.
        </p>
      )}

      <div className="fin-leaf">
        <div className="fin-holes" aria-hidden="true" />
        <div className="fin-leaf-body">
          <div className="fin-plate-head">
            <span>{plate} — disposition of funds</span>
            <span>{label}</span>
          </div>

          <PiePlate slices={slices} active={active} onPick={setActive} month={label} />

          <div className="fin-plate-foot">
            <span><i className="t-label">Out</i> {fmt(total)}</span>
            <span><i className="t-label">In</i> <b className="fin-credit">{fmt(inTotal)}</b></span>
            <span className={net < 0 ? 'fin-neg' : ''}>
              <i className="t-label">Net</i> {net < 0 ? '−' : '+'}{fmt(Math.abs(net))}
            </span>
          </div>

          {!!slices.length && (
            <div className="fin-legend">
              {slices.map((s) => {
                const on = active === s.id;
                const shown = s.lines.slice(0, DETAIL_CAP);
                return (
                  <div key={s.id} className={`fin-leg-block ${on ? 'fin-leg-open' : ''}`}>
                    <button className="fin-leg-row" onClick={() => setActive(on ? null : s.id)}>
                      <Swatch id={s.id} photo={s.photo} ink={s.ink} screen={s.screen} />
                      <span className="fin-leg-name">{s.label}</span>
                      <span className="fin-leg-cats">
                        {s.categories.slice(0, 3).map((c) => c.name).join(', ')}
                        {s.categories.length > 3 ? ` +${s.categories.length - 3}` : ''}
                      </span>
                      <span className="fin-leg-n">{String(s.lines.length).padStart(2, '0')}</span>
                      <span className="fin-leg-share">{(s.share * 100).toFixed(0)}%</span>
                      <span className="fin-leg-fig">{fmt(s.total)}</span>
                    </button>

                    {on && (
                      <div className="fin-detail">
                        <Remark slice={s} period={label} />
                        {shown.map((e, i) => (
                          <div key={e.id} className={`fin-detail-row ${i % 2 ? 'fin-band' : ''}`}>
                            <span className="fin-date">{shortDate(e.date)}</span>
                            <span className="fin-part">
                              {e.description || <em className="fin-blank">no particulars</em>}
                            </span>
                            <span className="fin-cat">{e.category}</span>
                            <span className="fin-num">{fmt(e.amount)}</span>
                          </div>
                        ))}
                        <div className="fin-detail-foot">
                          <span className="fin-carried">
                            {s.lines.length > DETAIL_CAP
                              ? `the ${DETAIL_CAP} largest of ${s.lines.length} under ${s.label}`
                              : `${s.lines.length} ${s.lines.length === 1 ? 'line' : 'lines'} under ${s.label}`}
                          </span>
                          <button className="fin-linkish" onClick={() => toSheet({ category: s.categories[0].name })}>
                            open in the sheet →
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {!!bars.length && (
        <div className="fin-leaf fin-leaf-short">
          <div className="fin-holes" aria-hidden="true" />
          <div className="fin-leaf-body">
            <div className="fin-plate-head">
              <span>{grain === 'all' ? 'Year by year' : 'The twelve months around it'}</span>
              <span>{trend ? `${trend.months.length} months on the books` : ''}</span>
            </div>
            <Strip
              bars={bars}
              here={grain === 'all' ? year : grain === 'year' ? `${year}-01` : month}
              onPick={pickBar}
            />
          </div>
        </div>
      )}

      {importing && <StatementImport onClose={() => setImporting(false)} onPosted={postBatch} />}
      {resetting && (
        <ResetBook
          lines={bookLines}
          onClose={() => setResetting(false)}
          onDone={(deleted) => {
            setResetting(false);
            setSorted(`${deleted} ${deleted === 1 ? 'line' : 'lines'} struck. The book is empty.`);
            setReload((n) => n + 1);
          }}
        />
      )}
      {consult && (
        <ClerkDrawer
          who={consult}
          onSwitch={(who) => { setConsult(who); setLastClerk(who); }}
          onClose={() => setConsult(null)}
          onPosted={postBatch}
        />
      )}
    </div>
  );
}
