import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../api/AuthContext';

export default function AdminDashboard() {
  const [tab, setTab] = useState('overview');
  const { logout } = useAuth();

  const TABS = [
    ['overview', 'Overview'],
    ['orders', 'Orders'],
    ['rates', 'Zones & Rates'],
    ['users', 'Users'],
  ];

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="brand">Comonn<span style={{ color: 'var(--coral)' }}>.</span> Admin</div>
        {TABS.map(([key, label]) => (
          <button key={key} className={`app-navlink ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>{label}</button>
        ))}
        <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,.1)' }}>
          <Link to="/" className="app-navlink">← Back to site</Link>
          <button className="app-navlink" onClick={logout}>Log out</button>
        </div>
      </aside>
      <main className="app-main">
        {tab === 'overview' && <Overview />}
        {tab === 'orders' && <OrdersPanel />}
        {tab === 'rates' && <RatesPanel />}
        {tab === 'users' && <UsersPanel />}
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

const ORDER_STATUSES = ['PENDING_PAYMENT', 'PAID', 'LABEL_GENERATED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'EXCEPTION'];

function OrdersPanel() {
  const [orders, setOrders] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  function load(query = '') {
    setLoading(true);
    client.get('/orders', { params: { q: query || undefined } }).then(({ data }) => setOrders(data.orders)).finally(() => setLoading(false));
  }
  useEffect(() => load(), []);

  async function updateStatus(id, status) {
    const location = prompt('Location (optional)') || undefined;
    const { data } = await client.patch(`/orders/${id}/status`, { status, location });
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: data.order.status } : o)));
  }

  return (
    <div>
      <h1 className="h-lg" style={{ marginBottom: 16 }}>Orders</h1>
      <form onSubmit={(e) => { e.preventDefault(); load(q); }} style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <input className="input" placeholder="Search order or tracking number" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 320 }} />
        <button className="btn btn-outline btn-sm">Search</button>
      </form>

      {loading ? <p className="lead">Loading…</p> : (
        <table className="data-table">
          <thead><tr><th>Order</th><th>Customer</th><th>Service</th><th>Destination</th><th>Total</th><th>Status</th><th>Update</th></tr></thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td className="mono">{o.orderNumber}</td>
                <td>{o.senderAddress?.contactName}</td>
                <td>{o.service.name}</td>
                <td>{o.receiverAddress?.city}, {o.receiverAddress?.countryCode}</td>
                <td>₹{Number(o.grandTotal).toFixed(2)}</td>
                <td>{o.status.replace(/_/g, ' ')}</td>
                <td>
                  <select className="select" style={{ padding: '6px 8px', fontSize: 12.5 }} defaultValue="" onChange={(e) => { if (e.target.value) updateStatus(o.id, e.target.value); e.target.value = ''; }}>
                    <option value="" disabled>Set status…</option>
                    {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function RatesPanel() {
  const [zones, setZones] = useState([]);
  const [services, setServices] = useState([]);
  const [rateCards, setRateCards] = useState([]);
  const [form, setForm] = useState({ serviceId: '', zoneId: '', weightFromKg: '', weightToKg: '', basePrice: '', perKgOverage: '', currency: 'AUD' });

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
  );
}

function UsersPanel() {
  const [users, setUsers] = useState([]);
  useEffect(() => { client.get('/admin/users').then(({ data }) => setUsers(data.users)); }, []);

  async function setRole(id, role) {
    const { data } = await client.patch(`/admin/users/${id}`, { role });
    setUsers((prev) => prev.map((u) => (u.id === id ? data.user : u)));
  }

  return (
    <div>
      <h1 className="h-lg" style={{ marginBottom: 16 }}>Users</h1>
      <table className="data-table">
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.fullName}</td>
              <td>{u.email}</td>
              <td>
                <select className="select" style={{ padding: '6px 8px', fontSize: 12.5 }} value={u.role} onChange={(e) => setRole(u.id, e.target.value)}>
                  <option value="CUSTOMER">CUSTOMER</option>
                  <option value="STAFF">STAFF</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </td>
              <td>{new Date(u.createdAt).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
