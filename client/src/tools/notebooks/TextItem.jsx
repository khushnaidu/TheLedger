import { useRef, useState, useEffect } from 'react';
import ItemFrame from './ItemFrame';
import { FONTS, INK_COLORS, lineHeightFor } from './model';

const SIZES = [14, 20, 28, 40];
const FONT_LABELS = { cute: 'C', gochi: 'G', magnetic: 'Mg', cedarville: 'Ce', mono: 'M' };

export default function TextItem({ item, scale, paperStyle, selected, onSelect, onChange, onGestureStart, onDelete, onLayer }) {
  // a just-placed empty item opens straight into typing — doc mode
  const [editing, setEditing] = useState(selected && !item.text);
  const editRef = useRef(null);

  useEffect(() => {
    if (editing && editRef.current) {
      editRef.current.focus();
      // caret at the end
      const sel = window.getSelection();
      sel.selectAllChildren(editRef.current);
      sel.collapseToEnd();
    }
  }, [editing]);

  const commitText = () => {
    const text = editRef.current?.innerText ?? item.text;
    setEditing(false);
    if (!text.trim()) {
      // nothing written — the box never happened
      onDelete();
      return;
    }
    if (text !== item.text) {
      onGestureStart();
      onChange({ text });
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
          {Object.keys(FONTS).map((f) => (
            <button key={f}
              className={`nb-text-ctl ${item.font === f ? 'nb-text-ctl-on' : ''}`}
              style={{ fontFamily: FONTS[f] }}
              onClick={() => { onGestureStart(); onChange({ font: f }); }}>
              {FONT_LABELS[f]}
            </button>
          ))}
          <button className="nb-text-ctl" onClick={() => sizeStep(-1)}>A−</button>
          <button className="nb-text-ctl" onClick={() => sizeStep(1)}>A+</button>
          <button className="nb-text-ctl"
            onClick={() => { onGestureStart(); onChange({ color: item.color === 'ink' ? 'stamp' : 'ink' }); }}>
            <span className="nb-text-swatch" style={{ background: INK_COLORS[item.color] }} />
          </button>
        </div>
      )}
      <div
        ref={editRef}
        className={`nb-text ${editing ? 'nb-text-editing' : ''} ${!item.text && !editing ? 'nb-text-empty' : ''}`}
        style={{
          fontFamily: FONTS[item.font],
          fontSize: item.size,
          color: INK_COLORS[item.color],
          lineHeight: lineHeightFor(paperStyle, item.size),
        }}
        contentEditable={editing}
        suppressContentEditableWarning
        onDoubleClick={() => setEditing(true)}
        onBlur={commitText}
        onKeyDown={(e) => { if (e.key === 'Escape') commitText(); }}
      >
        {item.text || (!editing ? 'write…' : '')}
      </div>
    </ItemFrame>
  );
}
