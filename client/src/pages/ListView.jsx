import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowUpDown, Trash2 } from 'lucide-react';
import { api } from '../api';
import { STATUSES, PRIORITIES, STATUS_CONFIG, PRIORITY_CONFIG } from '../constants';
import StatusBadge from '../components/StatusBadge';
import PriorityBadge from '../components/PriorityBadge';

export default function ListView() {
  const [tickets, setTickets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');
  const navigate = useNavigate();

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
  const handleSearch = (e) => { e.preventDefault(); setLoading(true); fetchData(); };
  const handleDelete = async (e, id) => { e.stopPropagation(); if (!confirm('Delete?')) return; await api.deleteTicket(id); setTickets((p) => p.filter((t) => t.id !== id)); };
  const toggleSort = (f) => { if (sortBy === f) setSortOrder((o) => o === 'asc' ? 'desc' : 'asc'); else { setSortBy(f); setSortOrder('asc'); } setLoading(true); };

  return (
    <div className="max-w-[960px] mx-auto">
      <div className="rule-8 mb-16" />

      {/* Header with lamp alongside */}
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
      </div>

      {/* Table */}
      <div className="border-t-[3px] border-black">
        <table className="w-full">
          <thead>
            <tr className="border-b-[2px] border-black">
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
              <tr><td colSpan={7} className="py-20 text-center t-small">Loading...</td></tr>
            ) : tickets.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-16 text-center">
                  <img src="/art/couchrandom.jpg" alt="" className="w-[100px] mx-auto mix-blend-multiply opacity-90 mb-4" />
                  <p className="t-small">No entries found</p>
                </td>
              </tr>
            ) : tickets.map((ticket) => (
              <tr key={ticket.id} onClick={() => navigate(`/tickets/${ticket.id}`)}
                className="cursor-pointer hover:bg-[var(--ink-04)] transition-colors border-b border-[var(--ink-08)]">
                <td className="py-4 pr-4 text-[0.6875rem] max-w-[280px] truncate">{ticket.title}</td>
                <td className="py-4 pr-4"><StatusBadge status={ticket.status} /></td>
                <td className="py-4 pr-4"><PriorityBadge priority={ticket.priority} /></td>
                <td className="py-4 pr-4 t-small">{ticket.category?.name || '—'}</td>
                <td className="py-4 pr-4 t-small">{ticket.dueDate ? new Date(ticket.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</td>
                <td className="py-4 pr-4 t-small">{new Date(ticket.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                <td className="py-4">
                  <button onClick={(e) => handleDelete(e, ticket.id)} className="text-[var(--ink-15)] hover:text-[var(--stamp)] transition-all p-1">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rule mt-16 mb-10" />
    </div>
  );
}
