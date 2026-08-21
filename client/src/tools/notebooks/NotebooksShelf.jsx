import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { COVERS, PAPERS } from './covers';

// Shelf bays measured from /art/book_shelf.png (439×568): each row of
// books is anchored to a board's front edge. floor/h are % of image height.
const BAYS = [
  { floor: 23.2, h: 13.8 },
  { floor: 34.5, h: 9.4 },
  { floor: 50.8, h: 14.6 },
  { floor: 71.9, h: 16.0 },
  { floor: 89.9, h: 16.0 },
];
const ROW_CAP = 10;

const hashOf = (id) => [...id].reduce((a, c) => a + c.charCodeAt(0), 0);

function CoverForm({ onCreate, onCancel }) {
  const [title, setTitle] = useState('');
  const [coverStyle, setCoverStyle] = useState('composition');
  const [paperStyle, setPaperStyle] = useState('ruled');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      await onCreate({ title, coverStyle, paperStyle });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="panel p-5 mt-6 max-w-[480px]">
      <p className="t-label mb-3">Bind a new notebook</p>
      <input
        className="input-field w-full mb-4"
        placeholder="Title…"
        value={title}
        maxLength={60}
        autoFocus
        onChange={(e) => setTitle(e.target.value)}
      />
      <p className="t-label mb-2">Cover</p>
      <div className="flex gap-3 mb-4">
        {COVERS.map((c) => (
          <button key={c.id} type="button"
            className={`nb-swatch nb-cover-${c.id} ${coverStyle === c.id ? 'nb-swatch-on' : ''}`}
            title={c.label}
            onClick={() => setCoverStyle(c.id)}
          />
        ))}
      </div>
      <p className="t-label mb-2">Paper</p>
      <div className="flex gap-3 mb-5">
        {PAPERS.map((p) => (
          <button key={p.id} type="button"
            className={`nb-swatch nb-swatch-paper nb-paper-${p.id} ${paperStyle === p.id ? 'nb-swatch-on' : ''}`}
            title={p.label}
            onClick={() => setPaperStyle(p.id)}
          />
        ))}
      </div>
      <div className="flex gap-3">
        <button type="submit" className="btn-black" disabled={!title.trim() || busy}>
          {busy ? 'Binding…' : 'Bind It'}
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel}>Never mind</button>
      </div>
    </form>
  );
}

function Spine({ nb, confirming, onOpen, onBurn }) {
  const hash = hashOf(nb.id);
  const fmtDate = new Date(nb.updatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '.');
  return (
    <div
      className={`nb-spine nb-spine-${nb.coverStyle}`}
      style={{ width: 30 + (hash % 13), height: `${78 + (hash % 18)}%` }}
      title={`${nb.title} — ${nb._count.pages} ${nb._count.pages === 1 ? 'page' : 'pages'}, touched ${fmtDate}`}
      onClick={onOpen}
    >
      <span className="nb-spine-title">{nb.title}</span>
      <button
        className={`nb-cover-burn ${confirming ? 'nb-cover-burn-hot' : ''}`}
        onClick={onBurn}
        title="Burn this notebook"
      >
        {confirming ? 'SURE?' : '×'}
      </button>
    </div>
  );
}

export default function NotebooksShelf() {
  const navigate = useNavigate();
  const [notebooks, setNotebooks] = useState(null);
  const [creating, setCreating] = useState(false);
  const [confirmingId, setConfirmingId] = useState(null);

  useEffect(() => {
    api.getNotebooks().then(setNotebooks).catch(() => setNotebooks([]));
  }, []);

  const handleCreate = async (data) => {
    const nb = await api.createNotebook(data);
    navigate(`/notebooks/${nb.id}`);
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (confirmingId !== id) {
      setConfirmingId(id);
      setTimeout(() => setConfirmingId((c) => (c === id ? null : c)), 2500);
      return;
    }
    setConfirmingId(null);
    await api.deleteNotebook(id);
    setNotebooks((nbs) => nbs.filter((n) => n.id !== id));
  };

  // deal the books onto the shelf rows, the bind-a-new-one ghost last;
  // anything past the last bay squeezes into it (flex shrink)
  const rows = [];
  if (notebooks) {
    const stock = [...notebooks, { ghost: true }];
    for (let i = 0; i < BAYS.length; i++) {
      rows.push(i === BAYS.length - 1
        ? stock.slice(i * ROW_CAP)
        : stock.slice(i * ROW_CAP, (i + 1) * ROW_CAP));
    }
  }

  return (
    <div className="max-w-[1100px] stagger relative">
      <p className="t-label">The Study · No. 01</p>
      <h1 className="t-display">Notebooks</h1>
      <p className="t-label mt-1" style={{ color: 'var(--ink-30)' }}>
        Paper that never runs out. Ink that never smudges. Almost.
      </p>

      {notebooks === null ? (
        <div className="pt-16 flex justify-center">
          <div className="loader"><div className="loader-bar" /><div className="loader-bar" /><div className="loader-bar" /><div className="loader-bar" /></div>
        </div>
      ) : (
        <>
          <div className="nb-case mt-8">
            <img src="/art/book_shelf.png" alt="" draggable={false} />
            {rows.map((row, i) => (
              <div key={i} className="nb-case-row"
                style={{ top: `${BAYS[i].floor - BAYS[i].h}%`, height: `${BAYS[i].h}%` }}>
                {row.map((nb) => nb.ghost ? (
                  <div key="ghost" className="nb-spine nb-spine-ghost" style={{ width: 34, height: '84%' }}
                    title="Bind a new notebook" onClick={() => setCreating(true)}>
                    <span className="nb-spine-title">+ bind new</span>
                  </div>
                ) : (
                  <Spine key={nb.id} nb={nb}
                    confirming={confirmingId === nb.id}
                    onOpen={() => navigate(`/notebooks/${nb.id}`)}
                    onBurn={(e) => handleDelete(e, nb.id)}
                  />
                ))}
              </div>
            ))}
          </div>
          <p className="fig-caption mt-3">
            fig. the study — {notebooks.length} {notebooks.length === 1 ? 'volume' : 'volumes'} in the stacks
          </p>
        </>
      )}

      {creating && <CoverForm onCreate={handleCreate} onCancel={() => setCreating(false)} />}
    </div>
  );
}
