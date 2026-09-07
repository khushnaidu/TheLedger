import { useEffect, useRef, useState } from 'react';
import ItemFrame from './ItemFrame';

// A code block on the page: a small dark printout, whitespace kept
// exactly as typed. Editing is a real textarea (Tab indents instead of
// leaving), display is highlighted through the lazily-loaded hl module.

const LANGS = ['auto', 'python', 'javascript', 'typescript', 'java', 'cpp', 'sql'];
const LANG_LABELS = { auto: 'auto', python: 'py', javascript: 'js', typescript: 'ts', java: 'java', cpp: 'c++', sql: 'sql' };
const SIZES = [11, 13, 16];
const MAX_CODE = 6000;

let hlPromise = null;
const loadHl = () => { hlPromise = hlPromise || import('./hl'); return hlPromise; };

export default function CodeItem({ item, scale, selected, onSelect, onChange, onGestureStart, onDelete, onLayer }) {
  const [editing, setEditing] = useState(selected && !item.code);
  const [lines, setLines] = useState(() => (item.code.split('\n').length || 1));
  const [html, setHtml] = useState(null);
  const taRef = useRef(null);

  useEffect(() => {
    if (editing && taRef.current) {
      taRef.current.focus();
      taRef.current.selectionStart = taRef.current.value.length;
    }
  }, [editing]);

  useEffect(() => {
    if (editing || !item.code) { setHtml(null); return undefined; }
    let dead = false;
    loadHl()
      .then(({ highlight }) => { if (!dead) setHtml(highlight(item.code, item.lang)); })
      .catch(() => { /* plain mono is a fine fallback */ });
    return () => { dead = true; };
  }, [item.code, item.lang, editing]);

  const commit = () => {
    const code = (taRef.current?.value ?? item.code).slice(0, MAX_CODE);
    setEditing(false);
    if (!code.trim()) {
      // nothing pasted — the block never happened
      onDelete();
      return;
    }
    if (code !== item.code) {
      onGestureStart();
      onChange({ code });
    }
  };

  const onKey = (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') { commit(); return; }
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = e.target;
      const { selectionStart: s, selectionEnd: en, value } = ta;
      ta.value = `${value.slice(0, s)}    ${value.slice(en)}`;
      ta.selectionStart = s + 4;
      ta.selectionEnd = s + 4;
      setLines(ta.value.split('\n').length);
    }
  };

  const sizeStep = (dir) => {
    const i = SIZES.indexOf(item.size);
    const next = SIZES[Math.max(0, Math.min(SIZES.length - 1, (i === -1 ? 1 : i) + dir))];
    if (next !== item.size) { onGestureStart(); onChange({ size: next }); }
  };

  return (
    <ItemFrame
      item={item} scale={scale} selected={selected} resizeMode="w"
      onSelect={onSelect} onChange={onChange} onGestureStart={onGestureStart} onDelete={onDelete} onLayer={onLayer}
      dragDisabled={editing}
      style={{ width: item.w }}
    >
      {selected && !editing && (
        <div className="nb-text-controls" onPointerDown={(e) => e.stopPropagation()}>
          {LANGS.map((l) => (
            <button key={l}
              className={`nb-text-ctl ${item.lang === l ? 'nb-text-ctl-on' : ''}`}
              onClick={() => { onGestureStart(); onChange({ lang: l }); }}>
              {LANG_LABELS[l]}
            </button>
          ))}
          <button className="nb-text-ctl" onClick={() => sizeStep(-1)}>A−</button>
          <button className="nb-text-ctl" onClick={() => sizeStep(1)}>A+</button>
        </div>
      )}
      <div className={`nb-code ${editing ? 'nb-code-editing' : ''}`}
        style={{ fontSize: item.size || 13 }}
        onDoubleClick={() => setEditing(true)}>
        <p className="nb-code-head">
          <span className="nb-code-dots">●●●</span>
          <span>{LANG_LABELS[item.lang] || item.lang}</span>
        </p>
        {editing ? (
          <textarea
            ref={taRef}
            className="nb-code-edit"
            defaultValue={item.code}
            rows={Math.min(30, Math.max(4, lines + 1))}
            spellCheck={false}
            placeholder="paste or type code — Tab indents"
            onChange={(e) => setLines(e.target.value.split('\n').length)}
            onBlur={commit}
            onKeyDown={onKey}
          />
        ) : html ? (
          <pre className="nb-code-pre"><code dangerouslySetInnerHTML={{ __html: html }} /></pre>
        ) : (
          <pre className="nb-code-pre"><code>{item.code || 'paste code…'}</code></pre>
        )}
      </div>
    </ItemFrame>
  );
}
