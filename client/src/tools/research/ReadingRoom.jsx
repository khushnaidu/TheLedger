import { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import UploadDrop from './UploadDrop';
import useIngest from './useIngest';
import { drawerSound } from './drawer-sfx';

const JanePanel = lazy(() => import('./JanePanel'));

// Drawer geometry measured from /art/file_cabinett.png (440×567) via pixel
// luminance profiling — top/h are % of image height, SLOT_X % of width.
const BANDS = [
  { top: 5.5, h: 17.8 },
  { top: 26.3, h: 17.3 },
  { top: 48.3, h: 17.5 },
  { top: 69.5, h: 19.7 },
];
const SLOT_X = { left: 8.4, width: 84.1 };

// a paper standing in the drawer — sunk to its tab, lifted on hover
function PaperFile({ paper, confirming, onOpen, onEdit, onBurn }) {
  return (
    <div className="rr-file" onClick={onOpen}>
      <p className="rr-file-title">{paper.title}</p>
      <p className="rr-file-byline">
        {paper.authors || 'author unknown'}{paper.year ? ` · ${paper.year}` : ''}
      </p>
      <p className="rr-file-facts">
        {paper.pageCount || '?'} pp · {paper._count?.annotations ?? 0} marks
        {paper.status === 'processing' && <span className="rr-badge">CATALOGUING</span>}
        {paper.status === 'scanned' && <span className="rr-badge">SCANNED</span>}
      </p>
      <div className="rr-file-tools" onClick={(e) => e.stopPropagation()}>
        <button className="rr-card-btn" onClick={onEdit} title="Correct the record">✎</button>
        <button className={`rr-card-btn ${confirming ? 'rr-card-btn-hot' : ''}`} onClick={onBurn} title="Withdraw from the stacks">
          {confirming ? 'SURE?' : '×'}
        </button>
      </div>
    </div>
  );
}

// the records desk — corrections happen beside the cabinet
function EditDesk({ paper, collections, onDone, onCancel }) {
  const [form, setForm] = useState({
    title: paper.title,
    authors: paper.authors,
    year: paper.year ?? '',
    collectionId: paper.collectionId || '',
  });

  const save = async () => {
    const year = form.year === '' ? null : parseInt(form.year, 10);
    const updated = await api.updatePaper(paper.id, {
      title: form.title,
      authors: form.authors,
      year: Number.isInteger(year) ? year : null,
      collectionId: form.collectionId || null,
    });
    onDone(updated);
  };

  return (
    <div className="rr-desk">
      <p className="t-label mb-2">Correct the record</p>
      <input className="rr-card-input" value={form.title} maxLength={200} autoFocus
        onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
        onKeyDown={(e) => e.key === 'Enter' && save()} placeholder="Title" />
      <input className="rr-card-input" value={form.authors} maxLength={300}
        onChange={(e) => setForm((f) => ({ ...f, authors: e.target.value }))}
        onKeyDown={(e) => e.key === 'Enter' && save()} placeholder="Authors" />
      <div className="flex gap-3 items-baseline">
        <input className="rr-card-input rr-card-input-year" value={form.year} maxLength={4}
          onChange={(e) => setForm((f) => ({ ...f, year: e.target.value.replace(/\D/g, '') }))}
          onKeyDown={(e) => e.key === 'Enter' && save()} placeholder="Year" />
        <select className="rr-card-move flex-1" value={form.collectionId}
          onChange={(e) => setForm((f) => ({ ...f, collectionId: e.target.value }))}>
          <option value="">— unfiled —</option>
          {collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="flex gap-2 mt-3">
        <button className="btn-black" onClick={save} disabled={!form.title.trim()}>File it</button>
        <button className="btn-ghost" onClick={onCancel}>Never mind</button>
      </div>
    </div>
  );
}

export default function ReadingRoom() {
  const navigate = useNavigate();
  const [collections, setCollections] = useState([]);
  const [papers, setPapers] = useState(null);
  const [openDrawer, setOpenDrawer] = useState(null); // collection id | 'unfiled' | null
  const [newDrawer, setNewDrawer] = useState(null);
  const [confirmingDrawer, setConfirmingDrawer] = useState(null);
  const [confirmingPaper, setConfirmingPaper] = useState(null);
  const [editingPaper, setEditingPaper] = useState(null);
  const [consulting, setConsulting] = useState(false);
  const [confirmingCab, setConfirmingCab] = useState(null);
  const [trayFor, setTrayFor] = useState(null); // drawer id currently ingesting via its + slot
  const trayInputRef = useRef(null);
  const trayTargetRef = useRef(null);

  const load = () => Promise.all([api.getCollections(), api.getPapers()])
    .then(([cs, ps]) => { setCollections(cs); setPapers(ps); })
    .catch(() => { setCollections([]); setPapers([]); });

  const trayIngest = useIngest(() => { load(); setTrayFor(null); });

  useEffect(() => { load(); }, []);

  // Jane peeking at the screen edge summons the consult drawer
  useEffect(() => {
    const handler = () => setConsulting((c) => !c);
    window.addEventListener('jane-consult', handler);
    return () => window.removeEventListener('jane-consult', handler);
  }, []);

  const toggleDrawer = (id) => {
    if (openDrawer === id) {
      drawerSound('shut');
      setOpenDrawer(null);
    } else {
      if (openDrawer !== null) drawerSound('shut');
      drawerSound('open');
      setOpenDrawer(id);
    }
  };

  const addDrawer = async () => {
    const name = newDrawer?.trim();
    if (!name) { setNewDrawer(null); return; }
    try {
      await api.createCollection(name);
      setNewDrawer(null);
      load();
    } catch (err) {
      alert(err.message);
    }
  };

  const removeDrawer = async (e, id) => {
    e.stopPropagation();
    if (confirmingDrawer !== id) {
      setConfirmingDrawer(id);
      setTimeout(() => setConfirmingDrawer((c) => (c === id ? null : c)), 2500);
      return;
    }
    setConfirmingDrawer(null);
    await api.deleteCollection(id);
    if (openDrawer === id) setOpenDrawer(null);
    load();
  };

  const burnPaper = async (e, id) => {
    e.stopPropagation();
    if (confirmingPaper !== id) {
      setConfirmingPaper(id);
      setTimeout(() => setConfirmingPaper((c) => (c === id ? null : c)), 2500);
      return;
    }
    setConfirmingPaper(null);
    await api.deletePaper(id);
    setPapers((ps) => ps.filter((p) => p.id !== id));
    if (editingPaper?.id === id) setEditingPaper(null);
  };

  const onSaved = (updated) => {
    setPapers((ps) => ps.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
    setEditingPaper(null);
    load(); // drawer counts moved with it
  };

  const drawers = [
    ...collections.map((c) => ({ id: c.id, name: c.name, deletable: true })),
    { id: 'unfiled', name: 'Unfiled', deletable: false },
  ];
  const papersIn = (id) => (papers || []).filter((p) =>
    id === 'unfiled' ? !p.collectionId : p.collectionId === id);

  // retire a whole cabinet: its labeled drawers go, their papers unfile
  const removeCabinet = async (e, ci) => {
    e.stopPropagation();
    if (confirmingCab !== ci) {
      setConfirmingCab(ci);
      setTimeout(() => setConfirmingCab((c) => (c === ci ? null : c)), 2500);
      return;
    }
    setConfirmingCab(null);
    const doomed = drawers.slice(ci * BANDS.length, (ci + 1) * BANDS.length).filter((d) => d.deletable);
    for (const d of doomed) await api.deleteCollection(d.id);
    if (doomed.some((d) => d.id === openDrawer)) setOpenDrawer(null);
    load();
  };

  const openTrayPicker = (e, drawerId) => {
    e.stopPropagation();
    trayTargetRef.current = drawerId;
    trayInputRef.current?.click();
  };

  return (
    <div className="max-w-[1100px] stagger relative">
      <p className="t-label">The Study · No. 02</p>
      <h1 className="t-display">Reading Room</h1>
      <p className="t-label mt-1" style={{ color: 'var(--ink-30)' }}>
        Every paper you meant to read. The consultant has already read them.
      </p>

      {papers === null ? (
        <div className="pt-16 flex justify-center">
          <div className="loader"><div className="loader-bar" /><div className="loader-bar" /><div className="loader-bar" /><div className="loader-bar" /></div>
        </div>
      ) : (
        <>
          <div className="flex items-start gap-8 mt-8 flex-wrap">
            {/* intake first, so new cabinets never shove it around */}
            <UploadDrop onDone={() => load()} />

            {/* one hidden input serves every drawer's + slot */}
            <input
              ref={trayInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const target = trayTargetRef.current;
                setTrayFor(target);
                trayIngest.ingest(e.target.files?.[0], target === 'unfiled' ? null : target);
                e.target.value = '';
              }}
            />

            {/* the cabinet bank — the real photo, drawers mapped onto it */}
            <div data-no-click-sound className="rr-cabbank">
              {Array.from({ length: Math.max(1, Math.ceil((drawers.length + 1) / BANDS.length)) }, (_, ci) => (
                <div key={ci} className="rr-cabinet-photo">
                  <img src="/art/file_cabinett.png" alt="" draggable={false} />
                  {drawers.slice(ci * BANDS.length, (ci + 1) * BANDS.length).some((d) => d.deletable) && (
                    <button
                      type="button"
                      className={`rr-cab-x ${confirmingCab === ci ? 'rr-card-btn-hot' : ''}`}
                      onClick={(e) => removeCabinet(e, ci)}
                      title="Retire this cabinet (its papers go unfiled)"
                    >
                      {confirmingCab === ci ? 'SURE?' : '×'}
                    </button>
                  )}
                  {BANDS.map((band, bi) => {
                    const gi = ci * BANDS.length + bi;
                    if (gi > drawers.length) return null; // bare photo drawer
                    const slotStyle = { top: `${band.top}%`, height: `${band.h}%`, left: `${SLOT_X.left}%`, width: `${SLOT_X.width}%` };

                    // the first empty photo drawer takes new labels
                    if (gi === drawers.length) {
                      return (
                        <div key="ghost" className="rr-cabslot" style={slotStyle}>
                          {newDrawer === null ? (
                            <button type="button" className="rr-cabslot-front rr-cabslot-ghost" onClick={() => setNewDrawer('')}>
                              <span className="rr-cabslot-plate rr-cabslot-plate-ghost">
                                <span className="rr-cab-label">+ label this drawer</span>
                              </span>
                            </button>
                          ) : (
                            <div className="rr-cabslot-front rr-cabslot-ghost">
                              <span className="rr-cabslot-plate">
                                <input className="rr-cab-input" value={newDrawer} maxLength={40} autoFocus
                                  placeholder="label…"
                                  onChange={(e) => setNewDrawer(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === 'Enter') addDrawer(); if (e.key === 'Escape') setNewDrawer(null); }}
                                  onBlur={addDrawer} />
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    }

                    const d = drawers[gi];
                    const inside = papersIn(d.id);
                    const open = openDrawer === d.id;
                    return (
                      <div key={d.id} className={`rr-cabslot ${open ? 'rr-cab-open' : ''}`} style={slotStyle}>
                        <button type="button" className="rr-cabslot-front" onClick={() => toggleDrawer(d.id)}>
                          <span className="rr-cabslot-plate">
                            <span className="rr-cab-label">{d.name}</span>
                            <span className="rr-cab-count">{String(inside.length).padStart(2, '0')}</span>
                          </span>
                          {d.deletable && (
                            <span
                              className={`rr-cab-burn ${confirmingDrawer === d.id ? 'rr-card-btn-hot' : ''}`}
                              onClick={(e) => removeDrawer(e, d.id)}
                              title="Remove drawer (papers go unfiled)"
                            >
                              {confirmingDrawer === d.id ? 'SURE?' : '×'}
                            </span>
                          )}
                        </button>
                        {open && (
                          <div className="rr-cabslot-tray">
                            <div className="rr-cab-files">
                              {inside.map((p) => (
                                <PaperFile key={p.id} paper={p}
                                  confirming={confirmingPaper === p.id}
                                  onOpen={() => navigate(`/research/${p.id}`)}
                                  onEdit={() => setEditingPaper(p)}
                                  onBurn={(e) => burnPaper(e, p.id)}
                                />
                              ))}
                              <button
                                type="button"
                                className="rr-file rr-file-add"
                                onClick={(e) => !trayIngest.busy && openTrayPicker(e, d.id)}
                                title="File a PDF straight into this drawer"
                              >
                                {trayIngest.busy && trayFor === d.id
                                  ? <span className="rr-file-add-stage">{trayIngest.stage?.label}</span>
                                  : '+'}
                              </button>
                            </div>
                            {trayIngest.error && trayFor === d.id && (
                              <p className="rr-drop-error rr-tray-error">{trayIngest.error}</p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* the records desk */}
            <div className="flex-1 min-w-[280px]">
              {editingPaper && (
                <EditDesk key={editingPaper.id} paper={editingPaper} collections={collections}
                  onDone={onSaved} onCancel={() => setEditingPaper(null)} />
              )}
              <p className="fig-caption mt-4">
                fig. the reading room — {papers.length} {papers.length === 1 ? 'volume' : 'volumes'} in {drawers.length} drawers
              </p>
            </div>
          </div>

          {consulting && (
            <Suspense fallback={null}>
              <JanePanel mode="library" papers={papers} onClose={() => setConsulting(false)} />
            </Suspense>
          )}
        </>
      )}
    </div>
  );
}
