import { NavLink, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/board', label: 'Board' },
  { to: '/list', label: 'Archive' },
  { to: '/canvas', label: 'Canvas LMS' },
];

export default function Sidebar() {
  const navigate = useNavigate();

  return (
    <aside className="fixed left-0 top-0 h-screen w-[220px] bg-white flex flex-col z-50 border-r-[3px] border-black overflow-hidden">
      {/* Logo art — large, dominant */}
      <div className="px-5 pt-6 pb-2 flex flex-col items-center">
        <img src="/art/ledgerlogo.jpg" alt="" className="w-[90px] mb-3 mix-blend-multiply" />
        <p className="text-[1.1rem] leading-[0.85] tracking-[-0.04em] uppercase text-center">
          The Ledger
        </p>
      </div>

      <div className="mx-5 mt-3 rule-4 mb-1" />
      <div className="mx-5 rule" />

      {/* Date */}
      <div className="px-5 pt-3 pb-1">
        <p className="t-label">
          {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
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
                  : 'text-[var(--ink-30)] hover:text-black'
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

      {/* Bottom art — strong, fills the remaining space */}
      <div className="relative mt-auto flex-1 min-h-[180px]">
        <img
          src="/art/sidebarbottom.jpg"
          alt=""
          className="absolute bottom-0 left-0 w-full h-full object-cover object-top mix-blend-multiply opacity-90"
        />
        <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-white to-transparent" />
      </div>
    </aside>
  );
}
