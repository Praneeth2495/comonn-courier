import { useEffect, useState } from 'react';
import client from '../api/client';
import LoadingLogo from './LoadingLogo';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function AssetsPanel() {
  const [assets, setAssets] = useState([]);
  const [totalValue, setTotalValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  function load() {
    setLoading(true);
    client.get('/admin/assets')
      .then(({ data }) => { setAssets(data.assets); setTotalValue(Number(data.totalValue)); setLoading(false); })
      .catch(() => setLoading(false));
  }
  useEffect(load, []);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 className="h-lg">Assets</h1>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ Add asset</button>
      </div>

      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="label">Total asset value</div>
          <div className="value">₹{totalValue.toFixed(2)}</div>
        </div>
      </div>

      {loading ? <LoadingLogo /> : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Asset name</th><th>Value</th><th>Qty</th><th>Purchase date</th><th>Staff name</th><th>Added by</th></tr></thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td>₹{Number(a.value).toFixed(2)}</td>
                  <td>{a.quantity}</td>
                  <td>{new Date(a.purchaseDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}</td>
                  <td>{a.staffName}</td>
                  <td>{a.createdBy?.fullName || '—'}</td>
                </tr>
              ))}
              {assets.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--slate-light)', padding: '24px 0' }}>No assets added yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateAssetModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}
    </div>
  );
}

function CreateAssetModal({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [purchaseDate, setPurchaseDate] = useState(todayIso());
  const [staffName, setStaffName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await client.post('/admin/assets', { name, value, quantity, purchaseDate, staffName });
      onCreated();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save this asset.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: 16 }}>Add asset</h3>
        <form onSubmit={submit} className="form-stack">
          <div className="field">
            <label>Asset name</label>
            <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label>Value (₹)</label>
            <input className="input" type="number" min="0.01" step="0.01" required value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          <div className="field">
            <label>Quantity</label>
            <input className="input" type="number" min="1" step="1" required value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div className="field">
            <label>Date</label>
            <input className="input" type="date" required value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
          </div>
          <div className="field">
            <label>Staff name</label>
            <input className="input" required value={staffName} onChange={(e) => setStaffName(e.target.value)} />
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
