import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../../api';
import { MAX_PAGE_BYTES, PAGE_W, PAGE_H, pageBytes } from './model';

// Rescue any item that drifted off the paper (pre-clamping data): pull it
// back to where at least a grabbable sliver is on the page. Purely visual —
// nothing is written until the user next edits.
function rescueItems(content) {
  let changed = false;
  const items = content.items.map((it) => {
    if (it.type === 'ink') return it;
    const w = it.type === 'sticker' ? 64 * (it.scale || 1) : (it.w || 100);
    const h = it.type === 'image' ? it.h : it.type === 'sticker' ? 64 * (it.scale || 1) : 40;
    const x = Math.min(Math.max(it.x, 28 - w), PAGE_W - 28);
    const y = Math.min(Math.max(it.y, 28 - h), PAGE_H - 28);
    if (x !== it.x || y !== it.y) { changed = true; return { ...it, x, y }; }
    return it;
  });
  return changed ? { ...content, items } : content;
}

const AUTOSAVE_MS = 1200;
const UNDO_CAP = 50;

// Owns the notebook + pages, per-page undo stacks (in-memory, lost on
// refresh — v1), debounced autosave, and a save status the reader renders
// as the corner stamp: 'saved' | 'saving' | 'unsaved' | 'error' | 'full'.
export default function useNotebookState(notebookId) {
  const [notebook, setNotebook] = useState(null);
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saveStatus, setSaveStatus] = useState('saved');
  const [savedAt, setSavedAt] = useState(null);

  const undoStacks = useRef({}); // pageId -> [contentSnapshots]
  const dirty = useRef(new Set()); // pageIds needing a save
  const timer = useRef(null);
  const pagesRef = useRef(pages);
  pagesRef.current = pages;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.getNotebook(notebookId)
      .then((nb) => {
        if (!alive) return;
        setNotebook(nb);
        setPages(nb.pages.map((p) => ({ ...p, content: rescueItems(p.content) })));
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [notebookId]);

  const saveDirty = useCallback(async ({ keepalive = false } = {}) => {
    const ids = [...dirty.current];
    if (!ids.length) return;
    dirty.current = new Set();
    setSaveStatus('saving');
    try {
      await Promise.all(ids.map((pageId) => {
        const page = pagesRef.current.find((p) => p.id === pageId);
        if (!page) return null;
        if (keepalive) {
          // route-leave / tab-hide flush — plain fetch so the request survives teardown
          return fetch(`/api/notebooks/${notebookId}/pages/${pageId}`, {
            method: 'PATCH',
            keepalive: true,
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${localStorage.getItem('ledger_token')}`,
            },
            body: JSON.stringify({ content: page.content }),
          });
        }
        return api.saveNotebookPage(notebookId, pageId, page.content);
      }));
      setSaveStatus('saved');
      setSavedAt(new Date());
    } catch (e) {
      ids.forEach((id) => dirty.current.add(id));
      setSaveStatus('error');
      console.error('autosave failed:', e);
    }
  }, [notebookId]);

  const scheduleSave = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(saveDirty, AUTOSAVE_MS);
  }, [saveDirty]);

  // flush when the tab hides or the reader unmounts
  useEffect(() => {
    const flush = () => { if (dirty.current.size) saveDirty({ keepalive: true }); };
    const onHide = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      clearTimeout(timer.current);
      flush();
    };
  }, [saveDirty]);

  // Mutate one page's content. withUndo=false for drag-move ticks; the
  // caller commits one undo snapshot at gesture start instead.
  const mutatePage = useCallback((pageId, fn, { withUndo = true } = {}) => {
    setPages((prev) => prev.map((p) => {
      if (p.id !== pageId) return p;
      const next = fn(p.content);
      if (pageBytes(next) > MAX_PAGE_BYTES) {
        setSaveStatus('full');
        return p;
      }
      if (withUndo) {
        const stack = (undoStacks.current[pageId] ||= []);
        stack.push(p.content);
        if (stack.length > UNDO_CAP) stack.shift();
      }
      return { ...p, content: next };
    }));
    dirty.current.add(pageId);
    setSaveStatus('unsaved');
    scheduleSave();
  }, [scheduleSave]);

  const pushUndo = useCallback((pageId) => {
    const page = pagesRef.current.find((p) => p.id === pageId);
    if (!page) return;
    const stack = (undoStacks.current[pageId] ||= []);
    stack.push(page.content);
    if (stack.length > UNDO_CAP) stack.shift();
  }, []);

  const undo = useCallback((pageId) => {
    const stack = undoStacks.current[pageId];
    if (!stack?.length) return;
    const prev = stack.pop();
    setPages((ps) => ps.map((p) => (p.id === pageId ? { ...p, content: prev } : p)));
    dirty.current.add(pageId);
    setSaveStatus('unsaved');
    scheduleSave();
  }, [scheduleSave]);

  const addPage = useCallback(async () => {
    const page = await api.addNotebookPage(notebookId);
    setPages((prev) => [...prev, page]);
    return page;
  }, [notebookId]);

  const deletePage = useCallback(async (pageId) => {
    await api.deleteNotebookPage(notebookId, pageId);
    setPages((prev) => prev
      .filter((p) => p.id !== pageId)
      .map((p, i) => ({ ...p, pageNumber: i + 1 })));
    delete undoStacks.current[pageId];
    dirty.current.delete(pageId);
  }, [notebookId]);

  return {
    notebook, pages, loading, error,
    saveStatus, savedAt,
    mutatePage, pushUndo, undo, addPage, deletePage,
    canUndo: (pageId) => !!undoStacks.current[pageId]?.length,
  };
}
