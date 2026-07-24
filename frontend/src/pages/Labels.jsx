import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useBooking } from '../api/BookingContext';
import { useAuth } from '../api/AuthContext';
import Stepper from '../components/Stepper';

export default function Labels() {
  const { order, clearBooking } = useBooking();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [labels, setLabels] = useState(null);
  const [invoice, setInvoice] = useState(null);
  const [emailedTo, setEmailedTo] = useState(null);
  const [pricingPending, setPricingPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const didGenerate = useRef(false);

  useEffect(() => {
    if (!order || didGenerate.current) return;
    didGenerate.current = true;
    client
      .post(`/labels/${order.id}/generate`)
      .then(({ data }) => {
        if (data.pricingPending) {
          setPricingPending(true);
          setEmailedTo(data.emailedTo);
        } else {
          setLabels(data.labels);
          setInvoice(data.invoice);
          setEmailedTo(data.emailedTo);
        }
      })
      .catch((err) => setError(err.response?.data?.error || 'Could not generate your labels.'))
      .finally(() => setLoading(false));
  }, [order]);

  if (!order) {
    return (
      <div className="wrap section-narrow" style={{ textAlign: 'center' }}>
        <p className="lead">No order in progress yet.</p>
        <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/quote')}>Get a quote</button>
      </div>
    );
  }

  return (
    <div>
      <div id="stepper-labels"><Stepper activeKey="labels" /></div>
      <div className="section" style={{ paddingTop: 20, maxWidth: 960, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <span className="pill pill-success" style={{ marginBottom: 14 }}>✓ Booking confirmed</span>
          <h2 className="h-lg" style={{ marginTop: 10 }}>
            {pricingPending ? 'Your pickup is booked' : 'Download your shipping labels'}
          </h2>
          <p className="lead" style={{ marginTop: 8 }}>
            {pricingPending
              ? "We'll weigh and price your shipment at pickup — no label to print yet."
              : 'Print and attach these to each package before pickup.'}
          </p>
        </div>

        {loading && <p className="lead" style={{ textAlign: 'center' }}>Confirming your booking…</p>}
        {error && <div className="error-text" style={{ textAlign: 'center' }}>{error}</div>}

        {pricingPending && !loading && (
          <>
            <div className="card" style={{ padding: 26, marginTop: 24, textAlign: 'center' }}>
              <div className="addr-grid" style={{ margin: '0 0 18px' }}>
                <div className="addr-block"><div className="lbl">Order</div><p>{order.orderNumber}</p></div>
                <div className="addr-block"><div className="lbl">Tracking</div><p>{order.trackingNumber}</p></div>
              </div>
              <p style={{ fontSize: 13.5, color: 'var(--slate)', lineHeight: 1.6 }}>
                Our courier will collect your shipment, weigh and measure it in person, confirm the final price, and collect payment in cash. Shipping labels will be printed and attached by the courier at pickup.
              </p>
            </div>

            {emailedTo && (
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: 'var(--success-bg)', borderRadius: 12, padding: '16px 18px', marginTop: 22 }}>
                <span style={{ fontSize: 18, lineHeight: 1 }}>✉️</span>
                <p style={{ fontSize: 13.5, color: 'var(--success)' }}>
                  A booking confirmation has been emailed to <b>{emailedTo}</b>.
                </p>
              </div>
            )}

            <GuestOrDashboardCta user={user} order={order} clearBooking={clearBooking} navigate={navigate} />
          </>
        )}

        {labels && (
          <>
            <div className="table-wrap" style={{ marginTop: 30 }}>
              <div className="label-row" style={{ background: 'var(--paper)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--slate-light)', fontWeight: 700 }}>
                <div>Order ID</div><div>Origin</div><div>Destination</div><div>Label</div>
              </div>
              {labels.map((l) => (
                <div className="label-row" key={l.id}>
                  <div className="oid">{order.orderNumber}{labels.length > 1 ? ` (${l.packageIndex}/${labels.length})` : ''}</div>
                  <div className="addr"><b>Pickup</b>{order.senderAddress?.city}, {order.senderAddress?.countryCode}</div>
                  <div className="addr"><b>Delivery</b>{order.receiverAddress?.city}, {order.receiverAddress?.countryCode}</div>
                  <div>
                    <a
                      className="btn btn-dark btn-sm"
                      href={`${import.meta.env.VITE_API_BASE_URL || '/api'}${l.downloadUrl}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      ⬇ Download
                    </a>
                  </div>
                </div>
              ))}
            </div>

            {invoice && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                <a
                  className="btn btn-outline btn-sm"
                  href={`${import.meta.env.VITE_API_BASE_URL || '/api'}${invoice.downloadUrl}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  ⬇ Download invoice
                </a>
              </div>
            )}

            {emailedTo && (
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: 'var(--success-bg)', borderRadius: 12, padding: '16px 18px', marginTop: 22 }}>
                <span style={{ fontSize: 18, lineHeight: 1 }}>✉️</span>
                <p style={{ fontSize: 13.5, color: 'var(--success)' }}>
                  These labels and your invoice have also been emailed to your verified address — <b>{emailedTo}</b>.
                </p>
              </div>
            )}

            <GuestOrDashboardCta user={user} order={order} clearBooking={clearBooking} navigate={navigate} />
          </>
        )}
      </div>
    </div>
  );
}

// Logged-in customers go to their dashboard as before. Guests have no
// dashboard to go to — a booking-time account was created for them behind
// the scenes (see accountProvisioning.js). Rather than sending them through
// the forgot-password email round-trip, jump straight to the same "create
// password" screen used from the account-creation email — the order id
// itself (see issuePasswordSetLink) is enough to prove they just completed
// this checkout with a verified email, so a fresh token is issued instantly.
function GuestOrDashboardCta({ user, order, clearBooking, navigate }) {
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState('');

  if (user) {
    return (
      <button className="btn btn-outline block" style={{ marginTop: 22 }} onClick={() => { clearBooking(); navigate('/dashboard'); }}>
        Go to my orders
      </button>
    );
  }

  async function setUpPassword() {
    setIssuing(true);
    setError('');
    try {
      const { data } = await client.post(`/orders/${order.id}/password-set-link`);
      clearBooking();
      navigate(`/set-password?token=${encodeURIComponent(data.token)}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not start account setup — please use the link from your confirmation email instead.');
      setIssuing(false);
    }
  }

  const email = order.otpEmail;
  return (
    <div style={{ marginTop: 22 }}>
      <p style={{ fontSize: 13, color: 'var(--slate)', textAlign: 'center', marginBottom: 10 }}>
        {email ? <>You can track this order any time from your account — <b>{email}</b>. Set a password to get started.</> : 'You can track this order any time by setting up a password for your account.'}
      </p>
      <button className="btn btn-outline block" disabled={issuing} onClick={setUpPassword}>
        {issuing ? 'One moment…' : 'Set up my password →'}
      </button>
      {error && <p className="error-text" style={{ marginTop: 8, textAlign: 'center' }}>{error}</p>}
    </div>
  );
}
