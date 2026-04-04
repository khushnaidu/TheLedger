import { useState } from 'react';
import { Volume2, VolumeX, ArrowRight } from 'lucide-react';

export default function Entrance({ userName, onEnter }) {
  const [hovered, setHovered] = useState(null);

  return (
    <div className="fixed inset-0 z-[100] bg-white flex items-center justify-center entrance-screen">
      {/* Background art — faded, atmospheric */}
      <img
        src="/art/buildings.jpg"
        alt=""
        className="absolute inset-0 w-full h-full object-cover mix-blend-multiply opacity-[0.06]"
      />

      {/* Content */}
      <div className="relative z-10 text-center entrance-content">
        {/* Logo */}
        <img
          src="/art/ledgerlogo.jpg"
          alt=""
          className="w-[100px] mx-auto mb-6 mix-blend-multiply entrance-logo"
        />

        {/* Title */}
        <div className="mb-3">
          <div className="rule-4 w-[50px] mx-auto mb-8" />
          <h1 className="text-[3.5rem] leading-[0.85] tracking-[-0.05em] uppercase entrance-title">
            The Ledger
          </h1>
        </div>

        <p className="t-label mb-2 entrance-subtitle">Task Management, Filed Properly</p>

        <div className="rule w-[200px] mx-auto mt-8 mb-8 entrance-rule" />

        {/* Welcome */}
        <p className="text-[0.75rem] tracking-[0.08em] text-[var(--ink-30)] mb-12 entrance-welcome">
          Welcome back, {userName}
        </p>

        {/* Two choices */}
        <div className="flex items-center justify-center gap-6 entrance-buttons">
          <button
            onClick={() => onEnter(true)}
            onMouseEnter={() => setHovered('sound')}
            onMouseLeave={() => setHovered(null)}
            className="group relative border-2 border-black px-10 py-5 transition-all duration-150 hover:bg-black hover:text-white"
          >
            <div className="flex items-center gap-3">
              <Volume2 className="w-4 h-4" />
              <span className="text-[0.625rem] tracking-[0.14em] uppercase">Enter with sound</span>
            </div>
            {hovered === 'sound' && (
              <ArrowRight className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 opacity-60" />
            )}
          </button>

          <button
            onClick={() => onEnter(false)}
            onMouseEnter={() => setHovered('silent')}
            onMouseLeave={() => setHovered(null)}
            className="group relative border-2 border-[var(--ink-15)] px-10 py-5 transition-all duration-150 hover:border-black"
          >
            <div className="flex items-center gap-3">
              <VolumeX className="w-4 h-4 text-[var(--ink-30)]" />
              <span className="text-[0.625rem] tracking-[0.14em] uppercase text-[var(--ink-30)] group-hover:text-black transition-colors">
                Enter silent
              </span>
            </div>
            {hovered === 'silent' && (
              <ArrowRight className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 opacity-30" />
            )}
          </button>
        </div>

        {/* Stamp */}
        <div className="mt-16 entrance-stamp">
          <span className="stamp stamp-red text-[0.5rem]">
            {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </span>
        </div>
      </div>
    </div>
  );
}
