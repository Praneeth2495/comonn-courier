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
  OUT_FOR_DELIVERY: 'pill-cobalt',
  DELIVERED: 'pill-success',
  CANCELLED: 'pill-danger',
  EXCEPTION: 'pill-danger',
};
const HISTORY_STATUSES = ['DELIVERED', 'CANCELLED', 'EXCEPTION'];
const PAID_STATUSES = ['PAID', 'LABEL_GENERATED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'];

const ACCT_TABS = [['active', 'Active orders'], ['history', 'Order history'], ['boxes', 'My Box']];

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
  useEffect(() => { if (tab !== 'boxes') loadOrders(); }, [tab]);

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

      {tab !== 'boxes' && (
        <>
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
        </>
      )}

      {tab === 'boxes' && <BoxBookings />}

      {selected && <OrderDetailModal order={selected} onClose={() => setSelected(null)} canManageLabels={false} canViewComments={false} canManageTracking={false} canViewWhatsapp={false} />}
    </div>
  );
}

const BOX_STATUS_PILL = { PENDING: 'pill-warn', ACTIVE: 'pill-success', EXPIRED: 'pill-danger', CANCELLED: 'pill-navy' };

// Invoice download is auth-protected (not a plain <a href>-able static
// file), so fetch it as a blob with the normal authenticated client and
// trigger a save — same pattern used for admin invoice downloads elsewhere.
async function downloadBoxInvoice(bookingId, filename) {
  const { data } = await client.get(`/box-bookings/${bookingId}/invoice`, { responseType: 'blob' });
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function BoxBookings() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [renewing, setRenewing] = useState(null); // booking being renewed

  function load() {
    setLoading(true);
    client.get('/box-bookings/mine').then(({ data }) => setBookings(data.bookings)).finally(() => setLoading(false));
  }
  useEffect(load, []);

  if (loading) return <LoadingLogo label="Loading your boxes…" />;

  if (bookings.length === 0) {
    return (
      <div className="empty-state card">
        <p>No storage boxes yet.</p>
        <a className="btn btn-primary btn-sm" style={{ marginTop: 10 }} href="/storage">Reserve a box →</a>
      </div>
    );
  }

  return (
    <div>
      {bookings.map((b) => {
        const daysLeft = b.endDate ? Math.max(0, Math.ceil((new Date(b.endDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000))) : null;
        return (
          <div className="card order-card" key={b.id}>
            <div className="order-card-top">
              <div>
                <div className="order-route">{b.boxSize.name}{b.boxAddress ? ` · Box ${b.box.number}` : ''}</div>
                <p style={{ fontSize: 12.5, color: 'var(--slate-light)', marginTop: 4 }}>
                  {b.boxAddress || 'Assigning your box…'}
                </p>
              </div>
              <span className={`pill ${BOX_STATUS_PILL[b.status] || 'pill-navy'}`}>{b.status}</span>
            </div>
            {b.endDate && (
              <p style={{ fontSize: 13, color: 'var(--slate)', marginBottom: 10 }}>
                {b.status === 'ACTIVE' ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining` : `Expired ${new Date(b.endDate).toLocaleDateString('en-IN')}`}
              </p>
            )}
            {b.boxAddress && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => navigator.clipboard.writeText(b.boxAddress)}
                >
                  Copy address
                </button>
                {b.invoiceNumber && (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => downloadBoxInvoice(b.id, `${b.invoiceNumber}.pdf`)}
                  >
                    Download invoice
                  </button>
                )}
                {['ACTIVE', 'EXPIRED'].includes(b.status) && (
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => setRenewing(b)}>Renew</button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {renewing && <RenewBoxModal booking={renewing} onClose={() => setRenewing(null)} onRenewed={() => { setRenewing(null); load(); }} />}
    </div>
  );
}

function RenewBoxModal({ booking, onClose, onRenewed }) {
  const [days, setDays] = useState(30);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const amount = Math.round((Number(booking.monthlyRate) / 30) * days * 100) / 100;

  async function pay() {
    setError('');
    if (!window.Razorpay) {
      setError('Payment checkout failed to load. Please refresh and try again.');
      return;
    }
    setSubmitting(true);
    let checkout;
    try {
      const { data } = await client.post(`/box-bookings/${booking.id}/renew`, { days });
      checkout = data;
    } catch (err) {
      setError(err.response?.data?.error || 'Could not start renewal payment.');
      setSubmitting(false);
      return;
    }

    const rzp = new window.Razorpay({
      key: checkout.keyId,
      order_id: checkout.providerOrderId,
      name: 'Comonn',
      description: `Renew ${booking.boxSize.name} — ${days} days`,
      handler: async (response) => {
        try {
          await client.post(`/box-bookings/${booking.id}/confirm`, response);
          onRenewed();
        } catch (err) {
          setError(err.response?.data?.error || 'Could not confirm renewal payment.');
          setSubmitting(false);
        }
      },
      modal: { ondismiss: () => setSubmitting(false) },
      theme: { color: '#0f172a' },
    });
    rzp.on('payment.failed', () => { setError('Payment failed. Please try again.'); setSubmitting(false); });
    rzp.open();
  }

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: 4 }}>Renew {booking.boxSize.name}</h3>
        <p style={{ fontSize: 12.5, color: 'var(--slate-light)', marginBottom: 16 }}>{booking.boxAddress}</p>
        <div className="field">
          <label>Extra days</label>
          <input className="input" type="number" min="1" value={days} onChange={(e) => setDays(Number(e.target.value) || 1)} />
        </div>
        <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', margin: '14px 0' }}>Total ₹{amount.toFixed(2)}</p>
        {error && <div className="error-text" style={{ marginBottom: 10 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" style={{ flex: 1 }} disabled={submitting || days <= 0} onClick={pay}>
            {submitting ? 'Processing…' : 'Pay & renew'}
          </button>
        </div>
      </div>
    </div>
  );
}

