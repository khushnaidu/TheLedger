import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { api } from '../api';
import WireGlobe from '../components/WireGlobe';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const navigate = useNavigate();

  const loadDashboard = async () => {
    // Auto-sync Canvas in background (fire and forget on first load)
    api.autoSyncCanvas()
      .then((result) => {
        if (result.imported > 0 || result.updated > 0) {
          setSyncResult(result);
          // Refresh stats after sync brought new data
          api.getStats().then(setStats);
        }
      })
      .catch(() => {}); // silently fail if Canvas not connected

    // Load stats immediately (don't wait for sync)
    api.getStats().then(setStats).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { loadDashboard(); }, []);

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

  const manualSync = async () => {
    setSyncing(true);
    try {
      const result = await api.autoSyncCanvas();
      setSyncResult(result);
      const fresh = await api.getStats();
      setStats(fresh);
    } catch {}
    setSyncing(false);
  };

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
      {/* Sync notification — a whisper, not a box */}
      {syncResult && (syncResult.imported > 0 || syncResult.updated > 0) && (
        <p className="t-small mb-8">
          canvas brought {syncResult.imported > 0 && `${syncResult.imported} new`}
          {syncResult.imported > 0 && syncResult.updated > 0 && ' and '}
          {syncResult.updated > 0 && `${syncResult.updated} changed`}
          {' — '}
          <button onClick={() => setSyncResult(null)} className="btn-ghost inline">noted</button>
        </p>
      )}

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
        <div className="ledger-only flex-shrink-0">
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
      <div className="ledger-only">
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
      </div>

      {/* Big and small — the world spins, the kiss undercuts it */}
      <div className="ledger-only mb-24 relative z-0">
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
        <button onClick={manualSync} disabled={syncing} className="btn-ghost">
          <RefreshCw className={`w-2.5 h-2.5 ${syncing ? 'animate-spin' : ''}`} />
          sync canvas
        </button>
      </div>
    </div>
  );
}
