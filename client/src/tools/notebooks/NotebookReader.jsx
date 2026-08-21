import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../api';
import useNotebookState from './useNotebookState';
import PageCanvas from './PageCanvas';
import ToolPalette from './ToolPalette';
import { PAGE_W, PAGE_H, newImage } from './model';

// GIFs keep their animation (no canvas re-encode); everything else is
// downscaled to ≤1600px JPEG before it ever leaves the machine.
async function prepareImage(file) {
  const bmp = await createImageBitmap(file);
  if (file.type === 'image/gif') {
    if (file.size > 3_800_000) throw new Error('That gif is too heavy for the page (max ~4MB)');
    return { blob: file, w: bmp.width, h: bmp.height };
  }
  const ratio = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * ratio);
  canvas.height = Math.round(bmp.height * ratio);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
  return {
    blob: new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }),
    w: canvas.width,
    h: canvas.height,
  };
}

// ── page-curl geometry ───────────────────────────────────────
// The grabbed corner P0 is dragged to the cursor M; paper folds so P0
// lands exactly on M, which makes the fold line the perpendicular
// bisector of P0→M. The sheet keeps the half-plane away from the corner;
// the flap is the corner side reflected across the fold line — an affine
// reflection the browser applies as a CSS matrix(). Works for any cursor
// position, so the fold follows the hand in real time.

