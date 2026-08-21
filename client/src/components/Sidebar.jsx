import { useState, useEffect, useMemo } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Plus, LogOut } from 'lucide-react';
import { getLevelInfo, getTotalXP } from '../lib/xp';
import { APP_TITLE, ASSETS } from '../lib/theme';
import { isPersonal } from '../lib/edition';
import TvSet from './TvSet';
import { SECTIONS, TOOLS } from '../tools/registry';

// Sections of the paper, each with its tools in registry order.
// Empty sections don't print; numbering runs continuously like a
// broadsheet index column.
function buildNav() {
  let index = 0;
  return SECTIONS.map((section) => ({
    ...section,
    tools: TOOLS
      .filter((t) => t.section === section.id && (!t.personalOnly || isPersonal()))
      .map((t) => ({ ...t, index: ++index })),
  })).filter((section) => section.tools.length > 0);
}

// which section a path belongs to (detail routes count toward their tool's prefix)
function sectionForPath(nav, path) {
  for (const section of nav) {
    for (const t of section.tools) {
      if (t.end ? path === t.route : path.startsWith(t.route)) return section.id;
    }
  }
  return null;
}

export default function Sidebar({ user, onLogout }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [levelInfo, setLevelInfo] = useState(() => getLevelInfo(getTotalXP()));
  const nav = useMemo(() => buildNav(), []);

  // accordion: one section unfolded at a time so the column never outgrows
  // its slot; the section holding the current page opens itself
  // starts folded; picking a tool folds it back up — the ▪ marks where you are
  const [openId, setOpenId] = useState(null);
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpenId(null);
  }

  useEffect(() => {
    const handler = (e) => setLevelInfo(e.detail.level);
    window.addEventListener('gus-xp-gained', handler);
    return () => window.removeEventListener('gus-xp-gained', handler);
  }, []);

  return (
    <aside className="fixed left-0 top-0 h-screen w-[220px] bg-white flex flex-col z-50 overflow-hidden">
      {/* The television sits where the logo used to — persistent across pages */}
      <div className="px-5 pt-3 pb-1.5 flex flex-col items-center">
        <TvSet />
        <p className="t-title text-[1.05rem] uppercase text-center mt-1.5">
          {APP_TITLE}
        </p>
      </div>

      <div className="mt-2" style={{ borderTop: '1px solid var(--ink)' }} />

      {/* User + date */}
      <div className="px-5 pt-1.5 pb-1 flex items-baseline justify-between">
        <p className="t-label">{user?.name}</p>
        <p className="text-[0.5rem] tracking-[0.1em]" style={{ color: 'var(--ink-30)' }}>
          {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '.')}
        </p>
      </div>

      {/* The staff — it's the two of us, so the section only exists in the personal edition */}
      {isPersonal() && (
        <div className="px-5 pt-1.5 flex items-start gap-2">
          <img src="/art/selfie-cap.png" alt="" className="w-[46px]" />
          <img src="/art/selfie-bandana.png" alt="" className="w-[46px] mt-3" />
          <span className="fig-caption mt-1" style={{ writingMode: 'vertical-rl' }}>the staff</span>
        </div>
      )}

      {/* XP Level */}
      <div className="mx-5 mt-1.5 mb-1">
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

      {/* Nav — the paper's sections as a folding index. One section open at a
          time, so the column stays short and the bottom art keeps its room. */}
      <nav className="pt-1 pb-1 overflow-y-auto min-h-0" style={{ scrollbarWidth: 'none' }}>
        {nav.map((section) => {
          const open = openId === section.id;
          const holdsPage = sectionForPath(nav, pathname) === section.id;
          return (
            <div key={section.id}>
              <button
                type="button"
                className={`nav-section-head ${holdsPage && !open ? 'nav-section-head-hot' : ''}`}
                aria-expanded={open}
                onClick={() => setOpenId(open ? null : section.id)}
              >
                <span>§ {section.label}</span>
                <span className="nav-section-count">
                  {holdsPage && !open && <span className="nav-section-dot">▪ </span>}
                  {open ? '—' : String(section.tools.length).padStart(2, '0')}
                </span>
              </button>
              <div className={`nav-section-fold ${open ? 'nav-section-fold-open' : ''}`}>
                <div className="nav-section-fold-inner">
                  {section.tools.map(({ id, route, name, end, index }) => (
                    <NavLink
                      key={id}
                      to={route}
                      end={!!end}
                      tabIndex={open ? 0 : -1}
                      className={({ isActive }) =>
                        `block px-5 py-[5px] text-[0.5625rem] uppercase tracking-[0.14em] border-t border-[var(--ink)] ${
                          isActive
                            ? 'bg-black text-white'
                            : 'text-[var(--ink-50)] hover:text-[var(--ink)]'
                        }`
                      }
                    >
                      <span className="nav-index-num">{String(index).padStart(2, '0')}</span>
                      {name}
                    </NavLink>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </nav>

      {/* Create */}
      <div className="px-4 pb-1.5">
        <button onClick={() => navigate('/tickets/new')} className="btn-black w-full justify-center py-2.5">
          <Plus className="w-3 h-3" strokeWidth={3} />
          New Entry
        </button>
      </div>

      {/* Bottom art */}
      {/* flexible — soaks up whatever height remains so Sign Out never clips */}
      <div className="relative mt-auto flex-1 min-h-0 overflow-hidden">
        <img
          src={isPersonal() ? ASSETS.sidebarBottom : '/art/goodboy.jpg'}
          alt=""
          className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[92%] max-h-full object-contain object-bottom"
          style={isPersonal() ? undefined : { transform: 'translateX(-50%) scaleY(1.15)', transformOrigin: 'bottom' }}
        />
      </div>

      {/* Logout */}
      <div className="px-4 py-2.5 border-t border-[var(--ink)]">
        <button onClick={onLogout} className="btn-ghost w-full justify-center">
          <LogOut className="w-3 h-3" /> Sign Out
        </button>
      </div>
    </aside>
  );
}
