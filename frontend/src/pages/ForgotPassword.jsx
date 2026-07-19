import { useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await client.post('/auth/forgot-password', { email });
    } finally {
      setLoading(false);
      setSent(true);
    }
  }

  return (
    <div className="auth-row">
      <div className="auth-side">
        <div>
          <span className="pill pill-cobalt" style={{ background: 'rgba(36,81,255,.18)', color: '#9DB2FF' }}>Account recovery</span>
          <p className="quote" style={{ marginTop: 22 }}>&quot;Ship anywhere. Track everything. One dashboard for every order.&quot;</p>
        </div>
      </div>

      <div className="card auth-card">
        <h2>Forgot password?</h2>
        <p className="sub">Enter your account email and we'll send you a secure link to set a new password.</p>
        {sent ? (
          <div className="empty-state card" style={{ marginTop: 16 }}>
            <p>If an account exists for <b>{email}</b>, a password reset link is on its way. It expires in 24 hours.</p>
          </div>
        ) : (
          <form className="form-stack" onSubmit={submit}>
            <div className="field">
              <label>Email</label>
              <input className="input" type="email" placeholder="you@email.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <button className="btn btn-primary block" style={{ padding: 13 }} disabled={loading}>
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        )}
        <div className="divider-text">Remembered your password?</div>
        <Link to="/login" className="btn btn-outline block" style={{ padding: 12 }}>Back to login</Link>
      </div>
    </div>
  );
}
