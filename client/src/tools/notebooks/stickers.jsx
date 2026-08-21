/* eslint-disable react-refresh/only-export-components */
// The sticker sheet — analog desk debris, drawn inline so nothing is fetched.
// Each renders inside a 64×64 box; StickerItem scales/rotates the box.

const CoffeeRing = () => (
  <svg viewBox="0 0 64 64" className="w-full h-full">
    <circle cx="32" cy="32" r="24" fill="none" stroke="#8a5a2b" strokeWidth="5" opacity="0.35"
      strokeDasharray="30 8 22 6 40 10" strokeLinecap="round" />
    <circle cx="32" cy="32" r="18" fill="none" stroke="#8a5a2b" strokeWidth="2" opacity="0.2"
      strokeDasharray="20 14 30 8" />
  </svg>
);

const RedArrow = () => (
  <svg viewBox="0 0 64 64" className="w-full h-full">
    <path d="M6 50 C 24 44, 38 34, 50 16" fill="none" stroke="#c41e1e" strokeWidth="4" strokeLinecap="round" />
    <path d="M50 16 L 40 20 M50 16 L 48 27" fill="none" stroke="#c41e1e" strokeWidth="4" strokeLinecap="round" />
  </svg>
);

const Star = () => (
  <svg viewBox="0 0 64 64" className="w-full h-full">
    <path d="M32 8 L38 25 L56 25 L42 36 L47 54 L32 43 L17 54 L22 36 L8 25 L26 25 Z"
      fill="none" stroke="#221c13" strokeWidth="3" strokeLinejoin="round" />
  </svg>
);

const Paperclip = () => (
  <svg viewBox="0 0 64 64" className="w-full h-full">
    <path d="M20 44 L20 16 a8 8 0 0 1 16 0 L36 40 a14 14 0 0 1 -28 0 L8 18"
      fill="none" stroke="#5a6570" strokeWidth="4" strokeLinecap="round" transform="rotate(24 32 32)" />
  </svg>
);

const Scribble = () => (
  <svg viewBox="0 0 64 64" className="w-full h-full">
    <path d="M8 40 C 16 20, 24 52, 32 30 C 38 14, 46 46, 56 24"
      fill="none" stroke="#221c13" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

const Check = () => (
  <svg viewBox="0 0 64 64" className="w-full h-full">
    <path d="M12 36 L26 50 L54 14" fill="none" stroke="#1d7a34" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const Cross = () => (
  <svg viewBox="0 0 64 64" className="w-full h-full">
    <path d="M14 14 L50 50 M50 14 L14 50" fill="none" stroke="#c41e1e" strokeWidth="6" strokeLinecap="round" />
  </svg>
);

const UrgentStamp = () => (
  <div className="w-full h-full flex items-center justify-center">
    <span className="nb-sticker-stamp">URGENT</span>
  </div>
);

const NotedStamp = () => (
  <div className="w-full h-full flex items-center justify-center">
    <span className="nb-sticker-stamp nb-sticker-stamp-ink">NOTED</span>
  </div>
);

const Sun = () => (
  <svg viewBox="0 0 64 64" className="w-full h-full">
    <circle cx="32" cy="32" r="11" fill="none" stroke="#b8860b" strokeWidth="3" />
    {Array.from({ length: 8 }, (_, i) => {
      const a = (i * Math.PI) / 4;
      return <line key={i} x1={32 + Math.cos(a) * 16} y1={32 + Math.sin(a) * 16}
        x2={32 + Math.cos(a) * 24} y2={32 + Math.sin(a) * 24}
        stroke="#b8860b" strokeWidth="3" strokeLinecap="round" />;
    })}
  </svg>
);

const Heart = () => (
  <svg viewBox="0 0 64 64" className="w-full h-full">
    <path d="M32 52 C 8 36, 12 14, 28 20 C 30 21, 32 24, 32 26 C 32 24, 34 21, 36 20 C 52 14, 56 36, 32 52 Z"
      fill="none" stroke="#c41e1e" strokeWidth="3" strokeLinejoin="round" />
  </svg>
);

const Asterisk = () => (
  <svg viewBox="0 0 64 64" className="w-full h-full">
    <path d="M32 10 L32 54 M13 21 L51 43 M51 21 L13 43" fill="none" stroke="#221c13" strokeWidth="4" strokeLinecap="round" />
  </svg>
);

export const STICKERS = {
  coffee: { label: 'coffee ring', Render: CoffeeRing },
  arrow: { label: 'red arrow', Render: RedArrow },
  star: { label: 'star', Render: Star },
  clip: { label: 'paperclip', Render: Paperclip },
  scribble: { label: 'scribble', Render: Scribble },
  check: { label: 'check', Render: Check },
  cross: { label: 'cross', Render: Cross },
  urgent: { label: 'urgent', Render: UrgentStamp },
  noted: { label: 'noted', Render: NotedStamp },
  sun: { label: 'sun', Render: Sun },
  heart: { label: 'heart', Render: Heart },
  asterisk: { label: 'asterisk', Render: Asterisk },
};
