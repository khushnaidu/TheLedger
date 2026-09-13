import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';

// THE GYMNASIUM — python practice with a tutor who never hands over
// the answer (ADR-0015). Chalk up a drill: a whole pasted leetcode
// problem or one loose line ("practice graphs with bfs and dfs") both
// work — the brief is whatever you want to train against. Each drill
// keeps its code, so the bench reopens exactly where you left it.

const fmtDate = (s) => new Date(s).toLocaleDateString([], { month: 'short', day: 'numeric' });

export default function Gymnasium() {
  const navigate = useNavigate();
  const [drills, setDrills] = useState(null);
  const [brief, setBrief] = useState('');
  const [chalking, setChalking] = useState(false);
  const [error, setError] = useState('');
  const [arming, setArming] = useState(null); // drill id with the × half-pressed

  useEffect(() => {
    api.getDrills().then(setDrills).catch((e) => setError(e.message));
  }, []);

  const chalkUp = async () => {
    const text = brief.trim();
    if (!text || chalking) return;
    setChalking(true);
    setError('');
    try {
      const drill = await api.createDrill({ brief: text });
      navigate(`/practice/${drill.id}`);
    } catch (e) {
      setError(e.message);
      setChalking(false);
    }
  };

  const strike = async (id) => {
    if (arming !== id) { setArming(id); setTimeout(() => setArming((a) => (a === id ? null : a)), 2500); return; }
    setArming(null);
    setDrills((old) => old.filter((d) => d.id !== id));
    try { await api.deleteDrill(id); } catch (e) { setError(e.message); }
  };

  return (
    <div className="gym-page stagger">
      <p className="t-label">The Study · No. 03</p>
      <h1 className="t-display">The Gymnasium</h1>
      <p className="t-label mt-1" style={{ color: 'var(--ink-30)' }}>
        Python drills, worked at the bench with a tutor who never hands over the answer.
      </p>

      <div className="gym-intake">
        <p className="gym-intake-head">Chalk up a drill — a pasted problem, or just what you want to practice</p>
        <textarea
          className="gym-chalk"
          rows={4}
          maxLength={20000}
          value={brief}
          placeholder={'paste a whole leetcode problem here, or write one line like\n"practice graphs in python with bfs and dfs"'}
          onChange={(e) => setBrief(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) chalkUp(); }}
        />
        <button data-clicky className="btn-black" disabled={chalking || !brief.trim()} onClick={chalkUp}>
          {chalking ? 'Chalking it up…' : 'Chalk it up'}
        </button>
      </div>

      {error && <p className="gym-error">{error}</p>}

      {drills === null ? (
        <div className="pt-16 flex justify-center">
          <div className="loader"><div className="loader-bar" /><div className="loader-bar" /><div className="loader-bar" /><div className="loader-bar" /></div>
        </div>
      ) : !drills.length ? (
        <p className="gym-empty">The board is bare. Chalk up the first drill — the bench, the engine, and Ada are waiting.</p>
      ) : (
        <div className="gym-board">
          {drills.map((d) => (
            <div key={d.id} className={`gym-row ${d.status === 'solved' ? 'gym-row-solved' : ''}`}>
              <button data-clicky className="gym-row-open" onClick={() => navigate(`/practice/${d.id}`)}>
                <span className="gym-row-title">{d.title}</span>
                <span className="gym-row-date">worked {fmtDate(d.updatedAt)}</span>
              </button>
              <span className={`gym-stamp ${d.status === 'solved' ? 'gym-stamp-solved' : ''}`}>
                {d.status === 'solved' ? 'SOLVED' : 'OPEN'}
              </span>
              <button data-clicky className={`gym-strike ${arming === d.id ? 'gym-strike-armed' : ''}`}
                title={arming === d.id ? 'Press again to strike it' : 'Strike this drill'}
                onClick={() => strike(d.id)}>
                {arming === d.id ? 'sure?' : '×'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
