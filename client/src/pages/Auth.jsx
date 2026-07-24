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
    <div className="min-h-screen bg-white flex items-center justify-center px-8">
      <div className="w-full max-w-[360px]">
        <p className="t-label mb-4 text-center">{mode === 'login' ? 'Sign In' : 'Create Account'}</p>
        <h1
          className="mb-12 text-center"
          style={{ fontFamily: "'Magnetic Drawing', 'Gochi Hand', cursive", fontSize: '2.6rem', lineHeight: 1.1 }}
        >
          {mode === 'login' ? 'Welcome Back' : 'New Entry'}
        </h1>

        {error && (
          <p className="text-[0.5625rem] text-[var(--stamp)] tracking-[0.04em] text-center mb-8">{error}</p>
        )}

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

        <p className="t-small text-center mt-8">
          {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
          <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
            className="text-black underline underline-offset-2 hover:text-[var(--stamp)] transition-colors">
            {mode === 'login' ? 'Register' : 'Sign In'}
          </button>
        </p>

        <img src="/art/bloom.png" alt="" className="w-[150px] mx-auto mt-14 mix-blend-multiply" />
      </div>
    </div>
  );
}
