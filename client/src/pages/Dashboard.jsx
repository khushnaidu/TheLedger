import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import WireGlobe from '../components/WireGlobe';

const DEDICATION_RU =
  '— Хуш верит в Таю и знает: сегодня она покорит каждую задачу, которую поставит перед собой, — и ещё успеет насладиться сладким угощением в конце дня :)';
const DEDICATION_EN =
  '— Khush believes in Taia and knows: today she will conquer every task she sets for herself — and will still have time to enjoy a sweet treat at the end of the day :)';
const DEDICATION_STYLE = {
  fontFamily: 'var(--font-head)',
  fontWeight: 700,
  fontSize: '1.8rem',
  lineHeight: 1.05,
  letterSpacing: '-0.015em',
};

// hover lens — reveals the english translation through a circle under the cursor
function DedicationLens() {
  const boxRef = useRef(null);
  const [lens, setLens] = useState(null);
  const R = 72;

  return (
    <div
      ref={boxRef}
      className="absolute right-[-150px] bottom-[240px] w-[430px] text-right z-30 select-none"
      style={{ cursor: lens ? 'none' : 'default' }}
      onMouseMove={(e) => {
        const r = boxRef.current.getBoundingClientRect();
        setLens({ x: e.clientX - r.left, y: e.clientY - r.top });
      }}
      onMouseLeave={() => setLens(null)}
    >
      <p style={{ ...DEDICATION_STYLE, color: 'var(--ink)' }}>{DEDICATION_RU}</p>
      {lens && (
        <>
          <p
            className="absolute inset-0 bg-white"
            style={{
              ...DEDICATION_STYLE,
              color: 'var(--ink)',
              clipPath: `circle(${R}px at ${lens.x}px ${lens.y}px)`,
            }}
          >
            {DEDICATION_EN}
          </p>
          <div
            className="absolute rounded-full border border-[var(--ink)] pointer-events-none"
            style={{ left: lens.x - R, top: lens.y - R, width: R * 2, height: R * 2 }}
          >
            <span
              className="absolute left-1/2 -translate-x-1/2 bg-white border border-[var(--ink)] px-1.5"
              style={{ bottom: -8, fontSize: '0.4375rem', letterSpacing: '0.14em', fontFamily: 'var(--font)' }}
            >
              RU→EN
            </span>
          </div>
        </>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.getStats().then(setStats).catch(console.error).finally(() => setLoading(false));
  }, []);

  // Refresh when Gus creates tickets
  useEffect(() => {
    const handler = () => { api.getStats().then(setStats).catch(console.error); };
    window.addEventListener('gus-tickets-created', handler);
    return () => window.removeEventListener('gus-tickets-created', handler);
  }, []);

  // parallax — tagged art drifts up faster than the scroll, factor per element
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      document.querySelectorAll('[data-parallax]').forEach((el) => {
        el.style.transform = `translateY(${(-y * parseFloat(el.dataset.parallax)).toFixed(1)}px)`;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-32">
      <div className="loader mb-6"><div className="loader-bar" /><div className="loader-bar" /><div className="loader-bar" /><div className="loader-bar" /></div>
      <p className="t-label">Loading ledger...</p>
    </div>
  );
  if (!stats) return <div className="t-label">Connection lost</div>;

  const done = stats.byStatus['DONE'] || 0;
  const inProgress = stats.byStatus['IN_PROGRESS'] || 0;
  const completionRate = stats.total ? Math.round((done / stats.total) * 100) : 0;
  const urgentTickets = (stats.urgentTickets || []).slice(0, 5);

  return (
    <div className="max-w-[820px] stagger relative">
      {/* Header — one headline, one number */}
      <div className="flex items-end justify-between pt-10 mb-6 relative z-10">
        <div>
          <p className="t-label mb-4">Overview</p>
          <h1 className="t-display">Command Center</h1>
        </div>
        <div className="text-right">
          <span className="completion-stat">
            {completionRate}<span className="pct">%</span>
          </span>
          <p className="t-label mt-3">completion</p>
        </div>
      </div>

      {/* The kid and the numbers, side by side */}
      <div className="flex items-start gap-10 mb-16 relative z-10">
        <div className="flex-shrink-0">
          <img src="/art/babykhush.gif" alt="" data-parallax="0.12" className="block w-[270px] -ml-10" />
          <p className="fig-caption mt-2 -ml-10">fig. babykhush.gif — the original archivist</p>
        </div>
        <div className="flex-1 flex flex-wrap items-start gap-x-10 gap-y-5 pt-1">
          {[
            { label: 'Entries', value: stats.total, pad: 4, size: 'lg', step: 0 },
            { label: 'In motion', value: inProgress, pad: 2, size: 'md', step: 34, highlight: inProgress > 0 },
            { label: 'Filed', value: done, pad: 2, size: 'md', step: 62 },
            { label: 'Categories', value: stats.byCategory.length, pad: 2, size: 'sm', step: 88 },
          ].map(({ label, value, pad, size, step, highlight }) => (
            <div key={label} style={{ marginTop: step }}>
              <div className="digit-row">
                {String(value).padStart(pad, '0').split('').map((d, i) => (
                  <span
                    key={i}
                    className={`digit-cell digit-${size}`}
                    style={highlight ? { color: 'var(--stamp)', borderColor: 'var(--stamp)' } : {}}
                  >
                    {d}
                  </span>
                ))}
              </div>
              <p className="t-label mt-1.5">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Next up */}
      <div className="mb-24 relative z-10">
        <p className="t-label mb-6">Next on the docket</p>
        {urgentTickets.length > 0 ? (
          urgentTickets.map((ticket) => {
            const daysLeft = ticket.dueDate
              ? Math.ceil((new Date(ticket.dueDate) - new Date()) / (1000 * 60 * 60 * 24))
              : null;
            const pressing = daysLeft !== null && daysLeft <= 2;
            return (
              <div
                key={ticket.id}
                onClick={() => navigate(`/tickets/${ticket.id}`)}
                className="entry-row flex items-baseline justify-between gap-8 border-t-0 border-b border-[var(--ink-08)] py-4"
              >
                <span className="entry-title text-[0.875rem]">{ticket.title}</span>
                <span className="t-small whitespace-nowrap" style={pressing ? { color: 'var(--stamp)' } : {}}>
                  {daysLeft === null
                    ? '—'
                    : daysLeft < 0
                      ? `${Math.abs(daysLeft)}d overdue`
                      : daysLeft === 0
                        ? 'today'
                        : `${daysLeft}d`}
                </span>
              </div>
            );
          })
        ) : (
          <p className="t-body">Nothing is on fire.</p>
        )}
      </div>

      {/* the margin float — gosling up top, a small bourdain rocketing past the globe below */}
      <div>
        <img
          src="/art/gosling.gif"
          alt=""
          data-parallax="0.38"
          className="art-loose w-[235px] h-[420px] object-cover right-[-350px] top-[150px] z-[5]"
        />
        <img
          src="/art/bourdain.gif"
          alt=""
          data-parallax="0.65"
          className="art-loose w-[160px] right-[-200px] top-[1520px] z-20"
        />
        {/* the dragon guards the bottom of the ledger */}
        <img
          src="/art/dragon.gif"
          alt=""
          className="art-loose w-[240px] right-[-150px] bottom-[-10px] z-0"
        />
        {/* для Таи — hover to decode */}
        <DedicationLens />
      </div>

      {/* Big and small — the world spins, the kiss undercuts it */}
      <div className="mb-24 relative z-0">
        <div className="flex items-start">
          <img src="/art/herewegoagain.gif" alt="" data-parallax="0.22" className="block w-[250px] shrink-0" />
          <div className="ml-auto -mr-16 shrink-0">
            <WireGlobe size={580} />
            <div className="mt-1 mr-12 ml-auto max-w-[320px] text-right select-none">
              <p className="t-label mb-3">Sector 00 · Headquarters</p>
              <p className="text-[0.5625rem] leading-[1.9] tracking-[0.1em] uppercase text-[var(--ink-30)]">
                Recognized seat of executive motion. Verdicts issued at this desk
                propagate outward at the speed of paperwork. No committee, no
                quorum — one archivist, planetary jurisdiction. All decisions
                final upon filing. Coordinates: your chair.
              </p>
            </div>
          </div>
        </div>
        <img src="/art/kiss.png" alt="" data-parallax="0.3" className="block w-[360px] -ml-16 -mt-28 relative z-10" />
        <p className="fig-caption mt-3">
          fig. herewegoagain.gif — every monday · fig. situation globe — live, drag to rotate ·
          fig. kiss.png — evidence of joy
        </p>
      </div>

      {/* Quiet footer actions */}
      <div className="flex items-center gap-10 pb-16 relative z-10">
        <button onClick={() => navigate('/board')} className="btn-ghost">the board</button>
        <button onClick={() => navigate('/list')} className="btn-ghost">the archive</button>
      </div>
    </div>
  );
}
