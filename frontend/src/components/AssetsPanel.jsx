import { useEffect, useState } from 'react';
import client from '../api/client';
import { useAuth } from '../api/AuthContext';
import LoadingLogo from './LoadingLogo';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function downloadBlob(url, filename) {
  const { data } = await client.get(url, { responseType: 'blob' });
  const objectUrl = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

export default function AssetsPanel() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [assets, setAssets] = useState([]);
  const [totalValue, setTotalValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null); // asset being edited, or null
  const [removingId, setRemovingId] = useState(null);

  function load() {
    setLoading(true);
    client.get('/admin/assets')
      .then(({ data }) => { setAssets(data.assets); setTotalValue(Number(data.totalValue)); setLoading(false); })
      .catch(() => setLoading(false));
  }
  useEffect(load, []);

  async function remove(id) {
    if (!window.confirm('Remove this asset? This cannot be undone.')) return;
    setRemovingId(id);
    try {
      await client.delete(`/admin/assets/${id}`);
      load();
    } finally {
      setRemovingId(null);
    }
  }

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
            <thead><tr><th>Asset name</th><th>Value</th><th>Qty</th><th>Purchase date</th><th>Staff name</th><th>Added by</th><th>Invoice</th><th></th></tr></thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td>₹{Number(a.value).toFixed(2)}</td>
                  <td>{a.quantity}</td>
                  <td>{new Date(a.purchaseDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}</td>
                  <td>{a.staffName}</td>
                  <td>{a.createdBy?.fullName || '—'}</td>
                  <td>
                    {a.hasAttachment ? (
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => downloadBlob(`/admin/assets/${a.id}/attachment`, a.attachmentName || 'invoice')}>
                        ⬇ Invoice
                      </button>
                    ) : (
                      <span style={{ color: 'var(--slate-light)' }}>—</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditing(a)}>Edit</button>
                      {isAdmin && (
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                          disabled={removingId === a.id}
                          onClick={() => remove(a.id)}
                        >
                          {removingId === a.id ? 'Removing…' : 'Remove'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {assets.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--slate-light)', padding: '24px 0' }}>No assets added yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <AssetFormModal
          title="Add asset"
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); load(); }}
        />
      )}

      {editing && (
        <AssetFormModal
          title="Edit asset"
          asset={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function AssetFormModal({ title, asset, onClose, onSaved }) {
  const [name, setName] = useState(asset?.name || '');
  const [value, setValue] = useState(asset ? String(asset.value) : '');
  const [quantity, setQuantity] = useState(asset ? String(asset.quantity) : '1');
  const [purchaseDate, setPurchaseDate] = useState(asset ? new Date(asset.purchaseDate).toISOString().slice(0, 10) : todayIso());
  const [staffName, setStaffName] = useState(asset?.staffName || '');
  const [attachment, setAttachment] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('name', name);
      formData.append('value', value);
      formData.append('quantity', quantity);
      formData.append('purchaseDate', purchaseDate);
      formData.append('staffName', staffName);
      if (attachment) formData.append('attachment', attachment);

      if (asset) {
        await client.patch(`/admin/assets/${asset.id}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      } else {
        await client.post('/admin/assets', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save this asset.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: 16 }}>{title}</h3>
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
          <div className="field">
            <label>Attach invoice {asset?.hasAttachment ? '(optional — replaces the current one)' : '(optional)'}</label>
            <input className="input" type="file" onChange={(e) => setAttachment(e.target.files?.[0] || null)} />
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
