import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../api/AuthContext';
import { useBooking } from '../api/BookingContext';
import ChangePassword from '../components/ChangePassword';

const STATUS_PILL = {
  DRAFT: 'pill-warn',
  UNFINISHED: 'pill-warn',
  PENDING_PAYMENT: 'pill-warn',
  PICKUP_CONFIRMED: 'pill-cobalt',
  PAID: 'pill-cobalt',
  LABEL_GENERATED: 'pill-cobalt',
  PICKED_UP: 'pill-cobalt',
  IN_TRANSIT: 'pill-cobalt',
  OUT_FOR_DELIVERY: 'pill-cobalt',
  DELIVERED: 'pill-success',
  CANCELLED: 'pill-danger',
  EXCEPTION: 'pill-danger',
};
const HISTORY_STATUSES = ['DELIVERED', 'CANCELLED', 'EXCEPTION'];
const PAID_STATUSES = ['PAID', 'LABEL_GENERATED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'];

const ACCT_TABS = [['active', 'Active orders'], ['history', 'Order history'], ['addresses', 'Saved addresses']];

export default function UserDashboard() {
  const { user } = useAuth();
  const { setBooking } = useBooking();
  const navigate = useNavigate();
  const [tab, setTab] = useState('active');
  const [orders, setOrders] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [showAccount, setShowAccount] = useState(false);
  const labelRequestedRef = useRef(new Set());

  function loadOrders() {
    setLoading(true);
    const params = { q: q || undefined };
    if (tab === 'history') params.status = HISTORY_STATUSES.join(',');
    else params.notStatus = HISTORY_STATUSES.join(',');
    client.get('/orders', { params }).then(({ data }) => {
      setOrders(data.orders);
      ensureLabelsForPaidOrders(data.orders);
    }).finally(() => setLoading(false));
  }
  useEffect(() => { if (tab !== 'addresses') loadOrders(); }, [tab]);

  // A paid order only gets its label/invoice generated once the customer
  // lands on the post-payment Labels page — if they never do (closed the
  // tab, navigated away), it's stuck showing "Paid" with no download
  // buttons. Generate it lazily here instead; the endpoint is idempotent.
  function ensureLabelsForPaidOrders(list) {
    list
      .filter((o) => PAID_STATUSES.includes(o.status) && !o.pricingPending && !(o.labels?.length))
      .filter((o) => !labelRequestedRef.current.has(o.id))
      .forEach((o) => {
        labelRequestedRef.current.add(o.id);
        client.post(`/labels/${o.id}/generate`).then(({ data }) => {
          if (data.labels?.length) {
            setOrders((prev) => prev.map((p) => (p.id === o.id ? { ...p, labels: data.labels, status: 'LABEL_GENERATED' } : p)));
          }
        }).catch(() => {
          labelRequestedRef.current.delete(o.id); // allow a retry on the next load
        });
      });
  }

  function search(e) {
    e.preventDefault();
    loadOrders();
  }

  async function continueBooking(id) {
    const { data } = await client.get(`/orders/${id}`);
    setBooking({ order: data.order });
    navigate('/payment');
  }

  return (
    <div className="wrap section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="h-lg" style={{ marginBottom: 4 }}>Hi, {user?.fullName?.split(' ')[0]} 👋</h1>
          <p className="lead" style={{ marginBottom: 24 }}>Here's what's happening with your shipments.</p>
        </div>
        <button className="btn btn-outline btn-sm" onClick={() => setShowAccount((v) => !v)}>
          {showAccount ? 'Hide account settings' : 'Account settings'}
        </button>
      </div>

      {showAccount && <div style={{ marginBottom: 24 }}><ChangePassword /></div>}

      <div className="acct-tabs">
        {ACCT_TABS.map(([key, label]) => (
          <button key={key} className={`acct-tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      {tab !== 'addresses' && (
        <>
          <form className="search-box" style={{ marginBottom: 20, maxWidth: 360 }} onSubmit={search}>
            🔍<input placeholder="Search order ID, city…" value={q} onChange={(e) => setQ(e.target.value)} />
          </form>

          {loading && <p className="lead">Loading orders…</p>}
          {!loading && orders.length === 0 && (
            <div className="empty-state card">
              <p>No {tab === 'history' ? 'past' : 'active'} orders yet.</p>
            </div>
          )}

          {orders.map((o) => {
            const label = o.labels?.[0];
            return (
              <div className="card order-card" key={o.id}>
                <div className="order-card-top">
                  <div>
                    <div className="order-route">
                      {o.senderAddress.city} <span className="arrow">→</span> {o.receiverAddress.city}
                    </div>
                    <p style={{ fontSize: 12.5, color: 'var(--slate-light)', marginTop: 4 }}>
                      Order ID: <span className="mono">{o.orderNumber}</span> · {o.service.name}
                    </p>
                  </div>
                  <span className={`pill ${STATUS_PILL[o.status] || 'pill-navy'}`}>{o.status.replace(/_/g, ' ')}</span>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {['UNFINISHED', 'PENDING_PAYMENT'].includes(o.status) && (
                    <button className="btn btn-primary btn-sm" onClick={() => continueBooking(o.id)}>Continue booking →</button>
                  )}
                  {o.trackingNumber && (
                    <button className="btn btn-primary btn-sm" onClick={() => navigate(`/track?id=${encodeURIComponent(o.trackingNumber)}`)}>
                      Track order →
                    </button>
                  )}
                  <button className="btn btn-outline btn-sm" onClick={() => setSelected(o)}>View details</button>
                  {label && (
                    <a
                      className="btn btn-outline btn-sm"
                      href={`${import.meta.env.VITE_API_BASE_URL || '/api'}${label.downloadUrl}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Download label
                    </a>
                  )}
                  {label && (
                    <a
                      className="btn btn-outline btn-sm"
                      href={`${import.meta.env.VITE_API_BASE_URL || '/api'}/labels/invoice/download/${o.id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Download invoice
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </>
      )}

      {tab === 'addresses' && <SavedAddresses />}

      {selected && <OrderDetailModal order={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

const emptyAddressForm = { label: '', contactName: '', phone: '', email: '', instructions: '', line1: '', line2: '', city: '', state: '', postcode: '', countryCode: '', isDefault: false };

function SavedAddresses() {
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null = not editing, 'new' = adding, or an address object
  const [form, setForm] = useState(emptyAddressForm);

  function load() {
    setLoading(true);
    client.get('/addresses').then(({ data }) => setAddresses(data.addresses)).finally(() => setLoading(false));
  }
  useEffect(load, []);

  function startAdd() {
    setForm(emptyAddressForm);
    setEditing('new');
  }

  function startEdit(addr) {
    setForm({ ...emptyAddressForm, ...addr });
    setEditing(addr);
  }

  async function save(e) {
    e.preventDefault();
    if (editing === 'new') await client.post('/addresses', form);
    else await client.patch(`/addresses/${editing.id}`, form);
    setEditing(null);
    load();
  }

  async function remove(id) {
    if (!confirm('Delete this saved address?')) return;
    try {
      await client.delete(`/addresses/${id}`);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Could not delete this address — it may still be linked to an existing order.');
    }
  }

  if (loading) return <p className="lead">Loading addresses…</p>;

  return (
    <div>
      {editing === null && <button className="btn btn-primary btn-sm" style={{ marginBottom: 16 }} onClick={startAdd}>+ Add address</button>}

      {addresses.map((a) => (
        <div className="card addr-card" key={a.id}>
          <div>
            <div className="tag">{a.label || 'Address'}{a.isDefault ? ' · Default' : ''}</div>
            <p style={{ fontWeight: 600, fontSize: 14 }}>{a.contactName}</p>
            <p style={{ fontSize: 13, color: 'var(--slate)' }}>
              {a.line1}{a.line2 ? `, ${a.line2}` : ''}, {a.city}{a.state ? `, ${a.state}` : ''} {a.postcode}, {a.countryCode}
            </p>
            <p style={{ fontSize: 13, color: 'var(--slate)' }}>{a.phone}{a.email ? ` · ${a.email}` : ''}</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline btn-sm" onClick={() => startEdit(a)}>Edit</button>
            <button className="btn btn-outline btn-sm" onClick={() => remove(a.id)}>Delete</button>
          </div>
        </div>
      ))}

      {addresses.length === 0 && editing === null && (
        <div className="empty-state card" style={{ marginBottom: 16 }}><p>No saved addresses yet.</p></div>
      )}

      {editing !== null && (
        <form className="card" style={{ padding: 22 }} onSubmit={save}>
          <h4 style={{ marginBottom: 14, color: 'var(--navy)' }}>{editing === 'new' ? 'Add address' : 'Edit address'}</h4>
          <div className="grid-2">
            <div className="field"><label>Label</label><input className="input" placeholder="Home, Warehouse…" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} /></div>
            <div className="field"><label>Full name</label><input className="input" required value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} /></div>
          </div>
          <div className="grid-2" style={{ marginTop: 14 }}>
            <div className="field"><label>Phone</label><input className="input" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="field"><label>Email</label><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          </div>
          <div className="grid-2" style={{ marginTop: 14 }}>
            <div className="field"><label>Address line 1</label><input className="input" required value={form.line1} onChange={(e) => setForm({ ...form, line1: e.target.value })} /></div>
            <div className="field"><label>Address line 2</label><input className="input" value={form.line2} onChange={(e) => setForm({ ...form, line2: e.target.value })} /></div>
          </div>
          <div className="grid-2" style={{ marginTop: 14 }}>
            <div className="field"><label>City</label><input className="input" required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
            <div className="field"><label>State</label><input className="input" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></div>
          </div>
          <div className="grid-2" style={{ marginTop: 14 }}>
            <div className="field"><label>Postcode</label><input className="input" required value={form.postcode} onChange={(e) => setForm({ ...form, postcode: e.target.value })} /></div>
            <div className="field"><label>Country code</label><input className="input" required maxLength={2} value={form.countryCode} onChange={(e) => setForm({ ...form, countryCode: e.target.value.toUpperCase() })} /></div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 13 }}>
            <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} /> Set as default
          </label>
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button type="button" className="btn btn-outline" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn btn-primary">Save address</button>
          </div>
        </form>
      )}
    </div>
  );
}

function OrderDetailModal({ order, onClose }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(14,27,61,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}
      onClick={onClose}
    >
      <div className="card" style={{ padding: 28, width: 460, maxHeight: '80vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <h3 className="h-md" style={{ marginBottom: 4 }}>{order.orderNumber}</h3>
        <p style={{ fontSize: 12.5, color: 'var(--slate-light)', marginBottom: 16 }}>{order.trackingNumber || 'Tracking number pending payment'}</p>

        <Row label="Service" value={order.service.name} />
        <Row label="Chargeable weight" value={`${order.chargeableWeightKg} kg`} />
        <Row label="Zone" value={order.zoneCode} />
        <Row label="Base freight" value={`₹${Number(order.baseFreight).toFixed(2)}`} />
        <Row label="Surcharges" value={`₹${Number(order.surchargesTotal).toFixed(2)}`} />
        {Number(order.addonsTotal) > 0 && <Row label="Add-ons" value={`₹${Number(order.addonsTotal).toFixed(2)}`} />}
        {Number(order.discountTotal) > 0 && <Row label="Discount" value={`-₹${Number(order.discountTotal).toFixed(2)}`} />}
        <Row label="Tax" value={`₹${Number(order.taxTotal).toFixed(2)}`} />
        <Row label="Grand total" value={`₹${Number(order.grandTotal).toFixed(2)} ${order.currency}`} bold />

        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--line-2)' }}>
          <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Sender</p>
          <p style={{ fontSize: 13, color: 'var(--slate)' }}>{order.senderAddress.contactName}, {order.senderAddress.city}, {order.senderAddress.countryCode}</p>
          <p style={{ fontWeight: 600, fontSize: 13, margin: '10px 0 4px' }}>Receiver</p>
          <p style={{ fontSize: 13, color: 'var(--slate)' }}>{order.receiverAddress.contactName}, {order.receiverAddress.city}, {order.receiverAddress.countryCode}</p>
        </div>

        <button className="btn btn-outline block" style={{ marginTop: 20 }} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

function Row({ label, value, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, padding: '4px 0', fontWeight: bold ? 700 : 400, color: bold ? 'var(--navy)' : 'var(--ink)' }}>
      <span style={{ color: 'var(--slate)' }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
