import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../api/AuthContext';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', company: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(form);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="wrap" style={{ maxWidth: 480, padding: '64px 32px' }}>
      <h1 className="h-lg" style={{ marginBottom: 6 }}>Create your account</h1>
      <p className="lead" style={{ marginBottom: 24 }}>Book faster and track every shipment in one place.</p>
      <form className="card form-stack" style={{ padding: 28 }} onSubmit={submit}>
        <div className="field">
          <label>Full name</label>
          <input className="input" required value={form.fullName} onChange={(e) => update('fullName', e.target.value)} />
        </div>
        <div className="field">
          <label>Email</label>
          <input className="input" type="email" required value={form.email} onChange={(e) => update('email', e.target.value)} />
        </div>
        <div className="grid-2">
          <div className="field">
            <label>Phone</label>
            <input className="input" value={form.phone} onChange={(e) => update('phone', e.target.value)} />
          </div>
          <div className="field">
            <label>Company (optional)</label>
            <input className="input" value={form.company} onChange={(e) => update('company', e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>Password</label>
          <input className="input" type="password" required minLength={8} value={form.password} onChange={(e) => update('password', e.target.value)} />
        </div>
        {error && <div className="error-text">{error}</div>}
        <button className="btn btn-primary block" disabled={loading}>{loading ? 'Creating account…' : 'Create account'}</button>
        <p style={{ textAlign: 'center', fontSize: 13.5 }}>
          Already have an account? <Link to="/login" style={{ color: 'var(--cobalt)', fontWeight: 600 }}>Log in</Link>
        </p>
      </form>
    </div>
  );
}
