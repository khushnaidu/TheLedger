import { useRef, useEffect } from 'react';

const CITIES = [
  { name: 'New York', lat: 40.71, lon: -74.01 },
  { name: 'Los Angeles', lat: 34.05, lon: -118.24 },
  { name: 'Mexico City', lat: 19.43, lon: -99.13 },
  { name: 'São Paulo', lat: -23.55, lon: -46.63 },
  { name: 'London', lat: 51.51, lon: -0.13 },
  { name: 'Paris', lat: 48.86, lon: 2.35 },
  { name: 'Cairo', lat: 30.04, lon: 31.24 },
  { name: 'Lagos', lat: 6.52, lon: 3.38 },
  { name: 'Moscow', lat: 55.76, lon: 37.62 },
  { name: 'Dubai', lat: 25.2, lon: 55.27 },
  { name: 'Mumbai', lat: 19.08, lon: 72.88 },
  { name: 'Singapore', lat: 1.35, lon: 103.82 },
  { name: 'Tokyo', lat: 35.68, lon: 139.69 },
  { name: 'Sydney', lat: -33.87, lon: 151.21 },
];

const toVec = (lat, lon) => {
  const la = (lat * Math.PI) / 180;
  const lo = (lon * Math.PI) / 180;
  // negative z-lon keeps east running rightward on screen (unmirrored earth)
  return [Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo)];
};

const fmt = (v, pos, neg) => `${Math.abs(v).toFixed(1)}°${v >= 0 ? pos : neg}`;

// graticule polylines, computed once
const POLYLINES = (() => {
  const lines = [];
  for (let lat = -75; lat <= 75; lat += 15) {
    const pts = [];
    for (let lon = 0; lon <= 360; lon += 4) pts.push(toVec(lat, lon));
    lines.push({ pts, strong: lat === 0 });
  }
  for (let lon = 0; lon < 360; lon += 15) {
    const pts = [];
    for (let lat = -90; lat <= 90; lat += 4) pts.push(toVec(lat, lon));
    lines.push({ pts, strong: lon === 0 });
  }
  return lines;
})();

