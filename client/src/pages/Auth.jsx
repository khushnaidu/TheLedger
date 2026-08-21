import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { api, setToken } from '../api';
import { resolveEdition, setEdition } from '../lib/edition';

export default function Auth({ onLogin }) {
  const [mode, setMode] = useState('login'); // login | register | forgot
  const [form, setForm] = useState({ email: '', name: '', password: '', code: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'forgot') {
        await api.forgotPassword(form.email);
        setSent(true);
      } else {
        const result = mode === 'login'
          ? await api.login({ email: form.email, password: form.password })
          : await api.register({ email: form.email, name: form.name, password: form.password });
        setEdition(mode === 'login' ? resolveEdition(form.code) : 'public');
        setToken(result.token);
        onLogin(result.user);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (next) => {
    setMode(next);
    setError('');
    setSent(false);
  };

  const titles = { login: 'Welcome Back', register: 'New Entry', forgot: 'Lost the Key' };
  const labels = { login: 'Sign In', register: 'Create Account', forgot: 'Password Recovery' };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-8">
      <div className="w-full max-w-[360px]">
        <p className="t-label mb-4 text-center">{labels[mode]}</p>
        <h1
          className="mb-12 text-center"
          style={{ fontFamily: "'Magnetic Drawing', 'Gochi Hand', cursive", fontSize: '2.6rem', lineHeight: 1.1 }}
        >
          {titles[mode]}
        </h1>

        {error && (
          <p className="text-[0.5625rem] text-[var(--stamp)] tracking-[0.04em] text-center mb-8">{error}</p>
        )}

        {mode === 'forgot' && sent ? (
          <div className="text-center space-y-6">
            <p className="t-small leading-relaxed">
              If a ledger is held under <span className="font-bold">{form.email}</span>, a reset
              link has been dispatched. Check the inbox — it expires in one hour.
            </p>
            <button
              onClick={() => switchMode('login')}
              className="t-small text-black underline underline-offset-2 hover:text-[var(--stamp)] transition-colors"
            >
              Back to Sign In
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
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

            {mode !== 'forgot' && (
              <div>
                <div className="flex items-baseline justify-between mb-3">
                  <label className="t-label">Password</label>
                  {mode === 'login' && (
                    <button type="button" onClick={() => switchMode('forgot')}
                      className="text-[0.5rem] tracking-[0.1em] uppercase text-[var(--ink-30)] hover:text-[var(--stamp)] transition-colors">
                      Forgot?
                    </button>
                  )}
                </div>
                <input type="password" value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="input-field" placeholder={mode === 'register' ? '6+ characters' : 'Your password'} required
                  minLength={mode === 'register' ? 6 : undefined} />
              </div>
            )}

            {mode === 'login' && (
              <div>
                <label className="t-label block mb-3">Special Code · Optional</label>
                <input type="text" value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  className="input-field" placeholder="For those who know" autoComplete="off" />
              </div>
            )}

            <div className="pt-4">
              <button type="submit" disabled={loading}
                className="btn-black w-full justify-center disabled:opacity-20">
                <ArrowRight className="w-3 h-3" strokeWidth={3} />
                {loading ? 'Working...'
                  : mode === 'login' ? 'Sign In'
                  : mode === 'register' ? 'Create Account'
                  : 'Send Reset Link'}
              </button>
            </div>
          </form>
        )}

        {!(mode === 'forgot' && sent) && (
          <p className="t-small text-center mt-8">
            {mode === 'login' ? "Don't have an account?"
              : mode === 'register' ? 'Already have an account?'
              : 'Remembered it after all?'}{' '}
            <button onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
              className="text-black underline underline-offset-2 hover:text-[var(--stamp)] transition-colors">
              {mode === 'login' ? 'Register' : 'Sign In'}
            </button>
          </p>
        )}

        <img src="/art/bloom.png" alt="" className="w-[150px] mx-auto mt-14 mix-blend-multiply" />
      </div>
    </div>
  );
}
