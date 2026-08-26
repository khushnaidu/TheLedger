import { useCallback, useEffect, useRef, useState, lazy, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import PdfPage from './PdfPage';
import AnnotationRail from './AnnotationRail';
import useSelectionHighlights from './useSelectionHighlights';

const JanePanel = lazy(() => import('./JanePanel'));

const ZOOMS = [0.75, 1, 1.25, 1.5, 2];
const COLORS = ['marigold', 'rose', 'sage', 'ink'];

// How wide the margin rail sits. Remembered, because a reader who wants a
// big chat wants it on every paper, not just this one.
const RAIL_KEY = 'rr_rail_w';
const RAIL_MIN = 260;
const RAIL_MAX = 900;
const railClamp = (w) => Math.min(Math.max(Math.round(w), RAIL_MIN), RAIL_MAX);

export default function PaperReader() {
  const { paperId } = useParams();
  const navigate = useNavigate();
  const [paper, setPaper] = useState(null);
  const [doc, setDoc] = useState(null);
  const [aspect, setAspect] = useState(1.294); // letter-ish until page 1 reports
  const [error, setError] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [visible, setVisible] = useState([1]);
  const [railTab, setRailTab] = useState('margins'); // margins | jane
  const [flashId, setFlashId] = useState(null);
  // which mark is currently picked out, on the page and in the rail both
  const [selectedId, setSelectedId] = useState(null);
  const [askSeed, setAskSeed] = useState(null); // prefill for Jane from a highlight
  const [healing, setHealing] = useState(null); // progress while finishing a died intake
  const [noteDraft, setNoteDraft] = useState('');
  const [pickColor, setPickColor] = useState('marigold');
  const colRef = useRef(null);
  const [colW, setColW] = useState(720);
  const [railW, setRailW] = useState(() => {
    const saved = Number(localStorage.getItem(RAIL_KEY));
    return saved ? railClamp(saved) : 340;
  });
  const [dragging, setDragging] = useState(false);
  const { pending, capture, clear } = useSelectionHighlights();

  // Jane peeking at the screen edge flips the rail to his tab
  useEffect(() => {
    const handler = () => setRailTab((t) => (t === 'jane' ? 'margins' : 'jane'));
    window.addEventListener('jane-consult', handler);
    return () => window.removeEventListener('jane-consult', handler);
  }, []);

  // Dragging the grip between the paper and the rail. Listeners go on the
  // window rather than the grip, because a pointer moving faster than React
  // re-renders will otherwise leave the handle behind and drop the drag.
  useEffect(() => {
    if (!dragging) return undefined;
    const move = (e) => setRailW(railClamp(window.innerWidth - e.clientX));
    const stop = () => setDragging(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    document.body.classList.add('rr-resizing');
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      document.body.classList.remove('rr-resizing');
    };
  }, [dragging]);

  useEffect(() => {
    try { localStorage.setItem(RAIL_KEY, String(railW)); } catch { /* private mode */ }
  }, [railW]);

  // paper row + the PDF itself
  useEffect(() => {
    let dead = false;
    api.getPaper(paperId).then(async (p) => {
      if (dead) return;
      setPaper(p);
      try {
        const { loadPdf } = await import('./pdf');
        const d = await loadPdf(p.blobUrl);
        if (dead) { d.destroy(); return; }
        const page1 = await d.getPage(1);
        const vp = page1.getViewport({ scale: 1 });
        setAspect(vp.height / vp.width);
        page1.cleanup();
        setDoc(d);
        // a paper still marked processing is a died intake: the badge is
        // stuck on CATALOGUING and Jane has no text. The reader holds
        // the whole PDF anyway, so it quietly finishes the job.
        if (p.status === 'processing') {
          const { catalogueDoc } = await import('./useIngest');
          setHealing('finishing the catalogue…');
          catalogueDoc(p.id, d, (label) => { if (!dead) setHealing(label); })
            // merge: the PATCH payload has no annotations array, and
            // wholesale replacement would strip the margins mid-read
            .then((fresh) => { if (!dead) { setPaper((old) => ({ ...old, ...fresh, annotations: old?.annotations ?? fresh.annotations ?? [] })); setHealing(null); } })
            .catch(() => { if (!dead) setHealing('the catalogue could not be finished — Jane still cannot see the text'); });
        }
      } catch {
        setError('The volume would not open. The file may be missing from storage.');
      }
    }).catch((e) => setError(e.message));
    return () => { dead = true; };
  }, [paperId]);
  useEffect(() => () => doc?.destroy(), [doc]);

  // fit-width base
  useEffect(() => {
    const el = colRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setColW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [doc]);

  // which pages are on screen (drives mount/unmount of canvases)
  useEffect(() => {
    const el = colRef.current;
    if (!el || !doc) return;
    const io = new IntersectionObserver((entries) => {
      setVisible((old) => {
        const set = new Set(old);
        for (const e of entries) {
          const n = parseInt(e.target.dataset.rrPage, 10);
          if (e.isIntersecting) set.add(n); else set.delete(n);
        }
        return set.size ? [...set].sort((a, b) => a - b) : old;
      });
    }, { root: null, rootMargin: '150% 0px' });
    el.querySelectorAll('[data-rr-page]').forEach((p) => io.observe(p));
    return () => io.disconnect();
  }, [doc, zoom]);

  const pageW = Math.min(Math.max(320, colW - 48), 800) * zoom;
  const lo = Math.max(1, (visible[0] ?? 1) - 2);
  const hi = Math.min(doc?.numPages ?? 1, (visible[visible.length - 1] ?? 1) + 2);
  const currentPage = visible[0] ?? 1;

  const jumpToPage = useCallback((n, annId = null) => {
    document.querySelector(`[data-rr-page="${n}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (annId) {
      setFlashId(annId);
      setTimeout(() => setFlashId(null), 1600);
    }
  }, []);

  const saveHighlight = async () => {
    if (!pending) return;
    const ann = await api.createAnnotation(paperId, {
      page: pending.page,
      rects: pending.rects,
      quote: pending.quote,
      note: noteDraft,
      color: pickColor,
    });
    setPaper((p) => ({ ...p, annotations: [...p.annotations, ann].sort((a, b) => a.page - b.page) }));
    setNoteDraft('');
    clear();
  };

  const askJaneAbout = (annOrPending) => {
    setAskSeed({ page: annOrPending.page, quote: annOrPending.quote, ts: Date.now() });
    setRailTab('jane');
    clear();
  };

  const updateAnn = async (annId, data) => {
    const updated = await api.updateAnnotation(paperId, annId, data);
    setPaper((p) => ({ ...p, annotations: p.annotations.map((a) => (a.id === annId ? updated : a)) }));
  };
  const deleteAnn = async (annId) => {
    await api.deleteAnnotation(paperId, annId);
    setSelectedId((id) => (id === annId ? null : id));
    setPaper((p) => ({ ...p, annotations: p.annotations.filter((a) => a.id !== annId) }));
  };

  // a click on the paper: an annotation if one was under it, null if not
  const overlayClick = (ann) => {
    setSelectedId(ann?.id ?? null);
    if (!ann) return;
    setRailTab('margins');
    setTimeout(() => document.getElementById(`rr-markcard-${ann.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
  };

  if (error) {
    return (
      <div className="max-w-[800px] pt-10">
        <p className="t-label" style={{ color: 'var(--stamp)' }}>{error}</p>
        <button data-clicky className="btn-ghost mt-4" onClick={() => navigate('/research')}>← back to the catalog</button>
      </div>
    );
  }
  if (!paper) {
    return (
      <div className="pt-16 flex justify-center">
        <div className="loader"><div className="loader-bar" /><div className="loader-bar" /><div className="loader-bar" /><div className="loader-bar" /></div>
      </div>
    );
  }

  return (
    <div className="rr-reader stagger">
      <div className="rr-reader-bar">
        <button data-clicky className="btn-ghost" onClick={() => navigate('/research')}>← catalog</button>
        <div className="rr-reader-title">
          <p className="t-label">{paper.title}</p>
          <p className="rr-reader-byline">
            {paper.authors}{paper.year ? ` · ${paper.year}` : ''}
            {healing && <span className="rr-healing"> · {healing}</span>}
          </p>
        </div>
        <div className="rr-reader-zoom">
          {ZOOMS.map((z) => (
            <button key={z} className={`rr-zoom-btn ${zoom === z ? 'rr-zoom-on' : ''}`} onClick={() => setZoom(z)}>
              {Math.round(z * 100)}
            </button>
          ))}
        </div>
        <p className="rr-reader-folio">p. {currentPage} / {paper.pageCount || doc?.numPages || '?'}</p>
      </div>

      <div className="rr-reader-body">
        <div data-no-click-sound className="rr-pagecol" ref={colRef} onPointerUp={() => setTimeout(capture, 10)}>
          {doc ? (
            Array.from({ length: doc.numPages }, (_, i) => i + 1).map((n) => (
              <PdfPage
                key={n}
                doc={doc}
                pageNumber={n}
                width={pageW}
                aspect={aspect}
                active={n >= lo && n <= hi}
                annotations={paper.annotations.filter((a) => a.page === n)}
                flashId={flashId}
                selectedId={selectedId}
                onOverlayClick={overlayClick}
              />
            ))
          ) : (
            <div className="pt-16 flex justify-center">
              <div className="loader"><div className="loader-bar" /><div className="loader-bar" /><div className="loader-bar" /><div className="loader-bar" /></div>
            </div>
          )}
        </div>

        <div
          className={`rr-railgrip ${dragging ? 'rr-railgrip-on' : ''}`}
          onPointerDown={(e) => { e.preventDefault(); setDragging(true); }}
          onDoubleClick={() => setRailW(340)}
          role="separator"
          aria-orientation="vertical"
          title="Drag to resize. Double-click to reset."
        />

        <aside className="rr-rail" style={{ width: railW }}>
          <div className="rr-rail-tabs">
            <button className={`rr-rail-tab ${railTab === 'margins' ? 'rr-rail-tab-on' : ''}`} onClick={() => setRailTab('margins')}>
              MARGINS ({paper.annotations.length})
            </button>
            <button className={`rr-rail-tab ${railTab === 'jane' ? 'rr-rail-tab-on' : ''}`} onClick={() => setRailTab('jane')}>
              JANE
            </button>
          </div>
          {railTab === 'margins' ? (
            <AnnotationRail
              annotations={paper.annotations}
              selectedId={selectedId}
              onJump={(a) => { setSelectedId(a.id); jumpToPage(a.page, a.id); }}
              onUpdate={updateAnn}
              onDelete={deleteAnn}
              onAsk={askJaneAbout}
            />
          ) : (
            <Suspense fallback={null}>
              <JanePanel mode="paper" paperId={paperId} paperTitle={paper.title}
                currentPage={currentPage} askSeed={askSeed} onJumpToPage={jumpToPage} docked />
            </Suspense>
          )}
        </aside>
      </div>

      {pending && (
        <div className="rr-popover" style={{ left: pending.anchor.x, top: pending.anchor.y + 10 }}
          onPointerUp={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-1.5">
            {COLORS.map((c) => (
              <button key={c} className={`rr-dot rr-dot-${c} ${pickColor === c ? 'rr-dot-on' : ''}`}
                onClick={() => setPickColor(c)} />
            ))}
          </div>
          <input className="rr-popover-note" placeholder="margin note (optional)…" value={noteDraft}
            maxLength={2000} onChange={(e) => setNoteDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveHighlight()} />
          <div className="flex gap-2">
            <button className="btn-black" onClick={saveHighlight}>MARK IT</button>
            <button className="rr-popover-ask" onClick={() => askJaneAbout(pending)}>ASK JANE</button>
            <button className="btn-ghost" onClick={() => { setNoteDraft(''); clear(); }}>✕</button>
          </div>
        </div>
      )}
    </div>
  );
}