// Sutherland–Hodgman: clip a polygon to one side of the line through Q
// with unit normal n (positive side when keepPositive).
function clipHalfPlane(pts, Q, n, keepPositive) {
  const sign = keepPositive ? 1 : -1;
  const side = (p) => ((p[0] - Q[0]) * n[0] + (p[1] - Q[1]) * n[1]) * sign;
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const sa = side(a);
    const sb = side(b);
    if (sa >= 0) out.push(a);
    if ((sa > 0 && sb < 0) || (sa < 0 && sb > 0)) {
      const t = sa / (sa - sb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

const toPoly = (pts) =>
  pts.length >= 3
    ? `polygon(${pts.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(',')})`
    : 'polygon(0px 0px, 0px 0px, 0px 0px)';

// Set sheet/flap clip-paths and the flap's reflection matrix for a fold
// where corner P0 has been dragged to M. Returns true while a visible
// fold exists.
function applyFold(sheet, flap, overlay, W, H, P0, M, fade) {
  overlay.style.opacity = fade;
  const dx = M[0] - P0[0];
  const dy = M[1] - P0[1];
  const len = Math.hypot(dx, dy);
  if (len < 1) {
    sheet.style.clipPath = 'none';
    flap.style.opacity = 0;
    return;
  }
  const n = [dx / len, dy / len];
  const Q = [(M[0] + P0[0]) / 2, (M[1] + P0[1]) / 2];
  const rect = [[0, 0], [W, 0], [W, H], [0, H]];
  sheet.style.clipPath = toPoly(clipHalfPlane(rect, Q, n, true));
  const flapPts = clipHalfPlane(rect, Q, n, false);
  if (flapPts.length >= 3) {
    const k = Q[0] * n[0] + Q[1] * n[1];
    flap.style.clipPath = toPoly(flapPts);
    flap.style.transform = `matrix(${1 - 2 * n[0] * n[0]}, ${-2 * n[0] * n[1]}, ${-2 * n[0] * n[1]}, ${1 - 2 * n[1] * n[1]}, ${2 * k * n[0]}, ${2 * k * n[1]})`;
    flap.style.opacity = 1;
  } else {
    flap.style.opacity = 0;
  }
}

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t));

const STATUS_LABEL = {
  saved: (at) => `saved ${at ? at.toTimeString().slice(0, 5) : ''}`,
  saving: () => 'saving…',
  unsaved: () => 'unsaved',
  error: () => 'save failed — retrying on next edit',
  full: () => 'page full — start a fresh one',
};

export default function NotebookReader() {
  const { id } = useParams();
  const {
    notebook, pages, loading, error,
    saveStatus, savedAt,
    mutatePage, pushUndo, undo, addPage, deletePage, canUndo,
  } = useNotebookState(id);

  const [spreadStart, setSpreadStart] = useState(0);
  const [flip, setFlip] = useState(null); // { pages, dir: 1|-1, target }
  const [tool, setTool] = useState('select');
  const [penColor, setPenColor] = useState('ink');
  const [penSize, setPenSize] = useState(2);
  const [armedSticker, setArmedSticker] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [tearingId, setTearingId] = useState(null);
  const [notice, setNotice] = useState(null);

  const stageRef = useRef(null);
  const [stageW, setStageW] = useState(1100);
  const lastActive = useRef(null);
  const flipping = useRef(false);
  const curlSheetRef = useRef(null);
  const curlFlapRef = useRef(null);
  const curlOverlayRef = useRef(null);
  const curlCtx = useRef(null); // { W, H, P0, TARGET, left, top, apply } while a flip is mounted
  const dragging = useRef(false);
  const dragInfo = useRef(null); // { target, phantom, prevSpread }
  const lastM = useRef(null);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setStageW(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading]);

  // always one page — a bound book shows one leaf at a time
  const perSpread = 1;
  const scale = Math.min(0.68, (stageW - 64) / PAGE_W);
  const spreadCount = Math.max(1, Math.ceil(pages.length / perSpread));
  const spread = Math.min(spreadStart, spreadCount - 1);
  const visiblePages = pages.slice(spread * perSpread, spread * perSpread + perSpread);

  const flipTo = useCallback((next) => {
    if (flipping.current || next < 0 || next >= spreadCount || next === spread) return;
    flipping.current = true;
    setSelectedId(null);
    if (next > spread) {
      // forward: the current sheet peels away, the next spread is already beneath
      setFlip({ pages: visiblePages, dir: 1, target: next, mode: 'auto', corner: 'br' });
      setSpreadStart(next);
    } else {
      // backward: the previous sheet unfolds back over the current spread
      setFlip({ pages: pages.slice(next * perSpread, next * perSpread + perSpread), dir: -1, target: next, mode: 'auto', corner: 'br' });
    }
  }, [spread, spreadCount, visiblePages, pages, perSpread]);

  // Mount the fold context whenever a flip exists; in auto mode, also
  // animate the grabbed corner from its home to the far side (or back).
  useEffect(() => {
    if (!flip) { curlCtx.current = null; return; }
    const sheet = curlSheetRef.current;
    const flap = curlFlapRef.current;
    const overlay = curlOverlayRef.current;
    if (!sheet || !flap || !overlay) return;
    const rect = sheet.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;
    const P0 = flip.corner === 'tr' ? [W, 0] : [W, H];
    const TARGET = [-1.15 * W, flip.corner === 'tr' ? H * 0.12 : H * 0.88];
    const arcLift = (flip.corner === 'tr' ? 0.28 : -0.28) * H;
    const pointAt = (s) => [
      P0[0] + (TARGET[0] - P0[0]) * s,
      P0[1] + (TARGET[1] - P0[1]) * s + arcLift * Math.sin(Math.PI * s),
    ];
    const apply = (M, fade = 1) => applyFold(sheet, flap, overlay, W, H, P0, M, fade);
    curlCtx.current = { W, H, P0, TARGET, left: rect.left, top: rect.top, apply, pointAt };

    if (flip.mode === 'drag') {
      // forward starts flat (corner at home); backward starts folded away
      apply(flip.dir === 1 ? P0 : TARGET, 1);
      return () => { curlCtx.current = null; };
    }

    const DUR = 620;
    let raf;
    let start;
    const step = (ts) => {
      if (start === undefined) start = ts;
      const t = Math.min(1, (ts - start) / DUR);
      const e = easeInOut(t);
      const fade = flip.dir === 1
        ? (t > 0.85 ? (1 - t) / 0.15 : 1)   // outgoing sheet dissolves as it lands
        : (t < 0.12 ? t / 0.12 : 1);         // incoming sheet materializes at the far side
      apply(pointAt(flip.dir === 1 ? e : 1 - e), fade);
      if (t < 1) raf = requestAnimationFrame(step);
      else {
        if (flip.dir === -1) setSpreadStart(flip.target);
        setFlip(null);
        flipping.current = false;
      }
    };
    apply(pointAt(flip.dir === 1 ? 0 : 1), flip.dir === 1 ? 1 : 0);
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); curlCtx.current = null; flipping.current = false; };
  }, [flip]);

  // ── manual corner-drag flip ────────────────────────────────
  const moveDragFlip = useCallback((ev) => {
    const ctx = curlCtx.current;
    if (!ctx || !dragging.current) return;
    const mx = Math.max(-1.3 * ctx.W, Math.min(ev.clientX - ctx.left, 1.02 * ctx.W));
    const my = Math.max(-0.3 * ctx.H, Math.min(ev.clientY - ctx.top, 1.3 * ctx.H));
    lastM.current = [mx, my];
    ctx.apply([mx, my]);
  }, []);

  const endDragFlip = useCallback(() => {
    window.removeEventListener('pointermove', moveDragFlip);
    dragging.current = false;
    const ctx = curlCtx.current;
    const info = dragInfo.current;
    if (!ctx || !info) { setFlip(null); flipping.current = false; return; }
    const dir = info.dir;
    const M0 = lastM.current || (dir === 1 ? ctx.P0 : ctx.TARGET);
    // forward commits once carried past the midline going left;
    // backward commits once carried past the midline going right
    const commit = dir === 1 ? M0[0] < ctx.W * 0.5 : M0[0] > ctx.W * 0.5;
    const dest = dir === 1
      ? (commit ? ctx.TARGET : ctx.P0)
      : (commit ? ctx.P0 : ctx.TARGET);
    // the overlay dissolves whenever it ends folded-away or landing flat on
    // identical content; a backward commit ends flush over the new spread
    const fadeAtEnd = (dir === 1 && commit) || (dir === -1 && !commit);
    const DUR = 260;
    let start;
    const finalize = async () => {
      if (dir === -1) {
        if (commit) setSpreadStart(info.target);
      } else if (commit && info.phantom) {
        // flipping past the last page binds a fresh one
        try {
          const page = await addPage();
          setSpreadStart(Math.ceil(page.pageNumber / perSpread) - 1);
        } catch (e) {
          flash(e.message);
        }
      } else if (!commit && !info.phantom) {
        setSpreadStart(info.prevSpread);
      }
      dragInfo.current = null;
      setFlip(null);
      flipping.current = false;
    };
    const step = (ts) => {
      if (start === undefined) start = ts;
      const t = Math.min(1, (ts - start) / DUR);
      const e = 1 - (1 - t) * (1 - t);
      const M = [M0[0] + (dest[0] - M0[0]) * e, M0[1] + (dest[1] - M0[1]) * e];
      ctx.apply(M, fadeAtEnd && t > 0.8 ? (1 - t) / 0.2 : 1);
      if (t < 1) requestAnimationFrame(step);
      else finalize();
    };
    requestAnimationFrame(step);
  }, [moveDragFlip, addPage, perSpread]);

  const startDragFlip = (e) => {
    if (flipping.current || tearingId || !visiblePages.length) return;
    const corner = e.currentTarget.dataset.corner;
    const backward = e.currentTarget.dataset.edge === 'left';
    if (backward && spread === 0) return;
    e.preventDefault();
    flipping.current = true;
    dragging.current = true;
    setSelectedId(null);
    lastM.current = null;
    if (backward) {
      // grab a left corner: the previous sheet unfolds back over this one
      const target = spread - 1;
      dragInfo.current = { target, phantom: false, prevSpread: spread, dir: -1 };
      setFlip({
        pages: pages.slice(target * perSpread, target * perSpread + perSpread),
        dir: -1, target, mode: 'drag', corner, phantom: false,
      });
    } else {
      const next = spread + 1;
      const phantom = next >= spreadCount; // past the end: flip onto a fresh page
      dragInfo.current = { target: next, phantom, prevSpread: spread, dir: 1 };
      setFlip({ pages: visiblePages, dir: 1, target: next, mode: 'drag', corner, phantom });
      if (!phantom) setSpreadStart(next);
    }
    window.addEventListener('pointermove', moveDragFlip);
    window.addEventListener('pointerup', endDragFlip, { once: true });
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.isContentEditable || /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.key === 'ArrowLeft') flipTo(spread - 1);
      if (e.key === 'ArrowRight') flipTo(spread + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [spread, flipTo]);

  const flash = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3500);
  };

  const handleImagePick = async (file) => {
    const target = lastActive.current
      ? pages.find((p) => p.id === lastActive.current) || visiblePages[0]
      : visiblePages[0];
    if (!target) return;
    setUploading(true);
    try {
      const { blob, w, h } = await prepareImage(file);
      const url = await api.uploadNotebookImage(blob);
      const dispW = Math.min(320, w);
      const dispH = Math.round((dispW / w) * h);
      pushUndo(target.id);
      mutatePage(target.id, (c) => ({
        ...c,
        items: [...c.items, newImage(
          (PAGE_W - dispW) / 2 + (Math.random() * 60 - 30),
          Math.min(PAGE_H - dispH - 60, 160 + Math.random() * 120),
          url, dispW, dispH
        )],
      }), { withUndo: false });
    } catch (e) {
      flash(e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleAddPage = async () => {
    await addPage();
    // land on the new last spread
    setSpreadStart(Math.ceil((pages.length + 1) / perSpread) - 1);
  };

  const handleDeletePage = () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      setTimeout(() => setConfirmingDelete(false), 2500);
      return;
    }
    setConfirmingDelete(false);
    const target = visiblePages[visiblePages.length - 1];
    if (!target || tearingId) return;
    // crumple first; the actual delete happens when the animation ends
    flipping.current = true;
    setSelectedId(null);
    setTearingId(target.id);
  };

  const finishTear = async () => {
    const target = tearingId;
    if (!target) return;
    try {
      await deletePage(target);
      setSpreadStart((s) => Math.max(0, Math.min(s, Math.ceil((pages.length - 1) / perSpread) - 1)));
    } catch (e) {
      flash(e.message);
    } finally {
      setTearingId(null);
      flipping.current = false;
    }
  };

  const trackedMutate = (pageId, fn, opts) => {
    lastActive.current = pageId;
    mutatePage(pageId, fn, opts);
  };

  // drop stray drag listeners if the reader unmounts mid-gesture
  useEffect(() => () => {
    window.removeEventListener('pointermove', moveDragFlip);
    window.removeEventListener('pointerup', endDragFlip);
  }, [moveDragFlip, endDragFlip]);

  // while dragging past the last page, a fresh blank sheet waits underneath;
  // it becomes a real page only if the flip commits
  const underPages = flip?.phantom
    ? [{ id: '__phantom', pageNumber: pages.length + 1, content: { v: 1, items: [] } }]
    : visiblePages;

  const undoTarget = lastActive.current || visiblePages[0]?.id;

  if (loading) {
    return (
      <div className="pt-16 flex justify-center">
        <div className="loader"><div className="loader-bar" /><div className="loader-bar" /><div className="loader-bar" /><div className="loader-bar" /></div>
      </div>
    );
  }
  if (error || !notebook) {
    return (
      <div className="max-w-[600px] pt-10">
        <p className="t-label" style={{ color: 'var(--stamp)' }}>{error || 'Notebook not found'}</p>
        <Link to="/notebooks" className="t-label underline">← back to the shelf</Link>
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] stagger relative">
      <div className="flex items-baseline justify-between">
        <div>
          <Link to="/notebooks" className="t-label hover:text-[var(--stamp)]">← The Shelf</Link>
          <h1 className="t-display mt-1">{notebook.title}</h1>
        </div>
        <div className="text-right">
          <span className={`nb-savestamp ${saveStatus === 'unsaved' || saveStatus === 'error' || saveStatus === 'full' ? 'nb-savestamp-hot' : ''}`}>
            {STATUS_LABEL[saveStatus](savedAt)}
          </span>
          <p className="t-label mt-2">
            page {String(spread + 1).padStart(2, '0')} / {String(spreadCount).padStart(2, '0')}
          </p>
        </div>
      </div>

      {notice && <p className="t-label mt-2" style={{ color: 'var(--stamp)' }}>{notice}</p>}

      <div className="flex gap-4 mt-5 items-start">
        <ToolPalette
          tool={tool} setTool={setTool}
          penColor={penColor} setPenColor={setPenColor}
          penSize={penSize} setPenSize={setPenSize}
          armedSticker={armedSticker} setArmedSticker={setArmedSticker}
          onImagePick={handleImagePick} uploading={uploading}
          onUndo={() => undoTarget && undo(undoTarget)}
          canUndo={undoTarget ? canUndo(undoTarget) : false}
        />

        <div className="flex-1 min-w-0" ref={stageRef}>
          <div className="nb-spread-stage">
            <div className={`nb-book nb-book-${notebook.coverStyle}`}>
            <div className="nb-spread">
              {underPages.map((page, i) => (
                <div key={page.id}
                  className={`nb-page-slot ${tearingId === page.id ? 'nb-tearing' : ''}`}
                  onAnimationEnd={(e) => { if (e.animationName === 'nbCrumpleToss') finishTear(); }}
                  style={{ width: PAGE_W * scale, height: PAGE_H * scale }}>
                  <PageCanvas
                    page={page}
                    paperStyle={notebook.paperStyle}
                    scale={scale}
                    tool={tool}
                    penColor={penColor}
                    penSize={penSize}
                    armedSticker={armedSticker}
                    selectedId={selectedId}
                    onSelect={(itemId) => { setSelectedId(itemId); if (itemId) lastActive.current = page.id; }}
                    onToolDone={() => { setTool('select'); setArmedSticker(null); }}
                    mutatePage={page.id === '__phantom' ? () => {} : trackedMutate}
                    pushUndo={page.id === '__phantom' ? () => {} : pushUndo}
                  />
                  {/* grab a right corner to turn forward, a left corner to turn back */}
                  {!flip && !tearingId && i === underPages.length - 1 && (
                    <>
                      <div className="nb-corner nb-corner-tr" data-corner="tr" data-edge="right" onPointerDown={startDragFlip} />
                      <div className="nb-corner nb-corner-br" data-corner="br" data-edge="right" onPointerDown={startDragFlip} />
                    </>
                  )}
                  {!flip && !tearingId && i === 0 && spread > 0 && (
                    <>
                      <div className="nb-corner nb-corner-tl" data-corner="tr" data-edge="left" onPointerDown={startDragFlip} />
                      <div className="nb-corner nb-corner-bl" data-corner="br" data-edge="left" onPointerDown={startDragFlip} />
                    </>
                  )}
                </div>
              ))}
            </div>

            {/* the turning sheet — a frozen copy of the outgoing (or incoming)
                spread, clipped along the sweeping fold; the flap is its blank
                paper backside reflected across the fold line */}
            {flip && (
              <div className="nb-curl-overlay" ref={curlOverlayRef}>
                <div className="nb-curl-sheet" ref={curlSheetRef}>
                  {flip.pages.map((page) => (
                    <div key={page.id} className="nb-page-slot"
                      style={{ width: PAGE_W * scale, height: PAGE_H * scale }}>
                      <PageCanvas
                        page={page}
                        paperStyle={notebook.paperStyle}
                        scale={scale}
                        tool="select"
                        penColor="ink"
                        penSize={2}
                        armedSticker={null}
                        selectedId={null}
                        onSelect={() => {}}
                        onToolDone={() => {}}
                        mutatePage={() => {}}
                        pushUndo={() => {}}
                      />
                    </div>
                  ))}
                  <div className="nb-curl-flap" ref={curlFlapRef} />
                </div>
              </div>
            )}
            </div>
          </div>

          <div className="flex items-center justify-between mt-4">
            <button className="btn-ghost" onClick={() => flipTo(spread - 1)} disabled={spread === 0}>
              ← prev
            </button>
            <div className="flex gap-3">
              <button className="btn-outline" onClick={handleAddPage}>+ Add Page</button>
              <button
                className={confirmingDelete ? 'btn-red' : 'btn-ghost'}
                onClick={handleDeletePage}
                disabled={pages.length <= 1}
              >
                {confirmingDelete ? 'Tear it out?' : 'Tear out page'}
              </button>
            </div>
            <button className="btn-ghost" onClick={() => flipTo(spread + 1)} disabled={spread >= spreadCount - 1}>
              next →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
