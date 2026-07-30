import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../api/AuthContext';
import LoadingLogo from '../components/LoadingLogo';

const DAY_PRESETS = [7, 30, 90];

const HOW_IT_WORKS = [
  ['1', 'Reserve a box', 'Pick a size and how many days you need it for, and pay online in minutes.'],
  ['2', 'Get your address', "You'll get a real physical address with your own box number — copy it any time from your dashboard."],
  ['3', 'Sellers ship to you', 'Use that address at checkout on any e-commerce site — your order is held safely in your box.'],
  ['4', 'Ship when ready', "Once everything's arrived, we'll help you book an international shipment for the whole lot."],
];

const WHY_STORAGE = [
  { icon: '🔒', bg: '#EAF0FF', title: 'Kept on-site, securely', sub: "Every box is on our premises, not a shared drop point." },
  { icon: '🗓️', bg: 'var(--success-bg)', title: 'Pay for just the days you need', sub: 'Day-based pricing off the monthly rate — no fixed-term contracts.' },
  { icon: '📍', bg: 'var(--warn-bg)', title: 'One address, every seller', sub: 'The same box number works for as many orders as you like.' },
  { icon: '🔁', bg: '#F3EBFF', title: 'Renew any time', sub: "Running out of days? Extend from your dashboard before it expires." },
];

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 12h15M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Storage() {
  const { user } = useAuth();
  const [sizes, setSizes] = useState(null);
  const [selectedSizeId, setSelectedSizeId] = useState(null);
  const [days, setDays] = useState(30);
  const [customDays, setCustomDays] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(null); // { boxAddress, boxSize, days, endDate }

  useEffect(() => {
    client.get('/box-bookings/sizes').then(({ data }) => setSizes(data.sizes)).catch(() => setSizes([]));
  }, []);

  const selectedSize = sizes?.find((s) => s.id === selectedSizeId);
  const amount = selectedSize ? Math.round((Number(selectedSize.monthlyRate) / 30) * days * 100) / 100 : 0;

  function pickDays(d) {
    setDays(d);
    setCustomDays('');
  }

  function pickCustomDays(value) {
    setCustomDays(value);
    const n = Number(value);
    if (n > 0) setDays(n);
  }

  async function reserveAndPay() {
    setError('');
    if (!selectedSize) {
      setError('Please choose a box size.');
      return;
    }
    if (!window.Razorpay) {
      setError('Payment checkout failed to load. Please refresh and try again.');
      return;
    }
    setSubmitting(true);
    let checkout;
    try {
      const { data } = await client.post('/box-bookings', { boxSizeId: selectedSize.id, days });
      checkout = data;
    } catch (err) {
      setError(err.response?.data?.error || 'Could not start checkout.');
      setSubmitting(false);
      return;
    }

    const rzp = new window.Razorpay({
      key: checkout.keyId,
      order_id: checkout.providerOrderId,
      name: 'Comonn',
      description: `${selectedSize.name} — ${days} days storage`,
      handler: async (response) => {
        try {
          const { data } = await client.post(`/box-bookings/${checkout.booking.id}/confirm`, response);
          setConfirmed(data.booking);
        } catch (err) {
          setError(err.response?.data?.error || 'Could not confirm payment.');
          setSubmitting(false);
        }
      },
      modal: { ondismiss: () => setSubmitting(false) },
      theme: { color: '#0f172a' },
    });
    rzp.on('payment.failed', () => { setError('Payment failed. Please try again.'); setSubmitting(false); });
    rzp.open();
  }

  if (confirmed) {
    return (
      <div className="wrap section-narrow" style={{ textAlign: 'center' }}>
        <span className="pill pill-success" style={{ marginBottom: 14 }}>✓ Box reserved</span>
        <h2 className="h-lg" style={{ marginTop: 10 }}>Your box is ready</h2>
        <p className="lead" style={{ marginTop: 8 }}>Give this address to any e-commerce seller — your package will be held here until you're ready to ship.</p>
        <div className="card" style={{ padding: 26, marginTop: 24, textAlign: 'left' }}>
          <p style={{ fontSize: 13, color: 'var(--slate-light)', marginBottom: 6 }}>Your address</p>
          <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)', marginBottom: 14 }}>{confirmed.boxAddress}</p>
          <button className="btn btn-outline btn-sm" onClick={() => navigator.clipboard.writeText(confirmed.boxAddress)}>Copy address</button>
        </div>
        <Link className="btn btn-primary block" style={{ marginTop: 22 }} to="/dashboard">Go to My Box →</Link>
      </div>
    );
  }

  return (
    <div>
    <div className="wrap section-narrow">
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        <h2 className="h-lg">Reserve a storage box</h2>
        <p className="lead" style={{ marginTop: 8 }}>
          Get a physical address for your online orders. Have sellers ship to your box, then send everything internationally when you're ready.
        </p>
      </div>

      {sizes === null && <LoadingLogo />}

      {sizes && (
        <>
          <div className="grid-3" style={{ marginTop: 28 }}>
            {sizes.map((size) => {
              const soldOut = size.availableCount <= 0;
              const active = selectedSizeId === size.id;
              return (
                <button
                  key={size.id}
                  type="button"
                  className="card"
                  disabled={soldOut}
                  onClick={() => setSelectedSizeId(size.id)}
                  style={{
                    padding: 22,
                    textAlign: 'left',
                    cursor: soldOut ? 'not-allowed' : 'pointer',
                    opacity: soldOut ? 0.5 : 1,
                    border: active ? '2px solid var(--cobalt)' : '1px solid var(--line-2)',
                  }}
                >
                  <h3 style={{ fontSize: 16, marginBottom: 4 }}>{size.name}</h3>
                  {size.description && <p style={{ fontSize: 12.5, color: 'var(--slate-light)', marginBottom: 10 }}>{size.description}</p>}
                  <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--navy)' }}>₹{Number(size.monthlyRate).toFixed(0)}<span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--slate)' }}> /month</span></p>
                  <p style={{ fontSize: 12, color: soldOut ? 'var(--danger)' : 'var(--slate-light)', marginTop: 8 }}>
                    {soldOut ? 'Sold out' : `${size.availableCount} available`}
                  </p>
                </button>
              );
            })}
          </div>

          {sizes.length === 0 && <p className="lead" style={{ textAlign: 'center', marginTop: 20 }}>No box sizes are available right now — please check back soon.</p>}

          {selectedSize && (
            <div className="card" style={{ padding: 22, marginTop: 24 }}>
              <h4 style={{ fontSize: 14, marginBottom: 12 }}>How many days?</h4>
              <div className="chip-filter-row">
                {DAY_PRESETS.map((d) => (
                  <div key={d} className={`chip-filter ${!customDays && days === d ? 'active' : ''}`} onClick={() => pickDays(d)}>{d} days</div>
                ))}
                <input
                  className="input"
                  style={{ maxWidth: 140 }}
                  type="number"
                  min="1"
                  placeholder="Custom days"
                  value={customDays}
                  onChange={(e) => pickCustomDays(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--line-2)' }}>
                <div>
                  <p style={{ fontSize: 12.5, color: 'var(--slate-light)' }}>{days} days at ₹{Number(selectedSize.monthlyRate).toFixed(0)}/month</p>
                  <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--navy)' }}>₹{amount.toFixed(2)}</p>
                </div>
              </div>

              {error && <div className="error-text" style={{ marginTop: 14 }}>{error}</div>}

              {user ? (
                <button className="btn btn-primary block" style={{ marginTop: 18 }} disabled={submitting || days <= 0} onClick={reserveAndPay}>
                  {submitting ? 'Processing…' : 'Reserve & Pay →'}
                </button>
              ) : (
                <div style={{ marginTop: 18, textAlign: 'center' }}>
                  <p style={{ fontSize: 13, color: 'var(--slate)', marginBottom: 10 }}>Log in or create an account to reserve this box.</p>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <Link className="btn btn-outline block" to="/login">Login</Link>
                    <Link className="btn btn-primary block" to="/register">Create account</Link>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
