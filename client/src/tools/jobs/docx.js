import JSZip from 'jszip';

// ── docx surgery for the rewrite desk ────────────────────────
// The whole trick of "edit without wrecking formatting": a .docx is XML
// in a zip, and every visible string lives in a <w:t> text node inside a
// styled run. We only ever change the CONTENTS of those text nodes. The
// runs, their properties, the styles part, tables, spacing — every other
// byte of the document — is carried through untouched. See ADR-0009.

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// document body plus headers/footers — resume templates love putting the
// contact line in a header, and a desk that cannot see it is useless
const EDITABLE = /^word\/(document|header\d+|footer\d+)\.xml$/;

const serializer = new XMLSerializer();

export async function loadDocx(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('The master would not open. The file may be missing from storage.');
  const zip = await JSZip.loadAsync(await res.arrayBuffer());
  const parts = [];
  for (const name of Object.keys(zip.files).filter((n) => EDITABLE.test(n)).sort()) {
    const text = await zip.file(name).async('string');
    const xml = new DOMParser().parseFromString(text, 'application/xml');
    if (xml.querySelector('parsererror')) throw new Error(`The master's ${name} would not parse.`);
    // XMLSerializer drops the <?xml ?> declaration; keep the original to put back
    parts.push({ name, xml, declaration: (text.match(/^<\?xml[^>]*\?>/) || [''])[0] });
  }
  if (!parts.length) throw new Error('That file is not a Word document.');
  return { zip, parts };
}

// A run's formatting identity is its rPr serialized; identical strings
// mean Word would render the text identically, so the runs can act as
// one segment even though the editor split them (spell-check and
// revision bookkeeping fragment sentences into many same-styled runs).
function runFormat(run) {
  const rPr = [...run.childNodes].find((c) => c.nodeType === 1 && c.localName === 'rPr');
  return rPr ? serializer.serializeToString(rPr) : '';
}

// A toggle property (<w:b/>, <w:i/>) is ON when present unless its val
// says otherwise — <w:b w:val="0"/> is an explicit OFF and must not read
// as bold, or the clerk would "fix" formatting that is already right.
function flagOn(fmt, tag) {
  const m = new RegExp(`<w:${tag}(?:\\s([^>]*?))?/?>`).exec(fmt);
  if (!m) return false;
  return !/w:val="(?:0|false|none)"/.test(m[1] || '');
}

// What a paragraph declares about its own geometry — indent, alignment,
// spacing — read off its pPr so the clerk can see layout, not just dress.
// Styles it inherits from are invisible here; absence means "as styled",
// not zero, and the clerk is told so.
const twToIn = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n ? Math.round((n / 1440) * 100) / 100 : 0;
};
function paraLayout(p) {
  const pPr = [...p.childNodes].find((c) => c.nodeType === 1 && c.localName === 'pPr');
  if (!pPr) return {};
  const get = (tag) => [...pPr.childNodes].find((c) => c.nodeType === 1 && c.localName === tag);
  const out = {};
  const ind = get('ind');
  if (ind) {
    out.ind = twToIn(ind.getAttribute('w:left') ?? ind.getAttribute('w:start'));
    out.fl = twToIn(ind.getAttribute('w:firstLine'));
    out.hang = twToIn(ind.getAttribute('w:hanging'));
  }
  const jc = get('jc');
  if (jc) out.jc = jc.getAttribute('w:val') || '';
  const sp = get('spacing');
  if (sp) {
    out.spb = Math.round(Number(sp.getAttribute('w:before') || 0) / 20);
    out.spa = Math.round(Number(sp.getAttribute('w:after') || 0) / 20);
    const line = Number(sp.getAttribute('w:line') || 0);
    if (line && (sp.getAttribute('w:lineRule') || 'auto') === 'auto') {
      out.lsp = Math.round((line / 240) * 100) / 100;
    }
  }
  return out;
}

