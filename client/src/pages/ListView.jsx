import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowUpDown, Trash2, Check, X } from 'lucide-react';
import { api } from '../api';
import { STATUSES, PRIORITIES, STATUS_CONFIG, PRIORITY_CONFIG } from '../constants';
import StatusBadge from '../components/StatusBadge';
import PriorityBadge from '../components/PriorityBadge';
import UndoToast from '../components/UndoToast';

const TIME_FILTERS = [
  { value: '', label: 'All Time' },
  { value: '7', label: 'Last 7 Days' },
  { value: '30', label: 'Last 30 Days' },
  { value: '90', label: 'Last 3 Months' },
  { value: '180', label: 'Last 6 Months' },
  { value: 'older', label: 'Older Than 6 Months' },
];

export default function ListView() {
  const [tickets, setTickets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterTime, setFilterTime] = useState('');
  const [sortBy, setSortBy] = useState('urgency');
  const [sortOrder, setSortOrder] = useState('asc');
  const [selected, setSelected] = useState(new Set());
  const [pendingDelete, setPendingDelete] = useState(null);
  const navigate = useNavigate();

  const selectMode = selected.size > 0;

  const fetchData = () => {
    const params = {};
    if (search) params.search = search;
    if (filterStatus) params.status = filterStatus;
    if (filterPriority) params.priority = filterPriority;
    if (filterCategory) params.categoryId = filterCategory;
    params.sortBy = sortBy; params.sortOrder = sortOrder;
    Promise.all([api.getTickets(params), api.getCategories()])
      .then(([t, c]) => { setTickets(t); setCategories(c); })
      .catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [filterStatus, filterPriority, filterCategory, sortBy, sortOrder]);

  // Refresh when Gus creates tickets
  useEffect(() => {
    const handler = () => fetchData();
    window.addEventListener('gus-tickets-created', handler);
    return () => window.removeEventListener('gus-tickets-created', handler);
  }, []);

  const handleSearch = (e) => { e.preventDefault(); setLoading(true); fetchData(); };
  const toggleSort = (f) => { if (sortBy === f) setSortOrder((o) => o === 'asc' ? 'desc' : 'asc'); else { setSortBy(f); setSortOrder('asc'); } setLoading(true); };

  // Apply time filter client-side
  const timeFiltered = tickets.filter((t) => {
    if (!filterTime) return true;
    const created = new Date(t.createdAt);
    const now = new Date();
    const daysAgo = (now - created) / (1000 * 60 * 60 * 24);
    if (filterTime === 'older') return daysAgo > 180;
    return daysAgo <= Number(filterTime);
  });

  // Hide pending deletes
  const visibleTickets = timeFiltered.filter((t) => !pendingDelete?.ids.includes(t.id));

  const toggleSelect = (e, id) => {
    e.stopPropagation();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === visibleTickets.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visibleTickets.map((t) => t.id)));
    }
  };

  const handleBulkDelete = () => {
    if (selected.size === 0) return;
    const ids = [...selected];
    const deletedTickets = tickets.filter((t) => ids.includes(t.id));
    setPendingDelete({ ids, tickets: deletedTickets });
    setSelected(new Set());
  };

  const handleSingleDelete = (e, id) => {
    e.stopPropagation();
    const ticket = tickets.find((t) => t.id === id);
    setPendingDelete({ ids: [id], tickets: [ticket] });
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    await Promise.all(pendingDelete.ids.map((id) => api.deleteTicket(id).catch(() => {})));
    setTickets((prev) => prev.filter((t) => !pendingDelete.ids.includes(t.id)));
    setPendingDelete(null);
  };

  const undoDelete = () => setPendingDelete(null);

  const deleteMsg = pendingDelete
    ? pendingDelete.ids.length === 1
      ? `"${pendingDelete.tickets[0].title}" deleted`
      : `${pendingDelete.ids.length} entries deleted`
    : '';

  return (
    <div className="max-w-[960px] mx-auto">
      <div className="rule-8 mb-16" />

      {/* Header */}
      <div className="flex items-end justify-between mb-16">
        <div>
          <p className="t-label mb-6">Archive</p>
          <h1 className="t-display text-[2.5rem]">All Entries</h1>
        </div>
        <img src="/art/randomstamps.jpg" alt="" className="w-[140px] mix-blend-multiply opacity-90" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-10">
        <form onSubmit={handleSearch} className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--ink-15)]" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..." className="input-field pl-6 text-[0.6875rem]" />
        </form>
        <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setLoading(true); }} className="select-field">
          <option value="">All Statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>)}
        </select>
        <select value={filterPriority} onChange={(e) => { setFilterPriority(e.target.value); setLoading(true); }} className="select-field">
          <option value="">All Priorities</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>)}
        </select>
        <select value={filterCategory} onChange={(e) => { setFilterCategory(e.target.value); setLoading(true); }} className="select-field">
          <option value="">All Categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filterTime} onChange={(e) => setFilterTime(e.target.value)} className="select-field">
          {TIME_FILTERS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      {/* Bulk action bar */}
      {selectMode && (
        <div className="flex items-center justify-between border-2 border-black p-3 mb-6 bulk-bar">
          <div className="flex items-center gap-4">
            <span className="t-label text-black">{selected.size} selected</span>
            <button onClick={selectAll} className="btn-ghost text-[0.5rem]">
              {selected.size === visibleTickets.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setSelected(new Set())} className="btn-ghost">
              <X className="w-3 h-3" /> Cancel
            </button>
            <button onClick={handleBulkDelete}
              className="btn-red py-2 px-4 text-[0.5rem]">
              <Trash2 className="w-3 h-3" strokeWidth={3} />
              Delete {selected.size}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="border-t-[3px] border-black">
        <table className="w-full">
          <thead>
            <tr className="border-b-[2px] border-black">
              <th className="w-8 py-4 pr-2">
                <button onClick={selectAll}
                  className={`w-4 h-4 border-2 flex items-center justify-center transition-all ${
                    selected.size === visibleTickets.length && visibleTickets.length > 0
                      ? 'border-black bg-black text-white' : 'border-[var(--ink-15)] hover:border-black'
                  }`}>
                  {selected.size === visibleTickets.length && visibleTickets.length > 0 && <Check className="w-2.5 h-2.5" strokeWidth={3} />}
                </button>
              </th>
              {[
                { key: 'title', label: 'Entry' },
                { key: 'status', label: 'Status' },
                { key: 'priority', label: 'Priority' },
                { key: 'category', label: 'Category' },
                { key: 'dueDate', label: 'Due' },
                { key: 'createdAt', label: 'Filed' },
              ].map(({ key, label }) => (
                <th key={key} onClick={() => toggleSort(key === 'category' ? 'categoryId' : key)}
                  className="text-left px-0 pr-4 py-4 t-label cursor-pointer hover:text-black transition-colors">
                  <div className="flex items-center gap-1">{label}<ArrowUpDown className="w-2.5 h-2.5 opacity-30" /></div>
                </th>
              ))}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="py-20 text-center">
                <div className="flex flex-col items-center">
                  <div className="loader mb-4"><div className="loader-bar" /><div className="loader-bar" /><div className="loader-bar" /><div className="loader-bar" /></div>
                  <p className="t-label">Loading entries...</p>
                </div>
              </td></tr>
            ) : visibleTickets.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-16 text-center">
                  <img src="/art/couchrandom.jpg" alt="" className="w-[100px] mx-auto mix-blend-multiply opacity-90 mb-4" />
                  <p className="t-small">No entries found</p>
                </td>
              </tr>
            ) : visibleTickets.map((ticket) => (
              <tr key={ticket.id}
                onClick={() => !selectMode && navigate(`/tickets/${ticket.id}`)}
                className={`transition-all border-b border-[var(--ink-08)] cursor-pointer hover:bg-[var(--ink-04)] ${
                  selected.has(ticket.id) ? 'bg-[var(--ink-04)]' : ''
                }`}>
                <td className="py-4 pr-2">
                  <button onClick={(e) => toggleSelect(e, ticket.id)}
                    className={`w-4 h-4 border-2 flex items-center justify-center transition-all ${
                      selected.has(ticket.id)
                        ? 'border-black bg-black text-white' : 'border-[var(--ink-15)] hover:border-black'
                    }`}>
                    {selected.has(ticket.id) && <Check className="w-2.5 h-2.5" strokeWidth={3} />}
                  </button>
                </td>
                <td className="py-4 pr-4 text-[0.6875rem] max-w-[260px] truncate">{ticket.title}</td>
                <td className="py-4 pr-4"><StatusBadge status={ticket.status} /></td>
                <td className="py-4 pr-4"><PriorityBadge priority={ticket.priority} /></td>
                <td className="py-4 pr-4 t-small">{ticket.category?.name || '—'}</td>
                <td className="py-4 pr-4 t-small">{ticket.dueDate ? new Date(ticket.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</td>
                <td className="py-4 pr-4 t-small">{new Date(ticket.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                <td className="py-4">
                  <button onClick={(e) => handleSingleDelete(e, ticket.id)} className="text-[var(--ink-15)] hover:text-[var(--stamp)] transition-all p-1">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Undo toast */}
      {pendingDelete && (
        <UndoToast
          message={deleteMsg}
          onUndo={undoDelete}
          onExpire={confirmDelete}
        />
      )}

      <div className="rule mt-16 mb-10" />
    </div>
  );
}
