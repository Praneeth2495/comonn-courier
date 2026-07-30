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
  const [viewing, setViewing] = useState(null); // booking whose details are shown
  const [editing, setEditing] = useState(null); // booking whose end date is being edited

  function load() {
    setLoading(true);
    client.get('/box-bookings/admin/bookings').then(({ data }) => { setBookings(data.bookings); setLoading(false); }).catch(() => setLoading(false));
  }
  useEffect(load, []);

  if (loading) return <LoadingLogo />;

  return (
    <div>
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Customer</th><th>Box size</th><th>Box #</th><th>Days</th><th>Amount</th><th>Ends</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {bookings.map((b) => (
              <tr key={b.id}>
                <td>
                  <button type="button" className="btn-link" style={{ background: 'none', border: 'none', padding: 0, color: 'var(--cobalt)', fontWeight: 600, cursor: 'pointer', textAlign: 'left' }} onClick={() => setViewing(b)}>
                    {b.customer.fullName}
                  </button>
                  <div style={{ fontSize: 11.5, color: 'var(--slate-light)' }}>{b.customer.email}</div>
                </td>
                <td>{b.boxSize.name}</td>
                <td className="mono">{b.box?.number ?? '—'}</td>
                <td>{b.days}</td>
                <td>₹{Number(b.totalAmount).toFixed(2)}</td>
                <td>{b.endDate ? new Date(b.endDate).toLocaleDateString('en-IN') : '—'}</td>
                <td><span className={`pill ${BOOKING_STATUS_PILL[b.status] || 'pill-navy'}`}>{b.status}</span></td>
                <td><button className="btn btn-outline btn-sm" onClick={() => setEditing(b)}>Edit</button></td>
              </tr>
            ))}
            {bookings.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--slate-light)', padding: '24px 0' }}>No bookings yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {viewing && <BookingDetailModal booking={viewing} onClose={() => setViewing(null)} />}
      {editing && <EditBookingDatesModal booking={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function BookingDetailModal({ booking, onClose }) {
  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <h3 style={{ fontSize: 17 }}>{booking.customer.fullName}</h3>
          <button onClick={onClose} style={{ background: 'var(--paper)', border: 'none', width: 44, height: 44, borderRadius: '50%', fontSize: 15, color: 'var(--slate)', cursor: 'pointer', flex: 'none' }}>✕</button>
        </div>
        <div className="form-stack">
          <Row label="Email" value={booking.customer.email} />
          <Row label="Mobile" value={booking.customer.phone || '—'} />
          <Row label="Box size" value={booking.boxSize.name} />
          <Row label="Box number" value={booking.box?.number ?? '—'} />
          <Row label="Address" value={booking.boxAddress || '—'} />
          <Row label="Days" value={booking.days} />
          <Row label="Amount" value={`₹${Number(booking.totalAmount).toFixed(2)}`} />
          <Row label="Started" value={booking.startDate ? new Date(booking.startDate).toLocaleDateString('en-IN') : '—'} />
          <Row label="Ends" value={booking.endDate ? new Date(booking.endDate).toLocaleDateString('en-IN') : '—'} />
          <Row label="Invoice #" value={booking.invoiceNumber || '—'} />
          <Row label="Status" value={booking.status} />
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, padding: '6px 0', borderBottom: '1px solid var(--line-2)' }}>
      <span style={{ color: 'var(--slate)' }}>{label}</span>
      <span style={{ fontWeight: 600, color: 'var(--navy)' }}>{value}</span>
    </div>
  );
}

function EditBookingDatesModal({ booking, onClose, onSaved }) {
  const [endDate, setEndDate] = useState(booking.endDate ? booking.endDate.slice(0, 10) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await client.patch(`/box-bookings/admin/bookings/${booking.id}`, { endDate });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not update this booking.');
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: 4 }}>Edit end date</h3>
        <p style={{ fontSize: 12.5, color: 'var(--slate-light)', marginBottom: 16 }}>{booking.customer.fullName} — {booking.boxSize.name}, Box {booking.box?.number ?? '—'}</p>
        <form onSubmit={save} className="form-stack">
          <div className="field">
            <label>End date</label>
            <input className="input" type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          {error && <div className="error-text">{error}</div>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" style={{ flex: 1 }} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
