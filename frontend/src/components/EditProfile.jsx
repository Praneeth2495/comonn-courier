import { useState } from 'react';
import client from '../api/client';
import { useAuth } from '../api/AuthContext';

export default function EditProfile() {
  const { user, updateUser } = useAuth();
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [company, setCompany] = useState(user?.company || '');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setSubmitting(true);
    try {
      const { data } = await client.patch('/auth/me', { fullName, phone, company });
      updateUser(data.user);
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not update your profile.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card" style={{ padding: 24, maxWidth: 420 }}>
      <h3 className="h-md" style={{ marginBottom: 16 }}>Profile details</h3>

      <div className="field" style={{ marginBottom: 12 }}>
        <label>Full name</label>
        <input className="input" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </div>
      <div className="field" style={{ marginBottom: 12 }}>
        <label>Email</label>
        <input className="input" value={user?.email || ''} disabled style={{ color: 'var(--slate-light)' }} />
      </div>
      <div className="field" style={{ marginBottom: 12 }}>
        <label>Phone</label>
        <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <div className="field" style={{ marginBottom: 16 }}>
        <label>Company (optional)</label>
        <input className="input" value={company} onChange={(e) => setCompany(e.target.value)} />
      </div>

      {error && <div className="error-text" style={{ marginBottom: 12 }}>{error}</div>}
      {success && <div style={{ color: 'var(--success, green)', marginBottom: 12, fontSize: 13.5 }}>Profile updated.</div>}

      <button className="btn btn-primary" disabled={submitting}>
        {submitting ? 'Saving…' : 'Save changes'}
      </button>
    </form>
  );
}
