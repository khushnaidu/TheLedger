import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { api } from '../api';
import { STATUS_CONFIG, PRIORITY_CONFIG, STATUSES } from '../constants';
import StatusBadge from '../components/StatusBadge';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.getStats().then(setStats).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="max-w-[960px] mx-auto pt-4"><div className="rule-8 mb-20" /></div>;
  if (!stats) return <div className="t-label">Connection lost</div>;

  const done = stats.byStatus['DONE'] || 0;
  const inProgress = stats.byStatus['IN_PROGRESS'] || 0;
  const completionRate = stats.total ? Math.round((done / stats.total) * 100) : 0;

  return (
    <div className="max-w-[960px] mx-auto stagger">
      <div className="rule-8 mb-16" />

      {/* Hero — title + buildings side by side */}
      <div className="flex items-end gap-12 mb-20">
        <div className="flex-1">
          <p className="t-label mb-6">Overview</p>
          <h1 className="t-display mb-6">Command<br/>Center</h1>
          <p className="t-body max-w-xs">
            {stats.total} entries across {stats.byCategory.length} categories.
            {inProgress > 0 && ` ${inProgress} currently active.`}
          </p>
        </div>
        {/* Buildings art — anchors the hero section */}
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

        {/* Recent */}
        <div>
          <div className="flex items-center justify-between mb-8">
            <p className="t-label">Recent</p>
            <button onClick={() => navigate('/list')} className="btn-ghost">All</button>
          </div>
          <div className="space-y-0">
            {stats.recentTickets.map((ticket, i) => (
              <div
                key={ticket.id}
                onClick={() => navigate(`/tickets/${ticket.id}`)}
                className={`py-4 cursor-pointer group ${
                  i < stats.recentTickets.length - 1 ? 'border-b border-[var(--ink-08)]' : ''
                }`}
              >
                <p className="text-[0.6875rem] leading-snug group-hover:text-[var(--stamp)] transition-colors mb-2">
                  {ticket.title}
                </p>
                <StatusBadge status={ticket.status} />
              </div>
            ))}
            {stats.recentTickets.length === 0 && <p className="t-small pt-4">No entries</p>}
          </div>
        </div>
      </div>

      {/* Couch — bottom of page editorial element */}
      <div className="flex justify-end mt-20 mb-10">
        <img src="/art/couchrandom.jpg" alt="" className="w-[160px] mix-blend-multiply opacity-90" />
      </div>

      <div className="rule mb-10" />
    </div>
  );
}
