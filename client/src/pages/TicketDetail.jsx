import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Trash2, Clock, Calendar } from 'lucide-react';
import { api } from '../api';
import { STATUSES, PRIORITIES, STATUS_CONFIG, PRIORITY_CONFIG } from '../constants';

export default function TicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState(null);
  const [categories, setCategories] = useState([]);
  const [labels, setLabels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});

  useEffect(() => {
    Promise.all([api.getTicket(id), api.getCategories(), api.getLabels()])
      .then(([t, c, l]) => {
        setTicket(t);
        setForm({ title: t.title, description: t.description || '', status: t.status, priority: t.priority, categoryId: t.categoryId, labelIds: t.labels.map((l) => l.id), dueDate: t.dueDate ? t.dueDate.slice(0, 10) : '' });
        setCategories(c); setLabels(l);
      }).catch(console.error).finally(() => setLoading(false));
  }, [id]);

  const handleSave = async () => { setSaving(true); try { const u = await api.updateTicket(id, form); setTicket(u); } catch (e) { console.error(e); } setSaving(false); };
  const handleDelete = async () => { if (!confirm('Delete permanently?')) return; await api.deleteTicket(id); navigate('/list'); };
  const toggleLabel = (lid) => { setForm((f) => ({ ...f, labelIds: f.labelIds.includes(lid) ? f.labelIds.filter((x) => x !== lid) : [...f.labelIds, lid] })); };

  if (loading) return <div className="max-w-[900px] mx-auto"><div className="rule-8 mb-20" /></div>;
  if (!ticket) return <div className="t-small">Not found</div>;

  return (
    <div className="max-w-[900px] mx-auto">
      <button onClick={() => navigate(-1)} className="btn-ghost mb-10">
        <ArrowLeft className="w-3 h-3" /> Back
      </button>

      <div className="rule-8 mb-16" />

      <div className="grid grid-cols-[1fr_240px] gap-16">
        {/* Main */}
        <div className="margin-line space-y-8">
          <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="input-field input-field-large" placeholder="Title" />

          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={18} className="textarea-field" placeholder="Notes..." />

          <div className="flex gap-4 pt-4">
            <button onClick={handleSave} disabled={saving} className="btn-black">
              <Save className="w-3 h-3" /> {saving ? 'Saving...' : 'Save'}
            </button>
            <button onClick={handleDelete} className="btn-red">
              <Trash2 className="w-3 h-3" /> Delete
            </button>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-8 stagger">
          {/* Stamps art — strong editorial element at top of sidebar */}
          <img src="/art/randomstamps.jpg" alt="" className="w-[120px] mx-auto mix-blend-multiply opacity-90" />

          <div>
            <p className="t-label mb-4">Status</p>
            <div className="space-y-0">
              {STATUSES.map((s) => {
                const active = form.status === s;
                return (
                  <button key={s} onClick={() => setForm({ ...form, status: s })}
                    className={`w-full text-left px-3 py-2.5 text-[0.625rem] uppercase tracking-[0.12em] flex items-center gap-2 transition-all ${
                      active ? 'bg-black text-white' : 'text-[var(--ink-30)] hover:text-black'
                    }`}>
                    <span className={`w-1.5 h-1.5 ${active ? 'bg-white' : 'bg-[var(--ink-15)]'}`} />
                    {STATUS_CONFIG[s].label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="t-label mb-4">Priority</p>
            <div className="space-y-0">
              {PRIORITIES.map((p) => {
                const active = form.priority === p;
                const isCrit = p === 'CRITICAL';
                return (
                  <button key={p} onClick={() => setForm({ ...form, priority: p })}
                    className={`w-full text-left px-3 py-2.5 text-[0.625rem] uppercase tracking-[0.12em] transition-all ${
                      active ? (isCrit ? 'bg-[var(--stamp)] text-white' : 'bg-black text-white') : 'text-[var(--ink-30)] hover:text-black'
                    }`}>
                    {PRIORITY_CONFIG[p].label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="t-label mb-4">Category</p>
            <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className="select-field w-full">
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div>
            <p className="t-label mb-4">Labels</p>
            <div className="flex flex-wrap gap-2">
              {labels.map((label) => {
                const active = form.labelIds.includes(label.id);
                return (
                  <button key={label.id} onClick={() => toggleLabel(label.id)}
                    className={`text-[0.5rem] uppercase tracking-[0.14em] px-3 py-2 border-2 transition-all ${
                      active ? 'border-black bg-black text-white' : 'border-[var(--ink-08)] text-[var(--ink-15)] hover:border-black hover:text-black'
                    }`}>
                    {label.name}
                  </button>
                );
              })}
              {labels.length === 0 && <p className="t-small">None</p>}
            </div>
          </div>

          <div>
            <p className="t-label mb-4">Due Date</p>
            <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              className="input-field text-[0.6875rem]" />
          </div>

          <div className="space-y-2 pt-4">
            <div className="flex items-center gap-2 t-small"><Calendar className="w-3 h-3" /> Filed {new Date(ticket.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
            <div className="flex items-center gap-2 t-small"><Clock className="w-3 h-3" /> Edited {new Date(ticket.updatedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
