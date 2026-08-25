import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { loadDocx, segment, applyEdit, applyFormat, applyWordFormat, applyLayout, deleteParagraph, insertParagraphAfter, packDocx, packPreviewDocx, downloadBlob, snapshotParts, restoreParts } from './docx';

// THE REWRITE DESK — the ephemeral resume editor. The master .docx loads
// as-is; the clerk proposes per-segment rewordings; accepted edits change
// only the words inside the document's own runs, so the download keeps
// every byte of formatting. Nothing here is saved: leave the page and the
// tailored copy is gone. See ADR-0009.

// the wire is retired (ADR-0010): tailoring against a posting now means
// pasting the posting's text straight into the clerk chat, so the ask
// field is sized for a whole job description
const ASK_MAX = 6000;

// the proof sits on the board at fit-width by default; the steps match
// the reading room's dial
const ZOOMS = [['fit', 'FIT'], [0.75, '75'], [1, '100'], [1.25, '125']];
const RAIL_KEY = 'jb_rail_w';
const RAIL_MIN = 300;
const RAIL_MAX = 560;
const railClamp = (w) => Math.min(Math.max(Math.round(w), RAIL_MIN), RAIL_MAX);

function MasterShelf({ onOpen }) {
  const [resumes, setResumes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const load = () => api.getResumes().then(setResumes).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const add = async (file) => {
    if (!/\.docx$/i.test(file.name)) { setError('The desk takes .docx masters only'); return; }
    setBusy(true);
    setError('');
    try {
      const blobUrl = await api.uploadResumeDocx(file);
      await api.addResume({ blobUrl, fileName: file.name });
      await load();
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  const retire = async (id) => {
    try {
      await api.deleteResume(id);
      setResumes((old) => old.filter((r) => r.id !== id));
    } catch (e) { setError(e.message); }
  };

  return (
    <div className="jb-shelf">
      <p className="jb-orders-head">The masters</p>
      {error && <p className="jb-error">{error}</p>}
      {resumes === null ? (
        <p className="jb-orders-empty">Opening the drawer…</p>
      ) : resumes.length === 0 ? (
        <p className="jb-orders-empty">
          No master on file. Bring the desk your resume as a .docx — Word, Pages and Google Docs all export one.
        </p>
      ) : (
        resumes.map((r) => (
          <div key={r.id} className="jb-order">
            <button data-clicky className="jb-shelf-open" onClick={() => onOpen(r.id)}>{r.name}</button>
            <span className="jb-order-loc">{r.fileName}</span>
            <span className="jb-order-ran">filed {new Date(r.createdAt).toLocaleDateString()}</span>
            <button data-clicky className="jb-order-x" title="Retire this master" onClick={() => retire(r.id)}>✕</button>
          </div>
        ))
      )}
      <div className="jb-order-form">
        <input ref={fileRef} type="file" accept=".docx" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) add(f); e.target.value = ''; }} />
        <button data-clicky className="btn-black" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? 'Filing…' : 'File a master'}
        </button>
      </div>
    </div>
  );
}

// Word's lineRule="auto" spacing is a multiple of the FONT'S NATURAL
// line box (ascent + descent + gap, ~1.15-1.3× the font size), but
// docx-preview emits it as a bare CSS multiple — line-height: 0.97 on a
// 12px font gives 11.64px lines where Word sets ~14.6px. Twenty percent
// per line, compounded over a page, is how a two-page resume previewed
// as one. This pass converts every unitless line-height to Word's
// semantics by measuring the natural line box of the element's own font.
const lhRatioCache = new Map();
function fixLineHeights(container) {
  for (const el of container.querySelectorAll('[style*="line-height"]')) {
    const raw = el.style.lineHeight;
    if (!raw || !/^[\d.]+$/.test(raw) || el.dataset.jbLh) continue;
    const cs = getComputedStyle(el);
    const key = `${cs.fontFamily}|${cs.fontSize}|${cs.fontWeight}`;
    let ratio = lhRatioCache.get(key);
    if (!ratio) {
      const probe = document.createElement('span');
      probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;line-height:normal;';
      probe.style.fontFamily = cs.fontFamily;
      probe.style.fontSize = cs.fontSize;
      probe.style.fontWeight = cs.fontWeight;
      probe.textContent = 'Hg';
      document.body.appendChild(probe);
      ratio = probe.getBoundingClientRect().height / parseFloat(cs.fontSize) || 1.15;
      probe.remove();
      lhRatioCache.set(key, ratio);
    }
    // stays unitless so runs of a different size inside the line scale too
    el.style.lineHeight = String(Math.round(Number(raw) * ratio * 1000) / 1000);
    el.dataset.jbLh = '1';
  }
}

