import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Plus, LogOut, Wand2 } from 'lucide-react';
import { getLevelInfo, getTotalXP } from '../lib/xp';
import { useTheme } from '../lib/ThemeContext';

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/board', label: 'Board' },
  { to: '/list', label: 'Archive' },
  { to: '/canvas', label: 'Canvas LMS' },
];

export default function Sidebar({ user, onLogout }) {
  const navigate = useNavigate();
  const { theme, toggle, assets, appTitle } = useTheme();
  const [levelInfo, setLevelInfo] = useState(() => getLevelInfo(getTotalXP()));

  useEffect(() => {
    const handler = (e) => setLevelInfo(e.detail.level);
    window.addEventListener('gus-xp-gained', handler);
    return () => window.removeEventListener('gus-xp-gained', handler);
  }, []);

  // Re-compute title when theme changes
  useEffect(() => {
    setLevelInfo(getLevelInfo(getTotalXP()));
  }, [theme]);

  return (
    <aside className="fixed left-0 top-0 h-screen w-[220px] bg-white flex flex-col z-50 border-r-[3px] border-black overflow-hidden">
      {/* Logo art */}
      <div className="px-5 pt-6 pb-2 flex flex-col items-center">
        <img src={assets.logo} alt="" className="w-[90px] mb-3 mix-blend-multiply" />
        <p className="text-[1.1rem] leading-[0.85] tracking-[-0.04em] uppercase text-center">
          {appTitle}
        </p>
      </div>

      <div className="mx-5 mt-3 rule-4 mb-1" />
      <div className="mx-5 rule" />

      {/* User + date */}
      <div className="px-5 pt-3 pb-1">
        <p className="t-label">{user?.name}</p>
        <p className="t-label mt-1" style={{ color: 'var(--ink-15)' }}>
          {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      </div>

      {/* XP Level badge */}
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
            className="h-full bg-[var(--ink)] transition-all duration-500"
            style={{ width: `${Math.min(levelInfo.progress * 100, 100)}%` }}
          />
        </div>
        <p className="text-[0.4375rem] tracking-[0.14em] text-[var(--ink-15)] uppercase mt-1">
          {levelInfo.title}
        </p>
      </div>

      {/* Nav */}
      <nav className="pt-5 pb-4 space-y-0">
        {navItems.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `block px-5 py-3 text-[0.6875rem] uppercase tracking-[0.12em] transition-all duration-75 ${
                isActive
                  ? 'bg-black text-white'
                  : 'text-[var(--ink-30)] hover:text-[var(--ink)]'
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Create */}
      <div className="px-4 pb-3">
        <button onClick={() => navigate('/tickets/new')} className="btn-black w-full justify-center py-3.5">
          <Plus className="w-3 h-3" strokeWidth={3} />
          New Entry
        </button>
      </div>

      {/* Theme toggle */}
      <div className="px-4 pb-3">
        <button onClick={toggle} className="btn-outline w-full justify-center py-2.5 text-[0.5rem]">
          <Wand2 className="w-3 h-3" />
          {theme === 'ledger' ? 'Enter the Tome' : 'Return to Ledger'}
        </button>
      </div>

      {/* Bottom art */}
      <div className="relative mt-auto flex-1 min-h-[100px]">
        <img
          src={assets.sidebarBottom}
          alt=""
          className="absolute bottom-0 left-0 w-full h-full object-cover object-top mix-blend-multiply opacity-90"
        />
        <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-white to-transparent" />
      </div>

      {/* Logout */}
      <div className="px-4 py-3 border-t border-[var(--ink-08)]">
        <button onClick={onLogout} className="btn-ghost w-full justify-center">
          <LogOut className="w-3 h-3" /> Sign Out
        </button>
      </div>
    </aside>
  );
}
