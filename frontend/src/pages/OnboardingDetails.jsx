import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import client from '../api/client';
import LoadingLogo from '../components/LoadingLogo';

const ID_PROOF_TYPES = ['Aadhaar', 'PAN', 'Passport', 'Driving Licence', 'Voter ID', 'Other'];

const EMPTY_FORM = {
  phone: '',
  addressLine1: '', addressLine2: '', city: '', state: '', postcode: '',
  emergencyContactName: '', emergencyContactRelation: '', emergencyContactPhone: '',
  idProofType: '', idProofNumber: '', idProofType2: '', idProofNumber2: '',
  bankAccountName: '', bankAccountNumber: '', bankIfsc: '', bankName: '',
};

/**
 * Public, token-gated — the link an invited employee gets by email (see
 * employee.controller.js's inviteEmployee). No login: the unguessable
 * token in the URL is the only gate, same trust model as /set-password.
 * Submitting doesn't activate the account by itself — an admin still has
 * to review and approve before a password-set email goes out.
 */
export default function OnboardingDetails() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [invite, setInvite] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [idProofFile, setIdProofFile] = useState(null);
  const [idProofFile2, setIdProofFile2] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) { setLoadError('This link is missing its token. Please use the link from your email.'); return; }
    client.get(`/onboarding-invite/${token}`)
      .then(({ data }) => setInvite(data))
      .catch((err) => setLoadError(err.response?.data?.error || 'This link is invalid or has expired.'));
  }, [token]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const formData = new FormData();
      Object.entries(form).forEach(([key, value]) => formData.append(key, value ?? ''));
      if (idProofFile) formData.append('idProofFile', idProofFile);
      if (idProofFile2) formData.append('idProofFile2', idProofFile2);
      await client.post(`/onboarding-invite/${token}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not submit your details.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <div className="wrap section-narrow">
        <div className="card" style={{ padding: 28, maxWidth: 480, margin: '40px auto' }}>
          <div className="error-text">{loadError}</div>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="wrap section-narrow">
        <div className="card" style={{ padding: 28, maxWidth: 480, margin: '40px auto', textAlign: 'center' }}>
          <h2 style={{ marginBottom: 10 }}>Details submitted</h2>
          <p className="lead">Thanks — your onboarding details have been sent for review. You'll get an email to set up your password once an admin approves your account.</p>
        </div>
      </div>
    );
  }

  if (!invite) {
    return (
      <div className="wrap section-narrow">
        <div style={{ margin: '60px auto', maxWidth: 480 }}><LoadingLogo /></div>
      </div>
    );
  }

  return (
    <div className="wrap section-narrow">
      <div className="card" style={{ padding: 28, maxWidth: 640, margin: '32px auto' }}>
        <h2 style={{ marginBottom: 4 }}>Welcome to Comonn, {invite.fullName}</h2>
        <p className="lead" style={{ marginBottom: 20 }}>
          Please fill in the rest of your onboarding details below. An admin will review and approve before your login is activated.
        </p>

        <div className="detail-section">
          <h4>Basic details</h4>
          <div className="grid-2">
            <div className="field"><label>Full name</label><input className="input" disabled value={invite.fullName} /></div>
            <div className="field"><label>Email</label><input className="input" disabled value={invite.email} /></div>
            <div className="field"><label>Role</label><input className="input" disabled value={invite.role === 'DRIVER' ? 'Rider' : 'Staff'} /></div>
            <div className="field"><label>Mobile</label><input className="input" value={form.phone} onChange={(e) => update('phone', e.target.value)} /></div>
          </div>
        </div>

        <form onSubmit={submit} className="form-stack">
          <div className="detail-section">
            <h4>Address</h4>
            <div className="grid-2">
              <div className="field" style={{ gridColumn: '1 / -1' }}><label>Address line 1</label><input className="input" value={form.addressLine1} onChange={(e) => update('addressLine1', e.target.value)} /></div>
              <div className="field" style={{ gridColumn: '1 / -1' }}><label>Address line 2 (optional)</label><input className="input" value={form.addressLine2} onChange={(e) => update('addressLine2', e.target.value)} /></div>
              <div className="field"><label>City</label><input className="input" value={form.city} onChange={(e) => update('city', e.target.value)} /></div>
              <div className="field"><label>State</label><input className="input" value={form.state} onChange={(e) => update('state', e.target.value)} /></div>
              <div className="field"><label>Pincode</label><input className="input" value={form.postcode} onChange={(e) => update('postcode', e.target.value)} /></div>
            </div>
          </div>

          <div className="detail-section">
            <h4>Emergency contact</h4>
            <div className="grid-2">
              <div className="field"><label>Name</label><input className="input" value={form.emergencyContactName} onChange={(e) => update('emergencyContactName', e.target.value)} /></div>
              <div className="field"><label>Relationship</label><input className="input" value={form.emergencyContactRelation} onChange={(e) => update('emergencyContactRelation', e.target.value)} /></div>
              <div className="field"><label>Phone</label><input className="input" value={form.emergencyContactPhone} onChange={(e) => update('emergencyContactPhone', e.target.value)} /></div>
            </div>
          </div>

          <div className="detail-section">
            <h4>Government ID proof</h4>
            <div className="grid-2">
              <div className="field">
                <label>ID type</label>
                <select className="select" value={form.idProofType} onChange={(e) => update('idProofType', e.target.value)}>
                  <option value="">—</option>
                  {ID_PROOF_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="field"><label>ID number</label><input className="input" value={form.idProofNumber} onChange={(e) => update('idProofNumber', e.target.value)} /></div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Attach ID document</label>
                <input className="input" type="file" accept="image/*,.pdf" onChange={(e) => setIdProofFile(e.target.files?.[0] || null)} />
              </div>
            </div>
            <div className="grid-2" style={{ marginTop: 10 }}>
              <div className="field">
                <label>ID type 2 (optional)</label>
                <select className="select" value={form.idProofType2} onChange={(e) => update('idProofType2', e.target.value)}>
                  <option value="">—</option>
                  {ID_PROOF_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="field"><label>ID number 2</label><input className="input" value={form.idProofNumber2} onChange={(e) => update('idProofNumber2', e.target.value)} /></div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Attach ID document 2 (optional)</label>
                <input className="input" type="file" accept="image/*,.pdf" onChange={(e) => setIdProofFile2(e.target.files?.[0] || null)} />
              </div>
            </div>
          </div>

          <div className="detail-section">
            <h4>Bank details (for payroll)</h4>
            <div className="grid-2">
              <div className="field"><label>Account holder name</label><input className="input" value={form.bankAccountName} onChange={(e) => update('bankAccountName', e.target.value)} /></div>
              <div className="field"><label>Account number</label><input className="input" value={form.bankAccountNumber} onChange={(e) => update('bankAccountNumber', e.target.value)} /></div>
              <div className="field"><label>IFSC</label><input className="input" value={form.bankIfsc} onChange={(e) => update('bankIfsc', e.target.value)} /></div>
              <div className="field"><label>Bank name</label><input className="input" value={form.bankName} onChange={(e) => update('bankName', e.target.value)} /></div>
            </div>
          </div>

          {error && <div className="error-text">{error}</div>}
          <button className="btn btn-primary block" style={{ padding: 13 }} disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit my details'}
          </button>
        </form>
      </div>
    </div>
  );
}