// Walk every paragraph and cut it into segments: maximal stretches of
// same-formatted text. Tabs, line breaks, images, fields all end a
// segment — replacing across a tab would eat the tab and shift a column.
export function segment(parts) {
  const segments = [];
  let pn = 0;
  for (const part of parts) {
    for (const p of part.xml.getElementsByTagName('w:p')) {
      pn += 1;
      const countBefore = segments.length;
      // structure hints for the clerk: a bold 16pt paragraph is a heading,
      // a numPr paragraph is a bullet — without these it reads a resume as
      // one flat ribbon of fragments and edits the wrong things
      const li = p.getElementsByTagName('w:numPr').length > 0;
      const lay = paraLayout(p);
      let current = null;
      const close = () => {
        if (current?.text.trim()) {
          current.b = flagOn(current.fmt, 'b');
          current.i = flagOn(current.fmt, 'i');
          current.u = flagOn(current.fmt, 'u');
          const sz = /<w:sz [^>]*w:val="([\d.]+)"/.exec(current.fmt);
          current.sz = sz ? Math.round(Number(sz[1]) / 2) : null; // half-points to points
          const f = /<w:rFonts [^>]*w:ascii="([^"]+)"/.exec(current.fmt);
          current.f = f ? f[1] : null; // so a stray-font line is visible on the sheet
          segments.push(current);
        }
        current = null;
      };
      for (const run of p.getElementsByTagName('w:r')) {
        const fmt = runFormat(run);
        for (const child of run.childNodes) {
          if (child.nodeType !== 1) continue;
          if (child.localName === 't') {
            // same formatting is not enough: a run inside a hyperlink must
            // never merge with its plain neighbor, or a replacement would
            // move words in or out of the link
            if (!current || current.fmt !== fmt || current.holder !== run.parentNode) {
              close();
              current = { n: 0, pn, li, ...lay, part: part.name, fmt, holder: run.parentNode, nodes: [], text: '', pEl: p };
            }
            current.nodes.push(child);
            current.text += child.textContent;
          } else if (child.localName !== 'rPr') {
            close(); // tab, br, drawing, field char: hard boundary
          }
        }
      }
      close();
      // A paragraph with no text at all still stands on the page — a blank
      // line, or worse, a bullet whose words were emptied but whose marker
      // and height remain. Invisible paragraphs caused a standoff where the
      // reader saw a lingering bullet and the clerk saw nothing (the sheet
      // skipped from P26 to P29). Emit a GHOST segment so the sheet can
      // show the line and a strike can remove it.
      if (segments.length === countBefore) {
        segments.push({
          n: 0, pn, li, ...lay, part: part.name, fmt: '', holder: null,
          nodes: [], text: '', ghost: true, pEl: p,
        });
      }
    }
  }
  segments.forEach((s, i) => { s.n = i + 1; });
  return segments;
}

// The replacement goes whole into the first text node; the rest of the
// segment's nodes are emptied, never removed — their runs and formatting
// stay in the file, ready to render nothing.
export function applyEdit(seg, text) {
  seg.nodes.forEach((node, i) => {
    node.textContent = i === 0 ? text : '';
    // Word strips leading/trailing spaces from unmarked text nodes
    node.setAttribute('xml:space', 'preserve');
  });
  seg.text = text;
}

// ── the retype move ──────────────────────────────────────────
// The one sanctioned breach of "only text nodes change": a format
// proposal the reader accepted rewrites the run properties of that one
// segment's own runs. Nothing else — not the paragraph, not the styles
// part, not the neighbors. OOXML demands rPr children in a fixed
// sequence or Word flags the file, hence the order table.
const RPR_ORDER = ['rStyle', 'rFonts', 'b', 'bCs', 'i', 'iCs', 'caps', 'smallCaps', 'strike',
  'dstrike', 'outline', 'shadow', 'emboss', 'imprint', 'noProof', 'snapToGrid', 'vanish',
  'webHidden', 'color', 'spacing', 'w', 'kern', 'position', 'sz', 'szCs', 'highlight', 'u',
  'effect', 'bdr', 'shd', 'fitText', 'vertAlign', 'rtl', 'cs', 'em', 'lang', 'eastAsianLayout',
  'specVanish', 'oMath'];

