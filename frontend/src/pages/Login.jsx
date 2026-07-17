import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../api/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="auth-row">
      <div className="auth-side">
        <div>
          <span className="pill pill-cobalt" style={{ background: 'rgba(36,81,255,.18)', color: '#9DB2FF' }}>Welcome back</span>
          <p className="quote" style={{ marginTop: 22 }}>&quot;Ship anywhere. Track everything. One dashboard for every order.&quot;</p>
        </div>
        <div className="auth-stats">
          <div><b>5</b><span>Countries served</span></div>
          <div><b>24/7</b><span>Support line</span></div>
          <div><b>₹1.5L</b><span>Transit warranty</span></div>
        </div>
      </div>

      <div className="card auth-card">
        <h2>Log in to Comonn</h2>
        <p className="sub">Access your order history, saved addresses and promotions.</p>
        <form className="form-stack" onSubmit={submit}>
          <div className="field">
            <label>Email</label>
            <input className="input" type="email" placeholder="you@email.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label>Password</label>
            <div className="pw-row">
              <input
                className="input"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button type="button" className="toggle" onClick={() => setShowPassword((s) => !s)}>
                {showPassword ? 'HIDE' : 'SHOW'}
              </button>
            </div>
            <span className="form-foot-link"><a href="#" onClick={(e) => e.preventDefault()}>Forgot password?</a></span>
          </div>
          {error && <div className="error-text">{error}</div>}
          <button className="btn btn-primary block" style={{ padding: 13 }} disabled={loading}>
            {loading ? 'Logging in…' : 'Sign In'}
          </button>
        </form>
        <div className="divider-text">New to Comonn?</div>
        <Link to="/register" className="btn btn-outline block" style={{ padding: 12 }}>Create an account</Link>
      </div>
    </div>
  );
}
