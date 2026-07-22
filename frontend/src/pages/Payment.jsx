import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useBooking } from '../api/BookingContext';
import { useAuth } from '../api/AuthContext';
import Stepper from '../components/Stepper';

const WARRANTY_TIERS = [
  { coverage: 10000, label: '₹10,000 cover — Free' },
  { coverage: 25000, label: '₹25,000 cover — ₹300' },
  { coverage: 50000, label: '₹50,000 cover — ₹550' },
  { coverage: 75000, label: '₹75,000 cover — ₹800' },
  { coverage: 100000, label: '₹1,00,000 cover — ₹1,050' },
  { coverage: 125000, label: '₹1,25,000 cover — ₹1,300' },
  { coverage: 150000, label: '₹1,50,000 cover — ₹1,500' },
];

const DG_ITEMS = [
  ['🔋', 'Spare batteries'], ['🧪', 'Flammable liquids'], ['💨', 'Gases'], ['⚠️', 'Corrosives'],
  ['🔴', 'Oxygen'], ['📋', 'Miscellaneous'], ['💥', 'Explosives'], ['🦠', 'Infectious substances'],
  ['🧫', 'Oxidizing materials'], ['☠️', 'Toxic substances'], ['🧴', 'Organic peroxides'],
  ['🔥', 'Flammable solids'], ['🧲', 'Magnetized materials'], ['☢️', 'Radioactive materials'],
];