function putOrdered(xml, parent, tag, attrs, order) {
  let el = [...parent.childNodes].find((c) => c.nodeType === 1 && c.localName === tag);
  if (!el) {
    el = xml.createElementNS(W_NS, `w:${tag}`);
    const rank = order.indexOf(tag);
    const before = [...parent.childNodes].find(
      (c) => c.nodeType === 1 && order.indexOf(c.localName) > rank,
    ) || null;
    parent.insertBefore(el, before);
  }
  for (const [k, v] of Object.entries(attrs)) el.setAttributeNS(W_NS, k, v);
  return el;
}

const putRPr = (xml, rPr, tag, attrs) => putOrdered(xml, rPr, tag, attrs, RPR_ORDER);

// set = { bold?, italic?, underline?: boolean, size_pt?: number, font?: string } —
// only the keys present change; toggles clear with an explicit val="0"
// (removing the element would merely fall back to whatever a style says).
function applyRunProps(xml, run, set) {
  let rPr = [...run.childNodes].find((c) => c.nodeType === 1 && c.localName === 'rPr');
  if (!rPr) {
    rPr = xml.createElementNS(W_NS, 'w:rPr');
    run.insertBefore(rPr, run.firstChild);
  }
  if (set.bold !== undefined) {
    putRPr(xml, rPr, 'b', { 'w:val': set.bold ? '1' : '0' });
    putRPr(xml, rPr, 'bCs', { 'w:val': set.bold ? '1' : '0' });
  }
  if (set.italic !== undefined) {
    putRPr(xml, rPr, 'i', { 'w:val': set.italic ? '1' : '0' });
    putRPr(xml, rPr, 'iCs', { 'w:val': set.italic ? '1' : '0' });
  }
  if (set.underline !== undefined) {
    putRPr(xml, rPr, 'u', { 'w:val': set.underline ? 'single' : 'none' });
  }
  if (set.size_pt !== undefined) {
    const half = String(Math.round(set.size_pt * 2));
    putRPr(xml, rPr, 'sz', { 'w:val': half });
    putRPr(xml, rPr, 'szCs', { 'w:val': half });
  }
  if (set.font) {
    const el = putRPr(xml, rPr, 'rFonts', { 'w:ascii': set.font, 'w:hAnsi': set.font, 'w:cs': set.font });
    // theme-font attributes outrank the literal names; a retype that
    // leaves them in place would change nothing on a themed template
    for (const a of ['asciiTheme', 'hAnsiTheme', 'cstheme', 'eastAsiaTheme']) el.removeAttributeNS(W_NS, a);
  }
}

export function applyFormat(seg, set) {
  const runs = [...new Set(seg.nodes.map((n) => n.parentNode))];
  for (const run of runs) applyRunProps(run.ownerDocument, run, set);
}

