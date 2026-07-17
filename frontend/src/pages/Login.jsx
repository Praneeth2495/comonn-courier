import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../api/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(email, password);
      navigate(user.role === 'ADMIN' || user.role === 'STAFF' ? '/admin' : '/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="wrap" style={{ maxWidth: 420, padding: '64px 32px' }}>
      <h1 className="h-lg" style={{ marginBottom: 6 }}>Welcome back</h1>
      <p className="lead" style={{ marginBottom: 24 }}>Log in to manage your shipments.</p>
      <form className="card form-stack" style={{ padding: 28 }} onSubmit={submit}>
        <div className="field">
          <label>Email</label>
          <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label>Password</label>
          <input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <div className="error-text">{error}</div>}
        <button className="btn btn-primary block" disabled={loading}>{loading ? 'Logging in…' : 'Log in'}</button>
        <p style={{ textAlign: 'center', fontSize: 13.5 }}>
          No account? <Link to="/register" style={{ color: 'var(--cobalt)', fontWeight: 600 }}>Create one</Link>
        </p>
      </form>
    </div>
  );
}
