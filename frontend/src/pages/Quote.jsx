import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useBooking } from '../api/BookingContext';
import { useAuth } from '../api/AuthContext';
import Stepper from '../components/Stepper';

const WEIGHT_OPTIONS = Array.from({ length: 25 }, (_, i) => `${i + 1} kg`);

// Standard international air-freight volumetric divisor (cm3/kg) — matches
// the pricing engine's default, used here only to preview the max size a
// customer could pack at their chosen weight before it costs more than the
// actual-weight price (final pricing still runs server-side per service).
const STANDARD_DIVISOR = 5000;

function maxDimsHint(weightPreset) {
  if (!weightPreset || weightPreset === 'NOT_SURE') return null;
  const weightKg = Number(weightPreset.replace(' kg', ''));
  if (!weightKg) return null;
  const side = Math.cbrt(weightKg * STANDARD_DIVISOR);
  const sumCm = Math.round(side * 3 * 10) / 10;
  return `${sumCm} cm (sum of length + width + height)`;
}

function emptyItem() {
  return { itemType: 'Box', weightPreset: '', lengthCm: '', widthCm: '', heightCm: '', quantity: 1, showDims: false };
}

// Rebuilds the item-row form state from a saved quoteInput so navigating
// back from Details/Payment doesn't lose what was already entered.
function hydrateItems(quoteInput) {
  if (!quoteInput?.items?.length) return [emptyItem()];
  if (quoteInput.pricingPending) {
    return quoteInput.items.map((it) => ({
      itemType: it.itemType,
      weightPreset: 'NOT_SURE',
      lengthCm: '',
      widthCm: '',
      heightCm: '',
      quantity: it.quantity,
      showDims: false,
    }));
  }
  return quoteInput.items.map((it) => ({
    itemType: it.itemType,
    weightPreset: `${it.actualWeightKg} kg`,
    lengthCm: it.lengthCm ? String(it.lengthCm) : '',
    widthCm: it.widthCm ? String(it.widthCm) : '',
    heightCm: it.heightCm ? String(it.heightCm) : '',
    quantity: it.quantity,
    // Always start collapsed behind "(Click here, if dimensions are
    // known)" — even if dimensions were already entered/persisted — rather
    // than auto-expanding just because a value happens to be present.
    showDims: false,
  }));
}

