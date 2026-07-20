import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../api/AuthContext';
import ChangePassword from '../components/ChangePassword';
import logoFooter from '../assets/logo-footer.png';

export default function AdminDashboard() {
  const [tab, setTab] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const TABS = [
    ['overview', 'Overview'],
    ['orders', 'Orders'],
    ...(isAdmin ? [['rates', 'Zones & Rates']] : []),
    ...(isAdmin ? [['users', 'Users']] : []),
    ['account', 'Account'],
  ];

  function selectTab(key) {
    setTab(key);
    setSidebarOpen(false);
  }

  return (
    <div className="app-shell">
      <div className="app-mobile-bar">
        <button className="app-hamburger" onClick={() => setSidebarOpen(true)} aria-label="Open menu">☰</button>
        <img className="logo-img" src={logoFooter} alt="Comonn" />
      </div>
      {sidebarOpen && <div className="app-sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}
      <aside className={`app-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <button className="app-sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close menu">✕</button>
        <div className="brand"><img className="logo-img lg" src={logoFooter} alt="Comonn" /><span style={{ fontSize: 12, fontWeight: 700, color: '#93A0C4', textTransform: 'uppercase', letterSpacing: '.06em' }}>Admin</span></div>
        {TABS.map(([key, label]) => (
          <button key={key} className={`app-navlink ${tab === key ? 'active' : ''}`} onClick={() => selectTab(key)}>{label}</button>
        ))}
        <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,.1)' }}>
          <Link to="/" className="app-navlink">← Back to site</Link>
          <button className="app-navlink" onClick={logout}>Log out</button>
        </div>
      </aside>
      <main className="app-main">
        {tab === 'overview' && <Overview />}
        {tab === 'orders' && <OrdersPanel />}
        {tab === 'rates' && isAdmin && <RatesPanel />}
        {tab === 'users' && isAdmin && <UsersPanel />}
        {tab === 'account' && <ChangePassword />}
      </main>
    </div>
  );
}

function Overview() {
  const [data, setData] = useState(null);

  useEffect(() => {
    client.get('/admin/dashboard').then(({ data }) => setData(data));
  }, []);

  if (!data) return <p className="lead">Loading…</p>;
  const { totals, recentOrders } = data;

  return (
    <div>
      <h1 className="h-lg" style={{ marginBottom: 20 }}>Overview</h1>
      <div className="stat-grid">
        <Stat label="Total orders" value={totals.totalOrders} />
        <Stat label="Pending payment" value={totals.pendingPayment} />
        <Stat label="Paid" value={totals.paid} />
        <Stat label="In transit" value={totals.inTransit} />
        <Stat label="Delivered" value={totals.delivered} />
        <Stat label="Total revenue" value={`₹${Number(totals.totalRevenue).toFixed(2)}`} />
      </div>

      <h3 className="h-md" style={{ margin: '24px 0 12px' }}>Recent orders</h3>
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Order</th><th>Service</th><th>Destination</th><th>Status</th></tr></thead>
          <tbody>
            {recentOrders.map((o) => (
              <tr key={o.id}>
                <td className="mono">{o.orderNumber}</td>
                <td>{o.service.name}</td>
                <td>{o.receiverAddress?.city}, {o.receiverAddress?.countryCode}</td>
                <td>{o.status.replace(/_/g, ' ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat-card">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}

const ORDER_STATUSES = ['PENDING_PAYMENT', 'PICKUP_CONFIRMED', 'PAID', 'LABEL_GENERATED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'EXCEPTION'];

const STATUS_PILL = {
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

// Third element is the status filter; fourth is the filter mode when there's
// no status list — 'hasUser' scopes to orders tied to a registered account,
// 'all' shows every booking regardless of account/status.
const ORDER_TABS = [
  ['bookings', 'Bookings', null, 'all'],
  ['pickup', 'Pickup orders', ['PICKUP_CONFIRMED', 'PAID', 'LABEL_GENERATED']],
  ['delivery', 'Delivery orders', ['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY']],
  ['users', 'Users orders', null, 'hasUser'],
  ['history', 'Orders history', ['DELIVERED', 'CANCELLED', 'EXCEPTION']],
  ['unconfirmed', 'Unconfirmed orders', ['PENDING_PAYMENT']],
];

function IndiaFlagChip() {
  return (
    <svg viewBox="0 0 60 40">
      <rect width="60" height="40" fill="#FF9933" />
      <rect y="13.3" width="60" height="13.3" fill="#fff" />
      <rect y="26.6" width="60" height="13.4" fill="#138808" />
      <circle cx="30" cy="20" r="3.2" fill="none" stroke="#000080" strokeWidth="0.6" />
    </svg>
  );
}

function OrdersPanel() {
  const [tab, setTab] = useState('pickup');
  const [zones, setZones] = useState([]);
  const [zoneCode, setZoneCode] = useState('');
  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailOrder, setDetailOrder] = useState(null);
  const [commentOrder, setCommentOrder] = useState(null);
  const seqRef = useRef(0);

  useEffect(() => {
    client.get('/admin/zones').then(({ data }) => setZones(data.zones)).catch(() => {});
  }, []);

  function load() {
    setLoading(true);
    const seq = ++seqRef.current;
    const tabDef = ORDER_TABS.find(([key]) => key === tab);
    const params = { q: q || undefined, page, pageSize, zoneCode: zoneCode || undefined };
    if (tabDef[2]) params.status = tabDef[2].join(',');
    else if (tabDef[3] === 'hasUser') params.hasUser = 'true';
    // 'all' mode (Bookings tab): no status/hasUser filter — every booking.

    client.get('/orders', { params }).then(({ data }) => {
      if (seq !== seqRef.current) return; // a newer request superseded this one
      setOrders(data.orders);
      setTotal(data.total);
      setLoading(false);
    }).catch(() => { if (seq === seqRef.current) setLoading(false); });
  }
  useEffect(load, [tab, zoneCode, page]);

  function search(e) {
    e.preventDefault();
    setPage(1);
    load();
  }

  async function updateStatus(id, status) {
    const { data } = await client.patch(`/orders/${id}/status`, { status });
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: data.order.status } : o)));
  }

  async function openDetail(id) {
    const { data } = await client.get(`/orders/${id}`);
    setDetailOrder(data.order);
  }

  async function cancelBooking(id) {
    if (!confirm('Delete (cancel) this booking? This cannot be undone from here.')) return;
    const { data } = await client.post(`/orders/${id}/cancel`);
    setOrders((prev) => prev.map((o) => (o.id === id ? data.order : o)));
  }

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <h1 className="h-lg" style={{ marginBottom: 16 }}>Orders</h1>

      <div className="dash-tabs">
        {ORDER_TABS.map(([key, label]) => (
          <button key={key} className={`dash-tab ${tab === key ? 'active' : ''}`} onClick={() => { setTab(key); setPage(1); }}>
            {label}
          </button>
        ))}
      </div>

      <div className="chip-filter-row">
        <div className="chip-filter active"><IndiaFlagChip /> India</div>
      </div>

      <div className="chip-filter-row">
        <div className={`chip-filter ${!zoneCode ? 'active' : ''}`} onClick={() => { setZoneCode(''); setPage(1); }}>All Zones</div>
        {zones.map((z) => (
          <div key={z.id} className={`chip-filter ${zoneCode === z.code ? 'active' : ''}`} onClick={() => { setZoneCode(z.code); setPage(1); }}>
            {z.code}
          </div>
        ))}
      </div>

      <div className="dash-toolbar">
        <form className="search-box" onSubmit={search}>
          🔍<input placeholder="Search order ID, city…" value={q} onChange={(e) => setQ(e.target.value)} />
        </form>
        <div className="pager">
          <span>{total} order{total === 1 ? '' : 's'}</span>
          <button type="button" className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹</button>
          <span className="mono" style={{ fontSize: 13 }}>{page} / {pageCount}</span>
          <button type="button" className="btn btn-outline btn-sm" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>›</button>
        </div>
      </div>

      {loading ? <p className="lead">Loading…</p> : (
        <div className="table-wrap">
          <div className={`t-row t-head orders-detailed ${tab === 'bookings' ? 'with-actions' : ''}`}>
            <div>Order ID</div><div>From Address</div><div>To Address</div><div>{tab === 'pickup' || tab === 'bookings' ? 'Pickup Date' : 'Qty'}</div><div>Order Status</div><div>Comment</div>{tab === 'bookings' && <div></div>}
          </div>
          {orders.map((o) => (
            <div className={`t-row orders-detailed ${tab === 'bookings' ? 'with-actions' : ''}`} key={o.id}>
              <button className="t-oid" onClick={() => openDetail(o.id)}>{o.orderNumber}</button>
              <div>{o.senderAddress?.city}, {o.senderAddress?.countryCode}</div>
              <div>{o.receiverAddress?.city}, {o.receiverAddress?.countryCode}</div>
              <div>{tab === 'pickup' || tab === 'bookings' ? (o.pickupDate || '—') : (o.items?.reduce((sum, it) => sum + it.quantity, 0) ?? 1)}</div>
              <div>
                <select
                  className={`status-badge status-dd ${STATUS_PILL[o.status] || 'pill-navy'}`}
                  style={{ border: 'none', cursor: 'pointer' }}
                  value={o.status}
                  onChange={(e) => updateStatus(o.id, e.target.value)}
                >
                  {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div><button className="btn btn-outline btn-sm" onClick={() => setCommentOrder(o)}>View</button></div>
              {tab === 'bookings' && (
                <div>
                  <button
                    className="row-delete-btn"
                    title="Delete booking"
                    aria-label="Delete booking"
                    disabled={['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(o.status)}
                    onClick={() => cancelBooking(o.id)}
                  >
                    🗑
                  </button>
                </div>
              )}
            </div>
          ))}
          {orders.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: 'var(--slate-light)' }}>No orders match this filter.</div>}
        </div>
      )}

      {detailOrder && <OrderDetailAdminModal order={detailOrder} onClose={() => setDetailOrder(null)} />}
      {commentOrder && <OrderCommentsModal order={commentOrder} onClose={() => setCommentOrder(null)} />}
    </div>
  );
}

function OrderDetailAdminModal({ order, onClose }) {
  const itemsSummary = order.items?.map((it) => `${it.itemType} · ${it.actualWeightKg} kg · Qty ${String(it.quantity).padStart(2, '0')}`).join(', ');
  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <h3 style={{ fontSize: 17 }}>Order <span className="mono">{order.orderNumber}</span></h3>
            <p style={{ fontSize: 12.5, color: 'var(--slate-light)', marginTop: 4 }}>Everything the customer entered at booking</p>
          </div>
          <button onClick={onClose} style={{ background: 'var(--paper)', border: 'none', width: 44, height: 44, borderRadius: '50%', fontSize: 15, color: 'var(--slate)', cursor: 'pointer', flex: 'none' }}>✕</button>
        </div>

        <div className="detail-section">
          <h4>Route</h4>
          <div className="addr-grid" style={{ margin: 0 }}>
            <div className="addr-block"><div className="lbl">Origin</div><p>{order.senderAddress?.city}, {order.senderAddress?.countryCode}</p></div>
            <div className="addr-block"><div className="lbl">Destination</div><p>{order.receiverAddress?.city}, {order.receiverAddress?.countryCode}</p></div>
          </div>
        </div>

        <div className="detail-section">
          <h4>Shipment</h4>
          <div className="detail-grid">
            <div className="detail-row" style={{ gridColumn: '1/-1' }}><span className="k">Items</span><span className="v">{itemsSummary || '—'}</span></div>
            <div className="detail-row"><span className="k">Service</span><span className="v">{order.service?.name}</span></div>
            <div className="detail-row"><span className="k">Total</span><span className="v">₹{Number(order.grandTotal).toFixed(2)} {order.currency}</span></div>
            <div className="detail-row" style={{ gridColumn: '1/-1' }}><span className="k">Goods description</span><span className="v">{order.contentsDescription || '—'}</span></div>
            <div className="detail-row"><span className="k">Value of goods</span><span className="v">₹{Number(order.declaredValue).toFixed(2)}</span></div>
          </div>
        </div>

        <div className="detail-section">
          <h4>Receiver details</h4>
          <div className="detail-grid">
            <div className="detail-row"><span className="k">Name</span><span className="v">{order.receiverAddress?.contactName}</span></div>
            <div className="detail-row"><span className="k">Phone</span><span className="v">{order.receiverAddress?.phone}</span></div>
            <div className="detail-row"><span className="k">Email</span><span className="v">{order.receiverAddress?.email || '—'}</span></div>
            <div className="detail-row"><span className="k">Delivery instructions</span><span className="v">{order.receiverAddress?.instructions || '—'}</span></div>
            <div className="detail-row" style={{ gridColumn: '1/-1' }}>
              <span className="k">Address</span>
              <span className="v">{order.receiverAddress?.line1}{order.receiverAddress?.line2 ? `, ${order.receiverAddress.line2}` : ''}, {order.receiverAddress?.city}{order.receiverAddress?.state ? `, ${order.receiverAddress.state}` : ''} {order.receiverAddress?.postcode}, {order.receiverAddress?.countryCode}</span>
            </div>
          </div>
        </div>

        <div className="detail-section" style={{ marginBottom: 0 }}>
          <h4>Sender details</h4>
          <div className="detail-grid">
            <div className="detail-row"><span className="k">Name</span><span className="v">{order.senderAddress?.contactName}</span></div>
            <div className="detail-row"><span className="k">Phone</span><span className="v">{order.senderAddress?.phone}</span></div>
            <div className="detail-row"><span className="k">Email</span><span className="v">{order.senderAddress?.email || '—'}</span></div>
            <div className="detail-row" style={{ gridColumn: '1/-1' }}>
              <span className="k">Address</span>
              <span className="v">{order.senderAddress?.line1}{order.senderAddress?.line2 ? `, ${order.senderAddress.line2}` : ''}, {order.senderAddress?.city}{order.senderAddress?.state ? `, ${order.senderAddress.state}` : ''} {order.senderAddress?.postcode}, {order.senderAddress?.countryCode}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OrderCommentsModal({ order, onClose }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');

  function load() {
    setLoading(true);
    client.get(`/orders/${order.id}/comments`).then(({ data }) => {
      setComments(data.comments);
      setLoading(false);
    }).catch(() => setLoading(false));
  }
  useEffect(load, [order.id]);

  async function submit(e) {
    e.preventDefault();
    if (!body.trim()) return;
    setPosting(true);
    setError('');
    try {
      const { data } = await client.post(`/orders/${order.id}/comments`, { body });
      setComments((prev) => [...prev, data.comment]);
      setBody('');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not add comment.');
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h3 style={{ fontSize: 17 }}>Comments — <span className="mono">{order.orderNumber}</span></h3>
            <p style={{ fontSize: 12.5, color: 'var(--slate-light)', marginTop: 4 }}>Internal notes, visible only to admin &amp; staff</p>
          </div>
          <button onClick={onClose} style={{ background: 'var(--paper)', border: 'none', width: 44, height: 44, borderRadius: '50%', fontSize: 15, color: 'var(--slate)', cursor: 'pointer', flex: 'none' }}>✕</button>
        </div>

        {loading ? (
          <p className="lead" style={{ fontSize: 13.5 }}>Loading…</p>
        ) : comments.length === 0 ? (
          <p className="lead" style={{ fontSize: 13.5 }}>No comments yet.</p>
        ) : (
          <div style={{ maxHeight: 320, overflowY: 'auto', marginBottom: 16 }}>
            {comments.map((c) => (
              <div className="comment-item" key={c.id}>
                <div className="meta">
                  <span className="author">{c.author?.fullName || c.author?.email || 'Unknown'}</span>
                  <span>{new Date(c.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <p className="body">{c.body}</p>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={submit} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', borderTop: '1px solid var(--line-2)', paddingTop: 14 }}>
          <textarea
            className="input"
            placeholder="Add a comment…"
            rows={2}
            style={{ resize: 'vertical', flex: 1 }}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <button className="btn btn-primary btn-sm" disabled={!body.trim() || posting} style={{ flex: 'none' }}>
            {posting ? '…' : 'Add comment'}
          </button>
        </form>
        {error && <div className="error-text" style={{ marginTop: 8 }}>{error}</div>}
      </div>
    </div>
  );
}

function RatesPanel() {
  const [zones, setZones] = useState([]);
  const [services, setServices] = useState([]);
  const [rateCards, setRateCards] = useState([]);
  const [form, setForm] = useState({ serviceId: '', zoneId: '', weightFromKg: '', weightToKg: '', basePrice: '', perKgOverage: '', currency: 'INR' });

  function load() {
    client.get('/admin/zones').then(({ data }) => setZones(data.zones));
    client.get('/admin/services').then(({ data }) => setServices(data.services));
    client.get('/admin/rate-cards').then(({ data }) => setRateCards(data.rateCards));
  }
  useEffect(load, []);

  async function submit(e) {
    e.preventDefault();
    await client.post('/admin/rate-cards', form);
    setForm({ ...form, weightFromKg: '', weightToKg: '', basePrice: '', perKgOverage: '' });
    load();
  }

  async function remove(id) {
    if (!confirm('Delete this rate bracket?')) return;
    await client.delete(`/admin/rate-cards/${id}`);
    load();
  }

  return (
    <div>
      <h1 className="h-lg" style={{ marginBottom: 16 }}>Zones &amp; Rate Cards</h1>

      <div className="card" style={{ padding: 20, marginBottom: 24 }}>
        <h4 style={{ marginBottom: 12, color: 'var(--navy)' }}>Zones</h4>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {zones.map((z) => (
            <span key={z.id} className="pill pill-navy" title={z.countries.map((c) => c.countryName).join(', ')}>
              {z.name} · {z.countries.length} countries
            </span>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 24 }}>
        <h4 style={{ marginBottom: 12, color: 'var(--navy)' }}>Add a rate bracket</h4>
        <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 10, alignItems: 'end' }}>
          <div className="field">
            <label>Service</label>
            <select className="select" required value={form.serviceId} onChange={(e) => setForm({ ...form, serviceId: e.target.value })}>
              <option value="">—</option>
              {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Zone</label>
            <select className="select" required value={form.zoneId} onChange={(e) => setForm({ ...form, zoneId: e.target.value })}>
              <option value="">—</option>
              {zones.map((z) => <option key={z.id} value={z.id}>{z.code}</option>)}
            </select>
          </div>
          <div className="field"><label>From kg</label><input className="input" type="number" step="0.01" required value={form.weightFromKg} onChange={(e) => setForm({ ...form, weightFromKg: e.target.value })} /></div>
          <div className="field"><label>To kg</label><input className="input" type="number" step="0.01" required value={form.weightToKg} onChange={(e) => setForm({ ...form, weightToKg: e.target.value })} /></div>
          <div className="field"><label>Base price</label><input className="input" type="number" step="0.01" required value={form.basePrice} onChange={(e) => setForm({ ...form, basePrice: e.target.value })} /></div>
          <div className="field"><label>₹/kg overage</label><input className="input" type="number" step="0.01" required value={form.perKgOverage} onChange={(e) => setForm({ ...form, perKgOverage: e.target.value })} /></div>
          <button className="btn btn-primary btn-sm" style={{ gridColumn: '1 / -1' }}>Add bracket</button>
        </form>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Service</th><th>Zone</th><th>Weight range</th><th>Base price</th><th>Overage ₹/kg</th><th></th></tr></thead>
          <tbody>
            {rateCards.map((r) => (
              <tr key={r.id}>
                <td>{r.service.name}</td>
                <td>{r.zone.code}</td>
                <td>{r.weightFromKg} – {r.weightToKg} kg</td>
                <td>₹{Number(r.basePrice).toFixed(2)}</td>
                <td>₹{Number(r.perKgOverage).toFixed(2)}</td>
                <td><button className="btn btn-outline btn-sm" onClick={() => remove(r.id)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UsersPanel() {
  const [users, setUsers] = useState([]);
  const [zones, setZones] = useState([]);
  const [staffZones, setStaffZones] = useState({}); // userId -> [zone,...]
  const [editingStaff, setEditingStaff] = useState(null); // { id, fullName }

  function load() {
    client.get('/admin/users').then(({ data }) => setUsers(data.users));
    client.get('/admin/zones').then(({ data }) => setZones(data.zones));
    client.get('/admin/staff-zones').then(({ data }) => {
      const map = {};
      data.staff.forEach((s) => { map[s.id] = s.zones; });
      setStaffZones(map);
    });
  }
  useEffect(load, []);

  async function setRole(id, role) {
    const { data } = await client.patch(`/admin/users/${id}`, { role });
    setUsers((prev) => prev.map((u) => (u.id === id ? data.user : u)));
  }

  async function saveZones(userId, zoneIds) {
    const { data } = await client.put(`/admin/staff-zones/${userId}`, { zoneIds });
    setStaffZones((prev) => ({ ...prev, [userId]: data.zones }));
    setEditingStaff(null);
  }

  return (
    <div>
      <h1 className="h-lg" style={{ marginBottom: 16 }}>Users</h1>
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Name</th><th>Email</th><th>Mobile</th><th>Joined</th><th>Role</th><th>Zones</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.fullName}</td>
                <td>{u.email}</td>
                <td>{u.phone || '—'}</td>
                <td>{new Date(u.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                <td>
                  <select className="select" style={{ padding: '6px 8px', fontSize: 12.5 }} value={u.role} onChange={(e) => setRole(u.id, e.target.value)}>
                    <option value="CUSTOMER">Customer</option>
                    <option value="STAFF">Staff</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </td>
                <td>
                  {u.role === 'STAFF' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {(staffZones[u.id] || []).length === 0 ? (
                        <span style={{ fontSize: 12, color: 'var(--slate-light)' }}>None assigned</span>
                      ) : (
                        (staffZones[u.id] || []).map((z) => <span key={z.id} className="pill pill-navy" style={{ fontSize: 11 }}>{z.code}</span>)
                      )}
                      <button className="btn btn-outline btn-sm" onClick={() => setEditingStaff({ id: u.id, fullName: u.fullName })}>Edit</button>
                    </div>
                  ) : (
                    <span style={{ color: 'var(--slate-light)' }}>—</span>
                  )}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--slate-light)', padding: '24px 0' }}>No accounts yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editingStaff && (
        <StaffZoneModal
          staff={editingStaff}
          zones={zones}
          currentZoneIds={(staffZones[editingStaff.id] || []).map((z) => z.id)}
          onSave={(zoneIds) => saveZones(editingStaff.id, zoneIds)}
          onClose={() => setEditingStaff(null)}
        />
      )}
    </div>
  );
}

function StaffZoneModal({ staff, zones, currentZoneIds, onSave, onClose }) {
  const [selected, setSelected] = useState(currentZoneIds);
  const [saving, setSaving] = useState(false);

  function toggle(zoneId) {
    setSelected((prev) => (prev.includes(zoneId) ? prev.filter((id) => id !== zoneId) : [...prev, zoneId]));
  }

  async function save() {
    setSaving(true);
    await onSave(selected);
    setSaving(false);
  }

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h3 style={{ fontSize: 17 }}>Zones for {staff.fullName}</h3>
          <button onClick={onClose} style={{ background: 'var(--paper)', border: 'none', width: 44, height: 44, borderRadius: '50%', fontSize: 15, color: 'var(--slate)', cursor: 'pointer' }}>✕</button>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--slate)', marginBottom: 16 }}>
          This staff account will only see and filter Pickup/Delivery orders in the zones checked below.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 320, overflowY: 'auto' }}>
          {zones.map((z) => (
            <label key={z.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, cursor: 'pointer' }}>
              <input type="checkbox" checked={selected.includes(z.id)} onChange={() => toggle(z.id)} />
              {z.name}
            </label>
          ))}
        </div>
        <button className="btn btn-primary block" style={{ marginTop: 20, padding: 12 }} disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Save zones'}
        </button>
      </div>
    </div>
  );
}