// Word-scope retype: dress only certain words inside a segment. This is
// how Word itself does it — the run SPLITS at the word boundaries into
// before/word/after runs, each a clone of the original rPr, with the
// word's run additionally dressed. Formatting still by construction; the
// desk never invents typesetting, it subdivides what is already there.
// Every occurrence of the words inside the segment is dressed.
export function applyWordFormat(seg, set, only) {
  const text = seg.text;
  const ranges = [];
  let idx = text.indexOf(only);
  while (idx !== -1) {
    ranges.push([idx, idx + only.length]);
    idx = text.indexOf(only, idx + only.length);
  }
  if (!ranges.length) throw new Error('Those exact words are not on that line anymore.');
  // collapse the segment's text into its first node so the split has one
  // authoritative text node to carve — the applyEdit invariant reused
  applyEdit(seg, text);
  const t0 = seg.nodes[0];
  const R = t0.parentNode;
  const H = R.parentNode;
  const xml = R.ownerDocument;
  const rPr0 = [...R.childNodes].find((c) => c.nodeType === 1 && c.localName === 'rPr');
  const mkRun = (chunk, styled) => {
    const run = xml.createElementNS(W_NS, 'w:r');
    if (rPr0) run.appendChild(rPr0.cloneNode(true));
    if (styled) applyRunProps(xml, run, set);
    const t = xml.createElementNS(W_NS, 'w:t');
    t.setAttribute('xml:space', 'preserve');
    t.textContent = chunk;
    run.appendChild(t);
    return run;
  };
  // in-run content AFTER the text node (a tab belonging to the next
  // segment, say) moves to a tail run so nothing changes order
  const after = [];
  let seen = false;
  for (const child of [...R.childNodes]) {
    if (child === t0) { seen = true; continue; }
    if (seen && !(child.nodeType === 1 && child.localName === 'rPr')) after.push(child);
  }
  let tail = null;
  if (after.length) {
    tail = xml.createElementNS(W_NS, 'w:r');
    if (rPr0) tail.appendChild(rPr0.cloneNode(true));
    for (const child of after) tail.appendChild(child);
  }
  const anchor = R.nextSibling;
  R.removeChild(t0);
  const runs = [];
  let pos = 0;
  for (const [s, e] of ranges) {
    if (s > pos) runs.push(mkRun(text.slice(pos, s), false));
    runs.push(mkRun(text.slice(s, e), true));
    pos = e;
  }
  if (pos < text.length) runs.push(mkRun(text.slice(pos), false));
  if (tail) runs.push(tail);
  for (const run of runs) H.insertBefore(run, anchor);
}

const paraOf = (node) => {
  let el = node;
  while (el && el.localName !== 'p') el = el.parentNode;
  return el;
};

// ── the lay-out move ─────────────────────────────────────────
// The paragraph-level sibling of retype: an accepted layout proposal
// rewrites the pPr geometry of the one paragraph the reader approved —
// indent, alignment, spacing — and nothing else. Same fixed-sequence
// rule as rPr, hence the second order table.
const PPR_ORDER = ['pStyle', 'keepNext', 'keepLines', 'pageBreakBefore', 'framePr',
  'widowControl', 'numPr', 'suppressLineNumbers', 'pBdr', 'shd', 'tabs',
  'suppressAutoHyphens', 'kinsoku', 'wordWrap', 'overflowPunct', 'topLinePunct',
  'autoSpaceDE', 'autoSpaceDN', 'bidi', 'adjustRightInd', 'snapToGrid', 'spacing',
  'ind', 'contextualSpacing', 'mirrorIndents', 'suppressOverlap', 'jc', 'textDirection',
  'textAlignment', 'textboxTightWrap', 'outlineLvl', 'divId', 'cnfStyle', 'rPr',
  'sectPr', 'pPrChange'];

// set = { indent_in?, first_line_in?, hanging_in?: number (inches),
//         align?: 'left'|'center'|'right'|'both',
//         space_before_pt?, space_after_pt?: number, line_spacing?: number } —
// only the keys present change. An explicit zero is meaningful: it
// overrides whatever a style inherits, which is how "remove the indent"
// actually sticks.
export function applyLayout(seg, set) {
  const p = paraOf(seg.nodes[0]);
  if (!p) throw new Error('The desk lost its place in the document.');
  const xml = p.ownerDocument;
  let pPr = [...p.childNodes].find((c) => c.nodeType === 1 && c.localName === 'pPr');
  if (!pPr) {
    pPr = xml.createElementNS(W_NS, 'w:pPr');
    p.insertBefore(pPr, p.firstChild);
  }
  const inTw = (v) => String(Math.round(v * 1440));
  if (set.indent_in !== undefined || set.first_line_in !== undefined || set.hanging_in !== undefined) {
    const ind = putOrdered(xml, pPr, 'ind', {}, PPR_ORDER);
    if (set.indent_in !== undefined) {
      ind.setAttributeNS(W_NS, 'w:left', inTw(set.indent_in));
      ind.removeAttributeNS(W_NS, 'start'); // left and start disagree, left wins in Word — don't leave both
    }
    // firstLine and hanging are rival attributes; setting one clears the other
    if (set.first_line_in !== undefined) {
      ind.setAttributeNS(W_NS, 'w:firstLine', inTw(set.first_line_in));
      ind.removeAttributeNS(W_NS, 'hanging');
    }
    if (set.hanging_in !== undefined) {
      ind.setAttributeNS(W_NS, 'w:hanging', inTw(set.hanging_in));
      ind.removeAttributeNS(W_NS, 'firstLine');
    }
  }
  if (set.align) putOrdered(xml, pPr, 'jc', { 'w:val': set.align }, PPR_ORDER);
  if (set.space_before_pt !== undefined || set.space_after_pt !== undefined || set.line_spacing !== undefined) {
    const sp = putOrdered(xml, pPr, 'spacing', {}, PPR_ORDER);
    if (set.space_before_pt !== undefined) sp.setAttributeNS(W_NS, 'w:before', String(Math.round(set.space_before_pt * 20)));
    if (set.space_after_pt !== undefined) sp.setAttributeNS(W_NS, 'w:after', String(Math.round(set.space_after_pt * 20)));
    if (set.line_spacing !== undefined) {
      sp.setAttributeNS(W_NS, 'w:line', String(Math.round(set.line_spacing * 240)));
      sp.setAttributeNS(W_NS, 'w:lineRule', 'auto');
    }
  }
}

