import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { api, setToken } from '../api';

export default function Auth({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', name: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = mode === 'login'
        ? await api.login({ email: form.email, password: form.password })
        : await api.register(form);
      setToken(result.token);
      onLogin(result.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex">
      {/* Left panel — art */}
      <div className="hidden lg:flex w-[45%] bg-black items-end justify-center p-10 relative overflow-hidden">
        <img src="/art/buildings.jpg" alt="" className="absolute inset-0 w-full h-full object-cover opacity-40 mix-blend-lighten" />
        <div className="relative z-10 text-white mb-10">
          <div className="h-[4px] bg-[var(--stamp)] w-[60px] mb-8" />
          <p className="text-[2.5rem] leading-[0.9] tracking-[-0.04em] uppercase mb-4">
            The Ledger
          </p>
          <p className="text-[0.625rem] tracking-[0.12em] uppercase opacity-50">
            Task management, filed properly.
          </p>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center px-8">
        <div className="w-full max-w-[360px]">
          {/* Mobile logo */}
          <div className="lg:hidden mb-12 text-center">
            <img src="/art/ledgerlogo.jpg" alt="" className="w-[60px] mx-auto mb-3 mix-blend-multiply" />
            <p className="text-[1.1rem] leading-[0.85] tracking-[-0.04em] uppercase">
              The Ledger
            </p>
          </div>

          <div className="rule-8 mb-12" />

          <p className="t-label mb-6">{mode === 'login' ? 'Sign In' : 'Create Account'}</p>
          <h1 className="t-display text-[2rem] mb-4">
            {mode === 'login' ? 'Welcome Back' : 'New Entry'}
          </h1>
          <div className="rule-4 mb-10" style={{ background: 'var(--stamp)', width: '40px' }} />

          {error && (
            <div className="border-2 border-[var(--stamp)] p-3 mb-8">
              <p className="text-[0.5625rem] text-[var(--stamp)] tracking-[0.04em]">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6 margin-line">
            {mode === 'register' && (
              <div>
                <label className="t-label block mb-3">Name</label>
                <input type="text" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="input-field" placeholder="Your name" required />
              </div>
            )}

            <div>
              <label className="t-label block mb-3">Email</label>
              <input type="email" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="input-field" placeholder="you@email.com" required autoFocus />
            </div>

            <div>
              <label className="t-label block mb-3">Password</label>
              <input type="password" value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="input-field" placeholder={mode === 'register' ? '6+ characters' : 'Your password'} required
                minLength={mode === 'register' ? 6 : undefined} />
            </div>

            <div className="pt-4">
              <button type="submit" disabled={loading}
                className="btn-black w-full justify-center disabled:opacity-20">
                <ArrowRight className="w-3 h-3" strokeWidth={3} />
                {loading ? 'Working...' : mode === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            </div>
          </form>

          <div className="rule mt-10 mb-6" />

          <p className="t-small text-center">
            {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
            <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
              className="text-black underline underline-offset-2 hover:text-[var(--stamp)] transition-colors">
              {mode === 'login' ? 'Register' : 'Sign In'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
