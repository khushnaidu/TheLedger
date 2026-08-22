import { useMemo, useRef, useState } from 'react';
import { parseStatement, guessMapping, guessMappingFromData, mapRows } from './statement';
import { api } from '../../api';
import { fmt, shortDate } from './money';

const BATCH = 500;
const PREVIEW = 10;

const KIND_LABEL = {
  tab: 'tab separated, straight out of a spreadsheet',
  comma: 'comma separated',
  pipe: 'pipe separated',
  spaces: 'a fixed-width text dump',
  none: 'unreadable',
};

function ColumnPick({ label, headers, value, onChange, optional }) {
  return (
    <label className="fin-map-row">
      <span className="t-label">{label}</span>
      <select
        className="select-field"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      >
        <option value="">{optional ? '— none —' : '— pick —'}</option>
        {headers.map((h, i) => <option key={i} value={i}>{h || `column ${i + 1}`}</option>)}
      </select>
    </label>
  );
}

export default function StatementImport({ onClose, onPosted }) {
  const [tab, setTab] = useState('paste');
  const [pasted, setPasted] = useState('');
  const [parsed, setParsed] = useState(null);
  const [origin, setOrigin] = useState('');
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState(null);
  const [fallback, setFallback] = useState('uncategorized');
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [showSkipped, setShowSkipped] = useState(false);
  const [sortMap, setSortMap] = useState(null);
  const [sorting, setSorting] = useState(false);
  const fileRef = useRef(null);

  const headers = useMemo(() => {
    if (!parsed?.rows.length) return [];
    return hasHeader ? parsed.rows[0] : parsed.rows[0].map((_, i) => `column ${i + 1}`);
  }, [parsed, hasHeader]);

  const body = useMemo(
    () => (parsed ? (hasHeader ? parsed.rows.slice(1) : parsed.rows) : []),
    [parsed, hasHeader]
  );

  const mapped = useMemo(() => {
    if (!mapping || !body.length) return null;
    if (mapping.date === null) return null;
    const noMoney = mapping.layout === 'signed'
      ? mapping.amount === null
      : mapping.debit === null && mapping.credit === null;
    if (noMoney) return null;
    return mapRows(body, mapping, fallback.trim().toLowerCase() || 'uncategorized');
  }, [body, mapping, fallback]);

  const ingest = (text, label) => {
    setError('');
    setResult(null);
    setSortMap(null);
    const out = parseStatement(text);
    if (!out.rows.length) {
      setError('There are no readable rows in that. Copy the transaction table itself, headers and all.');
      return;
    }
    const header = out.headerIndex === 0;
    setParsed(out);
    setOrigin(label);
    setHasHeader(header);
    setMapping(header
      ? guessMapping(out.rows[0])
      : guessMappingFromData(out.rows));
  };

  const final = useMemo(() => {
    if (!mapped || !sortMap) return mapped;
    return {
      ...mapped,
      entries: mapped.entries.map((e) => ({ ...e, category: sortMap[e.description] || e.category })),
    };
  }, [mapped, sortMap]);

  const loose = final?.entries.filter((e) => e.category === 'uncategorized').length || 0;

  // a statement names merchants, not categories. Reading "SAFEWAY #1842 SAN
  // JOSE CA" as groceries is the one part of this that wants a model, so the
  // distinct descriptions go to Vera and the answer is applied to every row.
  const sort = async () => {
    if (!final?.entries.length || sorting) return;
    setSorting(true);
    setError('');
    try {
      const names = [...new Set(final.entries.map((e) => e.description).filter(Boolean))];
      const map = {};
      for (let i = 0; i < names.length; i += 120) {
        const res = await api.sortCategories(names.slice(i, i + 120));
        Object.assign(map, res.map);
      }
      setSortMap(map);
    } catch (err) {
      setError(err.message);
    } finally {
      setSorting(false);
    }
  };

  const takeFile = async (file) => {
    setError('');
    if (!file) return;
    if (/\.xlsx?$/i.test(file.name)) {
      setError('Excel workbooks are not readable here. Open it, select the transactions, copy, and paste them into the Paste tab — that works and keeps the columns.');
      return;
    }
    if (file.size > 8_000_000) { setError('That statement is over 8MB. Split it.'); return; }
    ingest(await file.text(), file.name);
  };

  // re-derive the mapping when the header toggle flips
  const flipHeader = (on) => {
    setHasHeader(on);
    if (!parsed) return;
    setMapping(on ? guessMapping(parsed.rows[0]) : guessMappingFromData(parsed.rows));
  };

  const post = async () => {
    if (!final?.entries.length || progress) return;
    setError('');
    let posted = 0;
    let duplicates = 0;
    const chunks = [];
    for (let i = 0; i < final.entries.length; i += BATCH) chunks.push(final.entries.slice(i, i + BATCH));
    try {
      for (const [i, chunk] of chunks.entries()) {
        setProgress(`Posting ${i * BATCH + chunk.length} of ${final.entries.length}…`);
        const res = await onPosted(chunk);
        posted += res.count;
        duplicates += res.duplicates;
      }
      setResult({ posted, duplicates, skipped: final.skipped });
    } catch (err) {
      setError(err.message);
    } finally {
      setProgress(null);
    }
  };

  const reset = () => { setParsed(null); setMapping(null); setPasted(''); setResult(null); setSortMap(null); };

  return (
    <div className="fin-modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="fin-modal-sheet">
        <div className="fin-modal-head">
          <p className="t-title">Import a statement</p>
          <button className="fin-close" onClick={onClose}>✕</button>
        </div>

        {!parsed && !result && (
          <>
            <div className="fin-tabs">
              <button className={tab === 'paste' ? 'fin-tab-on' : ''} onClick={() => setTab('paste')}>
                Paste
              </button>
              <button className={tab === 'file' ? 'fin-tab-on' : ''} onClick={() => setTab('file')}>
                A file
              </button>
            </div>

            {tab === 'paste' ? (
              <>
                <p className="fin-lede">
                  Open the export, select the transactions, copy, paste below. Spreadsheet rows,
                  comma files and plain text dumps all read the same. The columns are worked out
                  here, and anything unreadable is listed rather than dropped.
                </p>
                <textarea
                  className="fin-paste"
                  autoFocus
                  placeholder={'08/02/2026\tSAFEWAY #1842\t-84.19\n08/03/2026\tCLIPPER CARD\t-25.00'}
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                />
                <div className="fin-modal-foot">
                  <button
                    className="btn-black"
                    disabled={!pasted.trim()}
                    onClick={() => ingest(pasted, 'pasted')}
                  >
                    Read it
                  </button>
                  <p className="fin-empty-sub">{pasted.trim() ? `${pasted.trim().split(/\r?\n/).length} lines pasted` : 'Nothing pasted yet'}</p>
                </div>
              </>
            ) : (
              <div
                className="fin-drop"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); takeFile(e.dataTransfer.files[0]); }}
                onClick={() => fileRef.current?.click()}
              >
                <p className="t-heading">Drop a .csv, .txt or .tsv</p>
                <p className="fin-empty-sub">
                  Read in this browser, never uploaded. Excel workbooks need copy and paste instead.
                </p>
                <input
                  ref={fileRef} type="file" accept=".csv,.txt,.tsv,text/csv,text/plain" hidden
                  onChange={(e) => takeFile(e.target.files[0])}
                />
              </div>
            )}
          </>
        )}

        {parsed && !result && (
          <>
            <div className="fin-modal-meta meta-strip">
              <span>{origin}</span>
              <span>{KIND_LABEL[parsed.kind]}</span>
              <span>{body.length} rows</span>
              {parsed.preamble > 0 && <span>{parsed.preamble} header lines skipped</span>}
              <button className="fin-linkish" onClick={reset}>start over</button>
            </div>

            <div className="fin-map">
              <ColumnPick label="Date" headers={headers} value={mapping.date}
                onChange={(v) => setMapping({ ...mapping, date: v })} />
              <ColumnPick label="Particulars" headers={headers} value={mapping.description} optional
                onChange={(v) => setMapping({ ...mapping, description: v })} />
              <ColumnPick label="Category" headers={headers} value={mapping.category} optional
                onChange={(v) => setMapping({ ...mapping, category: v })} />

              <label className="fin-map-row">
                <span className="t-label">Money columns</span>
                <select className="select-field" value={mapping.layout}
                  onChange={(e) => setMapping({ ...mapping, layout: e.target.value })}>
                  <option value="signed">One signed amount column</option>
                  <option value="pair">Separate debit and credit columns</option>
                </select>
              </label>

              {mapping.layout === 'signed' ? (
                <>
                  <ColumnPick label="Amount" headers={headers} value={mapping.amount}
                    onChange={(v) => setMapping({ ...mapping, amount: v })} />
                  <label className="fin-map-row">
                    <span className="t-label">A negative means</span>
                    <select className="select-field" value={mapping.negativeIsExpense ? 'out' : 'in'}
                      onChange={(e) => setMapping({ ...mapping, negativeIsExpense: e.target.value === 'out' })}>
                      <option value="out">Money out</option>
                      <option value="in">Money in</option>
                    </select>
                  </label>
                </>
              ) : (
                <>
                  <ColumnPick label="Debit (out)" headers={headers} value={mapping.debit}
                    onChange={(v) => setMapping({ ...mapping, debit: v })} />
                  <ColumnPick label="Credit (in)" headers={headers} value={mapping.credit}
                    onChange={(v) => setMapping({ ...mapping, credit: v })} />
                </>
              )}

              <label className="fin-map-row">
                <span className="t-label">Rows with no category go to</span>
                <input className="input-field" value={fallback} maxLength={32}
                  onChange={(e) => setFallback(e.target.value)} />
              </label>

              <label className="fin-map-row fin-map-check">
                <input type="checkbox" checked={hasHeader} onChange={(e) => flipHeader(e.target.checked)} />
                <span className="t-label">First row names the columns</span>
              </label>
            </div>

            <div className="fin-preview">
              <p className="t-label">
                {final
                  ? `${final.entries.length} readable · ${final.skipped.length} unreadable${
                      sortMap ? ` · sorted into ${new Set(final.entries.map((e) => e.category)).size} categories` : ''}`
                  : 'Pick a date column and a money column'}
              </p>
              {final?.entries.slice(0, PREVIEW).map((e, i) => (
                <div key={i} className="fin-line fin-prev-line">
                  <span className="fin-date">{shortDate(`${e.date}T00:00:00Z`)}</span>
                  <span className="fin-part">{e.description || '—'}</span>
                  <span className="fin-cat">{e.category}</span>
                  <span className="fin-num">{e.kind === 'expense' ? fmt(e.amount) : ''}</span>
                  <span className="fin-num fin-credit">{e.kind === 'income' ? fmt(e.amount) : ''}</span>
                </div>
              ))}
              {final && final.entries.length > PREVIEW && (
                <p className="fin-empty-sub">and {final.entries.length - PREVIEW} more</p>
              )}
              {!!final?.skipped.length && (
                <div className="fin-skipped">
                  <button className="fin-linkish" onClick={() => setShowSkipped(!showSkipped)}>
                    {showSkipped ? 'hide' : 'show'} the {final.skipped.length} it could not read
                  </button>
                  {showSkipped && final.skipped.map((s, i) => (
                    <p key={i} className="fin-skip-row">{s.reason} · {s.text}</p>
                  ))}
                </div>
              )}
            </div>

            <div className="fin-modal-foot">
              <button className="btn-black" onClick={post} disabled={!final?.entries.length || !!progress}>
                {progress || `Post ${final?.entries.length || 0} lines`}
              </button>
              {!!loose && (
                <button className="btn-ghost" onClick={sort} disabled={sorting}>
                  {sorting ? 'Vera is reading them…' : `Have Vera sort the ${loose} loose ones`}
                </button>
              )}
              <p className="fin-empty-sub">Importing the same statement twice will not double the book.</p>
            </div>
          </>
        )}

        {result && (
          <div className="fin-result">
            <p className="t-title">{result.posted} posted</p>
            <p className="fin-empty-sub">
              {result.duplicates} were already in the book, {result.skipped.length} could not be read.
            </p>
            {!!result.skipped.length && (
              <div className="fin-skipped fin-skipped-result">
                {result.skipped.map((s, i) => (
                  <p key={i} className="fin-skip-row">{s.reason} · {s.text}</p>
                ))}
              </div>
            )}
            <button className="btn-black" onClick={onClose}>Close the book</button>
          </div>
        )}

        {error && <p className="fin-error mt-3">{error}</p>}
      </div>
    </div>
  );
}