export default function Quote() {
  const { user } = useAuth();
  const { quoteInput, selectedQuote, order: bookingOrder, setBooking } = useBooking();
  const [countries, setCountries] = useState([]);
  const [destinationCountryCode, setDestinationCountryCode] = useState(quoteInput?.destinationCountryCode || '');
  const [items, setItems] = useState(() => hydrateItems(quoteInput));
  const [quotes, setQuotes] = useState(selectedQuote ? [selectedQuote] : null);
  const [selected, setSelected] = useState(selectedQuote || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [emailAddress, setEmailAddress] = useState(user?.email || '');
  const [emailStatus, setEmailStatus] = useState('');
  const [showEmailModal, setShowEmailModal] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    client.get('/quote/countries').then(({ data }) => setCountries(data.countries)).catch(() => {});
  }, []);

  // Re-fetch the full rate list (not just the previously selected service)
  // when returning to this page with a quote already in progress.
  useEffect(() => {
    if (!quoteInput || quoteInput.pricingPending || !selectedQuote) return;
    client
      .post('/quote', { destinationCountryCode: quoteInput.destinationCountryCode, items: quoteInput.items })
      .then(({ data }) => {
        setQuotes(data.quotes);
        const match = data.quotes.find((q) => q.service.code === selectedQuote.service.code);
        setSelected(match || selectedQuote);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateItem(idx, field, value) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  }

  function addItem() {
    setItems((prev) => [...prev, emptyItem()]);
  }

  function removeItem(idx) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  const isPickupOnly = items.some((it) => it.weightPreset === 'NOT_SURE');

  function buildItemsPayload() {
    const parsed = [];
    for (const it of items) {
      if (!it.weightPreset || it.weightPreset === 'NOT_SURE') return null;
      parsed.push({
        itemType: it.itemType,
        actualWeightKg: Number(it.weightPreset.replace(' kg', '')),
        // Dimensions are optional — if left blank, pricing assumes actual
        // weight is the chargeable weight (skips the volumetric calc).
        lengthCm: it.lengthCm ? Number(it.lengthCm) : undefined,
        widthCm: it.widthCm ? Number(it.widthCm) : undefined,
        heightCm: it.heightCm ? Number(it.heightCm) : undefined,
        quantity: Number(it.quantity) || 1,
      });
    }
    return parsed;
  }

  async function submitQuote(e) {
    e.preventDefault();
    setError('');
    setEmailStatus('');

    if (!destinationCountryCode) {
      setError('Please choose a destination.');
      return;
    }

    if (isPickupOnly) {
      const pickupItems = items.map((it) => ({ itemType: it.itemType, quantity: Number(it.quantity) || 1 }));
      const countryObj = countries.find((c) => c.countryCode === destinationCountryCode);
      setBooking({
        quoteInput: {
          destinationCountryCode,
          destinationCountryName: countryObj?.countryName || destinationCountryCode,
          items: pickupItems,
          pricingPending: true,
        },
        selectedQuote: null,
        // Preserve an in-progress order (e.g. an admin/staff "Edit order"
        // session, or a customer resubmitting after navigating back) rather
        // than always starting a fresh booking.
        order: bookingOrder || null,
      });
      navigate('/details');
      return;
    }

    const parsedItems = buildItemsPayload();
    if (!parsedItems) {
      setError('Please select a weight for every item.');
      return;
    }

    setLoading(true);
    setQuotes(null);
    setSelected(null);
    try {
      const { data } = await client.post('/quote', { destinationCountryCode, items: parsedItems });
      setQuotes(data.quotes);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not get a quote — please check the details and try again.');
    } finally {
      setLoading(false);
    }
  }

  function continueToDetails() {
    if (!selected) return;
    const parsedItems = buildItemsPayload();
    setBooking({ quoteInput: { destinationCountryCode, items: parsedItems }, selectedQuote: selected, order: bookingOrder || null });
    navigate('/details');
  }

  function openEmailModal() {
    setEmailStatus('');
    setShowEmailModal(true);
  }

  async function emailQuote(e) {
    e.preventDefault();
    if (!selected || !emailAddress) return;
    const parsedItems = buildItemsPayload();
    setEmailStatus('sending');
    try {
      await client.post('/quote/email', {
        email: emailAddress,
        serviceCode: selected.service.code,
        destinationCountryCode,
        items: parsedItems,
      });
      setEmailStatus('sent');
    } catch (err) {
      setEmailStatus(err.response?.data?.error || 'Could not send the email.');
    }
  }

  return (
    <div>
      <div id="stepper-quote"><Stepper activeKey="quote" /></div>
      <div className="section" style={{ paddingTop: 20, maxWidth: 820, margin: '0 auto' }}>
        <form className="card" style={{ padding: 28, marginBottom: 28, overflow: 'hidden' }} onSubmit={submitQuote}>
          <div className="airmail-edge" style={{ borderRadius: '18px 18px 0 0', margin: '-28px -28px 22px', width: 'calc(100% + 56px)' }} />
          <h3 style={{ marginBottom: 18 }}>Instant Booking</h3>

          <div className="grid-2">
            <div className="field">
              <label>Origin</label>
              <div className="input-group">
                <select className="flag" disabled defaultValue="🇮🇳 IN"><option>🇮🇳 IN</option></select>
                <input placeholder="India" disabled style={{ color: 'var(--slate-light)' }} />
              </div>
            </div>
            <div className="field">
              <label>Destination</label>
              <select className="select" required value={destinationCountryCode} onChange={(e) => setDestinationCountryCode(e.target.value)}>
                <option value="">Select destination…</option>
                {countries.map((c) => (
                  <option key={c.countryCode} value={c.countryCode}>{c.countryName} — {c.zone.name}</option>
                ))}
              </select>
            </div>
          </div>

          {items.map((it, idx) => (
            <div className="field" style={{ marginTop: 14 }} key={idx}>
              <label>Item {idx + 1}</label>
              <div className="item-row equal">
                <select className="select" value={it.itemType} onChange={(e) => updateItem(idx, 'itemType', e.target.value)}>
                  <option>Box</option>
                  <option>Pallet</option>
                  <option>Document</option>
                </select>
                <select className="select" value={it.weightPreset} onChange={(e) => updateItem(idx, 'weightPreset', e.target.value)}>
                  <option value="">Weight (kg)</option>
                  <option value="NOT_SURE">Not sure, book pickup</option>
                  {WEIGHT_OPTIONS.map((w) => <option key={w}>{w}</option>)}
                </select>
                <div className="qty-stepper">
                  <button type="button" onClick={() => updateItem(idx, 'quantity', Math.max(1, it.quantity - 1))}>–</button>
                  <div className="val"><span className="qty-tag">Qty</span><span className="qty-num">{String(it.quantity).padStart(2, '0')}</span></div>
                  <button type="button" onClick={() => updateItem(idx, 'quantity', it.quantity + 1)}>+</button>
                </div>
              </div>

              {it.weightPreset === 'NOT_SURE' ? (
                <p style={{ fontSize: 12.5, color: 'var(--slate)', marginTop: 8 }}>
                  We'll weigh and measure this at pickup, then collect payment in cash.
                </p>
              ) : (
                <>
                  {!it.showDims && maxDimsHint(it.weightPreset) && (
                    <p style={{ fontSize: 12, color: 'var(--slate-light)', marginTop: 8 }}>
                      Max allowed dimensions for this weight: {maxDimsHint(it.weightPreset)}
                    </p>
                  )}
                  {it.showDims ? (
                    <div className="item-row equal" style={{ marginTop: 8 }}>
                      <div>
                        <div className="lbl" style={{ marginBottom: 4 }}>Length (cm)</div>
                        <input className="input" type="number" min="1" value={it.lengthCm} onChange={(e) => updateItem(idx, 'lengthCm', e.target.value)} />
                      </div>
                      <div>
                        <div className="lbl" style={{ marginBottom: 4 }}>Width (cm)</div>
                        <input className="input" type="number" min="1" value={it.widthCm} onChange={(e) => updateItem(idx, 'widthCm', e.target.value)} />
                      </div>
                      <div>
                        <div className="lbl" style={{ marginBottom: 4 }}>Height (cm)</div>
                        <input className="input" type="number" min="1" value={it.heightCm} onChange={(e) => updateItem(idx, 'heightCm', e.target.value)} />
                      </div>
                    </div>
                  ) : (
                    <p style={{ fontSize: 12.5, color: 'var(--slate)', marginTop: 4 }}>
                      (<a href="#" style={{ color: 'var(--cobalt)', fontWeight: 700 }} onClick={(e) => { e.preventDefault(); updateItem(idx, 'showDims', true); }}>Click here</a>, if dimensions are known)
                    </p>
                  )}
                </>
              )}

              {items.length > 1 && (
                <button type="button" className="btn btn-outline btn-sm" style={{ marginTop: 8 }} onClick={() => removeItem(idx)}>Remove item</button>
              )}
            </div>
          ))}

          {!isPickupOnly && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18 }}>
              <a href="#" style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }} onClick={(e) => { e.preventDefault(); addItem(); }}>+ Add another item</a>
            </div>
          )}

          {error && <div className="error-text" style={{ marginTop: 14 }}>{error}</div>}

          <button className="btn btn-primary block" style={{ marginTop: 20 }} disabled={loading}>
            {isPickupOnly ? 'Book pickup →' : loading ? 'Calculating…' : 'Get instant quote'}
          </button>
        </form>

        {quotes && (
          <div>
            <h3 className="h-md" style={{ marginBottom: 16 }}>Choose a service</h3>
            {quotes.map((q) => {
              const isSelected = selected?.service.code === q.service.code;
              return (
                <div key={q.service.code} className={`rate-card ${isSelected ? 'selected' : ''}`} onClick={() => setSelected(q)} style={{ cursor: 'pointer' }}>
                  <div className="rate-left">
                    <div>
                      <div className="rate-name">{q.service.name}</div>
                      <div className="rate-meta">{q.service.transitDays} business days · {q.zone.name}</div>
                    </div>
                  </div>
                  <div className="rate-price">
                    <div className="unit-price"><div className="amt">₹{q.pricing.unitPrice}</div><div className="per">/ kg</div></div>
                    <div className="divider" />
                    <div className="rate-total">
                      <span className="amt2">₹{q.pricing.grandTotal.toFixed(2)}</span>
                      <span className="unit-note">{q.weight.chargeableWeightKg} kg billed</span>
                    </div>
                  </div>
                  <button type="button" className={isSelected ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}>
                    {isSelected ? 'Selected' : 'Select'}
                  </button>
                </div>
              );
            })}

            {selected && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 18, paddingTop: 18, borderTop: '1px dashed var(--line)', flexWrap: 'wrap', gap: 16 }}>
                <span style={{ fontSize: 13, color: 'var(--slate)', paddingTop: 4 }}>Total for this shipment</span>
                <div style={{ textAlign: 'right' }}>
                  <div className="mono" style={{ fontSize: 24, fontWeight: 700, color: 'var(--navy)' }}>₹{selected.pricing.grandTotal.toFixed(2)}</div>
                  <div style={{ fontSize: 12, color: 'var(--slate-light)' }}>{selected.weight.chargeableWeightKg.toFixed(2)} kg billed</div>

                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button type="button" className="btn btn-outline" onClick={openEmailModal}>
                      ✉️ Email quote
                    </button>
                    <button type="button" className="btn btn-primary" style={{ padding: '14px 32px' }} onClick={continueToDetails}>
                      Continue to details →
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className={`modal-overlay ${showEmailModal ? 'open' : ''}`} onClick={() => setShowEmailModal(false)}>
        <div className="modal-box" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h3 style={{ fontSize: 17 }}>Email this quote</h3>
            <button onClick={() => setShowEmailModal(false)} style={{ background: 'var(--paper)', border: 'none', width: 44, height: 44, borderRadius: '50%', fontSize: 15, color: 'var(--slate)', cursor: 'pointer' }}>✕</button>
          </div>
          <p style={{ fontSize: 13, color: 'var(--slate)', marginBottom: 18 }}>We'll send the price breakdown to this address.</p>
          <form onSubmit={emailQuote}>
            <div className="field">
              <label>Email address</label>
              <input
                className="input"
                type="email"
                required
                placeholder="you@email.com"
                value={emailAddress}
                onChange={(e) => setEmailAddress(e.target.value)}
                disabled={emailStatus === 'sent'}
                autoFocus
              />
            </div>
            {emailStatus === 'sent' ? (
              <div style={{ fontSize: 13, color: 'var(--success)', marginTop: 14 }}>✓ Quote emailed to {emailAddress}.</div>
            ) : (
              <button type="submit" className="btn btn-primary block" style={{ marginTop: 16, padding: 12 }} disabled={!emailAddress || emailStatus === 'sending'}>
                {emailStatus === 'sending' ? 'Sending…' : 'Send'}
              </button>
            )}
            {emailStatus && emailStatus !== 'sent' && emailStatus !== 'sending' && <div className="error-text" style={{ marginTop: 10 }}>{emailStatus}</div>}
          </form>
        </div>
      </div>
    </div>
  );
}
