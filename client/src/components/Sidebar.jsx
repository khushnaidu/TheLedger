import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Plus, LogOut } from 'lucide-react';
import { api } from '../api';
import { getLevelInfo, getTotalXP } from '../lib/xp';
import { APP_TITLE, ASSETS } from '../lib/theme';
import TvSet from './TvSet';

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/board', label: 'Board' },
  { to: '/wall', label: 'My Wall' },
  { to: '/list', label: 'Archive' },
];

export default function Sidebar({ user, onLogout }) {
  const navigate = useNavigate();
  const [levelInfo, setLevelInfo] = useState(() => getLevelInfo(getTotalXP()));
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const handler = (e) => setLevelInfo(e.detail.level);
    window.addEventListener('gus-xp-gained', handler);
    return () => window.removeEventListener('gus-xp-gained', handler);
  }, []);

  useEffect(() => {
    const load = () => api.getStats().then(setStats).catch(() => {});
    load();
    window.addEventListener('gus-tickets-created', load);
    window.addEventListener('gus-ticket-moved', load);
    return () => {
      window.removeEventListener('gus-tickets-created', load);
      window.removeEventListener('gus-ticket-moved', load);
    };
  }, []);

  const pad = (n) => String(n ?? 0).padStart(4, '0');

  return (
    <aside className="fixed left-0 top-0 h-screen w-[220px] bg-white flex flex-col z-50 overflow-hidden">
      {/* The television sits where the logo used to — persistent across pages */}
      <div className="px-5 pt-4 pb-2 flex flex-col items-center">
        <TvSet />
        <p className="t-title text-[1.05rem] uppercase text-center mt-2">
          {APP_TITLE}
        </p>
      </div>

      <div className="mx-5 mt-2 rule-4 mb-[2px]" />
      <div className="mx-5 rule" />

      {/* User + date */}
      <div className="px-5 pt-2 pb-1 flex items-baseline justify-between">
        <p className="t-label">{user?.name}</p>
        <p className="text-[0.5rem] tracking-[0.1em]" style={{ color: 'var(--ink-30)' }}>
          {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '.')}
        </p>
      </div>

      {/* The staff */}
      <div className="px-5 pt-2 flex items-start gap-2">
        <img src="/art/selfie-cap.png" alt="" className="w-[52px]" />
        <img src="/art/selfie-bandana.png" alt="" className="w-[52px] mt-3" />
        <span className="fig-caption mt-1" style={{ writingMode: 'vertical-rl' }}>the staff</span>
      </div>

      {/* Bureau counters */}
      <div className="mx-5 mt-1 mb-1 border-t border-b border-black py-1">
        <div className="counter-table">
          {[
            ['Entries', stats?.total],
            ['Done', stats?.byStatus?.DONE],
            ['Active', stats?.byStatus?.IN_PROGRESS],
            ['Categories', stats?.byCategory?.length],
          ].map(([label, n]) => (
            <div key={label} className="counter-row">
              <span>{label}</span>
              <span className="counter-num">{pad(n)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* XP Level */}
      <div className="mx-5 mt-2 mb-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[0.5rem] tracking-[0.16em] text-[var(--ink-30)] uppercase">
            Lvl {levelInfo.level}
          </span>
          <span className="text-[0.5rem] tracking-[0.16em] text-[var(--ink-30)] uppercase">
            {levelInfo.xp} XP
          </span>
        </div>
        <div className="w-full h-[3px] bg-[var(--ink-08)]">
          <div
            className="h-full bg-[var(--ink)]"
            style={{ width: `${Math.min(levelInfo.progress * 100, 100)}%` }}
          />
        </div>
        <p className="text-[0.4375rem] tracking-[0.14em] text-[var(--ink-15)] uppercase mt-1">
          {levelInfo.title}
        </p>
      </div>

      {/* Nav — numbered index */}
      <nav className="pt-4 pb-3 space-y-0">
        {navItems.map(({ to, label }, i) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `block px-5 py-2.5 text-[0.6875rem] uppercase tracking-[0.12em] border-t border-[var(--ink-08)] ${
                isActive
                  ? 'bg-black text-white'
                  : 'text-[var(--ink-50)] hover:text-[var(--ink)]'
              }`
            }
          >
            <span className="nav-index-num">{String(i + 1).padStart(2, '0')}</span>
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Create */}
      <div className="px-4 pb-2">
        <button onClick={() => navigate('/tickets/new')} className="btn-black w-full justify-center py-3">
          <Plus className="w-3 h-3" strokeWidth={3} />
          New Entry
        </button>
      </div>

      {/* Bottom art */}
      <div className="relative mt-auto flex-1 min-h-[90px]">
        <img
          src={ASSETS.sidebarBottom}
          alt=""
          className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[92%] max-h-full object-contain object-bottom"
        />
      </div>

      {/* Logout */}
      <div className="px-4 py-2.5 border-t border-[var(--ink-08)]">
        <button onClick={onLogout} className="btn-ghost w-full justify-center">
          <LogOut className="w-3 h-3" /> Sign Out
        </button>
      </div>
    </aside>
  );
}
