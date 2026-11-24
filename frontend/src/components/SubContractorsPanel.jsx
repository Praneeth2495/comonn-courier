import { useEffect, useState } from 'react';
import client from '../api/client';
import LoadingLogo from './LoadingLogo';
import { COUNTRY_NAMES, getCountryName } from '../utils/countryNames';
import { useDebouncedValue } from '../utils/useDebouncedValue';

export default function SubContractorsPanel() {
  const [subContractors, setSubContractors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const debouncedQ = useDebouncedValue(q);
  const [showCreate, setShowCreate] = useState(false);

  function load() {
    setLoading(true);
    client.get('/admin/sub-contractors', { params: { q: q || undefined } })
      .then(({ data }) => { setSubContractors(data.subContractors); setLoading(false); })
      .catch(() => setLoading(false));
  }
  useEffect(load, [debouncedQ]);

  function search(e) {
    e.preventDefault();
    load();
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <h1 className="h-lg">Sub Contractor</h1>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ Add sub contractor</button>
      </div>

      <div className="dash-toolbar">
        <form className="search-box" onSubmit={search}>
          🔍<input placeholder="Search name, business, email, mobile, GST…" value={q} onChange={(e) => setQ(e.target.value)} />
        </form>
      </div>

      {loading ? <LoadingLogo /> : (
        <div className="table-wrap">
          <table className="data-table" style={{ minWidth: 720 }}>
            <thead><tr><th>Name</th><th>Business</th><th>Mobile 1</th><th>City/Town</th><th>State</th><th>Country</th></tr></thead>
            <tbody>
              {subContractors.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.businessName}</td>
                  <td className="mono">{s.mobile1}</td>
                  <td>{s.cityTown}</td>
                  <td>{s.state}</td>
                  <td>{getCountryName(s.countryCode)}</td>
                </tr>
              ))}
              {subContractors.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--slate-light)', padding: '24px 0' }}>No sub contractors yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateSubContractorModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}
    </div>
  );
}

function CreateSubContractorModal({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [mobile1, setMobile1] = useState('');
  const [mobile2, setMobile2] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [cityTown, setCityTown] = useState('');
  const [district, setDistrict] = useState('');
  const [state, setState] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [gst, setGst] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await client.post('/admin/sub-contractors', {
        name, businessName, mobile1, mobile2, email, address, cityTown, district, state, countryCode, gst, reference, notes,
      });
      onCreated();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save this sub contractor.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <h3>Add sub contractor</h3>
          <button onClick={onClose} style={{ background: 'var(--paper)', border: 'none', width: 36, height: 36, borderRadius: '50%', fontSize: 13, color: 'var(--slate)', cursor: 'pointer', flex: 'none' }}>✕</button>
        </div>
        <form onSubmit={submit} className="form-stack">
          <div className="field">
            <label>Name <span style={{ color: 'var(--danger)', fontSize: 12 }}>*</span></label>
            <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label>Business name <span style={{ color: 'var(--danger)', fontSize: 12 }}>*</span></label>
            <input className="input" required value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
          </div>
          <div className="grid-2">
            <div className="field">
              <label>Mobile 1 <span style={{ color: 'var(--danger)', fontSize: 12 }}>*</span></label>
              <input className="input" required value={mobile1} onChange={(e) => setMobile1(e.target.value)} />
            </div>
            <div className="field">
              <label>Mobile 2 <span style={{ color: 'var(--danger)', fontSize: 12 }}>*</span></label>
              <input className="input" required value={mobile2} onChange={(e) => setMobile2(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>Email <span style={{ color: 'var(--danger)', fontSize: 12 }}>*</span></label>
            <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label>Address <span style={{ color: 'var(--danger)', fontSize: 12 }}>*</span></label>
            <textarea className="input" required rows={2} style={{ resize: 'vertical' }} value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="grid-2">
            <div className="field">
              <label>City/Town <span style={{ color: 'var(--danger)', fontSize: 12 }}>*</span></label>
              <input className="input" required value={cityTown} onChange={(e) => setCityTown(e.target.value)} />
            </div>
            <div className="field">
              <label>District <span style={{ color: 'var(--danger)', fontSize: 12 }}>*</span></label>
              <input className="input" required value={district} onChange={(e) => setDistrict(e.target.value)} />
            </div>
          </div>
          <div className="grid-2">
            <div className="field">
              <label>State <span style={{ color: 'var(--danger)', fontSize: 12 }}>*</span></label>
              <input className="input" required value={state} onChange={(e) => setState(e.target.value)} />
            </div>
            <div className="field">
              <label>Country <span style={{ color: 'var(--danger)', fontSize: 12 }}>*</span></label>
              <select className="input" required value={countryCode} onChange={(e) => setCountryCode(e.target.value)}>
                <option value="" disabled>Select country</option>
                {Object.entries(COUNTRY_NAMES).map(([code, name]) => (
                  <option key={code} value={code}>{name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label>GST <span style={{ color: 'var(--danger)', fontSize: 12 }}>*</span></label>
            <input className="input" required value={gst} onChange={(e) => setGst(e.target.value)} />
          </div>
          <div className="field">
            <label>Reference</label>
            <input className="input" placeholder="Optional" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <div className="field">
            <label>Notes</label>
            <textarea className="input" placeholder="Optional" rows={2} style={{ resize: 'vertical' }} value={notes} onChange={(e) => setNotes(e.target.value)} />
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
