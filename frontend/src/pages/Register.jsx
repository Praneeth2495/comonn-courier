import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../api/AuthContext';

const COUNTRY_CODES = ['🇮🇳 +91', '🇦🇺 +61', '🇨🇦 +1', '🇳🇿 +64', '🇬🇧 +44', '🇺🇸 +1', '🇪🇺 +32'];

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    fullName: '',
    company: '',
    countryCode: COUNTRY_CODES[0],
    phoneNumber: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    setError('');

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await register({
        fullName: form.fullName,
        company: form.company,
        email: form.email,
        phone: `${form.countryCode.split(' ')[1]} ${form.phoneNumber}`.trim(),
        password: form.password,
      });
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="center-card-wrap">
      <form className="card center-card" onSubmit={submit}>
        <div className="airmail-edge" style={{ borderRadius: '18px 18px 0 0', margin: '-44px -44px 30px' }} />
        <h2 className="h-lg" style={{ marginBottom: 6 }}>Create your account</h2>
        <p className="lead" style={{ marginBottom: 26 }}>Takes less than a minute — no credit card required.</p>

        <div className="grid-2">
          <div className="field">
            <label>Full Name</label>
            <input className="input" placeholder="Full name" required value={form.fullName} onChange={(e) => update('fullName', e.target.value)} />
          </div>
          <div className="field">
            <label>Business Name <span style={{ fontWeight: 400, color: 'var(--slate-light)' }}>(optional)</span></label>
            <input className="input" placeholder="Business name" value={form.company} onChange={(e) => update('company', e.target.value)} />
          </div>
        </div>

        <div className="grid-2" style={{ marginTop: 14 }}>
          <div className="field">
            <label>Mobile</label>
            <div className="input-group" style={{ width: '100%' }}>
              <select className="flag" value={form.countryCode} onChange={(e) => update('countryCode', e.target.value)}>
                {COUNTRY_CODES.map((c) => <option key={c}>{c}</option>)}
              </select>
              <input placeholder="00000 00000" required value={form.phoneNumber} onChange={(e) => update('phoneNumber', e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>Email</label>
            <input className="input" type="email" placeholder="you@email.com" required value={form.email} onChange={(e) => update('email', e.target.value)} />
          </div>
        </div>

        <div className="grid-2" style={{ marginTop: 14 }}>
          <div className="field">
            <label>Password</label>
            <input className="input" type="password" placeholder="••••••••" required minLength={8} value={form.password} onChange={(e) => update('password', e.target.value)} />
          </div>
          <div className="field">
            <label>Confirm Password</label>
            <input className="input" type="password" placeholder="••••••••" required minLength={8} value={form.confirmPassword} onChange={(e) => update('confirmPassword', e.target.value)} />
          </div>
        </div>

        {error && <div className="error-text" style={{ marginTop: 14 }}>{error}</div>}

        <button className="btn btn-primary block" style={{ marginTop: 24, padding: 13 }} disabled={loading}>
          {loading ? 'Creating account…' : 'Sign Up'}
        </button>
        <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--slate)', marginTop: 16 }}>
          Already have an account? <Link to="/login" style={{ color: 'var(--cobalt)', fontWeight: 600 }}>Log in</Link>
        </p>
      </form>
    </div>
  );
}
