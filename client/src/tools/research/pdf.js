// The only file that imports pdfjs-dist — everything under tools/research/
// is lazy-loaded, so the core stays in the research chunk and the worker
// ships as its own hashed asset, fetched the first time a PDF opens.
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export { pdfjs };
export const { TextLayer } = pdfjs;

export async function loadPdf(source) {
  const data = typeof source === 'string' ? { url: source } : { data: source };
  return pdfjs.getDocument(data).promise;
}

// Per-page plain text for the AI + retrieval. hasEOL marks pdfjs's own
// line breaks; everything else joins with spaces.
export async function extractAllPages(doc, onProgress) {
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const tc = await page.getTextContent();
    let text = '';
    for (const item of tc.items) {
      if (item.str) text += (text && !text.endsWith('\n') ? ' ' : '') + item.str;
      if (item.hasEOL) text += '\n';
    }
    pages.push({ pageNumber: n, text: text.trim().slice(0, 15_000) });
    onProgress?.(n, doc.numPages);
    page.cleanup();
  }
  return pages;
}

const BAD_TITLES = [/\.(pdf|dvi|tex|doc|docx)$/i, /^untitled/i, /^microsoft word/i, /^draft$/i];

// Best-effort title/authors/year — every field stays editable afterward.
export async function extractMetadata(doc, fileName) {
  let title = '';
  let authors = '';
  let year = null;

  try {
    const { info } = await doc.getMetadata();
    if (info?.Title?.trim() && !BAD_TITLES.some((re) => re.test(info.Title.trim()))) {
      title = info.Title.trim();
    }
    if (info?.Author?.trim()) authors = info.Author.trim();
  } catch { /* metadata is optional */ }

  try {
    const page = await doc.getPage(1);
    const tc = await page.getTextContent();
    const pageH = page.getViewport({ scale: 1 }).height;

    if (!title) {
      // the visually largest run of text in the top 40% of page 1
      let bestH = 0;
      for (const it of tc.items) {
        const h = Math.round(Math.hypot(it.transform[0], it.transform[1]));
        const y = it.transform[5];
        if (y > pageH * 0.6 && it.str.trim() && h > bestH) bestH = h;
      }
      if (bestH > 0) {
        const run = tc.items
          .filter((it) => Math.round(Math.hypot(it.transform[0], it.transform[1])) === bestH && it.transform[5] > pageH * 0.6)
          .map((it) => it.str)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (run.length >= 8) title = run.slice(0, 200);
      }
    }

    const pageText = tc.items.map((it) => it.str).join(' ');
    const yearMatch = pageText.match(/\b(19|20)\d{2}\b/);
    if (yearMatch) {
      const y = parseInt(yearMatch[0], 10);
      if (y >= 1900 && y <= new Date().getFullYear() + 1) year = y;
    }
    page.cleanup();
  } catch { /* first page may be unreadable */ }

  if (!title) {
    title = (fileName || 'Untitled paper')
      .replace(/\.pdf$/i, '')
      .replace(/[_-]+/g, ' ')
      .trim()
      .slice(0, 200) || 'Untitled paper';
  }
  return { title, authors, year };
}
