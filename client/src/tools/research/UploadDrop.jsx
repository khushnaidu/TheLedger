import { useRef, useState } from 'react';
import useIngest from './useIngest';

export default function UploadDrop({ onDone }) {
  const inputRef = useRef(null);
  const [drag, setDrag] = useState(false);
  const { ingest, stage, error } = useIngest(onDone);

  return (
    <div
      className={`rr-drop ${drag ? 'rr-drop-over' : ''} ${stage ? 'rr-drop-busy' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); ingest(e.dataTransfer.files?.[0]); }}
      onClick={() => !stage && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => { ingest(e.target.files?.[0]); e.target.value = ''; }}
      />
      <div className="rr-drop-body">
        {stage ? (
          <p className="rr-drop-stage">{stage.label}</p>
        ) : (
          <>
            <p className="rr-drop-title">Acquisitions</p>
            <p className="rr-drop-hint">drop a PDF here,<br />or click to browse — 25MB max</p>
          </>
        )}
        {error && <p className="rr-drop-error">{error}</p>}
      </div>
    </div>
  );
}