// docx-preview does not simulate Word's automatic page overflow: it
// renders one elastic page that stretches ("in the ledger preview it
// shows only one page" while Word showed two). This pass restores honest
// pagination after render: any section taller than its own declared page
// height has its overflowing paragraphs moved onto a freshly cloned page,
// repeatedly, until every page holds. Preview DOM only — the XML that
// downloads never changes. Paragraph-granularity: Word can split one
// paragraph across pages mid-line, this pass moves it whole; on resumes,
// where paragraphs are short, the page count comes out the same.
function paginatePreview(container) {
  const wrapper = container.querySelector('.docx-wrapper');
  if (!wrapper) return 0;
  let sec = wrapper.querySelector('section.docx');
  let guard = 0;
  while (sec && guard < 40) {
    guard += 1;
    const cs = getComputedStyle(sec);
    const pageH = parseFloat(cs.minHeight);
    if (!pageH) break;
    const padBottom = parseFloat(cs.paddingBottom) || 0;
    const body = sec.querySelector(':scope > article') || sec;
    const limit = sec.getBoundingClientRect().top
      + (cs.boxSizing === 'border-box' ? pageH : pageH + padBottom + (parseFloat(cs.paddingTop) || 0))
      - padBottom;
    const kids = [...body.children];
    let splitAt = -1;
    for (let i = 0; i < kids.length; i += 1) {
      if (kids[i].getBoundingClientRect().bottom > limit + 1) { splitAt = i; break; }
    }
    // fits whole, or a single block taller than a page (nothing sane to do)
    if (splitAt <= 0) { sec = sec.nextElementSibling; continue; }
    const nextSec = sec.cloneNode(false);
    let nextBody = nextSec;
    if (body !== sec) {
      nextBody = body.cloneNode(false);
      nextSec.appendChild(nextBody);
    }
    for (const k of kids.slice(splitAt)) nextBody.appendChild(k);
    // lock the filled page at its true height so it stops stretching
    sec.style.height = sec.style.minHeight || `${pageH}px`;
    sec.parentNode.insertBefore(nextSec, sec.nextSibling);
    sec = nextSec;
  }
  return wrapper.querySelectorAll('section.docx').length;
}

// a format proposal in words the reader can judge at a glance
export function dressLabel(set) {
  const bits = [];
  if (set.bold !== undefined) bits.push(set.bold ? 'bold' : 'bold off');
  if (set.italic !== undefined) bits.push(set.italic ? 'italic' : 'italic off');
  if (set.underline !== undefined) bits.push(set.underline ? 'underline' : 'underline off');
  if (set.size_pt !== undefined) bits.push(`${set.size_pt}pt`);
  if (set.font) bits.push(set.font);
  return bits.join(' · ');
}

// and a layout proposal likewise
export function geoLabel(set) {
  const bits = [];
  if (set.indent_in !== undefined) bits.push(set.indent_in === 0 ? 'indent removed' : `indent ${set.indent_in}in`);
  if (set.first_line_in !== undefined) bits.push(`first line ${set.first_line_in}in`);
  if (set.hanging_in !== undefined) bits.push(`hanging ${set.hanging_in}in`);
  if (set.align) bits.push(set.align === 'both' ? 'justified' : `${set.align} aligned`);
  if (set.space_before_pt !== undefined) bits.push(`${set.space_before_pt}pt before`);
  if (set.space_after_pt !== undefined) bits.push(`${set.space_after_pt}pt after`);
  if (set.line_spacing !== undefined) bits.push(`${set.line_spacing} line spacing`);
  return bits.join(' · ');
}

