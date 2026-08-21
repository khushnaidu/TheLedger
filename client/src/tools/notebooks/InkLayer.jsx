import { useRef, useState, memo } from 'react';
import { getStroke } from 'perfect-freehand';
import { PAGE_W, PAGE_H, INK_COLORS, newInk } from './model';

const strokeOpts = (size) => ({
  size: size * 3.2,
  thinning: 0.6,
  smoothing: 0.5,
  streamline: 0.5,
  simulatePressure: true,
});

function toPath(points, size) {
  const outline = getStroke(points, strokeOpts(size));
  if (!outline.length) return '';
  return outline.reduce(
    (d, [x, y], i) => (i === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : `${d} L ${x.toFixed(1)} ${y.toFixed(1)}`),
    ''
  ) + ' Z';
}

// One committed stroke as its own positioned svg, so ink participates in
// the page's stacking order alongside photos/text/stickers. Memoized —
// a page of ink re-renders only the live stroke.
export const StrokeSvg = memo(function StrokeSvg({ item }) {
  return (
    <svg className="nb-stroke" viewBox={`0 0 ${PAGE_W} ${PAGE_H}`}>
      <path d={toPath(item.points, item.size)} fill={INK_COLORS[item.color] || item.color} />
    </svg>
  );
});

// distance from point to segment, for whole-stroke erasing
function hitsStroke(item, px, py, threshold) {
  const pts = item.points;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
    const ex = x1 + t * dx - px, ey = y1 + t * dy - py;
    if (ex * ex + ey * ey < threshold * threshold) return true;
  }
  return pts.length === 1 && (pts[0][0] - px) ** 2 + (pts[0][1] - py) ** 2 < threshold * threshold;
}

export default function InkLayer({ strokes, tool, penColor, penSize, scale, onAddStroke, onEraseStroke }) {
  const svgRef = useRef(null);
  const drawing = useRef(null);
  const [live, setLive] = useState(null);

  const active = tool === 'pen' || tool === 'erase';

  const toPage = (e) => {
    const rect = svgRef.current.getBoundingClientRect();
    // clamp to the paper — a captured pointer can wander off the page
    return [
      Math.min(Math.max(((e.clientX - rect.left) / rect.width) * PAGE_W, 0), PAGE_W),
      Math.min(Math.max(((e.clientY - rect.top) / rect.height) * PAGE_H, 0), PAGE_H),
      e.pressure || 0.5,
    ];
  };

  const erase = (e) => {
    const [px, py] = toPage(e);
    const hit = strokes.find((s) => hitsStroke(s, px, py, Math.max(8, s.size * 3)));
    if (hit) onEraseStroke(hit.id);
  };

  const onPointerDown = (e) => {
    if (!active) return;
    e.preventDefault();
    svgRef.current.setPointerCapture(e.pointerId);
    if (tool === 'erase') { erase(e); return; }
    drawing.current = [toPage(e)];
    setLive([...drawing.current]);
  };

  const onPointerMove = (e) => {
    if (!active) return;
    if (tool === 'erase') { if (e.buttons) erase(e); return; }
    if (!drawing.current) return;
    const pt = toPage(e);
    const last = drawing.current[drawing.current.length - 1];
    // thin near-duplicate points — they bloat the payload, not the line
    if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) < 1.5) return;
    drawing.current.push(pt);
    setLive([...drawing.current]);
  };

  const onPointerUp = () => {
    if (drawing.current?.length) {
      const rounded = drawing.current.map(([x, y, p]) => [
        Math.round(x * 10) / 10, Math.round(y * 10) / 10, Math.round(p * 100) / 100,
      ]);
      onAddStroke(newInk(penColor, penSize, rounded));
    }
    drawing.current = null;
    setLive(null);
  };

  return (
    <svg
      ref={svgRef}
      className="nb-ink"
      viewBox={`0 0 ${PAGE_W} ${PAGE_H}`}
      style={{ pointerEvents: active ? 'auto' : 'none', touchAction: active ? 'none' : undefined }}
      data-scale={scale}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* committed strokes render in the page's item flow (StrokeSvg);
          this surface only captures the pen and shows the live stroke */}
      {live && <path d={toPath(live, penSize)} fill={INK_COLORS[penColor] || penColor} />}
    </svg>
  );
}
