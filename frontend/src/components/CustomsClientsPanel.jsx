import { useEffect, useState } from 'react';
import client from '../api/client';
import LoadingLogo from './LoadingLogo';
import { COUNTRY_NAMES, getCountryName } from '../utils/countryNames';

export default function CustomsClientsPanel() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  function load() {
    setLoading(true);
    client.get('/admin/customs-clients', { params: { q: q || undefined } })
      .then(({ data }) => { setClients(data.clients); setLoading(false); })
      .catch(() => setLoading(false));
  }
  useEffect(load, []);

  function search(e) {
    e.preventDefault();
    load();
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 className="h-lg">Customs Client</h1>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ Add customs client</button>
      </div>

      <div className="dash-toolbar">
        <form className="search-box" onSubmit={search}>
          🔍<input placeholder="Search name, business, email, mobile…" value={q} onChange={(e) => setQ(e.target.value)} />
        </form>
      </div>

      {loading ? <LoadingLogo /> : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Business</th><th>Mobile</th><th>Email</th><th>Country</th><th>City</th></tr></thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.businessName || '—'}</td>
                  <td className="mono">{c.mobile}</td>
                  <td>{c.email || '—'}</td>
                  <td>{getCountryName(c.countryCode)}</td>
                  <td>{c.city}</td>
                </tr>
              ))}
              {clients.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--slate-light)', padding: '24px 0' }}>No customs clients yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateCustomsClientModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}
    </div>
  );
}

function CreateCustomsClientModal({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await client.post('/admin/customs-clients', { name, businessName, mobile, email, countryCode, city, address });
      onCreated();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save this client.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: 16 }}>Add customs client</h3>
        <form onSubmit={submit} className="form-stack">
          <div className="field">
            <label>Name</label>
            <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label>Business name (optional)</label>
            <input className="input" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
          </div>
          <div className="field">
            <label>Mobile</label>
            <input className="input" required value={mobile} onChange={(e) => setMobile(e.target.value)} />
          </div>
          <div className="field">
            <label>Email (optional)</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label>Country</label>
            <select className="input" required value={countryCode} onChange={(e) => setCountryCode(e.target.value)}>
              <option value="" disabled>Select country</option>
              {Object.entries(COUNTRY_NAMES).map(([code, name]) => (
                <option key={code} value={code}>{name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>City</label>
            <input className="input" required value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div className="field">
            <label>Address</label>
            <textarea className="input" required rows={2} style={{ resize: 'vertical' }} value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          {error && <div className="error-text">{error}</div>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" style={{ flex: 1 }} disabled={submitting}>{submitting ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