// one proposal: a rewording (old line struck, new under it), a fresh
// line to be set in after an existing paragraph, or a retype (same
// words, new dress)
function EditCard({ edit, idx, onSet, onSpike }) {
  return (
    <div className="jb-card">
      <p className="jb-proof-label">
        Proof Nº {String(idx + 1).padStart(2, '0')} · {edit.kind === 'add' ? 'new line' : edit.kind === 'format' ? 'retype' : edit.kind === 'layout' ? 'lay out' : edit.kind === 'strike' ? 'strike the line' : 'rewrite'}
      </p>
      {edit.kind === 'strike' ? (
        <p className="jb-card-old">{edit.before || 'the empty line — a bare bullet marker with no words'}</p>
      ) : edit.kind === 'add' ? (
        <>
          <p className="jb-card-where">goes in after “{edit.anchor}”</p>
          <p className="jb-card-new">{edit.text.trim() ? edit.text : 'a blank line, for breathing room'}</p>
        </>
      ) : edit.kind === 'format' ? (
        <>
          <p className="jb-card-where">
            {edit.only ? <>on “{edit.only}” in “{edit.before.slice(0, 55)}”</> : <>on “{edit.before.slice(0, 70)}”</>}
          </p>
          <p className="jb-card-new">{dressLabel(edit.set)}</p>
        </>
      ) : edit.kind === 'layout' ? (
        <>
          <p className="jb-card-where">on “{edit.before.slice(0, 70)}”</p>
          <p className="jb-card-new">{geoLabel(edit.set)}</p>
        </>
      ) : (
        <>
          <p className="jb-card-old">{edit.before}</p>
          <p className="jb-card-new">{edit.text}</p>
        </>
      )}
      <div className="jb-entry-acts">
        <button data-clicky className="jb-act" onClick={onSet}>Set it</button>
        <button data-clicky className="jb-act jb-act-spike" onClick={onSpike}>Spike</button>
      </div>
    </div>
  );
}