// ── the strike move ──────────────────────────────────────────
// Removing a line means removing its PARAGRAPH: emptying the text leaves
// the paragraph standing with its bullet marker and its height, haunting
// the page while dropping off the sheet. The one thing a strike refuses
// is a paragraph carrying a section break in its pPr — deleting that
// would re-plumb the document's geometry.
export function deleteParagraph(seg) {
  const p = seg.pEl || paraOf(seg.nodes[0]);
  if (!p || !p.parentNode) throw new Error('The desk lost its place in the document.');
  const pPr = [...p.childNodes].find((c) => c.nodeType === 1 && c.localName === 'pPr');
  if (pPr && [...pPr.childNodes].some((c) => c.nodeType === 1 && c.localName === 'sectPr')) {
    throw new Error('That line carries a section break; the desk will not strike it.');
  }
  p.parentNode.removeChild(p);
}

// A brand-new line cannot be typeset from nothing, so it is not: the new
// paragraph is a deep clone of an existing one — pPr, numbering, run
// properties and all — stripped to a single text run carrying the new
// words. A bullet added beside bullets IS a bullet, by construction.
export function insertParagraphAfter(anchorSeg, text, likeSeg, afterEl = null) {
  // pEl first: a ghost (empty) paragraph has no text nodes to walk up from,
  // but it is a perfectly good anchor to set a new line after
  const anchorP = afterEl || anchorSeg.pEl || paraOf(anchorSeg.nodes[0]);
  const like = likeSeg || anchorSeg;
  const likeP = like.pEl || paraOf(like.nodes[0]);
  if (!anchorP || !likeP) throw new Error('The desk lost its place in the document.');
  const clone = likeP.cloneNode(true);
  // strip to one run: keep the first run that holds text, drop the rest
  // (hyperlink wrappers included — a cloned link would point somewhere stale)
  let kept = null;
  for (const el of [...clone.getElementsByTagName('w:hyperlink')]) el.parentNode.removeChild(el);
  for (const run of [...clone.getElementsByTagName('w:r')]) {
    if (!kept && run.getElementsByTagName('w:t').length) {
      kept = run;
      for (const child of [...run.childNodes]) {
        if (child.nodeType === 1 && child.localName !== 'rPr' && child.localName !== 't') run.removeChild(child);
      }
      const ts = run.getElementsByTagName('w:t');
      for (let i = ts.length - 1; i > 0; i -= 1) ts[i].parentNode.removeChild(ts[i]);
      ts[0].textContent = text;
      ts[0].setAttribute('xml:space', 'preserve');
    } else {
      run.parentNode.removeChild(run);
    }
  }
  // a BLANK add (text '') may legitimately end up with no text run at all
  // when patterned on a bare paragraph — a pPr-only <w:p> IS a blank line
  if (!kept && text) throw new Error('That line has nothing to pattern a new one on.');
  anchorP.parentNode.insertBefore(clone, anchorP.nextSibling);
  return clone;
}

