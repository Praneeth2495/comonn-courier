import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../api/AuthContext';
import { useBooking } from '../api/BookingContext';
import LoadingLogo from '../components/LoadingLogo';
import { OrderDetailModal } from '../components/OrderDetailModal';

const STATUS_PILL = {
  DRAFT: 'pill-warn',
  UNFINISHED: 'pill-warn',
  PENDING_PAYMENT: 'pill-warn',
  PICKUP_CONFIRMED: 'pill-cobalt',
  PAID: 'pill-cobalt',
  LABEL_GENERATED: 'pill-cobalt',
  PICKED_UP: 'pill-cobalt',
  IN_TRANSIT: 'pill-cobalt',
  CLEARED_DESTINATION_CUSTOMS: 'pill-cobalt',
  OUT_FOR_DELIVERY: 'pill-cobalt',
  DELIVERED: 'pill-success',
  CANCELLED: 'pill-danger',
  EXCEPTION: 'pill-danger',
};
const HISTORY_STATUSES = ['DELIVERED', 'CANCELLED', 'EXCEPTION'];
const PAID_STATUSES = ['PAID', 'LABEL_GENERATED', 'PICKED_UP', 'IN_TRANSIT', 'CLEARED_DESTINATION_CUSTOMS', 'OUT_FOR_DELIVERY', 'DELIVERED'];

const ACCT_TABS = [['active', 'Active orders'], ['history', 'Order history']];

export default function UserDashboard() {
  const { user } = useAuth();
  const { setBooking } = useBooking();
  const navigate = useNavigate();
  const [tab, setTab] = useState('active');
  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const labelRequestedRef = useRef(new Set());

  function loadOrders() {
    setLoading(true);
    const params = { q: q || undefined };
    if (tab === 'history') params.status = HISTORY_STATUSES.join(',');
    else params.notStatus = HISTORY_STATUSES.join(',');
    client.get('/orders', { params }).then(({ data }) => {
      setOrders(data.orders);
      setTotal(data.total);
      ensureLabelsForPaidOrders(data.orders);
    }).finally(() => setLoading(false));
  }
  useEffect(loadOrders, [tab]);

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

  // Re-fetches the full order (addons, items, etc.) rather than reusing the
  // list-row object — the list endpoint doesn't include everything the
  // detail view shows, same as the admin/staff "click order ID" flow.
  async function openDetail(id) {
    const { data } = await client.get(`/orders/${id}`);
    setSelected(data.order);
  }

  return (
    <div className="wrap section">
      <div>
        <h1 className="h-lg" style={{ marginBottom: 4 }}>Hi, {user?.fullName?.split(' ')[0]} 👋</h1>
        <p className="lead" style={{ marginBottom: 24 }}>Here's what's happening with your shipments.</p>
      </div>

      <div className="acct-tabs">
        {ACCT_TABS.map(([key, label]) => (
          <button key={key} className={`acct-tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      <form className="search-box" style={{ marginBottom: 20, maxWidth: 360 }} onSubmit={search}>
        🔍<input placeholder="Search order ID, city…" value={q} onChange={(e) => setQ(e.target.value)} />
      </form>

      {!loading && (
        <p style={{ fontSize: 13, color: 'var(--slate)', marginBottom: 14 }}>
          {total} {tab === 'history' ? 'past' : 'active'} order{total === 1 ? '' : 's'}
        </p>
      )}

      {loading && <LoadingLogo label="Loading orders…" />}
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
              <button className="btn btn-outline btn-sm" onClick={() => openDetail(o.id)}>View details</button>
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

      {selected && <OrderDetailModal order={selected} onClose={() => setSelected(null)} canManageLabels={false} canViewComments={false} canManageTracking={false} canViewWhatsapp={false} canViewTracking={false} />}
    </div>
  );
}