export default function WireGlobe({ size = 440 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;

    const rootStyle = getComputedStyle(document.documentElement);
    const ink = rootStyle.getPropertyValue('--ink').trim() || '#111111';
    const stamp = rootStyle.getPropertyValue('--stamp').trim() || '#c8102e';

    const cx = size / 2;
    const cy = size / 2;
    const R = size * 0.4;
    const SPIN = 0.0022;
    // axial tilt — the spin axis leans like the real thing
    const TILT = 0.41;
    const cT = Math.cos(TILT), sT = Math.sin(TILT);

    const st = {
      yaw: -1.25, pitch: 0.18, vyaw: SPIN, vpitch: 0,
      dragging: false, lastX: 0, lastY: 0, raf: 0,
    };

    const project = ([x, y, z]) => {
      const cyaw = Math.cos(st.yaw), syaw = Math.sin(st.yaw);
      const cpit = Math.cos(st.pitch), spit = Math.sin(st.pitch);
      const x1 = x * cyaw + z * syaw;
      const z1 = -x * syaw + z * cyaw;
      const y2 = y * cpit - z1 * spit;
      const z2 = y * spit + z1 * cpit;
      const px = x1 * R, py = -y2 * R;
      return { x: cx + px * cT - py * sT, y: cy + px * sT + py * cT, z: z2 };
    };

    const drawFrame = (time) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      ctx.lineWidth = 1;

      // limb + instrument tick ring
      ctx.strokeStyle = ink;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.18;
      ctx.beginPath();
      for (let a = 0; a < 360; a += 5) {
        const rad = (a * Math.PI) / 180;
        const len = a % 15 === 0 ? 7 : 3;
        ctx.moveTo(cx + Math.cos(rad) * (R + 8), cy + Math.sin(rad) * (R + 8));
        ctx.lineTo(cx + Math.cos(rad) * (R + 8 + len), cy + Math.sin(rad) * (R + 8 + len));
      }
      ctx.stroke();

      // graticule — back pass faint, front pass solid
      ctx.lineWidth = 1.3;
      for (const pass of [0, 1]) {
        for (const { pts, strong } of POLYLINES) {
          ctx.globalAlpha = pass === 0 ? 0.12 : strong ? 0.65 : 0.45;
          ctx.beginPath();
          let prev = project(pts[0]);
          for (let i = 1; i < pts.length; i++) {
            const p = project(pts[i]);
            const front = (prev.z + p.z) / 2 >= 0;
            if (pass === (front ? 1 : 0)) {
              ctx.moveTo(prev.x, prev.y);
              ctx.lineTo(p.x, p.y);
            }
            prev = p;
          }
          ctx.stroke();
        }
      }

      // cities — pulsing pointers with leader lines
      ctx.lineWidth = 1;
      CITIES.forEach((c, i) => {
        const p = project(toVec(c.lat, c.lon));
        if (p.z < 0.05) return;
        const alpha = Math.min(1, (p.z - 0.05) / 0.45);

        // radar pulse
        const k = ((time / 1600) + i * 0.19) % 1;
        ctx.strokeStyle = stamp;
        ctx.globalAlpha = alpha * (1 - k) * 0.55;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3 + k * 9, 0, Math.PI * 2);
        ctx.stroke();

        // diamond marker
        ctx.fillStyle = stamp;
        ctx.globalAlpha = alpha;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-1.8, -1.8, 3.6, 3.6);
        ctx.restore();

        // leader line + label, only when comfortably front-facing
        if (p.z < 0.3) return;
        const dx = p.x - cx, dy = p.y - cy;
        const d = Math.hypot(dx, dy) || 1;
        const ex = p.x + (dx / d) * 14;
        const ey = p.y + (dy / d) * 14;
        const side = p.x >= cx ? 1 : -1;
        ctx.strokeStyle = stamp;
        ctx.globalAlpha = alpha * 0.7;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(ex, ey);
        ctx.lineTo(ex + side * 10, ey);
        ctx.stroke();

        ctx.textAlign = side > 0 ? 'left' : 'right';
        ctx.fillStyle = ink;
        ctx.globalAlpha = alpha * 0.85;
        ctx.font = '600 7.5px "IBM Plex Mono", monospace';
        ctx.fillText(c.name.toUpperCase(), ex + side * 13, ey + 2);
        ctx.globalAlpha = alpha * 0.45;
        ctx.font = '400 6.5px "IBM Plex Mono", monospace';
        ctx.fillText(`${fmt(c.lat, 'N', 'S')} ${fmt(c.lon, 'E', 'W')}`, ex + side * 13, ey + 10);
      });

      ctx.globalAlpha = 1;
    };

    const tick = (time) => {
      if (!st.dragging) {
        st.vyaw = st.vyaw * 0.95 + SPIN * 0.05;
        st.vpitch *= 0.9;
        st.yaw += st.vyaw;
        st.pitch = Math.max(-1.2, Math.min(1.2, st.pitch + st.vpitch));
      }
      drawFrame(time);
      st.raf = requestAnimationFrame(tick);
    };

    const onDown = (e) => {
      st.dragging = true;
      st.lastX = e.clientX;
      st.lastY = e.clientY;
      st.vyaw = 0;
      st.vpitch = 0;
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'grabbing';
    };
    const onMove = (e) => {
      if (!st.dragging) return;
      const dx = e.clientX - st.lastX;
      const dy = e.clientY - st.lastY;
      st.lastX = e.clientX;
      st.lastY = e.clientY;
      st.yaw += dx * 0.005;
      st.pitch = Math.max(-1.2, Math.min(1.2, st.pitch + dy * 0.005));
      st.vyaw = dx * 0.005;
      st.vpitch = dy * 0.005;
    };
    const onUp = () => {
      st.dragging = false;
      canvas.style.cursor = 'grab';
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    st.raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(st.raf);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
    };
  }, [size]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size, cursor: 'grab', touchAction: 'none', userSelect: 'none' }}
    />
  );
}