// ── preview normalization ────────────────────────────────────
// Hand-aligned resumes push their dates to the right margin with runs
// of tabs and literal spaces. Reproducing where that soup lands means
// simulating Word's tab arithmetic through browser font metrics, and
// that is a lottery: the same line landed flush on one machine and two
// tab stops short on another. So the PREVIEW copy stops simulating and
// encodes the intent instead: a two-chunk line's gap collapses to one
// tab with an explicit right-aligned stop at the margin, which every
// renderer on every machine puts in exactly the same place. The
// download never sees any of this — it is the original XML.

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const isSpaces = (s) => /^[ \u00A0]*$/.test(s);

function contentWidthTwips(xml) {
  const pgSz = xml.getElementsByTagName('w:pgSz')[0];
  const pgMar = xml.getElementsByTagName('w:pgMar')[0];
  const num = (el, attr, dflt) => {
    const v = Number(el?.getAttribute(attr));
    return Number.isFinite(v) && v > 0 ? v : dflt;
  };
  return num(pgSz, 'w:w', 12240) - num(pgMar, 'w:left', 1440) - num(pgMar, 'w:right', 1440);
}

function normalizeAlignment(xml) {
  const pos = contentWidthTwips(xml);
  for (const p of [...xml.getElementsByTagName('w:p')]) {
    // a paragraph with EXPLICIT tab stops is a designed layout — a
    // template author declared that geometry, and it renders from
    // declared positions, not accumulated defaults. Never touch it.
    const pPr0 = [...p.childNodes].find((c) => c.nodeType === 1 && c.localName === 'pPr');
    if (pPr0 && [...pPr0.childNodes].some((c) => c.nodeType === 1 && c.localName === 'tabs')) continue;
    // the paragraph as a stream of text nodes and tabs, in order
    const items = [];
    for (const r of [...p.getElementsByTagName('w:r')]) {
      for (const c of [...r.childNodes]) {
        if (c.nodeType !== 1) continue;
        if (c.localName === 't') items.push({ tab: false, node: c });
        else if (c.localName === 'tab') items.push({ tab: true, node: c });
      }
    }
    if (items.length < 2) continue;
    const gappy = items.map((it) => it.tab || isSpaces(it.node.textContent));

    // right chunk: the trailing non-gap block; the gap sits just before it
    let j = items.length - 1;
    while (j >= 0 && gappy[j]) j -= 1;
    if (j < 0) continue; // nothing but gap
    // the tail AFTER the right chunk: trailing filler (tabs, space runs)
    // hangs past the text under a right-aligned stop, so the spaces end
    // at the margin and the words sit short of it — strip it entirely
    for (const it of items.slice(j + 1)) {
      if (it.tab) it.node.parentNode.removeChild(it.node);
      else it.node.textContent = '';
    }
    if (!items[j].tab) {
      items[j].node.textContent = items[j].node.textContent.replace(/[ \u00A0]+$/, '');
      items[j].node.setAttribute('xml:space', 'preserve');
    }
    let gEnd = -1;
    for (let k = j; k >= 0; k -= 1) if (gappy[k]) { gEnd = k; break; }
    if (gEnd < 0) continue; // no gap at all
    let gStart = gEnd;
    while (gStart >= 0 && gappy[gStart]) gStart -= 1;
    gStart += 1;
    if (gStart === 0) continue; // nothing on the left

    const gap = items.slice(gStart, gEnd + 1);
    const tabs = gap.filter((it) => it.tab);
    const spaceChars = gap.reduce((a, it) => a + (it.tab ? 0 : it.node.textContent.length), 0);
    // Only HAND-HAMMERED margin-pushing qualifies: several tabs, a tab
    // mixed with filler spaces, or a long space run. A single clean tab
    // is usually a designed label column ("Languages:<tab>Python") and
    // must keep its own geometry, not be flung to the right margin.
    const hammered = tabs.length >= 2 || (tabs.length >= 1 && spaceChars >= 2) || spaceChars >= 6;
    if (!hammered) continue;
    // only the simple two-chunk shape is normalized — tabs elsewhere in
    // the line mean columns this pass does not understand
    if (items.slice(0, gStart).some((it) => it.tab)) continue;
    if (items.slice(gEnd + 1, j + 1).some((it) => it.tab)) continue;

    // collapse the gap to exactly one tab
    for (const it of gap) if (!it.tab) it.node.textContent = '';
    let kept = null;
    for (const it of tabs) {
      if (!kept) kept = it.node;
      else it.node.parentNode.removeChild(it.node);
    }
    const rightNode = items[gEnd + 1].node;
    if (!kept) {
      const tab = xml.createElementNS(W_NS, 'w:tab');
      const run = rightNode.parentNode;
      run.insertBefore(tab, rightNode);
    }
    // trim the spaces hugging the gap's edges
    const leftNode = items[gStart - 1].node;
    if (!items[gStart - 1].tab) leftNode.textContent = leftNode.textContent.replace(/[ \u00A0]+$/, '');
    leftNode.setAttribute('xml:space', 'preserve');
    rightNode.textContent = rightNode.textContent.replace(/^[ \u00A0]+/, '');
    rightNode.setAttribute('xml:space', 'preserve');

    // and declare what the line meant all along: one right stop at the margin
    let pPr = [...p.childNodes].find((c) => c.nodeType === 1 && c.localName === 'pPr');
    if (!pPr) {
      pPr = xml.createElementNS(W_NS, 'w:pPr');
      p.insertBefore(pPr, p.firstChild);
    }
    for (const t of [...pPr.childNodes]) {
      if (t.nodeType === 1 && t.localName === 'tabs') pPr.removeChild(t);
    }
    const tabsEl = xml.createElementNS(W_NS, 'w:tabs');
    const stop = xml.createElementNS(W_NS, 'w:tab');
    stop.setAttributeNS(W_NS, 'w:val', 'right');
    stop.setAttributeNS(W_NS, 'w:pos', String(pos));
    tabsEl.appendChild(stop);
    pPr.insertBefore(tabsEl, pPr.firstChild);
  }
}

