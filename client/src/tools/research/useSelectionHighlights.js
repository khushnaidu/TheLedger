import { useCallback, useState } from 'react';

// Turns a text-layer selection into %-of-page rects (zoom-invariant: the
// page box scales uniformly, so percentages re-render true at any zoom).
export default function useSelectionHighlights() {
  const [pending, setPending] = useState(null); // {page, rects, quote, anchor:{x,y}}

  const capture = useCallback(() => {
    const sel = document.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return false;
    const range = sel.getRangeAt(0);
    const node = range.commonAncestorContainer;
    const el = node.nodeType === 1 ? node : node.parentElement;
    const pageEl = el?.closest?.('[data-rr-page]');
    if (!pageEl || !el.closest('.rr-textlayer')) return false; // selection left the text layer

    const pageBox = pageEl.getBoundingClientRect();
    const raw = [...range.getClientRects()].filter((r) => r.width >= 2 && r.height >= 2);
    if (!raw.length) return false;

    // Group rects into visual lines (pdfjs emits one per span).
    const lines = [];
    for (const r of raw.sort((a, b) => a.top - b.top || a.left - b.left)) {
      const line = lines.find((l) => {
        const overlap = Math.min(l.bottom, r.bottom) - Math.max(l.top, r.top);
        return overlap >= Math.min(l.bottom - l.top, r.height) * 0.5;
      });
      if (line) {
        line.top = Math.min(line.top, r.top);
        line.bottom = Math.max(line.bottom, r.bottom);
        line.parts.push(r);
      } else {
        lines.push({ top: r.top, bottom: r.bottom, parts: [r] });
      }
    }

    // Within a line, merge only the runs that actually touch. Unioning a whole
    // line's left and right edges is what made a mark reach past the words:
    // a two-column paper puts both columns on the same visual line, so one
    // union paints a band across the gutter and over text nobody selected.
    // A word space is a fraction of the line height, a gutter is multiples of
    // it, so the gap itself tells the two apart.
    const boxesAt = (slack) => {
      const out = [];
      for (const line of lines) {
        const gapMax = Math.max(4, (line.bottom - line.top) * slack);
        let run = null;
        for (const r of [...line.parts].sort((a, b) => a.left - b.left)) {
          if (run && r.left - run.right <= gapMax) {
            run.right = Math.max(run.right, r.right);
            run.top = Math.min(run.top, r.top);
            run.bottom = Math.max(run.bottom, r.bottom);
          } else {
            run = { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
            out.push(run);
          }
        }
      }
      return out;
    };

    // The server takes at most 40 rects. Rather than refuse a long selection,
    // loosen the gap until it fits — accuracy degrades toward the old
    // whole-line union only for selections big enough to need it.
    let boxes = boxesAt(1.2);
    for (const slack of [3, 10, Infinity]) {
      if (boxes.length <= 40) break;
      boxes = boxesAt(slack);
    }
    if (!boxes.length || boxes.length > 40) return false;

    // a rect that reaches outside the page is always wrong, whatever produced it
    const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
    const pct = (v) => Math.round(v * 1000) / 1000;
    const rects = boxes.map((l) => {
      const left = clamp(l.left, pageBox.left, pageBox.right);
      const right = clamp(l.right, pageBox.left, pageBox.right);
      const top = clamp(l.top, pageBox.top, pageBox.bottom);
      const bottom = clamp(l.bottom, pageBox.top, pageBox.bottom);
      return {
        x: pct(((left - pageBox.left) / pageBox.width) * 100),
        y: pct(((top - pageBox.top) / pageBox.height) * 100),
        w: pct(((right - left) / pageBox.width) * 100),
        h: pct(((bottom - top) / pageBox.height) * 100),
      };
    }).filter((r) => r.w > 0 && r.h > 0);
    if (!rects.length) return false;
    const quote = sel.toString().replace(/\s+/g, ' ').trim().slice(0, 1000);
    if (!quote) return false;

    // the popover hangs off the end of the last run, not the last line —
    // `lines` no longer carries edges, only the runs inside it do
    const last = boxes[boxes.length - 1];
    setPending({
      page: parseInt(pageEl.dataset.rrPage, 10),
      rects,
      quote,
      anchor: { x: (last.left + last.right) / 2, y: last.bottom }, // viewport coords
    });
    return true;
  }, []);

  const clear = useCallback(() => {
    setPending(null);
    document.getSelection()?.removeAllRanges();
  }, []);

  return { pending, capture, clear };
}
