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

    // merge rects sharing a line (pdfjs emits one per span)
    const lines = [];
    for (const r of raw.sort((a, b) => a.top - b.top || a.left - b.left)) {
      const line = lines.find((l) => {
        const overlap = Math.min(l.bottom, r.bottom) - Math.max(l.top, r.top);
        return overlap >= Math.min(l.bottom - l.top, r.height) * 0.5;
      });
      if (line) {
        line.left = Math.min(line.left, r.left);
        line.right = Math.max(line.right, r.right);
        line.top = Math.min(line.top, r.top);
        line.bottom = Math.max(line.bottom, r.bottom);
      } else {
        lines.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
      }
    }
    if (lines.length > 40) return false;

    const pct = (v) => Math.round(v * 1000) / 1000;
    const rects = lines.map((l) => ({
      x: pct(((l.left - pageBox.left) / pageBox.width) * 100),
      y: pct(((l.top - pageBox.top) / pageBox.height) * 100),
      w: pct(((l.right - l.left) / pageBox.width) * 100),
      h: pct(((l.bottom - l.top) / pageBox.height) * 100),
    }));
    const quote = sel.toString().replace(/\s+/g, ' ').trim().slice(0, 1000);
    if (!quote) return false;

    const last = lines[lines.length - 1];
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
