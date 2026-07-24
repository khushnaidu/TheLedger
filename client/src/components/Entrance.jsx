import { useState } from 'react';
import { ArrowRight } from 'lucide-react';

export default function Entrance({ userName, onEnter }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div className="fixed inset-0 z-[100] bg-white flex items-center justify-center entrance-screen">
      <div className="relative z-10 text-center px-8 entrance-content">
        <h1
          className="entrance-title mx-auto max-w-[900px]"
          style={{
            fontFamily: 'var(--font-head)',
            fontWeight: 700,
            fontSize: 'clamp(2.2rem, 5vw, 3.6rem)',
            lineHeight: 1.05,
            letterSpacing: '-0.03em',
            textTransform: 'lowercase',
          }}
        >
          willkommen zurück bei <span className="whitespace-nowrap">„the ledger“</span>
        </h1>

        <div className="flex items-center justify-center mt-14 entrance-buttons">
          <button
            onClick={onEnter}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            className="group relative px-12 py-5 transition-all duration-150 hover:bg-black hover:text-white"
            style={{ border: '2px solid var(--ink)' }}
          >
            <span className="text-[0.625rem] tracking-[0.14em] lowercase">eintreten</span>
            {hovered && (
              <ArrowRight className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 opacity-60" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
