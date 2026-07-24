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

// home turf — one marker from orbit, three cities up close
const BAY = { name: 'The Bay', lat: 37.6, lon: -122.2 };
const BAY_CITIES = [
  { name: 'San Francisco', lat: 37.77, lon: -122.42, dir: [-1, -0.25] },
  { name: 'Oakland', lat: 37.8, lon: -122.27, dir: [0.85, -0.75] },
  { name: 'San José', lat: 37.34, lon: -121.89, dir: [0.9, 0.6] },
];
const BAY_SPLIT_ZOOM = 2.2; // past this the single marker resolves into the three
const BAY_FLY_ZOOM = 9;
const MAX_ZOOM = 12;

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
      zoom: 1, targetZoom: 1,
      flying: false, targetYaw: 0, targetPitch: 0,
      dragging: false, lastX: 0, lastY: 0, downX: 0, downY: 0, moved: 0,
      bayScreen: null, raf: 0,
    };

    const project = ([x, y, z]) => {
      const Re = R * st.zoom;
      const cyaw = Math.cos(st.yaw), syaw = Math.sin(st.yaw);
      const cpit = Math.cos(st.pitch), spit = Math.sin(st.pitch);
      const x1 = x * cyaw + z * syaw;
      const z1 = -x * syaw + z * cyaw;
      const y2 = y * cpit - z1 * spit;
      const z2 = y * spit + z1 * cpit;
      const px = x1 * Re, py = -y2 * Re;
      return { x: cx + px * cT - py * sT, y: cy + px * sT + py * cT, z: z2 };
    };

    const drawLabel = (p, alpha, ex, ey, side, title, sub, bold) => {
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
      ctx.font = `${bold ? 700 : 600} ${bold ? 8.5 : 7.5}px "IBM Plex Mono", monospace`;
      ctx.fillText(title, ex + side * 13, ey + 2);
      ctx.globalAlpha = alpha * 0.45;
      ctx.font = '400 6.5px "IBM Plex Mono", monospace';
      ctx.fillText(sub, ex + side * 13, ey + 10);
    };

    const drawFrame = (time) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      ctx.lineWidth = 1;
      const Re = R * st.zoom;

      // limb + instrument tick ring
      ctx.strokeStyle = ink;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(cx, cy, Re, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.18;
      ctx.beginPath();
      for (let a = 0; a < 360; a += 5) {
        const rad = (a * Math.PI) / 180;
        const len = a % 15 === 0 ? 7 : 3;
        ctx.moveTo(cx + Math.cos(rad) * (Re + 8), cy + Math.sin(rad) * (Re + 8));
        ctx.lineTo(cx + Math.cos(rad) * (Re + 8 + len), cy + Math.sin(rad) * (Re + 8 + len));
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
        drawLabel(p, alpha, ex, ey, side, c.name.toUpperCase(), `${fmt(c.lat, 'N', 'S')} ${fmt(c.lon, 'E', 'W')}`);
      });

      // ---- the bay ----
      if (st.zoom < BAY_SPLIT_ZOOM) {
        // one home marker from orbit
        const p = project(toVec(BAY.lat, BAY.lon));
        st.bayScreen = p.z >= 0.05 ? p : null;
        if (p.z >= 0.05) {
          const alpha = Math.min(1, (p.z - 0.05) / 0.45);
          const k = (time / 1400) % 1;
          ctx.strokeStyle = stamp;
          ctx.globalAlpha = alpha * (1 - k) * 0.8;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 4 + k * 13, 0, Math.PI * 2);
          ctx.stroke();

          // ink ring + red diamond — home reads different from the rest
          ctx.strokeStyle = ink;
          ctx.globalAlpha = alpha * 0.9;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 5.5, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = stamp;
          ctx.globalAlpha = alpha;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(Math.PI / 4);
          ctx.fillRect(-2.4, -2.4, 4.8, 4.8);
          ctx.restore();

          if (p.z >= 0.3) {
            const dx = p.x - cx, dy = p.y - cy;
            const d = Math.hypot(dx, dy) || 1;
            const ex = p.x + (dx / d) * 18;
            const ey = p.y + (dy / d) * 18 - 12; // lift clear of the LA label
            const side = p.x >= cx ? 1 : -1;
            drawLabel(p, alpha, ex, ey, side, 'THE BAY', 'HOME — CLICK TO VISIT', true);
          }
        }
      } else {
        // up close it resolves into the three
        st.bayScreen = null;
        BAY_CITIES.forEach((c, i) => {
          const p = project(toVec(c.lat, c.lon));
          if (p.z < 0.05) return;
          const alpha = Math.min(1, (p.z - 0.05) / 0.45);
          const k = ((time / 1400) + i * 0.3) % 1;
          ctx.strokeStyle = stamp;
          ctx.globalAlpha = alpha * (1 - k) * 0.7;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3 + k * 11, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = stamp;
          ctx.globalAlpha = alpha;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(Math.PI / 4);
          ctx.fillRect(-2, -2, 4, 4);
          ctx.restore();

          // fixed leader directions — these three are too close for radial fanning
          const ex = p.x + c.dir[0] * 30;
          const ey = p.y + c.dir[1] * 30;
          const side = c.dir[0] >= 0 ? 1 : -1;
          drawLabel(p, alpha, ex, ey, side, c.name.toUpperCase(), `${fmt(c.lat, 'N', 'S')} ${fmt(c.lon, 'E', 'W')}`, true);
        });
      }

      // instrument readout
      ctx.textAlign = 'left';
      ctx.fillStyle = ink;
      if (st.zoom > 1.05) {
        ctx.globalAlpha = 0.6;
        ctx.font = '600 7.5px "IBM Plex Mono", monospace';
        ctx.fillText(`ZOOM ×${st.zoom.toFixed(1)}`, 10, size - 20);
        ctx.globalAlpha = 0.35;
        ctx.font = '400 6.5px "IBM Plex Mono", monospace';
        ctx.fillText('DBL-CLICK TO PULL BACK', 10, size - 10);
      } else {
        // idle hint — stacked in the left margin, breathes like an invitation
        const breathe = 0.4 + 0.2 * Math.sin(time / 600);
        ctx.globalAlpha = breathe;
        ctx.font = '600 7.5px "IBM Plex Mono", monospace';
        ctx.fillText('◇ INTERACTIVE', 8, 18);
        ctx.globalAlpha = breathe * 0.8;
        ctx.font = '400 6.5px "IBM Plex Mono", monospace';
        ctx.fillText('DRAG TO SPIN', 8, 32);
        ctx.fillText('SCROLL TO ZOOM', 8, 43);
        ctx.fillText('CLICK THE BAY', 8, 54);
      }

      ctx.globalAlpha = 1;
    };

    const flyToBay = () => {
      const [X, Y, Z] = toVec(BAY.lat, BAY.lon);
      const h = Math.hypot(X, Z);
      let ty = Math.atan2(-X, Z);
      // shortest way around
      let delta = (ty - st.yaw) % (Math.PI * 2);
      if (delta > Math.PI) delta -= Math.PI * 2;
      if (delta < -Math.PI) delta += Math.PI * 2;
      st.targetYaw = st.yaw + delta;
      st.targetPitch = Math.atan2(Y, h);
      st.targetZoom = BAY_FLY_ZOOM;
      st.flying = true;
      st.vyaw = 0;
      st.vpitch = 0;
    };

    const tick = (time) => {
      if (st.flying) {
        st.yaw += (st.targetYaw - st.yaw) * 0.07;
        st.pitch += (st.targetPitch - st.pitch) * 0.07;
        if (Math.abs(st.targetYaw - st.yaw) < 0.002 && Math.abs(st.targetPitch - st.pitch) < 0.002) st.flying = false;
      } else if (!st.dragging) {
        // surface speed stays sane up close
        st.vyaw = st.vyaw * 0.95 + (SPIN / (st.zoom * st.zoom)) * 0.05;
        st.vpitch *= 0.9;
        st.yaw += st.vyaw;
        st.pitch = Math.max(-1.2, Math.min(1.2, st.pitch + st.vpitch));
      }
      st.zoom += (st.targetZoom - st.zoom) * 0.08;
      drawFrame(time);
      st.raf = requestAnimationFrame(tick);
    };

    const onDown = (e) => {
      st.dragging = true;
      st.flying = false;
      st.lastX = e.clientX;
      st.lastY = e.clientY;
      st.downX = e.clientX;
      st.downY = e.clientY;
      st.moved = 0;
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
      st.moved += Math.abs(dx) + Math.abs(dy);
      const s = 0.005 / st.zoom;
      st.yaw += dx * s;
      st.pitch = Math.max(-1.2, Math.min(1.2, st.pitch + dy * s));
      st.vyaw = dx * s;
      st.vpitch = dy * s;
    };
    const onUp = (e) => {
      st.dragging = false;
      canvas.style.cursor = 'grab';
      // a clean click on the home marker flies you in
      if (st.moved < 5 && st.bayScreen && st.zoom < BAY_SPLIT_ZOOM) {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        if (Math.hypot(mx - st.bayScreen.x, my - st.bayScreen.y) < 24) flyToBay();
      }
    };
    const onWheel = (e) => {
      e.preventDefault();
      st.targetZoom = Math.max(1, Math.min(MAX_ZOOM, st.targetZoom * Math.exp(-e.deltaY * 0.0018)));
    };
    const onDbl = () => {
      if (st.targetZoom > 1.5) {
        st.targetZoom = 1;
        st.flying = false;
      } else {
        flyToBay();
      }
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('dblclick', onDbl);
    st.raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(st.raf);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('dblclick', onDbl);
    };
  }, [size]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size, cursor: 'grab', touchAction: 'none', userSelect: 'none' }}
    />
  );
}