function nextPickupDates() {
  const out = [];
  const d = new Date();
  d.setDate(d.getDate() + 1);
  for (let i = 0; i < 7; i++) {
    out.push(d.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' }));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export default function Payment() {
  const { order: bookingOrder, setBooking, clearBooking } = useBooking();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [order, setOrder] = useState(bookingOrder);
  const [pickupDates] = useState(nextPickupDates);

  const [dgAcknowledged, setDgAcknowledged] = useState(false);
  const [showDgModal, setShowDgModal] = useState(false);
  const [warrantyCoverage, setWarrantyCoverage] = useState(10000);
  const [selectedAddons, setSelectedAddons] = useState([]);
  const [pickupDate, setPickupDate] = useState(pickupDates[0]);

  const [otpEmail, setOtpEmail] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCodeInput, setOtpCodeInput] = useState('');
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpError, setOtpError] = useState('');

  const [promoInput, setPromoInput] = useState('');
  const [promoApplying, setPromoApplying] = useState(false);
  const [promoError, setPromoError] = useState('');

  const [payMethodTab, setPayMethodTab] = useState('card');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);

  const didInitialSync = useRef(false);
  const addonsSeqRef = useRef(0);

  useEffect(() => {
    if (!bookingOrder || didInitialSync.current) return;
    didInitialSync.current = true;
    setOtpEmail(bookingOrder.senderAddress?.email || bookingOrder.receiverAddress?.email || user?.email || '');
    // An order already past the payment step (edited by staff via "Edit
    // order") is shown as a read-only updated invoice further down — don't
    // reset its live add-ons/DG-ack back to defaults.
    if (bookingOrder.status !== 'PENDING_PAYMENT') return;
    // Sync default add-on state (free warranty tier, today's DG ack, first pickup date) to the order.
    const seq = ++addonsSeqRef.current;
    client
      .patch(`/orders/${bookingOrder.id}/addons`, {
        warrantyCoverage: 10000,
        addons: [],
        pickupDate: pickupDates[0],
        dgAcknowledged: false,
      })
      .then(({ data }) => { if (seq === addonsSeqRef.current) setOrder(data.order); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingOrder?.id]);

  async function syncAddons(overrides) {
    const payload = {
      warrantyCoverage,
      addons: selectedAddons,
      pickupDate,
      dgAcknowledged,
      ...overrides,
    };
    const seq = ++addonsSeqRef.current;
    const { data } = await client.patch(`/orders/${order.id}/addons`, payload);
    // Ignore out-of-order responses — only the latest fired request may update state.
    if (seq === addonsSeqRef.current) setOrder(data.order);
  }

  function changeWarranty(coverage) {
    setWarrantyCoverage(coverage);
    syncAddons({ warrantyCoverage: coverage });
  }

  function toggleAddon(code) {
    const next = selectedAddons.includes(code) ? selectedAddons.filter((c) => c !== code) : [...selectedAddons, code];
    setSelectedAddons(next);
    syncAddons({ addons: next });
  }

  function changePickupDate(date) {
    setPickupDate(date);
    syncAddons({ pickupDate: date });
  }

  function toggleDg(checked) {
    setDgAcknowledged(checked);
    syncAddons({ dgAcknowledged: checked });
  }

  async function copyPaymentLink() {
    const link = `${window.location.origin}/pay/${order.id}`;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      window.prompt('Copy this payment link:', link);
      return;
    }
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2500);
  }

  async function sendOtp() {
    setOtpSending(true);
    setOtpError('');
    try {
      await client.post(`/orders/${order.id}/send-otp`, { email: otpEmail });
      setOtpSent(true);
    } catch (err) {
      setOtpError(err.response?.data?.error || 'Could not send verification code.');
    } finally {
      setOtpSending(false);
    }
  }

  async function verifyOtp(code) {
    setOtpVerifying(true);
    setOtpError('');
    try {
      await client.post(`/orders/${order.id}/verify-otp`, { code });
      setOtpVerified(true);
    } catch (err) {
      setOtpError(err.response?.data?.error || 'Incorrect code.');
    } finally {
      setOtpVerifying(false);
    }
  }

  function handleOtpInput(v) {
    const digits = v.replace(/\D/g, '').slice(0, 6);
    setOtpCodeInput(digits);
    if (digits.length === 6) verifyOtp(digits);
  }

  async function applyPromo() {
    setPromoApplying(true);
    setPromoError('');
    try {
      const { data } = await client.post(`/orders/${order.id}/promo`, { code: promoInput });
      setOrder(data.order);
    } catch (err) {
      setPromoError(err.response?.data?.error || 'Invalid promo code.');
    } finally {
      setPromoApplying(false);
    }
  }

  async function pollForSuccess() {
    for (let i = 0; i < 8; i++) {
      const { data } = await client.get(`/payments/${order.id}`);
      if (data.payment.status === 'SUCCEEDED') return true;
      await new Promise((r) => setTimeout(r, 1200));
    }
    return false;
  }

  async function handlePay() {
    setError('');
    if (!dgAcknowledged) {
      setError('Please acknowledge the dangerous goods declaration.');
      return;
    }
    if (!otpVerified) {
      setError('Please verify your email before paying.');
      return;
    }
    if (!window.Razorpay) {
      setError('Payment checkout failed to load. Please refresh and try again.');
      return;
    }

    setSubmitting(true);
    let checkoutData;
    try {
      const { data } = await client.post(`/payments/${order.id}/order`);
      checkoutData = data;
    } catch (err) {
      setError(err.response?.data?.error || 'Could not start payment.');
      setSubmitting(false);
      return;
    }

    const rzp = new window.Razorpay({
      key: checkoutData.keyId,
      order_id: checkoutData.payment.providerOrderId,
      name: 'Comonn',
      description: `Order ${order.orderNumber}`,
      handler: async (response) => {
        try {
          await client.post(`/payments/${order.id}/confirm`, response);
          const succeeded = await pollForSuccess();
          if (succeeded) {
            setBooking({});
            navigate('/labels');
          } else {
            setError('Payment is processing — refresh in a moment or check your order status.');
            setSubmitting(false);
          }
        } catch (err) {
          setError(err.response?.data?.error || 'Could not confirm payment.');
          setSubmitting(false);
        }
      },
      modal: { ondismiss: () => setSubmitting(false) },
      theme: { color: '#0f172a' },
    });

    rzp.on('payment.failed', () => {
      setError('Payment failed. Please try again.');
      setSubmitting(false);
    });

    rzp.open();
  }

  async function handleConfirmCashBooking() {
    setError('');
    if (!dgAcknowledged) {
      setError('Please acknowledge the dangerous goods declaration.');
      return;
    }
    if (!otpVerified) {
      setError('Please verify your email before confirming.');
      return;
    }
    setSubmitting(true);
    try {
      // Mirrors the Razorpay success handler: keep the full order (with
      // senderAddress/receiverAddress) already in context from Details.jsx's
      // creation response rather than overwriting it with this endpoint's
      // response, which only includes `payment`.
      await client.post(`/payments/${order.id}/cash`);
      setBooking({});
      navigate('/labels');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not confirm the booking.');
      setSubmitting(false);
    }
  }

  if (!order) {
    return (
      <div className="wrap section-narrow" style={{ textAlign: 'center' }}>
        <p className="lead">No order in progress yet.</p>
        <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/quote')}>Get a quote</button>
      </div>
    );
  }

  // Reached only via an admin/staff "Edit order" on a booking that already
  // moved past the payment step (customers never edit orders in this state)
  // — show the recalculated invoice and any due/credit balance instead of
  // the normal DG/OTP/payment-method UI.
  if (order.status !== 'PENDING_PAYMENT') {
    const amountPaid = Number(order.amountPaid || 0);
    const balance = order.balance !== undefined && order.balance !== null ? Number(order.balance) : Number(order.grandTotal) - amountPaid;
    return (
      <div>
        <div id="stepper-payment"><Stepper activeKey="payment" /></div>
        <div className="section" style={{ paddingTop: 20 }}>
          <div className="wrap" style={{ maxWidth: 560, margin: '0 auto' }}>
            <button type="button" className="btn btn-outline btn-sm" style={{ marginBottom: 16 }} onClick={() => navigate('/details')}>← Back</button>
            <div className="card" style={{ padding: 26 }}>
              <h3 style={{ marginBottom: 4 }}>Updated invoice</h3>
              <p className="lead" style={{ fontSize: 13.5, marginBottom: 18 }}>
                This booking's details were just edited. Totals below reflect the updated information.
              </p>
              <div className="sum-line"><span>{order.service?.name || 'Shipping'} (incl. GST)</span><span className="v">₹{(Number(order.baseFreight) + Number(order.surchargesTotal)).toFixed(2)}</span></div>
              {order.addons?.map((a) => (
                <div className="sum-line" key={a.id}><span>{a.label}</span><span className="v">₹{Number(a.amount).toFixed(2)}</span></div>
              ))}
              {Number(order.discountTotal) > 0 && (
                <div className="sum-line"><span>Discount ({order.promoCode})</span><span className="v" style={{ color: 'var(--success)' }}>−₹{Number(order.discountTotal).toFixed(2)}</span></div>
              )}
              <div className="sum-line total"><span>New total</span><span className="v">₹{Number(order.grandTotal).toFixed(2)}</span></div>
              <div className="sum-line"><span>Already paid</span><span className="v">₹{amountPaid.toFixed(2)}</span></div>
              <div className="sum-line total" style={{ marginTop: 8 }}>
                <span>{balance > 0 ? 'Balance due' : balance < 0 ? 'Credit owed to customer' : 'Settled'}</span>
                <span className="v" style={{ color: balance > 0 ? 'var(--danger)' : balance < 0 ? 'var(--success)' : undefined }}>
                  {balance === 0 ? '—' : `₹${Math.abs(balance).toFixed(2)}`}
                </span>
              </div>
              {balance > 0 && (
                <p style={{ fontSize: 12.5, color: 'var(--slate)', marginTop: 12 }}>
                  Collect this additional amount from the customer directly and note it in the order's comments.
                </p>
              )}
              {balance < 0 && (
                <p style={{ fontSize: 12.5, color: 'var(--slate)', marginTop: 12 }}>
                  This customer is owed a credit — settle it with them directly and note it in the order's comments.
                </p>
              )}
              <button
                type="button"
                className="btn btn-primary block"
                style={{ padding: 14, marginTop: 20 }}
                onClick={() => { clearBooking(); navigate('/admin'); }}
              >
                Done — back to Bookings
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const totalBoxQty = order.items?.reduce((sum, it) => sum + it.quantity, 0) || 1;
  const addonAmount = (code) => order.addons?.find((a) => a.code === code)?.amount;
  const canPay = dgAcknowledged && otpVerified;
  const pricingPending = Boolean(order.pricingPending);

  return (
    <div>
      <div id="stepper-payment"><Stepper activeKey="payment" /></div>
      <div className="section" style={{ paddingTop: 20 }}>
        <div className="wrap payment-layout" style={{ maxWidth: 1080 }}>
          <div>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              style={{ marginBottom: 16 }}
              onClick={() => navigate('/details')}
            >
              ← Back
            </button>

            {['ADMIN', 'STAFF'].includes(user?.role) && (
              <div className="card" style={{ padding: 22, marginBottom: 22, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <h3 style={{ marginBottom: 4 }}>Share payment link</h3>
                  <p className="lead" style={{ fontSize: 13.5 }}>Send this to the customer so they can complete payment themselves.</p>
                </div>
                <button type="button" className="btn btn-outline btn-sm" onClick={copyPaymentLink}>
                  {linkCopied ? 'Copied ✓' : 'Copy link'}
                </button>
              </div>
            )}

            <div className="card" style={{ padding: 26 }}>
              <h3 style={{ marginBottom: 4 }}>Dangerous goods declaration</h3>
              <p className="lead" style={{ fontSize: 13.5, marginBottom: 18 }}>
                Some goods are restricted across our network —{' '}
                <a href="#" style={{ color: 'var(--cobalt)', fontWeight: 700 }} onClick={(e) => { e.preventDefault(); setShowDgModal(true); }}>see examples →</a>
              </p>
              <label className="dg-ack">
                <input type="checkbox" checked={dgAcknowledged} onChange={(e) => toggleDg(e.target.checked)} />
                <p><b>Yes</b> — I acknowledge that all contents of my freight are void of any dangerous goods. Lithium-ion batteries cannot be sent via air freight. All fluids must be drained from machine parts. Penalties apply.</p>
              </label>
            </div>

            <div className="card" style={{ padding: 26, marginTop: 22 }}>
              <h3 style={{ marginBottom: 6 }}>Add extra protection</h3>
                <div className="addon-row">
                  <div className="txt">
                    <h4>Transit warranty</h4>
                    <select className="select" style={{ marginTop: 8, maxWidth: 260 }} value={warrantyCoverage} onChange={(e) => changeWarranty(Number(e.target.value))}>
                      {WARRANTY_TIERS.map((t) => <option key={t.coverage} value={t.coverage}>{t.label}</option>)}
                    </select>
                  </div>
                  <div className="right">
                    <span className="price-tag" style={{ color: 'var(--success)' }}>{addonAmount('WARRANTY') > 0 ? `₹${Number(addonAmount('WARRANTY')).toFixed(2)}` : 'Free'}</span>
                    <button type="button" className="btn btn-outline btn-sm" disabled>Added ✓</button>
                  </div>
                </div>
                <div className="addon-row">
                  <div className="txt"><h4>Heavy-duty cardboard</h4><p>₹100 per box × Qty {totalBoxQty}</p></div>
                  <div className="right">
                    <span className="price-tag">₹{Number(addonAmount('CARDBOARD') || 0).toFixed(2)}</span>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => toggleAddon('CARDBOARD')}>
                      {selectedAddons.includes('CARDBOARD') ? 'Added ✓' : 'Add'}
                    </button>
                  </div>
                </div>
                <div className="addon-row">
                  <div className="txt"><h4>Packing service</h4><p>₹300 per order × Qty 1</p></div>
                  <div className="right">
                    <span className="price-tag">₹{Number(addonAmount('PACKING') || 0).toFixed(2)}</span>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => toggleAddon('PACKING')}>
                      {selectedAddons.includes('PACKING') ? 'Added ✓' : 'Add'}
                    </button>
                  </div>
                </div>
                <div className="addon-row">
                  <div className="txt"><h4>Wrapping service</h4><p>₹100 per box × Qty {totalBoxQty}</p></div>
                  <div className="right">
                    <span className="price-tag">₹{Number(addonAmount('WRAPPING') || 0).toFixed(2)}</span>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => toggleAddon('WRAPPING')}>
                      {selectedAddons.includes('WRAPPING') ? 'Added ✓' : 'Add'}
                    </button>
                  </div>
                </div>
              </div>

            <div className="card" style={{ padding: 26, marginTop: 22 }}>
              <h3 style={{ marginBottom: 16 }}>Pickup &amp; verification</h3>
              <div className="field">
                <label>Pickup collection date</label>
                <select className="select" style={{ maxWidth: 320 }} value={pickupDate} onChange={(e) => changePickupDate(e.target.value)}>
                  {pickupDates.map((d) => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div className="field" style={{ marginTop: 18 }}>
                <label>Email verification</label>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ width: '100%', maxWidth: 320 }}>
                    <div className="input-group">
                      <input placeholder="example@gmail.com" style={{ flex: 1 }} value={otpEmail} onChange={(e) => setOtpEmail(e.target.value)} disabled={otpVerified} />
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ flex: 'none', borderRadius: 0, height: 44, padding: '0 12px', fontSize: 11.5 }}
                        disabled={!otpEmail || otpSending || otpVerified}
                        onClick={sendOtp}
                      >
                        {otpSending ? 'Sending…' : otpSent ? 'Resend' : 'Send OTP'}
                      </button>
                    </div>
                  </div>
                  <input
                    className="input"
                    placeholder="Enter OTP"
                    style={{ maxWidth: 140 }}
                    value={otpCodeInput}
                    onChange={(e) => handleOtpInput(e.target.value)}
                    disabled={!otpSent || otpVerified}
                  />
                  {otpVerified && <span style={{ color: 'var(--success)', fontWeight: 700, fontSize: 13, alignSelf: 'center' }}>✓ Verified</span>}
                </div>
                {otpVerifying && <p style={{ fontSize: 12, color: 'var(--slate-light)', marginTop: 6 }}>Verifying…</p>}
                {otpError && <div className="error-text" style={{ marginTop: 8 }}>{otpError}</div>}
              </div>
            </div>

            {!pricingPending && (
              <div className="card" style={{ padding: 26, marginTop: 22 }}>
                <h3 style={{ marginBottom: 16 }}>Payment method</h3>
                {dgAcknowledged ? (
                  <>
                    <div className="pay-method-row">
                      <div className={`pay-method ${payMethodTab === 'card' ? 'active' : ''}`} onClick={() => setPayMethodTab('card')}>💳 Credit Card</div>
                      <div className={`pay-method ${payMethodTab === 'upi' ? 'active' : ''}`} onClick={() => setPayMethodTab('upi')}>📱 UPI</div>
                    </div>
                    <p style={{ fontSize: 12.5, color: 'var(--slate)' }}>
                      You'll enter your {payMethodTab === 'card' ? 'card' : 'UPI'} details securely in Razorpay's checkout window — Comonn never stores your payment details.
                    </p>
                  </>
                ) : (
                  <p style={{ fontSize: 12.5, color: 'var(--slate)' }}>
                    Acknowledge the dangerous goods declaration above to see payment options.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="card summary-sidebar" style={{ padding: 26 }}>
            <h4 style={{ marginBottom: 14 }}>Order summary</h4>
            {pricingPending ? (
              <>
                <p style={{ fontSize: 13.5, color: 'var(--slate)', lineHeight: 1.6 }}>
                  This is a pickup booking — weight and dimensions will be assessed by our courier in person, and the shipping price will be confirmed at that time.
                </p>

                {error && <div className="error-text" style={{ marginTop: 12 }}>{error}</div>}

                <button className="btn btn-primary block" style={{ padding: 14, marginTop: 16 }} disabled={!canPay || submitting} onClick={handleConfirmCashBooking}>
                  {submitting ? 'Confirming…' : 'Confirm pickup booking'}
                </button>
              </>
            ) : (
              <>
                <div className="sum-line"><span>{order.service?.name || 'Shipping'} (incl. GST)</span><span className="v">₹{(Number(order.baseFreight) + Number(order.surchargesTotal)).toFixed(2)}</span></div>
                <div className="sum-line"><span>Warranty</span><span className="v" style={{ color: addonAmount('WARRANTY') > 0 ? undefined : 'var(--success)' }}>{addonAmount('WARRANTY') > 0 ? `₹${Number(addonAmount('WARRANTY')).toFixed(2)}` : 'Free'}</span></div>
                <div className="sum-line"><span>Cardboard</span><span className="v">₹{Number(addonAmount('CARDBOARD') || 0).toFixed(2)}</span></div>
                <div className="sum-line"><span>Packing</span><span className="v">₹{Number(addonAmount('PACKING') || 0).toFixed(2)}</span></div>
                <div className="sum-line"><span>Wrapping</span><span className="v">₹{Number(addonAmount('WRAPPING') || 0).toFixed(2)}</span></div>
                {Number(order.discountTotal) > 0 && (
                  <div className="sum-line"><span>Discount ({order.promoCode})</span><span className="v" style={{ color: 'var(--success)' }}>−₹{Number(order.discountTotal).toFixed(2)}</span></div>
                )}

                <div style={{ display: 'flex', gap: 8, margin: '14px 0' }}>
                  <input className="input" placeholder="Promo code" style={{ flex: 1 }} value={promoInput} onChange={(e) => setPromoInput(e.target.value)} />
                  <button type="button" className="btn btn-outline btn-sm" disabled={!promoInput || promoApplying} onClick={applyPromo}>
                    {promoApplying ? '…' : 'Apply'}
                  </button>
                </div>
                {promoError && <div className="error-text" style={{ marginBottom: 8 }}>{promoError}</div>}

                <div className="sum-line total"><span>Total</span><span className="v">₹{Number(order.grandTotal).toFixed(2)}</span></div>

                {error && <div className="error-text" style={{ marginTop: 12 }}>{error}</div>}

                <button className="btn btn-primary block" style={{ padding: 14, marginTop: 16 }} disabled={!canPay || submitting} onClick={handlePay}>
                  {submitting ? 'Processing…' : `Pay ₹${Number(order.grandTotal).toFixed(2)} now`}
                </button>
                {!canPay && <p style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--slate-light)', marginTop: 8 }}>Acknowledge the declaration and verify your email to pay.</p>}
              </>
            )}
            {!pricingPending && (
              <p style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--slate-light)', marginTop: 12 }}>🔒 Secured by 256-bit SSL encryption</p>
            )}
          </div>
        </div>
      </div>

      <div className={`modal-overlay ${showDgModal ? 'open' : ''}`} onClick={() => setShowDgModal(false)}>
        <div className="modal-box" onClick={(e) => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 17 }}>Restricted goods — examples</h3>
            <button onClick={() => setShowDgModal(false)} style={{ background: 'var(--paper)', border: 'none', width: 44, height: 44, borderRadius: '50%', fontSize: 15, color: 'var(--slate)', cursor: 'pointer' }}>✕</button>
          </div>
          <p style={{ fontSize: 13, color: 'var(--slate)', marginBottom: 16 }}>These items cannot be shipped through our network:</p>
          <div className="dg-chip-row">
            {DG_ITEMS.map(([icon, label]) => (
              <span className="dg-chip" key={label}><span className="ic">{icon}</span>{label}</span>
            ))}
          </div>
          <button className="btn btn-primary block" style={{ marginTop: 20, padding: 12 }} onClick={() => setShowDgModal(false)}>Got it</button>
        </div>
      </div>
    </div>
  );
}
