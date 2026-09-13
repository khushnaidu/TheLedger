import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
import { runPython, warmUp, onEngineState } from './py';
import CodePane from './CodePane';
import TutorPanel from './TutorPanel';
import BriefMd from './BriefMd';

// THE BENCH — one drill, worked. Editor and console at the left, the
// brief and Ada at the right. Code autosaves on a short idle; the run
// output stays on the bench (and rides along to Ada) but is never
// stored — the code is the record, the run is the moment.

const ENGINE_WORDS = {
  cold: 'engine cold',
  booting: 'stoking the engine…',
  ready: 'engine hot',
};

const RAIL_DEFAULT = 460;
const clampRail = (w) => Math.max(340, Math.min(720, w));

export default function DrillRoom() {
  const { drillId } = useParams();
  const navigate = useNavigate();
  const [drill, setDrill] = useState(null);
  const [missing, setMissing] = useState(false);
  const [lines, setLines] = useState([]);   // {kind: out|err|sys, text}
  const [running, setRunning] = useState(false);
  const [engine, setEngine] = useState('cold');
  const [briefOpen, setBriefOpen] = useState(true);
  const [saveStamp, setSaveStamp] = useState('');

  const codeRef = useRef('');
  const linesRef = useRef([]);
  const saveTimer = useRef(null);
  const floorRef = useRef(null);
  const [railW, setRailW] = useState(() => {
    try { return clampRail(Number(localStorage.getItem('gym_rail_w')) || RAIL_DEFAULT); }
    catch { return RAIL_DEFAULT; }
  });

  const setRail = (w) => {
    const clamped = clampRail(w);
    setRailW(clamped);
    try { localStorage.setItem('gym_rail_w', String(clamped)); } catch { /* private mode */ }
  };

  const dragRail = (e) => {
    e.preventDefault();
    const rect = floorRef.current.getBoundingClientRect();
    const move = (ev) => setRail(rect.right - ev.clientX - 5);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  useEffect(() => {
    api.getDrill(drillId)
      .then((d) => { setDrill(d); codeRef.current = d.code; })
      .catch(() => setMissing(true));
  }, [drillId]);

  useEffect(() => {
    warmUp();
    return onEngineState(setEngine);
  }, []);

  const saveCode = useCallback(async () => {
    if (!drill || codeRef.current === undefined) return;
    try {
      await api.updateDrill(drill.id, { code: codeRef.current });
      setSaveStamp(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch { /* next idle retries */ }
  }, [drill]);

  const onCodeChange = useCallback((code) => {
    codeRef.current = code;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(saveCode, 1200);
  }, [saveCode]);

  // flush the pending save when the patron walks away from the bench
  useEffect(() => () => {
    clearTimeout(saveTimer.current);
    if (drill && codeRef.current !== drill.code) {
      api.updateDrill(drill.id, { code: codeRef.current }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drill?.id]);

  const pushLine = (kind, text) => {
    setLines((old) => {
      const next = [...old, { kind, text }];
      linesRef.current = next;
      return next;
    });
  };

  const run = async () => {
    if (running) return;
    clearTimeout(saveTimer.current);
    saveCode();
    setLines([]);
    linesRef.current = [];
    setRunning(true);
    if (engine !== 'ready') pushLine('sys', 'first run stokes the engine — a few seconds…');
    const started = performance.now();
    const { result, error, timedOut } = await runPython(codeRef.current, {
      onStream: (s, kind) => pushLine(kind === 'err' ? 'err' : 'out', s),
    });
    const secs = ((performance.now() - started) / 1000).toFixed(1);
    if (error) pushLine(timedOut ? 'sys' : 'err', error);
    else {
      if (result !== null) pushLine('out', `↳ ${result}`);
      pushLine('sys', `── ran clean in ${secs}s`);
    }
    setRunning(false);
  };

  const renameTitle = async (title) => {
    const t = title.trim();
    if (!t || !drill || t === drill.title) return;
    setDrill((d) => ({ ...d, title: t }));
    try { await api.updateDrill(drill.id, { title: t }); } catch { /* shrug */ }
  };

  const toggleSolved = async () => {
    const status = drill.status === 'solved' ? 'open' : 'solved';
    setDrill((d) => ({ ...d, status }));
    try { await api.updateDrill(drill.id, { status }); } catch { /* shrug */ }
  };

  // Ada reads the bench as it stands, at the moment of asking
  const getContext = useCallback(() => ({
    brief: drill?.brief || '',
    code: codeRef.current,
    output: linesRef.current.map((l) => l.text).join('\n'),
  }), [drill]);

  if (missing) {
    return (
      <div className="gym-page stagger">
        <p className="t-label">The Study · The Gymnasium</p>
        <p className="mt-6 text-sm">That drill is not on the board. <Link className="underline" to="/practice">Back to the gymnasium.</Link></p>
      </div>
    );
  }
  if (!drill) {
    return (
      <div className="pt-16 flex justify-center">
        <div className="loader"><div className="loader-bar" /><div className="loader-bar" /><div className="loader-bar" /><div className="loader-bar" /></div>
      </div>
    );
  }

  return (
    <div className="gym-room stagger">
      <div className="gym-bench-bar">
        <button data-clicky className="gym-back" onClick={() => navigate('/practice')}>← the gymnasium</button>
        <input
          className="gym-title-input"
          defaultValue={drill.title}
          maxLength={80}
          onBlur={(e) => renameTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        />
        <span className={`gym-engine gym-engine-${engine}`}>{ENGINE_WORDS[engine]}</span>
        {saveStamp && <span className="gym-savestamp">saved {saveStamp}</span>}
        <button data-clicky className={`gym-solved ${drill.status === 'solved' ? 'gym-solved-on' : ''}`} onClick={toggleSolved}>
          {drill.status === 'solved' ? 'SOLVED ✓' : 'mark solved'}
        </button>
        <button data-clicky className="gym-run" disabled={running} onClick={run}>
          {running ? 'RUNNING…' : 'RUN ⌘↵'}
        </button>
      </div>

      <div className="gym-floor" ref={floorRef} style={{ '--railw': `${railW}px` }}>
        <div className="gym-left">
          <div className="gym-editor-card">
            <CodePane key={drill.id} code={drill.code} onChange={onCodeChange} onRun={run} />
          </div>
          <div className="gym-console">
            <p className="gym-console-head">THE READOUT</p>
            {!lines.length && !running && <p className="gym-console-idle">run your code and the output prints here — tracebacks included, they are half the lesson</p>}
            {lines.map((l, i) => (
              <pre key={i} className={`gym-line gym-line-${l.kind}`}>{l.text}</pre>
            ))}
            {running && <p className="gym-console-idle gym-blink">▮</p>}
          </div>
        </div>

        <div
          className="gym-divider"
          title="drag to resize — double-click to reset"
          onPointerDown={dragRail}
          onDoubleClick={() => setRail(RAIL_DEFAULT)}
        />

        <div className="gym-rail">
          <div className={`gym-brief ${briefOpen ? '' : 'gym-brief-folded'}`}>
            <button data-clicky className="gym-brief-head" onClick={() => setBriefOpen((o) => !o)}>
              THE BRIEF <span>{briefOpen ? '−' : '+'}</span>
            </button>
            {briefOpen && (
              <div className="gym-brief-scroll">
                <BriefMd md={drill.briefMd} fallback={drill.brief} />
              </div>
            )}
          </div>
          <TutorPanel drillId={drill.id} getContext={getContext} />
        </div>
      </div>
    </div>
  );
}
