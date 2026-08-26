import { useState } from 'react';
import { api } from '../../api';

const BATCH = 25;

// The intake pipeline: Blob upload → pdfjs extraction → paper row +
// batched page text. Shared by the acquisitions drop ghost and each
// drawer's + slot (which files straight in via collectionId).
// Extraction alone, from an already-open pdfjs doc. The reader uses this
// to SELF-HEAL a paper whose intake died mid-catalogue (paper row filed,
// zero pages stored, badge stuck on CATALOGUING, Jane blind) — the
// reader has the whole PDF open to render it, which is exactly the text
// the catalog is missing. This is ADR-0005's promised re-extract path.
// Unlike ingest below it must NOT destroy the doc — the reader owns it.
export async function catalogueDoc(paperId, doc, onStage) {
  const { extractAllPages } = await import('./pdf');
  const pages = await extractAllPages(doc, (n, total) =>
    onStage?.(`re-cataloguing page ${n}/${total}…`));
  await api.clearPaperPages(paperId);
  for (let i = 0; i < pages.length; i += BATCH) {
    await api.postPaperPages(paperId, pages.slice(i, i + BATCH));
  }
  const emptyish = pages.filter((p) => p.text.length < 20).length;
  const scanned = pages.length > 0 && emptyish / pages.length >= 0.8;
  return api.updatePaper(paperId, { status: scanned ? 'scanned' : 'ready', pageCount: doc.numPages });
}

export default function useIngest(onDone) {
  const [stage, setStage] = useState(null); // null | {label}
  const [error, setError] = useState(null);

  const ingest = async (file, collectionId = null) => {
    if (!file || stage) return;
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
      setError('Only PDFs belong in the stacks.');
      return;
    }
    if (file.size > 25_000_000) {
      setError('That volume is over the 25MB limit.');
      return;
    }
    setError(null);
    let paper = null;
    try {
      setStage({ label: 'Shelving the file…' });
      const blobUrl = await api.uploadPaperPdf(file);

      setStage({ label: 'Opening the volume…' });
      const buf = await file.arrayBuffer();
      const { loadPdf, extractAllPages, extractMetadata } = await import('./pdf');
      const doc = await loadPdf(buf);
      const meta = await extractMetadata(doc, file.name);

      paper = await api.createPaper({
        ...meta,
        blobUrl,
        fileName: file.name,
        pageCount: doc.numPages,
        collectionId,
      });

      const pages = await extractAllPages(doc, (n, total) =>
        setStage({ label: `Cataloguing page ${n}/${total}…` }));
      doc.destroy();

      await api.clearPaperPages(paper.id);
      for (let i = 0; i < pages.length; i += BATCH) {
        await api.postPaperPages(paper.id, pages.slice(i, i + BATCH));
      }

      const emptyish = pages.filter((p) => p.text.length < 20).length;
      const scanned = pages.length > 0 && emptyish / pages.length >= 0.8;
      const updated = await api.updatePaper(paper.id, { status: scanned ? 'scanned' : 'ready' });

      setStage(null);
      onDone?.(updated);
    } catch (err) {
      // the real cause matters when a user reports a failed intake
      console.error('Reading Room intake failed:', err);
      setStage(null);
      setError(err.message || 'The intake desk jammed. Try again.');
      // paper row without text still opens in the reader; leave it be
      if (paper) onDone?.(paper);
    }
  };

  return { ingest, stage, error, busy: !!stage };
}
