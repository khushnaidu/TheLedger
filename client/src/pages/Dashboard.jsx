import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { api } from '../api';
import { STATUS_CONFIG, PRIORITY_CONFIG, STATUSES } from '../constants';
import StatusBadge from '../components/StatusBadge';
import PriorityBadge from '../components/PriorityBadge';

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
    <div className="max-w-[960px] mx-auto pt-4">
      <div className="rule-8 mb-20" />
      <div className="flex flex-col items-center justify-center py-32">
        <div className="loader mb-6"><div className="loader-bar" /><div className="loader-bar" /><div className="loader-bar" /><div className="loader-bar" /></div>
        <p className="t-label">Loading ledger...</p>
      </div>
    </div>
  );
  if (!stats) return <div className="t-label">Connection lost</div>;

  const done = stats.byStatus['DONE'] || 0;
  const inProgress = stats.byStatus['IN_PROGRESS'] || 0;
  const completionRate = stats.total ? Math.round((done / stats.total) * 100) : 0;

  return (
    <div className="max-w-[960px] mx-auto stagger">
      <div className="rule-8 mb-16" />

      {/* Sync notification */}
      {syncResult && (syncResult.imported > 0 || syncResult.updated > 0) && (
        <div className="border-2 border-black p-4 mb-10 flex items-center justify-between">
          <p className="t-small text-black">
            Canvas sync: {syncResult.imported > 0 && `${syncResult.imported} new assignment${syncResult.imported !== 1 ? 's' : ''} imported`}
            {syncResult.imported > 0 && syncResult.updated > 0 && ', '}
            {syncResult.updated > 0 && `${syncResult.updated} updated`}
          </p>
          <button onClick={() => setSyncResult(null)} className="t-label hover:text-black">Dismiss</button>
        </div>
      )}

      {/* Hero */}
      <div className="flex items-end gap-12 mb-20">
        <div className="flex-1">
          <p className="t-label mb-6">Overview</p>
          <h1 className="t-display mb-6">Command<br/>Center</h1>
          <p className="t-body max-w-xs">
            {stats.total} entries across {stats.byCategory.length} categories.
            {inProgress > 0 && ` ${inProgress} currently active.`}
          </p>
        </div>
        <img src="/art/buildings.jpg" alt="" className="w-[240px] mix-blend-multiply opacity-90 flex-shrink-0" />
      </div>

      {/* Stats */}
      <div className="rule-4 mb-12" />

      <div className="grid grid-cols-4 gap-0 mb-20">
        {[
          { label: 'Total', value: stats.total },
          { label: 'Active', value: inProgress, highlight: true },
          { label: 'Done', value: done },
          { label: 'Rate', value: `${completionRate}%` },
        ].map(({ label, value, highlight }, i) => (
          <div key={label} className={`${i > 0 ? 'border-l-[3px] border-black pl-8' : ''}`}>
            <p className="t-label mb-4">{label}</p>
            <span className={`t-stat ${highlight ? 'text-[var(--stamp)]' : ''}`}>{value}</span>
          </div>
        ))}
      </div>

      {/* Pipeline */}
      <div className="mb-6 flex items-center justify-between">
        <p className="t-label">Pipeline</p>
        <button onClick={() => navigate('/board')} className="btn-ghost">
          Board <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      <div className="flex h-3 border-[2px] border-black mb-4">
        {STATUSES.map((status) => {
          const count = stats.byStatus[status] || 0;
          const pct = stats.total ? (count / stats.total) * 100 : 0;
          if (pct === 0) return null;
          const isActive = status === 'IN_PROGRESS';
          const isDone = status === 'DONE';
          return (
            <div key={status} style={{
              width: `${pct}%`,
              background: isActive ? 'var(--stamp)' : isDone ? '#000' : 'var(--ink-08)',
              borderRight: '1px solid #fff',
            }} />
          );
        })}
      </div>

      <div className="flex gap-6 mb-20">
        {STATUSES.map((status) => {
          const config = STATUS_CONFIG[status];
          const count = stats.byStatus[status] || 0;
          const isActive = status === 'IN_PROGRESS';
          const isDone = status === 'DONE';
          return (
            <div key={status} className="flex items-center gap-2">
              <span className="w-2 h-2" style={{
                background: isActive ? 'var(--stamp)' : isDone ? '#000' : 'var(--ink-08)',
                border: '1px solid #000',
              }} />
              <span className="t-small">{config.label} ({count})</span>
            </div>
          );
        })}
      </div>

      <div className="rule-4 mb-12" />

      {/* Three columns */}
      <div className="grid grid-cols-3 gap-16">
        {/* Priority */}
        <div>
          <p className="t-label mb-8">Priority</p>
          <div className="space-y-6">
            {Object.entries(PRIORITY_CONFIG).map(([key, config]) => {
              const count = stats.byPriority[key] || 0;
              const pct = stats.total ? Math.round((count / stats.total) * 100) : 0;
              return (
                <div key={key}>
                  <div className="flex items-baseline justify-between mb-2">
                    <span className={`text-[0.625rem] uppercase tracking-[0.12em] ${key === 'CRITICAL' ? 'text-[var(--stamp)]' : 'text-[var(--ink-30)]'}`}>
                      {config.label}
                    </span>
                    <span className="t-title text-[1.25rem]">{count}</span>
                  </div>
                  <div className="h-1 bg-[var(--ink-04)]">
                    <div className="h-full transition-all duration-700" style={{
                      width: `${pct}%`,
                      background: key === 'CRITICAL' ? 'var(--stamp)' : '#000',
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Categories */}
        <div>
          <p className="t-label mb-8">Categories</p>
          <div className="space-y-0">
            {stats.byCategory.map(({ category, count }, i) => (
              <div key={category.id} className={`flex items-baseline justify-between py-4 ${
                i < stats.byCategory.length - 1 ? 'border-b border-[var(--ink-08)]' : ''
              }`}>
                <span className="text-[0.75rem]">{category.name}</span>
                <span className="t-title text-[1.25rem]">{count}</span>
              </div>
            ))}
            {stats.byCategory.length === 0 && <p className="t-small pt-4">No categories</p>}
          </div>
        </div>

        {/* Most Urgent */}
        <div>
          <div className="flex items-center justify-between mb-8">
            <p className="t-label">Most Urgent</p>
            <button onClick={manualSync} disabled={syncing} className="btn-ghost">
              <RefreshCw className={`w-2.5 h-2.5 ${syncing ? 'animate-spin' : ''}`} />
              Sync
            </button>
          </div>
          <div className="space-y-0">
            {(stats.urgentTickets || []).map((ticket, i) => {
              const daysLeft = ticket.dueDate
                ? Math.ceil((new Date(ticket.dueDate) - new Date()) / (1000 * 60 * 60 * 24))
                : null;
              const isOverdue = daysLeft !== null && daysLeft < 0;
              const isUrgent = daysLeft !== null && daysLeft <= 2 && daysLeft >= 0;

              return (
                <div
                  key={ticket.id}
                  onClick={() => navigate(`/tickets/${ticket.id}`)}
                  className={`py-4 cursor-pointer group ${
                    i < (stats.urgentTickets || []).length - 1 ? 'border-b border-[var(--ink-08)]' : ''
                  }`}
                >
                  <p className="text-[0.6875rem] leading-snug group-hover:text-[var(--stamp)] transition-colors mb-2">
                    {ticket.title}
                  </p>
                  <div className="flex items-center gap-2">
                    <PriorityBadge priority={ticket.priority} />
                    {daysLeft !== null && (
                      <span className={`text-[0.5rem] tracking-[0.06em] ${
                        isOverdue ? 'text-[var(--stamp)]' : isUrgent ? 'text-[var(--stamp)]' : 'text-[var(--ink-30)]'
                      }`}>
                        {isOverdue ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? 'Due today' : `${daysLeft}d left`}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            {(!stats.urgentTickets || stats.urgentTickets.length === 0) && <p className="t-small pt-4">All clear</p>}
          </div>
        </div>
      </div>

      {/* Couch */}
      <div className="flex justify-end mt-20 mb-10">
        <img src="/art/couchrandom.jpg" alt="" className="w-[160px] mix-blend-multiply opacity-90" />
      </div>

      <div className="rule mb-10" />
    </div>
  );
}
