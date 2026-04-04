import { useState, useEffect } from 'react';
import { Undo2 } from 'lucide-react';

export default function UndoToast({ message, onUndo, onExpire, duration = 5000 }) {
  const [remaining, setRemaining] = useState(duration);

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining((r) => {
        if (r <= 100) {
          clearInterval(interval);
          onExpire();
          return 0;
        }
        return r - 100;
      });
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const pct = (remaining / duration) * 100;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] undo-toast">
      <div className="border-2 border-black bg-white px-5 py-3 flex items-center gap-4 shadow-[4px_4px_0_#000]">
        <span className="text-[0.625rem] tracking-[0.08em] uppercase">{message}</span>
        <button onClick={onUndo}
          className="btn-outline py-1.5 px-3 text-[0.5rem] gap-1.5">
          <Undo2 className="w-2.5 h-2.5" strokeWidth={3} /> Undo
        </button>
      </div>
      {/* Timer bar */}
      <div className="h-[2px] bg-[var(--ink-08)] mt-0">
        <div className="h-full bg-black transition-all duration-100 ease-linear" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
