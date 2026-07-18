import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useBooking } from '../api/BookingContext';
import { useAuth } from '../api/AuthContext';
import Stepper from '../components/Stepper';

const WEIGHT_OPTIONS = Array.from({ length: 25 }, (_, i) => `${i + 1} kg`);

function emptyItem() {
  return { itemType: 'Box', weightPreset: '', lengthCm: '30', widthCm: '20', heightCm: '15', quantity: 1, showDims: false };
}

export default function Quote() {
  const { user } = useAuth();
  const [countries, setCountries] = useState([]);
  const [destinationCountryCode, setDestinationCountryCode] = useState('');
  const [items, setItems] = useState([emptyItem()]);
  const [quotes, setQuotes] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [emailAddress, setEmailAddress] = useState(user?.email || '');
  const [emailStatus, setEmailStatus] = useState('');
  const { setBooking } = useBooking();
  const navigate = useNavigate();

  useEffect(() => {
    client.get('/quote/countries').then(({ data }) => setCountries(data.countries)).catch(() => {});
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
        lengthCm: Number(it.lengthCm),
        widthCm: Number(it.widthCm),
        heightCm: Number(it.heightCm),
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
        order: null,
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
    setBooking({ quoteInput: { destinationCountryCode, items: parsedItems }, selectedQuote: selected, order: null });
    navigate('/details');
  }

  async function emailQuote() {
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
              ) : it.showDims ? (
                <div className="item-row equal" style={{ marginTop: 8 }}>
                  <input className="input" type="number" min="1" placeholder="Length (cm)" value={it.lengthCm} onChange={(e) => updateItem(idx, 'lengthCm', e.target.value)} />
                  <input className="input" type="number" min="1" placeholder="Width (cm)" value={it.widthCm} onChange={(e) => updateItem(idx, 'widthCm', e.target.value)} />
                  <input className="input" type="number" min="1" placeholder="Height (cm)" value={it.heightCm} onChange={(e) => updateItem(idx, 'heightCm', e.target.value)} />
                </div>
              ) : (
                <p style={{ fontSize: 12.5, color: 'var(--slate)', marginTop: 8 }}>
                  If dimensions are known, <a href="#" style={{ color: 'var(--cobalt)', fontWeight: 700 }} onClick={(e) => { e.preventDefault(); updateItem(idx, 'showDims', true); }}>Click Here.</a>{' '}
                  (assuming {it.lengthCm}×{it.widthCm}×{it.heightCm} cm otherwise)
                </p>
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
                    <input
                      className="input"
                      type="email"
                      placeholder="you@email.com"
                      value={emailAddress}
                      onChange={(e) => setEmailAddress(e.target.value)}
                      style={{ width: 200 }}
                    />
                    <button type="button" className="btn btn-outline" disabled={!emailAddress || emailStatus === 'sending'} onClick={emailQuote}>
                      ✉️ {emailStatus === 'sending' ? 'Sending…' : 'Email quote'}
                    </button>
                    <button type="button" className="btn btn-primary" style={{ padding: '14px 32px' }} onClick={continueToDetails}>
                      Continue to details →
                    </button>
                  </div>
                  {emailStatus === 'sent' && <div style={{ fontSize: 12.5, color: 'var(--success)', marginTop: 8 }}>Quote emailed to {emailAddress}.</div>}
                  {emailStatus && emailStatus !== 'sent' && emailStatus !== 'sending' && <div className="error-text" style={{ marginTop: 8 }}>{emailStatus}</div>}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
