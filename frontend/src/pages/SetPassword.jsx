import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../api/AuthContext';

export default function SetPassword() {
  const { setPassword } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPasswordValue] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (password.length < 8) return setError('Password must be at least 8 characters');
    if (password !== confirm) return setError('Passwords do not match');
    setLoading(true);
    try {
      const user = await setPassword(token, password);
      navigate(user.role === 'ADMIN' || user.role === 'STAFF' ? '/admin' : '/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-row">
      <div className="auth-side">
        <div>
          <span className="pill pill-cobalt" style={{ background: 'rgba(36,81,255,.18)', color: '#9DB2FF' }}>Activate account</span>
          <p className="quote" style={{ marginTop: 22 }}>&quot;One dashboard for every order — track, download, and manage addresses.&quot;</p>
        </div>
      </div>

      <div className="card auth-card">
        <h2>Set your password</h2>
        <p className="sub">Choose a password to activate your Comonn customer portal.</p>
        {!token ? (
          <div className="error-text" style={{ marginTop: 16 }}>
            This link is missing its token. Please use the link from your email, or request a new one from the <Link to="/forgot-password">forgot password</Link> page.
          </div>
        ) : (
          <form className="form-stack" onSubmit={submit}>
            <div className="field">
              <label>New password</label>
              <input className="input" type="password" placeholder="At least 8 characters" required value={password} onChange={(e) => setPasswordValue(e.target.value)} />
            </div>
            <div className="field">
              <label>Confirm password</label>
              <input className="input" type="password" placeholder="Re-enter password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            {error && (
              <div className="error-text">
                {error} {/invalid|expired/i.test(error) && <Link to="/forgot-password">Request a new link</Link>}
              </div>
            )}
            <button className="btn btn-primary block" style={{ padding: 13 }} disabled={loading}>
              {loading ? 'Activating…' : 'Set password & log in'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
