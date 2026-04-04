import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus } from 'lucide-react';
import { api } from '../api';
import { STATUSES, PRIORITIES, STATUS_CONFIG, PRIORITY_CONFIG } from '../constants';

export default function CreateTicket() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [labels, setLabels] = useState([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', status: 'BACKLOG', priority: 'MEDIUM', categoryId: '', labelIds: [], dueDate: '' });

  useEffect(() => {
    Promise.all([api.getCategories(), api.getLabels()]).then(([c, l]) => {
      setCategories(c); setLabels(l);
      if (c.length > 0) setForm((f) => ({ ...f, categoryId: c[0].id }));
    });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.categoryId) return;
    setSaving(true);
    try { const t = await api.createTicket(form); navigate(`/tickets/${t.id}`); } catch (e) { console.error(e); setSaving(false); }
  };

  const toggleLabel = (lid) => { setForm((f) => ({ ...f, labelIds: f.labelIds.includes(lid) ? f.labelIds.filter((x) => x !== lid) : [...f.labelIds, lid] })); };

  return (
    <div className="max-w-[640px] mx-auto">
      <button onClick={() => navigate(-1)} className="btn-ghost mb-10">
        <ArrowLeft className="w-3 h-3" /> Back
      </button>

      <div className="rule-8 mb-16" />

      {/* Header with scribbling art alongside */}
      <div className="flex items-start gap-10 mb-16">
        <div className="flex-1">
          <p className="t-label mb-6">Create</p>
          <h1 className="t-display text-[2.5rem] mb-4">New Entry</h1>
          <div className="rule-4" style={{ background: 'var(--stamp)', width: '60px' }} />
        </div>
        <img src="/art/handblack.jpg" alt="" className="w-[140px] mix-blend-multiply opacity-90 flex-shrink-0 -mt-4" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-10 margin-line">
        <div>
          <label className="t-label block mb-4">Title</label>
          <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="input-field input-field-large" placeholder="What needs to be done?" autoFocus />
        </div>

        <div>
          <label className="t-label block mb-4">Description</label>
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={8} className="textarea-field" placeholder="Notes, context, details..." />
        </div>

        <div className="grid grid-cols-3 gap-6">
          <div>
            <label className="t-label block mb-3">Status</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="select-field w-full">
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>)}
            </select>
          </div>
          <div>
            <label className="t-label block mb-3">Priority</label>
            <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="select-field w-full">
              {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>)}
            </select>
          </div>
          <div>
            <label className="t-label block mb-3">Category</label>
            <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className="select-field w-full">
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="t-label block mb-4">Due Date</label>
          <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
            className="input-field w-56 text-[0.6875rem]" />
        </div>

        <div>
          <label className="t-label block mb-4">Labels</label>
          <div className="flex flex-wrap gap-2">
            {labels.map((label) => {
              const active = form.labelIds.includes(label.id);
              return (
                <button key={label.id} type="button" onClick={() => toggleLabel(label.id)}
                  className={`text-[0.5rem] uppercase tracking-[0.14em] px-3 py-2 border-2 transition-all ${
                    active ? 'border-black bg-black text-white' : 'border-[var(--ink-08)] text-[var(--ink-15)] hover:border-black hover:text-black'
                  }`}>
                  {label.name}
                </button>
              );
            })}
            {labels.length === 0 && <p className="t-small">No labels</p>}
          </div>
        </div>

        <div className="pt-6">
          <button type="submit" disabled={saving || !form.title.trim() || !form.categoryId}
            className="btn-black disabled:opacity-20 disabled:cursor-not-allowed">
            <Plus className="w-3 h-3" strokeWidth={3} /> {saving ? 'Filing...' : 'File Entry'}
          </button>
        </div>
      </form>

      <div className="rule mt-20 mb-10" />
    </div>
  );
}