export default function ResumeDesk() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const resumeId = params.get('id');
  const [resume, setResume] = useState(null);
  const [doc, setDoc] = useState(null); // { zip, parts }
  const [segments, setSegments] = useState([]);
  const [error, setError] = useState('');
  const [instruction, setInstruction] = useState('');
  const [asking, setAsking] = useState(false);
  // the conversation with the clerk — held here and only here, so it is
  // as ephemeral as the edits; leave the page and it never happened
  const [chat, setChat] = useState([]);
  const [proposed, setProposed] = useState([]);
  // the ref is the source of truth during batch applies — React state lags
  // a synchronous Set All loop, and a stale proposal list was exactly how
  // "the bolding changes dont always apply" happened
  const proposedRef = useRef([]);
  const setProps = (list) => { proposedRef.current = list; setProposed(list); };
  const [setCount, setSetCount] = useState(0);
  const [refiling, setRefiling] = useState(0); // 0 idle · 1 armed · 2 filing
  const [undoDepth, setUndoDepth] = useState(0);
  const [pages, setPages] = useState(0);
  const undoRef = useRef([]); // one parts snapshot per set card, newest last
  const [zoom, setZoom] = useState(() => {
    const saved = localStorage.getItem('jb_zoom');
    return !saved || saved === 'fit' ? 'fit' : Number(saved) || 'fit';
  });
  const [nat, setNat] = useState({ w: 816, h: 1056 }); // letter-ish until the page reports
  const [boardW, setBoardW] = useState(900);
  const [railW, setRailW] = useState(() => {
    const saved = Number(localStorage.getItem(RAIL_KEY));
    return saved ? railClamp(saved) : 320;
  });
  const [dragging, setDragging] = useState(false);
  const previewRef = useRef(null);
  const boardRef = useRef(null);
  const scaleRef = useRef(null);
  const paintingRef = useRef(false);
  const chatRef = useRef(null);
  // what the reader did with the last filing, told to the clerk next turn
  const tallyRef = useRef({ set: 0, spiked: 0 });

  // the master, fresh — this is what "ephemeral" means: every visit
  // starts from the stored master, never from a previous session's edits
  useEffect(() => {
    if (!resumeId) return;
    let dead = false;
    setError('');
    setDoc(null);
    api.getResumes().then((all) => all.find((r) => r.id === resumeId)).then(async (row) => {
      if (dead) return;
      if (!row) { setError('No such master on the shelf.'); return; }
      setResume(row);
      const loaded = await loadDocx(row.blobUrl);
      if (dead) return;
      setDoc(loaded);
      setSegments(segment(loaded.parts));
      setSetCount(0);
      proposedRef.current = [];
      setProposed([]);
      setChat([]);
      tallyRef.current = { set: 0, spiked: 0 };
      undoRef.current = [];
      setUndoDepth(0);
    }).catch((e) => { if (!dead) setError(e.message); });
    return () => { dead = true; };
  }, [resumeId]);

  // faithful preview straight off the current zip — docx-preview renders
  // Word's own styles, so what you download is what you see
  // Faithful preview straight off the current zip. The render happens at
  // 100% with the transform suspended — docx-preview's tab engine takes
  // its one-shot measurements then — and only a finished sheet gets the
  // optical scale. CSS `zoom` stays banned: it re-lays-out per factor
  // and re-breaks lines. See ADR-0009.
  const paint = useCallback(async (d) => {
    const el = previewRef.current;
    const scaleEl = scaleRef.current;
    if (!el || !d) return;
    // the scale effect must not re-apply the transform behind our back
    // while the engine renders and (500ms later) measures
    paintingRef.current = true;
    if (scaleEl) scaleEl.style.transform = 'none';
    // the preview renders a normalized copy: hand-aligned tab-and-space
    // lines become explicit right-aligned tab stops, which land flush on
    // any machine. The download is packDocx — the original, untouched.
    const blob = await packPreviewDocx(d);
    const { renderAsync } = await import('docx-preview');
    // experimental turns on real tab-stop math — resumes right-align their
    // dates with tabs, and without it every date collapses onto its line
    const opts = { inWrapper: true, ignoreLastRenderedPageBreak: true, experimental: true };
    el.innerHTML = '';
    await renderAsync(blob, el, undefined, opts);
    // The render itself registers the document's embedded faces, so the
    // fonts check must come AFTER it — checked before, a fresh page has
    // nothing pending, reads 'loaded', skips the re-render, and the swap
    // lands late: tab stops and pagination then measure fallback-font
    // geometry (the "pagination didnt work" resume was 15px taller in its
    // real faces than in the fallbacks it was measured in).
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => setTimeout(r, 60));
    if (document.fonts.status !== 'loaded') {
      try { await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 3000))]); } catch { /* render anyway */ }
      el.innerHTML = '';
      await renderAsync(blob, el, undefined, opts);
    }
    // docx-preview's experimental tab pass runs on a setTimeout 500ms
    // AFTER renderAsync resolves (refreshTabStops in its source). Scale
    // applied inside that window poisons its measurements — the entire
    // "transform breaks tabs" saga was this one timer. Outwait it.
    // Word-true line heights first (vertical only, so the tab engine's
    // horizontal measurements are unaffected), then the tab pass
    fixLineHeights(el);
    await new Promise((r) => setTimeout(r, 650));
    await new Promise((r) => requestAnimationFrame(r));
    // honest page breaks — after the tab pass, while the transform is
    // still suspended so the measurements are unscaled
    setPages(paginatePreview(el));
    paintingRef.current = false;
    // state change recommits; the scale effect then applies the dial
    if (el.scrollWidth && el.scrollHeight) setNat({ w: el.scrollWidth, h: el.scrollHeight });
  }, []);
  useEffect(() => { paint(doc); }, [doc, paint]);

  // fit is computed, the rest is the dial; scaling is applied outside
  // paint so a zoom click never re-renders the document
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setBoardW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [doc]);
  useEffect(() => {
    try { localStorage.setItem('jb_zoom', String(zoom)); } catch { /* private mode */ }
  }, [zoom]);
  const zoomFactor = zoom === 'fit'
    ? Math.min(1.4, Math.max(0.4, (boardW - 56) / nat.w))
    : zoom;
  useEffect(() => {
    const el = scaleRef.current;
    if (el && !paintingRef.current) el.style.transform = `scale(${zoomFactor})`;
  }, [zoomFactor, nat, doc]);

  // the grip between board and rail — listeners on the window, same
  // reasoning as the reading room's rail
  useEffect(() => {
    if (!dragging) return undefined;
    const move = (e) => setRailW(railClamp(window.innerWidth - e.clientX));
    const stop = () => setDragging(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    document.body.classList.add('jb-resizing');
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      document.body.classList.remove('jb-resizing');
    };
  }, [dragging]);
  useEffect(() => {
    try { localStorage.setItem(RAIL_KEY, String(railW)); } catch { /* private mode */ }
  }, [railW]);

  // adds accepted since the last consult, so two new bullets under the
  // same job land in filed order instead of piling up at the anchor
  const lastAddRef = useRef(new Map());

  const consult = async (ask) => {
    if (!ask.trim() || !doc) return;
    setAsking(true);
    setError('');
    try {
      // the XML is the source of truth: re-read it every time, so lines
      // added since the last consult are on the sheet too
      const fresh = segment(doc.parts);
      setSegments(fresh);
      lastAddRef.current = new Map();
      // tell the clerk what became of its last filing, without printing
      // the bookkeeping into the visible conversation
      const { set, spiked } = tallyRef.current;
      tallyRef.current = { set: 0, spiked: 0 };
      const bookkeeping = set || spiked
        ? `(Of your last filing I set ${set} and spiked ${spiked}.)\n` : '';
      const history = chat.slice(-12);
      setChat((c) => [...c, { who: 'you', text: ask }]);
      const body = {
        segments: fresh.map((s) => ({
          n: s.n, text: s.text, p: s.pn, b: s.b, i: s.i, u: s.u, f: s.f, sz: s.sz, li: s.li,
          ind: s.ind, fl: s.fl, hang: s.hang, jc: s.jc, spb: s.spb, spa: s.spa, lsp: s.lsp,
          ghost: s.ghost,
        })),
        instruction: bookkeeping + ask,
        history,
      };
      const { edits, adds = [], formats = [], layouts = [], strikes = [], misfiled = 0, note: clerkNote } = await api.tailorResume(body);
      // a retype or lay-out that matches the current state is a no-op —
      // don't put a card in front of the reader for it
      const changesDress = (s, set) => (set.bold !== undefined && set.bold !== !!s.b)
        || (set.italic !== undefined && set.italic !== !!s.i)
        || (set.underline !== undefined && set.underline !== !!s.u)
        || (set.size_pt !== undefined && set.size_pt !== s.sz)
        || (!!set.font && set.font !== s.f);
      const changesGeo = (s, set) => (set.indent_in !== undefined && set.indent_in !== (s.ind || 0))
        || (set.first_line_in !== undefined && set.first_line_in !== (s.fl || 0))
        || (set.hanging_in !== undefined && set.hanging_in !== (s.hang || 0))
        || (!!set.align && set.align !== (s.jc || 'left'))
        || (set.space_before_pt !== undefined && set.space_before_pt !== (s.spb || 0))
        || (set.space_after_pt !== undefined && set.space_after_pt !== (s.spa || 0))
        || (set.line_spacing !== undefined && set.line_spacing !== (s.lsp || 1));
      const byN = new Map(fresh.map((s) => [s.n, s]));
      const byP = new Map();
      const paraFull = new Map();
      for (const s of fresh) {
        if (!byP.has(s.pn)) byP.set(s.pn, s);
        paraFull.set(s.pn, (paraFull.get(s.pn) || '') + s.text);
      }
      let key = 0;
      setProps([
        ...edits
          .filter((e) => byN.has(e.n) && e.text !== byN.get(e.n).text)
          .map((e) => ({ kind: 'edit', key: (key += 1), seg: byN.get(e.n), text: e.text, before: byN.get(e.n).text, bindText: byN.get(e.n).text })),
        ...adds
          .filter((a) => byP.has(a.after_p))
          .map((a) => ({
            kind: 'add',
            key: (key += 1),
            afterSeg: byP.get(a.after_p),
            likeSeg: byP.get(a.like_p) || byP.get(a.after_p),
            text: a.text,
            anchor: (paraFull.get(a.after_p) || '').trim().slice(0, 60),
            bindPara: paraFull.get(a.after_p),
            bindLike: paraFull.get(a.like_p) ?? null,
          })),
        ...formats
          .filter((f) => byN.has(f.n) && changesDress(byN.get(f.n), f.set))
          .map((f) => ({ kind: 'format', key: (key += 1), seg: byN.get(f.n), set: f.set, only: f.only, before: byN.get(f.n).text, bindText: byN.get(f.n).text })),
        ...layouts
          .filter((l) => byP.has(l.p) && changesGeo(byP.get(l.p), l.set))
          .map((l) => ({
            kind: 'layout',
            key: (key += 1),
            seg: byP.get(l.p),
            set: l.set,
            before: (paraFull.get(l.p) || '').trim().slice(0, 70),
            bindPara: paraFull.get(l.p),
          })),
        ...strikes
          .filter((st) => byP.has(st.p))
          .map((st) => ({
            kind: 'strike',
            key: (key += 1),
            seg: byP.get(st.p),
            before: (paraFull.get(st.p) || '').trim().slice(0, 90),
            bindPara: paraFull.get(st.p),
          })),
      ]);
      // count the RAW filings, before any client-side no-op filtering — a
      // note that claims work while the tool call carried nothing must be
      // contradicted in print, not silently believed
      const rawFilings = edits.length + adds.length + formats.length + layouts.length + strikes.length;
      setChat((c) => [...c, {
        who: 'clerk',
        text: misfiled
          ? `${clerkNote} (${misfiled} ${misfiled === 1 ? 'proposal was' : 'proposals were'} misfiled and thrown out at the desk. Ask again, more specifically, for what is missing.)`
          : rawFilings === 0
            ? `${clerkNote} (No filings came with this note.)`
            : clerkNote,
      }]);
    } catch (e) { setError(e.message); }
    setAsking(false);
  };
  useEffect(() => { chatRef.current?.scrollTo(0, chatRef.current.scrollHeight); }, [chat]);

  // After ANY mutation the segment list is rebuilt and every pending card
  // is re-bound to its fresh target BY ITS TEXT, not by stale numbers or
  // node references. This is what lets several cards touch the same line
  // in one Set All: a word-scope retype splits a segment into three, and
  // the next card simply finds its words in whichever piece holds them.
  const rebind = (list, fresh) => {
    const paras = new Map();
    for (const s of fresh) {
      if (!paras.has(s.pn)) paras.set(s.pn, { seg: s, text: '' });
      paras.get(s.pn).text += s.text;
    }
    const segByText = (t) => {
      const hits = fresh.filter((s) => s.text === t);
      return hits.length === 1 ? hits[0] : null;
    };
    const paraByText = (t) => {
      const hits = [...paras.values()].filter((p) => p.text === t);
      return hits.length === 1 ? hits[0].seg : null;
    };
    return list.map((p) => {
      if (p.kind === 'add') {
        const a = paraByText(p.bindPara);
        const like = p.bindLike != null ? paraByText(p.bindLike) : null;
        return a ? { ...p, afterSeg: a, likeSeg: like || a } : null;
      }
      if (p.kind === 'layout' || p.kind === 'strike') {
        const s = paraByText(p.bindPara);
        return s ? { ...p, seg: s } : null;
      }
      let s = segByText(p.bindText);
      if (!s && p.kind === 'format' && p.only) {
        // the line was carved up by an earlier card; the words still name
        // their target if exactly one piece holds them
        const hits = fresh.filter((x) => x.text.includes(p.only));
        if (hits.length === 1) s = { ...hits[0] };
        if (s) return { ...p, seg: s, bindText: s.text, before: s.text };
      }
      return s ? { ...p, seg: s } : null;
    }).filter(Boolean);
  };

  const applyProp = (prop) => {
    if (prop.kind === 'add') {
      const el = insertParagraphAfter(prop.afterSeg, prop.text, prop.likeSeg, lastAddRef.current.get(prop.afterSeg.pEl) || null);
      lastAddRef.current.set(prop.afterSeg.pEl, el);
    } else if (prop.kind === 'format') {
      if (prop.only) applyWordFormat(prop.seg, prop.set, prop.only);
      else applyFormat(prop.seg, prop.set);
    } else if (prop.kind === 'layout') {
      applyLayout(prop.seg, prop.set);
    } else if (prop.kind === 'strike') {
      deleteParagraph(prop.seg);
    } else {
      applyEdit(prop.seg, prop.text);
    }
  };

  const setEdit = (propIn, repaint = true) => {
    const prop = proposedRef.current.find((p) => p.key === propIn.key);
    if (!prop || !doc) return;
    const snap = snapshotParts(doc);
    try {
      applyProp(prop);
      undoRef.current.push(snap);
      if (undoRef.current.length > 60) undoRef.current.shift();
      setUndoDepth(undoRef.current.length);
      const fresh = segment(doc.parts);
      setSegments(fresh);
      setProps(rebind(proposedRef.current.filter((p) => p.key !== prop.key), fresh));
      setSetCount((c) => c + 1);
      tallyRef.current.set += 1;
      if (repaint) paint(doc);
    } catch (e) { setError(e.message); }
  };

  // one set card back per click; pending cards re-bind to the restored
  // state exactly as they do after an apply
  const undo = () => {
    const snap = undoRef.current.pop();
    if (!snap || !doc) return;
    restoreParts(doc, snap);
    const fresh = segment(doc.parts);
    setSegments(fresh);
    setProps(rebind(proposedRef.current, fresh));
    lastAddRef.current = new Map();
    setUndoDepth(undoRef.current.length);
    setSetCount((c) => Math.max(0, c - 1));
    tallyRef.current.set = Math.max(0, tallyRef.current.set - 1);
    paint(doc);
  };
  const spike = (prop) => {
    tallyRef.current.spiked += 1;
    setProps(proposedRef.current.filter((p) => p.key !== prop.key));
  };
  // apply in filed order off the LIVE list (each apply re-binds the rest),
  // painting once at the end instead of racing a render per card
  const setAll = () => {
    for (const p of [...proposedRef.current]) setEdit(p, false);
    paint(doc);
  };

  const download = async () => {
    try {
      const blob = await packDocx(doc);
      // an untouched or just-refiled copy is simply the master — no tail
      const tail = setCount ? ' — tailored' : '';
      downloadBlob(blob, `${resume.name}${tail}.docx`);
    } catch (e) { setError(`The copy would not pack: ${e.message}`); }
  };

  // PDF leaves through the browser's own print engine: the preview IS the
  // rendered document, so a print of it — vector text, embedded faces —
  // saves as a faithful PDF from the dialog. The page size is read off
  // the rendered section so A4 masters do not get squeezed onto letter.
  const printPdf = () => {
    const src = previewRef.current;
    const sec = src?.querySelector('.docx-wrapper > section.docx');
    if (!sec) return;
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:100%;bottom:100%;width:0;height:0;border:0;';
    document.body.appendChild(frame);
    const tail = setCount ? ' — tailored' : '';
    const fdoc = frame.contentDocument;
    fdoc.open();
    fdoc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${resume.name}${tail}</title><style>
      @page { size: ${sec.style.width || '8.5in'} ${sec.style.minHeight || '11in'}; margin: 0; }
      body { margin: 0; }
      .docx-wrapper { background: none !important; padding: 0 !important; display: block !important; }
      .docx-wrapper > section.docx { box-shadow: none !important; border: none !important; margin: 0 auto !important; }
      .docx-wrapper > section.docx:not(:last-child) { page-break-after: always; }
    </style></head><body></body></html>`);
    fdoc.close();
    fdoc.body.innerHTML += src.innerHTML; // docx-preview's styles ride along inside the container
    const cleanup = () => setTimeout(() => frame.remove(), 1500);
    frame.contentWindow.addEventListener('afterprint', cleanup);
    Promise.race([fdoc.fonts.ready, new Promise((r) => setTimeout(r, 2500))])
      .then(() => setTimeout(() => { frame.contentWindow.focus(); frame.contentWindow.print(); }, 150));
  };

  // promote the tailored copy to master — two clicks, the second armed in
  // red, because this points the shelf at the edited file for good
  const refileMaster = async () => {
    // armed stays armed until fired — the old 5s auto-disarm meant a
    // reader who paused on the red warning clicked into a silently reset
    // button, which read as "update master fails often"
    if (refiling === 0) { setRefiling(1); return; }
    if (refiling !== 1) return;
    setRefiling(2);
    setError('');
    try {
      const blob = await packDocx(doc);
      const fileName = resume.fileName || `${resume.name}.docx`;
      const file = new File([blob], fileName, {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      // one quiet retry: the blob client-upload handshake occasionally
      // hiccups, and a refile should not fail on a single stumble
      let blobUrl;
      try {
        blobUrl = await api.uploadResumeDocx(file);
      } catch {
        await new Promise((r) => setTimeout(r, 1200));
        blobUrl = await api.uploadResumeDocx(file);
      }
      const updated = await api.updateResume(resume.id, { blobUrl });
      setResume(updated);
      setSetCount(0);
      setChat((c) => [...c, { who: 'clerk', text: 'Filed. This copy is the master now; every future visit starts from it.' }]);
    } catch (e) { setError(`The refile did not take — the shelf still points at the old master. ${e.message}`); }
    setRefiling(0);
  };

  if (!resumeId) {
    return (
      <div className="jb-page stagger">
        <div className="jb-deskad jb-deskad-still" role="banner">
          <span className="jb-deskad-kicker">The house service · no charge · nothing is kept</span>
          <span className="jb-deskad-title">The Rewrite Desk</span>
          <span className="jb-deskad-copy">
            Bring your resume as a .docx. The clerk rewords it, retypes it, lays it out, and tailors it to any posting you paste — every change is a proof you set or spike, and the copy leaves as Word or PDF with its formatting untouched.
          </span>
        </div>
        <MasterShelf onOpen={(id) => setParams((p) => { p.set('id', id); return p; }, { replace: false })} />
      </div>
    );
  }

  return (
    <div className="jb-desk stagger">
      <div className="jb-desk-bar">
        <button data-clicky className="btn-ghost"
          onClick={() => setParams((p) => { p.delete('id'); return p; })}>
          ← the shelf
        </button>
        <div className="jb-desk-title">
          <p className="t-label">{resume ? resume.name : '…'}</p>
          <p className="jb-desk-byline">
            the master, as filed
            {pages > 0 && ` · ${pages} ${pages === 1 ? 'page' : 'pages'}`}
          </p>
        </div>
        <div className="jb-zoom">
          {ZOOMS.map(([z, label]) => (
            <button key={label} data-clicky className={`jb-zoom-btn ${zoom === z ? 'jb-zoom-on' : ''}`}
              onClick={() => setZoom(z)}>{label}</button>
          ))}
        </div>
        <p className="jb-desk-counter">{String(setCount).padStart(3, '0')} set</p>
        <button data-clicky className="btn-ghost" disabled={!undoDepth}
          title="Take back the last set card, one at a time" onClick={undo}>
          ↶ Undo
        </button>
        <button data-clicky className={`btn-ghost ${refiling === 1 ? 'jb-refile-warn' : ''}`}
          disabled={!doc || !setCount || refiling === 2}
          title="Point the shelf at this edited copy — future visits start from it"
          onClick={refileMaster}>
          {refiling === 2 ? 'Filing…' : refiling === 1 ? 'Sure? Replaces the master' : 'Update the master'}
        </button>
        <button data-clicky className="btn-ghost" disabled={!doc} title="Save as PDF through the print dialog" onClick={printPdf}>
          PDF
        </button>
        <button data-clicky className="btn-black" disabled={!doc} onClick={download}>
          Take the copy
        </button>
      </div>

      {error && <p className="jb-error">{error}</p>}

      <div className="jb-desk-body">
        <div className="jb-board" ref={boardRef}>
          <span className="jb-stamp" aria-hidden="true">Galley proof<br />nothing is kept</span>
          <div className="jb-zoombox" style={{ width: Math.ceil(nat.w * zoomFactor), height: Math.ceil(nat.h * zoomFactor) }}>
            <div className="jb-zoomscale" ref={scaleRef}>
              <div className="jb-preview" ref={previewRef}>
                {!doc && !error && (
                  <div className="pt-16 flex justify-center">
                    <div className="loader"><div className="loader-bar" /><div className="loader-bar" /><div className="loader-bar" /><div className="loader-bar" /></div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div
          className={`jb-grip ${dragging ? 'jb-grip-on' : ''}`}
          onPointerDown={(e) => { e.preventDefault(); setDragging(true); }}
          onDoubleClick={() => setRailW(320)}
          role="separator"
          aria-orientation="vertical"
          title="Drag to resize. Double-click to reset."
        />

        <aside className="jb-deskrail" style={{ width: railW }}>
          <p className="jb-deskrail-head">The clerk’s desk</p>
          {chat.length > 0 && (
            <div className="jb-chat" ref={chatRef}>
              {chat.map((m, i) => (
                <p key={i} className={m.who === 'you' ? 'jb-msg-you' : 'jb-msg-clerk'}>{m.text}</p>
              ))}
              {asking && <p className="jb-msg-clerk jb-msg-wait">at the desk…</p>}
            </div>
          )}
          <textarea
            className="jb-ask"
            rows={3}
            placeholder={chat.length ? 'answer the clerk, or ask for more…'
              : 'reword my summary to lead with distributed systems… or paste a job posting and ask the clerk to tailor to it'}
            value={instruction}
            maxLength={ASK_MAX}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); consult(instruction); setInstruction(''); } }}
          />
          <button data-clicky className="btn-black w-full" disabled={asking || !doc || !instruction.trim()}
            onClick={() => { consult(instruction); setInstruction(''); }}>
            {asking ? 'At the desk…' : 'Send to the clerk'}
          </button>

          {proposed.length > 0 && (
            <>
              <div className="jb-cards-head">
                <span>{proposed.length} proposed</span>
                <button data-clicky className="jb-act" onClick={setAll}>Set all</button>
              </div>
              {proposed.map((e, i) => (
                <EditCard key={e.key} edit={e} idx={i} onSet={() => setEdit(e)} onSpike={() => spike(e)} />
              ))}
            </>
          )}

          <button data-clicky className="jb-startfresh"
            onClick={() => { setParams((p) => p, { replace: true }); window.location.reload(); }}>
            Start over from the master
          </button>
        </aside>
      </div>
    </div>
  );
}
