import { useRef } from 'react';
import { PAGE_W, PAGE_H } from './model';

// keep at least this much of an item on the paper — nothing can be
// dragged fully off the page and become unreachable
const EDGE_KEEP = 28;

// Shared chrome for anything placed on a page: drag to move, corner dot to
// resize, nub to rotate, × to delete. All pointer math happens in page units
// (client deltas ÷ scale). One undo snapshot per gesture, committed at
// gesture start via onGestureStart.
export default function ItemFrame({
  item, scale, selected, resizeMode, // 'w' | 'wh' | 'scale' | null
  onSelect, onChange, onGestureStart, onDelete, onLayer,
  children, style, dragDisabled = false,
}) {
  const ref = useRef(null);

  const startGesture = (e, onMove) => {
    e.stopPropagation();
    e.preventDefault();
    onGestureStart();
    const startX = e.clientX;
    const startY = e.clientY;
    const move = (ev) => onMove((ev.clientX - startX) / scale, (ev.clientY - startY) / scale, ev);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const handleDragStart = (e) => {
    onSelect();
    if (dragDisabled) return;
    const { x, y } = item;
    const w = ref.current?.offsetWidth || 60;
    const h = ref.current?.offsetHeight || 40;
    startGesture(e, (dx, dy) => onChange({
      x: Math.min(Math.max(x + dx, EDGE_KEEP - w), PAGE_W - EDGE_KEEP),
      y: Math.min(Math.max(y + dy, EDGE_KEEP - h), PAGE_H - EDGE_KEEP),
    }));
  };

  const handleResizeStart = (e) => {
    if (resizeMode === 'scale') {
      const start = item.scale;
      startGesture(e, (dx) => onChange({ scale: Math.max(0.3, Math.min(6, start + dx / 64)) }));
    } else if (resizeMode === 'wh') {
      const { w, h } = item;
      startGesture(e, (dx) => {
        const nw = Math.max(40, w + dx);
        onChange({ w: nw, h: Math.round((nw / w) * h) });
      });
    } else {
      const { w } = item;
      startGesture(e, (dx) => onChange({ w: Math.max(60, w + dx) }));
    }
  };

  const handleRotateStart = (e) => {
    startGesture(e, (dx, dy, ev) => {
      const rect = ref.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const angle = (Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180) / Math.PI + 90;
      onChange({ rot: Math.round(angle * 10) / 10 });
    });
  };

  return (
    <div
      ref={ref}
      className={`nb-item ${selected ? 'nb-item-selected' : ''}`}
      style={{
        left: item.x,
        top: item.y,
        transform: `rotate(${item.rot || 0}deg)`,
        ...style,
      }}
      onPointerDown={handleDragStart}
    >
      {children}
      {selected && (
        <>
          <button className="nb-handle nb-handle-delete" title="Tear off"
            onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); onDelete(); }}>×</button>
          {onLayer && (
            <>
              <button className="nb-handle nb-handle-front" title="Bring to front"
                onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); onLayer('front'); }}>↥</button>
              <button className="nb-handle nb-handle-back" title="Send to back"
                onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); onLayer('back'); }}>↧</button>
            </>
          )}
          <div className="nb-handle nb-handle-rotate" title="Rotate"
            onPointerDown={handleRotateStart} />
          {resizeMode && (
            <div className="nb-handle nb-handle-resize" title="Resize"
              onPointerDown={handleResizeStart} />
          )}
        </>
      )}
    </div>
  );
}
