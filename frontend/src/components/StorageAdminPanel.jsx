import { useEffect, useState } from 'react';
import client from '../api/client';
import LoadingLogo from './LoadingLogo';

const LOW_STOCK_THRESHOLD = 1;

const BOX_STATUS_PILL = { AVAILABLE: 'pill-success', RENTED: 'pill-cobalt', RETIRED: 'pill-danger' };
const BOOKING_STATUS_PILL = { ACTIVE: 'pill-success', EXPIRED: 'pill-danger' };

export default function StorageAdminPanel() {
  const [subTab, setSubTab] = useState('sizes');

  return (
    <div>
      <h1 className="h-lg" style={{ marginBottom: 16 }}>Storage</h1>
      <div className="acct-tabs" style={{ marginBottom: 20 }}>
        {[['sizes', 'Sizes & boxes'], ['bookings', 'Bookings']].map(([key, label]) => (
          <button key={key} className={`acct-tab ${subTab === key ? 'active' : ''}`} onClick={() => setSubTab(key)}>{label}</button>
        ))}
      </div>
      {subTab === 'sizes' && <SizesAndBoxes />}
      {subTab === 'bookings' && <BookingsTable />}
    </div>
  );
}

function SizesAndBoxes() {
  const [sizes, setSizes] = useState([]);
  const [boxes, setBoxes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sizeForm, setSizeForm] = useState({ code: '', name: '', description: '', monthlyRate: '' });
  const [boxForm, setBoxForm] = useState({ boxSizeId: '', number: '' });
  const [addingSize, setAddingSize] = useState(false);
  const [addingBox, setAddingBox] = useState(false);
  const [error, setError] = useState('');

  function load() {
    setLoading(true);
    Promise.all([
      client.get('/box-bookings/admin/sizes'),
      client.get('/box-bookings/admin/boxes'),
    ]).then(([sizesRes, boxesRes]) => {
      setSizes(sizesRes.data.sizes);
      setBoxes(boxesRes.data.boxes);
      setLoading(false);
    }).catch(() => setLoading(false));
  }
  useEffect(load, []);

  async function addSize(e) {
    e.preventDefault();
    if (!sizeForm.code.trim() || !sizeForm.name.trim() || !sizeForm.monthlyRate) return;
    setAddingSize(true);
    setError('');
    try {
      await client.post('/box-bookings/admin/sizes', sizeForm);
      setSizeForm({ code: '', name: '', description: '', monthlyRate: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not add this size.');
    } finally {
      setAddingSize(false);
    }
  }

  async function toggleSizeActive(size) {
    await client.patch(`/box-bookings/admin/sizes/${size.id}`, { isActive: !size.isActive });
    load();
  }

  async function addBox(e) {
    e.preventDefault();
    if (!boxForm.boxSizeId || !boxForm.number) return;
    setAddingBox(true);
    setError('');
    try {
      await client.post('/box-bookings/admin/boxes', boxForm);
      setBoxForm({ boxSizeId: boxForm.boxSizeId, number: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not add this box.');
    } finally {
      setAddingBox(false);
    }
  }

  async function retireBox(id) {
    if (!confirm('Retire this box? It will no longer be available for booking.')) return;
    await client.patch(`/box-bookings/admin/boxes/${id}/retire`);
    load();
  }

  async function releaseBox(id) {
    await client.patch(`/box-bookings/admin/boxes/${id}/release`);
    load();
  }

  if (loading) return <LoadingLogo />;

  return (
    <div>
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <h4 style={{ marginBottom: 12, color: 'var(--navy)' }}>Add a box size</h4>
        <form onSubmit={addSize} style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, alignItems: 'end' }}>
          <div className="field">
            <label>Code</label>
            <input className="input" placeholder="SMALL" required value={sizeForm.code} onChange={(e) => setSizeForm({ ...sizeForm, code: e.target.value })} />
          </div>
          <div className="field">
            <label>Name</label>
            <input className="input" placeholder="Small Box" required value={sizeForm.name} onChange={(e) => setSizeForm({ ...sizeForm, name: e.target.value })} />
          </div>
          <div className="field">
            <label>Description</label>
            <input className="input" placeholder="30x30x30 cm" value={sizeForm.description} onChange={(e) => setSizeForm({ ...sizeForm, description: e.target.value })} />
          </div>
          <div className="field">
            <label>Monthly rate (₹)</label>
            <input className="input" type="number" min="0" required value={sizeForm.monthlyRate} onChange={(e) => setSizeForm({ ...sizeForm, monthlyRate: e.target.value })} />
          </div>
          <button className="btn btn-primary btn-sm" disabled={addingSize}>{addingSize ? 'Adding…' : 'Add size'}</button>
        </form>
      </div>

      <div className="table-wrap" style={{ marginBottom: 24 }}>
        <table className="data-table">
          <thead><tr><th>Code</th><th>Name</th><th>Monthly rate</th><th>Available</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {sizes.map((s) => {
              const low = s.availableCount <= LOW_STOCK_THRESHOLD;
              return (
                <tr key={s.id}>
                  <td className="mono">{s.code}</td>
                  <td>{s.name}</td>
                  <td>₹{Number(s.monthlyRate).toFixed(2)}</td>
                  <td style={{ fontWeight: 700, color: low ? 'var(--danger)' : 'var(--ink)' }}>
                    {s.availableCount} / {s.totalCount} {low && '⚠️'}
                  </td>
                  <td>{s.isActive ? <span className="pill pill-success">Active</span> : <span className="pill pill-danger">Inactive</span>}</td>
                  <td><button className="btn btn-outline btn-sm" onClick={() => toggleSizeActive(s)}>{s.isActive ? 'Deactivate' : 'Activate'}</button></td>
                </tr>
              );
            })}
            {sizes.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--slate-light)', padding: '24px 0' }}>No box sizes yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <h4 style={{ marginBottom: 12, color: 'var(--navy)' }}>Add a box</h4>
        <form onSubmit={addBox} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, alignItems: 'end' }}>
          <div className="field">
            <label>Size</label>
            <select className="select" required value={boxForm.boxSizeId} onChange={(e) => setBoxForm({ ...boxForm, boxSizeId: e.target.value })}>
              <option value="">Choose a size…</option>
              {sizes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Box number</label>
            <input className="input" type="number" min="1" required value={boxForm.number} onChange={(e) => setBoxForm({ ...boxForm, number: e.target.value })} />
          </div>
          <button className="btn btn-primary btn-sm" disabled={addingBox}>{addingBox ? 'Adding…' : 'Add box'}</button>
        </form>
        {error && <div className="error-text" style={{ marginTop: 10 }}>{error}</div>}
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Box</th><th>Size</th><th>Status</th><th>Currently rented by</th><th></th></tr></thead>
          <tbody>
            {boxes.map((b) => {
              const activeBooking = b.bookings?.[0];
              return (
                <tr key={b.id}>
                  <td className="mono">Box {b.number}</td>
                  <td>{b.boxSize.name}</td>
                  <td><span className={`pill ${BOX_STATUS_PILL[b.status] || 'pill-navy'}`}>{b.status}</span></td>
                  <td style={{ fontSize: 12.5, color: 'var(--slate-light)' }}>{activeBooking ? `${activeBooking.customer.fullName} (${activeBooking.customer.email})` : '—'}</td>
                  <td style={{ display: 'flex', gap: 8 }}>
                    {b.status === 'RENTED' && <button className="btn btn-outline btn-sm" onClick={() => releaseBox(b.id)}>Release</button>}
                    {b.status !== 'RETIRED' && <button className="btn btn-outline btn-sm" onClick={() => retireBox(b.id)}>Retire</button>}
                  </td>
                </tr>
              );
            })}
            {boxes.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--slate-light)', padding: '24px 0' }}>No boxes yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BookingsTable() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    client.get('/box-bookings/admin/bookings').then(({ data }) => { setBookings(data.bookings); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <LoadingLogo />;

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead><tr><th>Customer</th><th>Box</th><th>Days</th><th>Amount</th><th>Ends</th><th>Status</th></tr></thead>
        <tbody>
          {bookings.map((b) => (
            <tr key={b.id}>
              <td>{b.customer.fullName}<div style={{ fontSize: 11.5, color: 'var(--slate-light)' }}>{b.customer.email}</div></td>
              <td className="mono">{b.boxAddress || `${b.boxSize.name} — Box ${b.box?.number ?? '?'}`}</td>
              <td>{b.days}</td>
              <td>₹{Number(b.totalAmount).toFixed(2)}</td>
              <td>{b.endDate ? new Date(b.endDate).toLocaleDateString('en-IN') : '—'}</td>
              <td><span className={`pill ${BOOKING_STATUS_PILL[b.status] || 'pill-navy'}`}>{b.status}</span></td>
            </tr>
          ))}
          {bookings.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--slate-light)', padding: '24px 0' }}>No bookings yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
