import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../api/AuthContext';
import { useBooking } from '../api/BookingContext';
import ChangePassword from '../components/ChangePassword';
import BatchScanPanel from '../components/BatchScanPanel';
import logoFooter from '../assets/logo-footer.png';

export default function AdminDashboard() {
  const [tab, setTab] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const TABS = [
    ['overview', 'Overview'],
    ['orders', 'Orders'],
    ...(isAdmin ? [['accounts', 'Accounts']] : []),
    ['inventory', 'Inventory'],
    ['batchscan', 'Scan'],
    ...(isAdmin ? [['rates', 'Zones & Rates']] : []),
    ...(isAdmin ? [['users', 'Users']] : []),
    ['account', 'Profile'],
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
        {tab === 'accounts' && isAdmin && <AccountsPanel />}
        {tab === 'inventory' && <InventoryPanel />}
        {tab === 'batchscan' && <BatchScanPanel />}
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

const ORDER_STATUSES = ['UNFINISHED', 'PENDING_PAYMENT', 'PICKUP_CONFIRMED', 'PAID', 'LABEL_GENERATED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'EXCEPTION'];

const STATUS_PILL = {
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

// Third element is the status filter; fourth is the filter mode when there's
// no status list — 'hasUser' scopes to orders tied to a registered account,
// 'all' shows every booking regardless of account/status.
// UNFINISHED = a quote+details started but payment never even reached
// (leads for follow-up). PENDING_PAYMENT is now narrower — a pickup-booking
// order staff have already priced and pushed to real payment — tracked
// alongside the rest of the pickup pipeline rather than Unconfirmed.
const ORDER_TABS = [
  ['bookings', 'Bookings', null, 'all'],
  ['pickup', 'Pickup orders', ['PENDING_PAYMENT', 'PICKUP_CONFIRMED', 'PAID', 'LABEL_GENERATED', 'PICKED_UP']],
  ['delivery', 'Delivery orders', ['IN_TRANSIT', 'OUT_FOR_DELIVERY']],
  ['unconfirmed', 'Unconfirmed orders', ['UNFINISHED']],
];

// Reshapes a fetched order back into the same quoteInput/selectedQuote shape
// the booking flow (Quote/Details/Payment) already knows how to hydrate from,
// so "Edit order" can reuse that flow instead of a separate edit UI.
function toQuoteInput(order, destinationCountryName) {
  // Pickup postcode/suburb/state feed the Quote page's origin-zone pricing
  // and autocomplete — without these, editing an order silently reverts to
  // wildcard pricing and shows a blank pincode field.
  const origin = {
    originPostcode: order.senderAddress?.postcode || undefined,
    originSuburb: order.senderAddress?.city || undefined,
    originState: order.senderAddress?.state || undefined,
  };
  if (order.pricingPending) {
    return {
      destinationCountryCode: order.receiverAddress.countryCode,
      destinationCountryName: destinationCountryName || order.receiverAddress.countryCode,
      items: order.items.map((it) => ({ itemType: it.itemType, quantity: it.quantity })),
      pricingPending: true,
      ...origin,
    };
  }
  return {
    destinationCountryCode: order.receiverAddress.countryCode,
    items: order.items.map((it) => ({
      itemType: it.itemType,
      actualWeightKg: Number(it.actualWeightKg),
      lengthCm: Number(it.lengthCm),
      widthCm: Number(it.widthCm),
      heightCm: Number(it.heightCm),
      quantity: it.quantity,
    })),
    ...origin,
  };
}

function toSelectedQuote(order) {
  if (order.pricingPending) return null;
  const chargeableWeightKg = Number(order.chargeableWeightKg);
  return {
    service: { code: order.service.code, name: order.service.name, transitDays: order.service.transitDays },
    zone: { code: order.zoneCode, name: order.zoneCode },
    pricing: {
      unitPrice: chargeableWeightKg > 0 ? Math.round((Number(order.baseFreight) / chargeableWeightKg) * 100) / 100 : 0,
      grandTotal: Number(order.grandTotal),
      currency: order.currency,
    },
    weight: { chargeableWeightKg },
  };
}

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
  // Pickup tab only: origin (sender) state/region — independent of the
  // destination zoneCode filter above.
  const [pickupStates, setPickupStates] = useState([]);
  const [pickupRegionsByState, setPickupRegionsByState] = useState({});
  const [originState, setOriginState] = useState('');
  const [originRegion, setOriginRegion] = useState('');
  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailOrder, setDetailOrder] = useState(null);
  const [commentOrder, setCommentOrder] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [assignDriverId, setAssignDriverId] = useState('');
  const [assigning, setAssigning] = useState(false);
  const seqRef = useRef(0);
  const navigate = useNavigate();
  const { setBooking } = useBooking();

  useEffect(() => {
    client.get('/admin/zones').then(({ data }) => setZones(data.zones)).catch(() => {});
  }, []);

  useEffect(() => {
    if (tab === 'pickup' && drivers.length === 0) {
      client.get('/admin/drivers').then(({ data }) => setDrivers(data.drivers)).catch(() => {});
    }
    if (tab === 'pickup' && pickupStates.length === 0) {
      client.get('/admin/pickup-origins').then(({ data }) => {
        setPickupStates(data.states);
        setPickupRegionsByState(data.regionsByState);
      }).catch(() => {});
    }
    setSelectedIds([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Picking a different state clears any region filter from the previous
  // state's list — a region name is only meaningful within its own state.
  function selectOriginState(state) {
    setOriginState(state);
    setOriginRegion('');
    setPage(1);
  }

  function load() {
    setLoading(true);
    const seq = ++seqRef.current;
    const tabDef = ORDER_TABS.find(([key]) => key === tab);
    const params = {
      q: q || undefined,
      page,
      pageSize,
      zoneCode: zoneCode || undefined,
      originState: tab === 'pickup' ? originState || undefined : undefined,
      originRegion: tab === 'pickup' ? originRegion || undefined : undefined,
    };
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
  useEffect(load, [tab, zoneCode, page, originState, originRegion]);

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

  function toggleSelect(id) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  // Sends every selected pickup job to one driver in a single action — the
  // driver then sees these in their own portal and marks each PICKED_UP once
  // collected in person.
  async function sendToDriver() {
    if (!assignDriverId || selectedIds.length === 0) return;
    setAssigning(true);
    try {
      const { data } = await client.patch('/orders/assign-driver', { orderIds: selectedIds, driverId: assignDriverId });
      const byId = Object.fromEntries(data.orders.map((o) => [o.id, o]));
      setOrders((prev) => prev.map((o) => (byId[o.id] ? { ...o, assignedDriver: byId[o.id].assignedDriver } : o)));
      setSelectedIds([]);
      setAssignDriverId('');
    } catch (err) {
      alert(err.response?.data?.error || 'Could not send these jobs to the driver.');
    } finally {
      setAssigning(false);
    }
  }

  // Sends the existing order back through the Quote/Details/Payment flow,
  // pre-filled, so staff can edit service/items/addresses and see the
  // re-priced total (with any due/credit balance) on the Payment page.
  async function editOrder(id) {
    setEditingId(id);
    try {
      const { data } = await client.get(`/orders/${id}`);
      const order = data.order;
      let destinationCountryName;
      if (order.pricingPending) {
        try {
          const { data: cd } = await client.get('/quote/countries');
          destinationCountryName = cd.countries.find((c) => c.countryCode === order.receiverAddress.countryCode)?.countryName;
        } catch {
          // fall back to the raw country code if the lookup fails
        }
      }
      setBooking({
        quoteInput: toQuoteInput(order, destinationCountryName),
        selectedQuote: toSelectedQuote(order),
        order,
      });
      navigate('/quote');
    } catch (err) {
      alert(err.response?.data?.error || 'Could not load this order for editing.');
    } finally {
      setEditingId(null);
    }
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

      {tab === 'pickup' && pickupStates.length > 0 && (
        <div className="chip-filter-row">
          <div className={`chip-filter ${!originState ? 'active' : ''}`} onClick={() => selectOriginState('')}>All States</div>
          {pickupStates.map((s) => (
            <div key={s} className={`chip-filter ${originState === s ? 'active' : ''}`} onClick={() => selectOriginState(s)}>
              {s}
            </div>
          ))}
        </div>
      )}

      {tab === 'pickup' && originState && (pickupRegionsByState[originState] || []).length > 0 && (
        <div className="chip-filter-row">
          <div className={`chip-filter ${!originRegion ? 'active' : ''}`} onClick={() => { setOriginRegion(''); setPage(1); }}>All Regions</div>
          {pickupRegionsByState[originState].map((r) => (
            <div key={r} className={`chip-filter ${originRegion === r ? 'active' : ''}`} onClick={() => { setOriginRegion(r); setPage(1); }}>
              {r}
            </div>
          ))}
        </div>
      )}

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

      {tab === 'pickup' && selectedIds.length > 0 && (
        <div className="card" style={{ padding: 14, marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>{selectedIds.length} selected</span>
          <select className="select" style={{ maxWidth: 220 }} value={assignDriverId} onChange={(e) => setAssignDriverId(e.target.value)}>
            <option value="">Choose a driver…</option>
            {drivers.map((d) => <option key={d.id} value={d.id}>{d.fullName}</option>)}
          </select>
          <button className="btn btn-primary btn-sm" disabled={!assignDriverId || assigning} onClick={sendToDriver}>
            {assigning ? 'Sending…' : 'Send to driver'}
          </button>
          {drivers.length === 0 && <span style={{ fontSize: 12, color: 'var(--slate-light)' }}>No driver accounts yet — create one from Users (set role to Driver).</span>}
        </div>
      )}

      {loading ? <p className="lead">Loading…</p> : (
        <div className="table-wrap">
          <div className={`t-row t-head orders-detailed ${tab === 'bookings' ? 'with-actions' : ''} ${tab === 'pickup' ? 'with-driver' : ''}`}>
            {tab === 'pickup' && <div></div>}
            <div>Order ID</div><div>From Address</div><div>To Address</div><div>{tab === 'pickup' || tab === 'bookings' ? 'Pickup Date' : 'Qty'}</div><div>Order Status</div><div>Comment</div>{tab === 'bookings' && <div></div>}{tab === 'pickup' && <div>Driver</div>}
          </div>
          {orders.map((o) => (
            <div className={`t-row orders-detailed ${tab === 'bookings' ? 'with-actions' : ''} ${tab === 'pickup' ? 'with-driver' : ''}`} key={o.id}>
              {tab === 'pickup' && (
                <div>
                  <input type="checkbox" checked={selectedIds.includes(o.id)} onChange={() => toggleSelect(o.id)} />
                </div>
              )}
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
                  {!ORDER_STATUSES.includes(o.status) && <option value={o.status}>{o.status}</option>}
                  {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div><button className="btn btn-outline btn-sm" onClick={() => setCommentOrder(o)}>View</button></div>
              {tab === 'bookings' && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className="row-edit-btn"
                    title="Edit order"
                    aria-label="Edit order"
                    disabled={editingId === o.id}
                    onClick={() => editOrder(o.id)}
                  >
                    {editingId === o.id ? '…' : '✏️'}
                  </button>
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
              {tab === 'pickup' && (
                <div>
                  {o.assignedDriver ? (
                    <span className="pill pill-cobalt" style={{ fontSize: 11 }}>{o.assignedDriver.fullName}</span>
                  ) : (
                    <span style={{ color: 'var(--slate-light)', fontSize: 12 }}>Unassigned</span>
                  )}
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

function paidAndDue(o) {
  const grandTotal = Number(o.grandTotal);
  const amountPaid = o.payment?.status === 'SUCCEEDED' ? Number(o.payment.amount) : 0;
  const due = Math.round((grandTotal - amountPaid) * 100) / 100;
  return { amountPaid, due };
}

function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function monthStart(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function monthEnd(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }

function AccountsPanel() {
  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const now = useState(() => new Date())[0];
  const [fromDate, setFromDate] = useState(isoDate(monthStart(now)));
  const [toDate, setToDate] = useState(isoDate(monthEnd(now)));
  const seqRef = useRef(0);

  function load() {
    setLoading(true);
    const seq = ++seqRef.current;
    const params = { q: q || undefined, page, pageSize, from: fromDate || undefined, to: toDate || undefined };
    Promise.all([
      client.get('/orders', { params }),
      client.get('/orders/summary', { params }),
    ]).then(([ordersRes, summaryRes]) => {
      if (seq !== seqRef.current) return;
      setOrders(ordersRes.data.orders);
      setTotal(ordersRes.data.total);
      setSummary(summaryRes.data);
      setLoading(false);
    }).catch(() => { if (seq === seqRef.current) setLoading(false); });
  }
  useEffect(load, [page, fromDate, toDate]);

  function search(e) {
    e.preventDefault();
    setPage(1);
    load();
  }

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <h1 className="h-lg" style={{ marginBottom: 16 }}>Accounts</h1>

      <div className="card" style={{ padding: 14, marginBottom: 16, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, color: 'var(--slate)', fontWeight: 600 }}>Showing bookings from</span>
        <input className="input" type="date" style={{ maxWidth: 170 }} value={fromDate} max={toDate} onChange={(e) => { setPage(1); setFromDate(e.target.value); }} />
        <span style={{ fontSize: 12.5, color: 'var(--slate)' }}>to</span>
        <input className="input" type="date" style={{ maxWidth: 170 }} value={toDate} min={fromDate} onChange={(e) => { setPage(1); setToDate(e.target.value); }} />
      </div>

      {summary && (
        <div className="stat-grid" style={{ marginBottom: 20 }}>
          <Stat label="Total bookings" value={summary.totalBookings} />
          <Stat label="Total paid" value={`₹${Number(summary.totalPaid).toFixed(2)}`} />
          <Stat label="Total to pay" value={`₹${Number(summary.totalDue).toFixed(2)}`} />
          <Stat label="Total credit owed" value={`₹${Number(summary.totalCredit).toFixed(2)}`} />
        </div>
      )}

      <div className="dash-toolbar">
        <form className="search-box" onSubmit={search}>
          🔍<input placeholder="Search order ID, city…" value={q} onChange={(e) => setQ(e.target.value)} />
        </form>
        <div className="pager">
          <span>{total} booking{total === 1 ? '' : 's'}</span>
          <button type="button" className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹</button>
          <span className="mono" style={{ fontSize: 13 }}>{page} / {pageCount}</span>
          <button type="button" className="btn btn-outline btn-sm" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>›</button>
        </div>
      </div>

      {loading ? <p className="lead">Loading…</p> : (
        <div className="table-wrap">
          <div className="t-row t-head accounts-row">
            <div>Order ID</div><div>Invoice #</div><div>From Address</div><div>To Address</div><div>Paid / To pay</div>
          </div>
          {orders.map((o) => {
            const { amountPaid, due } = paidAndDue(o);
            return (
              <div className="t-row accounts-row" key={o.id}>
                <div className="mono">{o.orderNumber}</div>
                <div className="mono">{o.invoiceNumber || '—'}</div>
                <div>{o.senderAddress?.city}, {o.senderAddress?.countryCode}</div>
                <div>{o.receiverAddress?.city}, {o.receiverAddress?.countryCode}</div>
                <div>
                  <div style={{ color: 'var(--success)', fontWeight: 700, fontSize: 13 }}>Paid ₹{amountPaid.toFixed(2)}</div>
                  {due > 0 ? (
                    <div style={{ color: 'var(--danger)', fontSize: 12 }}>To pay ₹{due.toFixed(2)}</div>
                  ) : due < 0 ? (
                    <div style={{ color: 'var(--slate)', fontSize: 12 }}>Credit ₹{Math.abs(due).toFixed(2)}</div>
                  ) : null}
                </div>
              </div>
            );
          })}
          {orders.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: 'var(--slate-light)' }}>No bookings yet.</div>}
        </div>
      )}
    </div>
  );
}

const LABEL_ELIGIBLE_STATUSES = ['PAID', 'LABEL_GENERATED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'];

function OrderDetailAdminModal({ order, onClose }) {
  const itemsSummary = order.items?.map((it) => `${it.itemType} · ${it.actualWeightKg} kg · Qty ${String(it.quantity).padStart(2, '0')}`).join(', ');
  const [labels, setLabels] = useState(order.labels || []);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');

  async function generateLabel() {
    setGenerating(true);
    setGenerateError('');
    try {
      const { data } = await client.post(`/labels/${order.id}/generate`);
      setLabels(data.labels || []);
    } catch (err) {
      setGenerateError(err.response?.data?.error || 'Could not generate the label — please try again.');
    } finally {
      setGenerating(false);
    }
  }

  const canGenerate = labels.length === 0 && !order.pricingPending && LABEL_ELIGIBLE_STATUSES.includes(order.status);

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

        {labels.length > 0 && (
          <div className="detail-section" style={{ marginBottom: 0, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {labels.map((l) => (
              <a key={l.id} className="btn btn-outline btn-sm" href={`${import.meta.env.VITE_API_BASE_URL || '/api'}/labels/download/${l.id}?inline=1`} target="_blank" rel="noreferrer">
                View label{labels.length > 1 ? ` (${l.packageIndex})` : ''}
              </a>
            ))}
            <a className="btn btn-outline btn-sm" href={`${import.meta.env.VITE_API_BASE_URL || '/api'}/labels/invoice/download/${order.id}?inline=1`} target="_blank" rel="noreferrer">
              View invoice
            </a>
          </div>
        )}

        {canGenerate && (
          <div className="detail-section" style={{ marginBottom: 0 }}>
            <button className="btn btn-outline btn-sm" disabled={generating} onClick={generateLabel}>
              {generating ? 'Generating…' : 'Generate label & invoice'}
            </button>
            {generateError && <div className="error-text" style={{ marginTop: 8 }}>{generateError}</div>}
          </div>
        )}
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

function InventoryPanel() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', unit: 'pcs', quantity: '', lowStockThreshold: '' });
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editQty, setEditQty] = useState('');

  function load() {
    setLoading(true);
    client.get('/inventory').then(({ data }) => { setItems(data.items); setLoading(false); }).catch(() => setLoading(false));
  }
  useEffect(load, []);

  async function addItem(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setAdding(true);
    setError('');
    try {
      await client.post('/inventory', {
        name: form.name,
        unit: form.unit,
        quantity: Number(form.quantity) || 0,
        lowStockThreshold: form.lowStockThreshold || undefined,
      });
      setForm({ name: '', unit: 'pcs', quantity: '', lowStockThreshold: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not add this item.');
    } finally {
      setAdding(false);
    }
  }

  function startEdit(item) {
    setEditingId(item.id);
    setEditQty(String(item.quantity));
  }

  async function saveQty(id) {
    const { data } = await client.patch(`/inventory/${id}`, { quantity: Number(editQty) || 0 });
    setItems((prev) => prev.map((it) => (it.id === id ? data.item : it)));
    setEditingId(null);
  }

  async function remove(id) {
    if (!confirm('Delete this inventory item? This cannot be undone.')) return;
    await client.delete(`/inventory/${id}`);
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  return (
    <div>
      <h1 className="h-lg" style={{ marginBottom: 16 }}>Inventory</h1>

      <div className="card" style={{ padding: 20, marginBottom: 24 }}>
        <h4 style={{ marginBottom: 12, color: 'var(--navy)' }}>Add an item</h4>
        <form onSubmit={addItem} style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, alignItems: 'end' }}>
          <div className="field">
            <label>Name</label>
            <input className="input" placeholder="e.g. Heavy-duty cardboard" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field">
            <label>Unit</label>
            <input className="input" placeholder="boxes, rolls, pcs…" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
          </div>
          <div className="field">
            <label>Quantity</label>
            <input className="input" type="number" min="0" placeholder="0" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
          </div>
          <div className="field">
            <label>Low-stock alert below</label>
            <input className="input" type="number" min="0" placeholder="Optional" value={form.lowStockThreshold} onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value })} />
          </div>
          <button className="btn btn-primary btn-sm" disabled={adding}>{adding ? 'Adding…' : 'Add item'}</button>
        </form>
        {error && <div className="error-text" style={{ marginTop: 10 }}>{error}</div>}
      </div>

      {loading ? <p className="lead">Loading…</p> : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Unit</th><th>Quantity</th><th>Last updated by</th><th></th></tr></thead>
            <tbody>
              {items.map((it) => {
                const low = it.lowStockThreshold != null && it.quantity <= it.lowStockThreshold;
                return (
                  <tr key={it.id}>
                    <td>{it.name}</td>
                    <td>{it.unit}</td>
                    <td>
                      {editingId === it.id ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <input className="input" type="number" min="0" style={{ width: 90, padding: '6px 8px' }} value={editQty} onChange={(e) => setEditQty(e.target.value)} autoFocus />
                          <button className="btn btn-primary btn-sm" onClick={() => saveQty(it.id)}>Save</button>
                          <button className="btn btn-outline btn-sm" onClick={() => setEditingId(null)}>Cancel</button>
                        </div>
                      ) : (
                        <span
                          style={{ cursor: 'pointer', fontWeight: 700, color: low ? 'var(--danger)' : 'var(--ink)' }}
                          onClick={() => startEdit(it)}
                          title="Click to update quantity"
                        >
                          {it.quantity} {low && '⚠️'}
                        </span>
                      )}
                    </td>
                    <td style={{ fontSize: 12.5, color: 'var(--slate-light)' }}>{it.updatedBy?.fullName || '—'}</td>
                    <td><button className="btn btn-outline btn-sm" onClick={() => remove(it.id)}>Delete</button></td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--slate-light)', padding: '24px 0' }}>No inventory items yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const EMPTY_RATE_FORM = { id: null, serviceId: '', fromZoneId: '', zoneId: '', weightFromKg: '', weightToKg: '', basePrice: '', perKgOverage: '', currency: 'INR', transitDaysMin: '', transitDaysMax: '' };

// Document Express and Pickup Booking aren't priced via weight/zone rate
// brackets (Document is retired, Pickup is priced by staff at collection) —
// hidden from "Add a rate bracket", but kept selectable if a bracket for one
// of them is already being edited so its service isn't silently reassigned.
const RATE_BRACKET_EXCLUDED_SERVICE_CODES = ['DOCUMENTS', 'PICKUP'];

function RatesPanel() {
  const [zones, setZones] = useState([]);
  const [originZones, setOriginZones] = useState([]);
  const [services, setServices] = useState([]);
  const [rateCards, setRateCards] = useState([]);
  const [form, setForm] = useState(EMPTY_RATE_FORM);

  function load() {
    client.get('/admin/zones').then(({ data }) => setZones(data.zones));
    client.get('/admin/zones', { params: { kind: 'origin' } }).then(({ data }) => setOriginZones(data.zones));
    client.get('/admin/services').then(({ data }) => setServices(data.services));
    client.get('/admin/rate-cards').then(({ data }) => setRateCards(data.rateCards));
  }
  useEffect(load, []);

  async function submit(e) {
    e.preventDefault();
    await client.post('/admin/rate-cards', { ...form, fromZoneId: form.fromZoneId || null });
    setForm(EMPTY_RATE_FORM);
    load();
  }

  function startEdit(r) {
    setForm({
      id: r.id,
      serviceId: r.serviceId,
      fromZoneId: r.fromZoneId || '',
      zoneId: r.zoneId,
      weightFromKg: String(r.weightFromKg),
      weightToKg: String(r.weightToKg),
      basePrice: String(r.basePrice),
      perKgOverage: String(r.perKgOverage),
      currency: r.currency,
      transitDaysMin: r.transitDaysMin === null || r.transitDaysMin === undefined ? '' : String(r.transitDaysMin),
      transitDaysMax: r.transitDaysMax === null || r.transitDaysMax === undefined ? '' : String(r.transitDaysMax),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEdit() {
    setForm(EMPTY_RATE_FORM);
  }

  async function remove(id) {
    if (!confirm('Delete this rate bracket?')) return;
    await client.delete(`/admin/rate-cards/${id}`);
    if (form.id === id) setForm(EMPTY_RATE_FORM);
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
        <h4 style={{ marginBottom: 12, color: 'var(--navy)' }}>{form.id ? 'Edit rate bracket' : 'Add a rate bracket'}</h4>
        <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))', gap: 10, alignItems: 'end' }}>
          <div className="field">
            <label>Service</label>
            <select className="select" required value={form.serviceId} onChange={(e) => setForm({ ...form, serviceId: e.target.value })}>
              <option value="">—</option>
              {services
                .filter((s) => !RATE_BRACKET_EXCLUDED_SERVICE_CODES.includes(s.code) || s.id === form.serviceId)
                .map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>From zone (optional)</label>
            <select className="select" value={form.fromZoneId} onChange={(e) => setForm({ ...form, fromZoneId: e.target.value })}>
              <option value="">Any</option>
              {originZones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>To zone</label>
            <select className="select" required value={form.zoneId} onChange={(e) => setForm({ ...form, zoneId: e.target.value })}>
              <option value="">—</option>
              {zones.map((z) => <option key={z.id} value={z.id}>{z.code}</option>)}
            </select>
          </div>
          <div className="field"><label>From kg</label><input className="input" type="number" step="0.01" required value={form.weightFromKg} onChange={(e) => setForm({ ...form, weightFromKg: e.target.value })} /></div>
          <div className="field"><label>To kg</label><input className="input" type="number" step="0.01" required value={form.weightToKg} onChange={(e) => setForm({ ...form, weightToKg: e.target.value })} /></div>
          <div className="field"><label>Base price (optional)</label><input className="input" type="number" step="0.01" placeholder="0" value={form.basePrice} onChange={(e) => setForm({ ...form, basePrice: e.target.value })} /></div>
          <div className="field"><label>₹/kg overage</label><input className="input" type="number" step="0.01" required value={form.perKgOverage} onChange={(e) => setForm({ ...form, perKgOverage: e.target.value })} /></div>
          <div className="field"><label>Delivery days from (optional)</label><input className="input" type="number" step="1" min="0" placeholder="Service default" value={form.transitDaysMin} onChange={(e) => setForm({ ...form, transitDaysMin: e.target.value })} /></div>
          <div className="field"><label>Delivery days to (optional)</label><input className="input" type="number" step="1" min="0" placeholder="Service default" value={form.transitDaysMax} onChange={(e) => setForm({ ...form, transitDaysMax: e.target.value })} /></div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10 }}>
            <button className="btn btn-primary btn-sm">{form.id ? 'Update bracket' : 'Add bracket'}</button>
            {form.id && <button type="button" className="btn btn-outline btn-sm" onClick={cancelEdit}>Cancel</button>}
          </div>
        </form>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Service</th><th>From zone</th><th>To zone</th><th>Weight range</th><th>Base price</th><th>Overage ₹/kg</th><th>Delivery days</th><th></th></tr></thead>
          <tbody>
            {rateCards.map((r) => (
              <tr key={r.id}>
                <td>{r.service.name}</td>
                <td>{r.fromZone ? r.fromZone.name : <span style={{ color: 'var(--slate-light)' }}>Any</span>}</td>
                <td>{r.zone.code}</td>
                <td>{r.weightFromKg} – {r.weightToKg} kg</td>
                <td>₹{Number(r.basePrice).toFixed(2)}</td>
                <td>₹{Number(r.perKgOverage).toFixed(2)}</td>
                <td>{r.transitDaysMin != null && r.transitDaysMax != null ? `${r.transitDaysMin}-${r.transitDaysMax}` : <span style={{ color: 'var(--slate-light)' }}>Service default</span>}</td>
                <td style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-outline btn-sm" onClick={() => startEdit(r)}>Edit</button>
                  <button className="btn btn-outline btn-sm" onClick={() => remove(r.id)}>Delete</button>
                </td>
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
                    <option value="DRIVER">Driver</option>
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
