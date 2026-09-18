import { useEffect, useState } from 'react';
import client from '../api/client';
import LoadingLogo from '../components/LoadingLogo';

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

// Its own page (not a tab on the Orders dashboard) — reached via the
// header's "My Box" link (see Layout.jsx's dashboardLinks).
export default function MyBox() {
  return (
    <div className="wrap section">
      <div>
        <h1 className="h-lg" style={{ marginBottom: 4 }}>My Box</h1>
        <p className="lead" style={{ marginBottom: 24 }}>Your reserved storage boxes and their status.</p>
      </div>
      <BoxBookings />
    </div>
  );
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
