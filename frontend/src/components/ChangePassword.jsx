import { useState } from 'react';
import client from '../api/client';

export default function ChangePassword() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess(false);

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await client.post('/auth/change-password', { currentPassword, newPassword });
      setSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not change password.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card" style={{ padding: 24, maxWidth: 420 }}>
      <h3 className="h-md" style={{ marginBottom: 16 }}>Change password</h3>

      <div className="field" style={{ marginBottom: 12 }}>
        <label>Current password</label>
        <input
          className="input"
          type="password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
      </div>
      <div className="field" style={{ marginBottom: 12 }}>
        <label>New password</label>
        <input
          className="input"
          type="password"
          required
          minLength={8}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
      </div>
      <div className="field" style={{ marginBottom: 16 }}>
        <label>Confirm new password</label>
        <input
          className="input"
          type="password"
          required
          minLength={8}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
      </div>

      {error && <div className="error-text" style={{ marginBottom: 12 }}>{error}</div>}
      {success && <div style={{ color: 'var(--success, green)', marginBottom: 12, fontSize: 13.5 }}>Password updated.</div>}

      <button className="btn btn-primary" disabled={submitting}>
        {submitting ? 'Updating…' : 'Update password'}
      </button>
    </form>
  );
}
