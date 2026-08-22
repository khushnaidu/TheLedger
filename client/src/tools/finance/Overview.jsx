import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import StatementImport from './StatementImport';
import VeraDrawer from './VeraDrawer';
import PiePlate from './PiePlate';
import { buildSlices } from './groups';
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
  const [vera, setVera] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

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
    Promise.all([api.getEntries({ ...range, limit: LINE_CAP }), api.getTrend()])
      .then(([rows, t]) => {
        if (!live) return;
        setEntries(rows);
        setTrend(t);
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
        <span>Kept by Vera</span>
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
        <button className={vera ? 'btn-black' : 'btn-ghost'} onClick={() => setVera(true)}>Vera</button>
      </div>

      {error && <p className="fin-error mb-4">{error}</p>}
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
      {vera && <VeraDrawer onClose={() => setVera(false)} onPosted={postBatch} />}
    </div>
  );
}
