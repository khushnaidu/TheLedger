import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link2, Unlink, RefreshCw, Check, BookOpen, ChevronRight, Download, ExternalLink } from 'lucide-react';
import { api } from '../api';

export default function Canvas() {
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [error, setError] = useState('');

  // Courses & assignments
  const [courses, setCourses] = useState([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [selected, setSelected] = useState(new Set());

  // Import
  const [categories, setCategories] = useState([]);
  const [importCategory, setImportCategory] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  useEffect(() => {
    Promise.all([api.getCanvasStatus(), api.getCategories()])
      .then(([s, c]) => {
        setStatus(s);
        setCategories(c);
        if (c.length > 0) setImportCategory(c[0].id);
        if (s.connected) fetchCourses();
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const fetchCourses = () => {
    setLoadingCourses(true);
    api.getCanvasCourses()
      .then(setCourses)
      .catch((e) => setError(e.message))
      .finally(() => setLoadingCourses(false));
  };

  const handleConnect = async (e) => {
    e.preventDefault();
    setError('');
    setConnecting(true);
    try {
      const result = await api.connectCanvas({ baseUrl, apiToken });
      setStatus(result);
      setApiToken('');
      fetchCourses();
    } catch (e) {
      setError(e.message);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Disconnect Canvas? Imported tickets will remain.')) return;
    await api.disconnectCanvas();
    setStatus({ connected: false });
    setCourses([]);
    setSelectedCourse(null);
    setAssignments([]);
  };

  const handleSelectCourse = async (course) => {
    setSelectedCourse(course);
    setLoadingAssignments(true);
    setSelected(new Set());
    setImportResult(null);
    try {
      const data = await api.getCanvasAssignments(course.id);
      setAssignments(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingAssignments(false);
    }
  };

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    const importable = assignments.filter((a) => !a.imported);
    if (selected.size === importable.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(importable.map((a) => a.id)));
    }
  };

  const handleImport = async () => {
    if (selected.size === 0) return;
    setImporting(true);
    setImportResult(null);
    try {
      const toImport = assignments
        .filter((a) => selected.has(a.id))
        .map((a) => ({ ...a, courseId: selectedCourse.id }));
      const result = await api.importCanvasAssignments({ assignments: toImport, categoryId: importCategory });
      setImportResult(result);
      // Refresh assignments to update imported state
      const refreshed = await api.getCanvasAssignments(selectedCourse.id);
      setAssignments(refreshed);
      setSelected(new Set());
    } catch (e) {
      setError(e.message);
    } finally {
      setImporting(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await api.syncCanvas();
      setImportResult({ synced: result.updated });
    } catch (e) {
      setError(e.message);
    } finally {
      setSyncing(false);
    }
  };

  if (loading) return <div className="rule-8 mb-20" />;

  return (
    <div className="max-w-[720px] mx-auto">
      <div className="rule-8 mb-16" />

      {/* Header */}
      <div className="flex items-start gap-10 mb-16">
        <div className="flex-1">
          <p className="t-label mb-6">Integration</p>
          <h1 className="t-display text-[2.5rem] mb-4">Canvas LMS</h1>
          <div className="rule-4" style={{ background: 'var(--stamp)', width: '60px' }} />
        </div>
        <img src="/art/randomstamps.jpg" alt="" className="w-[120px] mix-blend-multiply opacity-90 flex-shrink-0 -mt-4" />
      </div>

      {error && (
        <div className="border-2 border-[var(--stamp)] p-4 mb-10">
          <p className="text-[0.625rem] text-[var(--stamp)]">{error}</p>
          <button onClick={() => setError('')} className="t-label mt-2 hover:text-black">Dismiss</button>
        </div>
      )}

      {/* Connection Status */}
      {!status?.connected ? (
        <div className="margin-line mb-16">
          <p className="t-label mb-6">Connect your account</p>
          <p className="t-body mb-8 normal-case">
            Enter your Canvas instance URL and an API access token.
            Generate a token from Canvas → Account → Settings → New Access Token.
          </p>
          <form onSubmit={handleConnect} className="space-y-6">
            <div>
              <label className="t-label block mb-3">Canvas URL</label>
              <input type="url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)}
                className="input-field" placeholder="https://your-school.instructure.com" required />
            </div>
            <div>
              <label className="t-label block mb-3">API Token</label>
              <input type="password" value={apiToken} onChange={(e) => setApiToken(e.target.value)}
                className="input-field" placeholder="Token from Canvas settings" required />
            </div>
            <button type="submit" disabled={connecting} className="btn-black disabled:opacity-20">
              <Link2 className="w-3 h-3" strokeWidth={3} />
              {connecting ? 'Connecting...' : 'Connect'}
            </button>
          </form>
        </div>
      ) : (
        <>
          {/* Connected header */}
          <div className="flex items-center justify-between mb-10 pb-6 border-b-2 border-black">
            <div className="flex items-center gap-4">
              <div className="stamp stamp-black">
                <Check className="w-2.5 h-2.5" /> Connected
              </div>
              <span className="t-small">{status.userName} — {status.baseUrl}</span>
            </div>
            <div className="flex gap-3">
              <button onClick={handleSync} disabled={syncing} className="btn-ghost">
                <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing...' : 'Sync All'}
              </button>
              <button onClick={handleDisconnect} className="btn-ghost text-[var(--stamp)] hover:text-[var(--stamp)]">
                <Unlink className="w-3 h-3" /> Disconnect
              </button>
            </div>
          </div>

          {importResult && (
            <div className="border-2 border-black p-4 mb-10">
              {importResult.created && (
                <p className="t-small text-black">
                  Imported {importResult.created.length} assignment{importResult.created.length !== 1 ? 's' : ''}
                  {importResult.skipped?.length > 0 && ` (${importResult.skipped.length} already existed)`}
                </p>
              )}
              {importResult.synced !== undefined && (
                <p className="t-small text-black">Synced {importResult.synced} ticket{importResult.synced !== 1 ? 's' : ''}</p>
              )}
            </div>
          )}

          {/* Two-panel layout: courses list → assignments */}
          <div className="flex gap-6 min-h-[400px]">
            {/* Courses */}
            <div className="w-[240px] flex-shrink-0">
              <p className="t-label mb-4">Your Courses</p>
              <div className="rule-2 mb-4" />
              {loadingCourses ? (
                <p className="t-small py-6">Loading courses...</p>
              ) : courses.length === 0 ? (
                <p className="t-small py-6">No active courses</p>
              ) : (
                <div className="space-y-0">
                  {courses.map((course) => (
                    <button key={course.id} onClick={() => handleSelectCourse(course)}
                      className={`w-full text-left px-3 py-3 flex items-center gap-2 transition-all border-b border-[var(--ink-08)] ${
                        selectedCourse?.id === course.id
                          ? 'bg-black text-white'
                          : 'hover:bg-[var(--ink-04)]'
                      }`}>
                      <BookOpen className="w-3 h-3 flex-shrink-0" />
                      <span className="text-[0.5625rem] tracking-[0.04em] truncate">{course.name}</span>
                      <ChevronRight className="w-2.5 h-2.5 ml-auto flex-shrink-0 opacity-30" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Assignments */}
            <div className="flex-1">
              {!selectedCourse ? (
                <div className="flex items-center justify-center h-full">
                  <p className="t-small">Select a course to view assignments</p>
                </div>
              ) : loadingAssignments ? (
                <p className="t-small py-6">Loading assignments...</p>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <p className="t-label">{selectedCourse.name}</p>
                    <span className="t-small">{assignments.length} assignment{assignments.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="rule-2 mb-4" />

                  {assignments.length === 0 ? (
                    <p className="t-small py-6">No assignments found</p>
                  ) : (
                    <>
                      {/* Select all + import controls */}
                      <div className="flex items-center justify-between mb-4 pb-3 border-b border-[var(--ink-08)]">
                        <button onClick={selectAll} className="btn-ghost">
                          {selected.size === assignments.filter((a) => !a.imported).length && selected.size > 0
                            ? 'Deselect All' : 'Select All'}
                        </button>
                        <div className="flex items-center gap-3">
                          <select value={importCategory} onChange={(e) => setImportCategory(e.target.value)}
                            className="select-field text-[0.5rem]">
                            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                          <button onClick={handleImport} disabled={selected.size === 0 || importing}
                            className="btn-black disabled:opacity-20 py-2 px-4 text-[0.5rem]">
                            <Download className="w-2.5 h-2.5" strokeWidth={3} />
                            {importing ? 'Importing...' : `Import (${selected.size})`}
                          </button>
                        </div>
                      </div>

                      {/* Assignment list */}
                      <div className="space-y-0">
                        {assignments.map((a) => {
                          const isPast = a.dueAt && new Date(a.dueAt) < new Date();
                          return (
                            <div key={a.id}
                              className={`flex items-start gap-3 px-3 py-3 border-b border-[var(--ink-08)] transition-colors ${
                                a.imported ? 'opacity-40' : 'hover:bg-[var(--ink-04)]'
                              }`}>
                              {/* Checkbox */}
                              <button
                                onClick={() => !a.imported && toggleSelect(a.id)}
                                disabled={a.imported}
                                className={`mt-0.5 w-4 h-4 border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                                  a.imported
                                    ? 'border-[var(--ink-15)] bg-[var(--ink-08)]'
                                    : selected.has(a.id)
                                      ? 'border-black bg-black text-white'
                                      : 'border-[var(--ink-15)] hover:border-black'
                                }`}>
                                {(selected.has(a.id) || a.imported) && <Check className="w-2.5 h-2.5" strokeWidth={3} />}
                              </button>

                              {/* Info */}
                              <div className="flex-1 min-w-0">
                                <p className="text-[0.6875rem] tracking-[0.02em] truncate">{a.name}</p>
                                <div className="flex items-center gap-3 mt-1">
                                  {a.dueAt && (
                                    <span className={`text-[0.5rem] tracking-[0.06em] ${isPast ? 'text-[var(--stamp)]' : 'text-[var(--ink-30)]'}`}>
                                      Due {new Date(a.dueAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                                    </span>
                                  )}
                                  {a.pointsPossible && (
                                    <span className="t-small">{a.pointsPossible} pts</span>
                                  )}
                                  {a.graded && <span className="stamp stamp-black text-[0.4rem] py-0 px-1">Graded</span>}
                                  {a.submitted && !a.graded && <span className="stamp stamp-black text-[0.4rem] py-0 px-1">Submitted</span>}
                                  {a.imported && (
                                    <button onClick={() => navigate(`/tickets/${a.ticketId}`)}
                                      className="btn-ghost text-[0.5rem] gap-1">
                                      View ticket <ExternalLink className="w-2 h-2" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="rule mt-16 mb-10" />
        </>
      )}
    </div>
  );
}