// preview blob: the same zip, briefly carrying normalized part XML,
// restored to the true document before anyone else can touch it
export async function packPreviewDocx({ zip, parts }) {
  const originals = new Map();
  for (const part of parts) {
    const xml = serializer.serializeToString(part.xml);
    originals.set(part.name, xml.startsWith('<?xml') ? xml : part.declaration + xml);
  }
  try {
    for (const part of parts) {
      const clone = part.xml.cloneNode(true);
      normalizeAlignment(clone);
      const xml = serializer.serializeToString(clone);
      zip.file(part.name, xml.startsWith('<?xml') ? xml : part.declaration + xml);
    }
    return await zip.generateAsync({ type: 'blob', mimeType: DOCX_MIME });
  } finally {
    for (const [name, xml] of originals) zip.file(name, xml);
  }
}

export async function packDocx({ zip, parts }) {
  for (const part of parts) {
    // Chromium's XMLSerializer emits the <?xml ?> declaration itself when
    // the parsed document carried one; only restore it when it did not —
    // a doubled declaration is a file Word refuses to open
    const xml = serializer.serializeToString(part.xml);
    zip.file(part.name, xml.startsWith('<?xml') ? xml : part.declaration + xml);
  }
  return zip.generateAsync({ type: 'blob', mimeType: DOCX_MIME });
}

// ── undo ─────────────────────────────────────────────────────
// One snapshot per set card: the parts serialized whole. Restoring
// reparses them in place, so the doc object every ref points at stays
// the same and only its XML documents are swapped back in time.
export function snapshotParts({ parts }) {
  return parts.map((p) => ({ name: p.name, xml: serializer.serializeToString(p.xml) }));
}

export function restoreParts({ parts }, snap) {
  for (const s of snap) {
    const part = parts.find((p) => p.name === s.name);
    if (part) part.xml = new DOMParser().parseFromString(s.xml, 'application/xml');
  }
}

export function downloadBlob(blob, fileName) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
