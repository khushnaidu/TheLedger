import { useEffect, useRef, useState, memo } from 'react';

// One PDF page: canvas underneath, tinted highlight divs in the middle,
// selectable transparent text layer on top. Renders only while `active`
// (the reader's IntersectionObserver decides); inactive pages keep their
// box height so the scrollbar never jumps.
function PdfPage({ doc, pageNumber, width, aspect, active, annotations, flashId, selectedId, onOverlayClick }) {
  const canvasRef = useRef(null);
  const textRef = useRef(null);
  const [pageAspect, setPageAspect] = useState(aspect);
  const renderTask = useRef(null);

  useEffect(() => {
    if (!active || !doc) return;
    const canvasEl = canvasRef.current;
    const textEl = textRef.current;
    let dead = false;
    (async () => {
      try {
        const page = await doc.getPage(pageNumber);
        if (dead) return;
        const base = page.getViewport({ scale: 1 });
        setPageAspect(base.height / base.width);
        const scale = width / base.width;
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const textDiv = textRef.current;
        if (!canvas || !textDiv) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        const ctx = canvas.getContext('2d');
        renderTask.current?.cancel();
        renderTask.current = page.render({
          canvasContext: ctx,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        });
        await renderTask.current.promise.catch(() => {});
        if (dead) return;

        // v4 text layer positions spans off this CSS var
        textDiv.innerHTML = '';
        textDiv.style.setProperty('--scale-factor', viewport.scale);
        const { TextLayer } = await import('./pdf');
        await new TextLayer({
          textContentSource: page.streamTextContent(),
          container: textDiv,
          viewport,
        }).render();
      } catch { /* cancelled mid-scroll */ }
    })();
    return () => {
      dead = true;
      renderTask.current?.cancel();
      if (canvasEl) canvasEl.width = 0; // release backing store
      if (textEl) textEl.innerHTML = '';
    };
  }, [doc, pageNumber, width, active]);

  // The text layer covers the whole page and sits above the marks, because it
  // has to be on top for the text to stay selectable. That means a click can
  // never land on a mark, which is why they used to be unclickable. So the
  // page hit-tests instead: a click with nothing selected is matched against
  // the mark rects, smallest first so an overlap picks the tighter one.
  const pick = (e) => {
    if (!onOverlayClick) return;
    const sel = document.getSelection();
    if (sel && !sel.isCollapsed) return; // finishing a drag, not clicking
    const box = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * 100;
    const y = ((e.clientY - box.top) / box.height) * 100;
    let hit = null;
    let area = Infinity;
    for (const a of annotations) {
      for (const r of a.rects) {
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h && r.w * r.h < area) {
          area = r.w * r.h;
          hit = a;
        }
      }
    }
    onOverlayClick(hit); // null clears, so clicking bare paper lets a mark go
  };

  return (
    <div
      className="rr-page"
      data-rr-page={pageNumber}
      style={{ width, height: Math.round(width * pageAspect) }}
      onClick={pick}
    >
      <canvas ref={canvasRef} className="rr-page-canvas" />
      {annotations.map((a) =>
        a.rects.map((r, i) => (
          <div
            key={`${a.id}-${i}`}
            className={`rr-mark rr-mark-${a.color}${flashId === a.id ? ' rr-mark-flash' : ''}${selectedId === a.id ? ' rr-mark-on' : ''}`}
            style={{ left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%` }}
          />
        )))}
      <div ref={textRef} className="rr-textlayer" />
      <span className="rr-page-folio">{pageNumber}</span>
    </div>
  );
}

export default memo(PdfPage);
