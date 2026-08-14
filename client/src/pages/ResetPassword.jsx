import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { api, setToken } from '../api';

// Landing page for the emailed reset link: /reset?token=...&email=...
export default function ResetPassword({ onLogin }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';
  const email = params.get('email') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const badLink = !token || !email;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const result = await api.resetPassword({ email, token, password });
      setToken(result.token);
      onLogin(result.user);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-8">
      <div className="w-full max-w-[360px]">
        <p className="t-label mb-4 text-center">Password Recovery</p>
        <h1
          className="mb-12 text-center"
          style={{ fontFamily: "'Magnetic Drawing', 'Gochi Hand', cursive", fontSize: '2.6rem', lineHeight: 1.1 }}
        >
          A New Key
        </h1>

        {error && (
          <p className="text-[0.5625rem] text-[var(--stamp)] tracking-[0.04em] text-center mb-8">{error}</p>
        )}

        {badLink ? (
          <div className="text-center space-y-6">
            <p className="t-small leading-relaxed">
              This reset link is incomplete. Request a fresh one from the sign-in page.
            </p>
            <button
              onClick={() => navigate('/')}
              className="t-small text-black underline underline-offset-2 hover:text-[var(--stamp)] transition-colors"
            >
              Back to Sign In
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="t-label block mb-3">Account</label>
              <p className="t-small">{email}</p>
            </div>

            <div>
              <label className="t-label block mb-3">New Password</label>
              <input type="password" value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field" placeholder="6+ characters" required minLength={6} autoFocus />
            </div>

            <div>
              <label className="t-label block mb-3">Confirm Password</label>
              <input type="password" value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="input-field" placeholder="Once more" required minLength={6} />
            </div>

            <div className="pt-4">
              <button type="submit" disabled={loading}
                className="btn-black w-full justify-center disabled:opacity-20">
                <ArrowRight className="w-3 h-3" strokeWidth={3} />
                {loading ? 'Working...' : 'File New Password'}
              </button>
            </div>
          </form>
        )}

        <img src="/art/bloom.png" alt="" className="w-[150px] mx-auto mt-14 mix-blend-multiply" />
      </div>
    </div>
  );
}
