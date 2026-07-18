import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useBooking } from '../api/BookingContext';
import { useAuth } from '../api/AuthContext';
import Stepper from '../components/Stepper';

const COUNTRY_CODES = ['🇮🇳 +91', '🇦🇺 +61', '🇨🇦 +1', '🇳🇿 +64', '🇬🇧 +44', '🇺🇸 +1', '🇪🇺 +32'];

const emptyAddress = (countryCode) => ({
  contactName: '',
  dialCode: COUNTRY_CODES[0],
  phoneNumber: '',
  email: '',
  instructions: '',
  line1: '',
  line2: '',
  city: '',
  state: '',
  postcode: '',
  countryCode,
});

function fromSavedAddress(saved) {
  const dial = COUNTRY_CODES.find((c) => saved.phone?.startsWith(c.split(' ')[1])) || COUNTRY_CODES[0];
  const phoneNumber = saved.phone?.startsWith(dial.split(' ')[1]) ? saved.phone.slice(dial.split(' ')[1].length).trim() : saved.phone || '';
  return {
    contactName: saved.contactName,
    dialCode: dial,
    phoneNumber,
    email: saved.email || '',
    instructions: saved.instructions || '',
    line1: saved.line1,
    line2: saved.line2 || '',
    city: saved.city,
    state: saved.state || '',
    postcode: saved.postcode,
    countryCode: saved.countryCode,
  };
}

export default function Details() {
  const { quoteInput, selectedQuote, setBooking, clearBooking } = useBooking();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [sender, setSender] = useState(() => emptyAddress('IN'));
  const [receiver, setReceiver] = useState(() => emptyAddress(quoteInput?.destinationCountryCode || ''));
  const [contentsDescription, setContentsDescription] = useState('');
  const [declaredValue, setDeclaredValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [savedAddresses, setSavedAddresses] = useState([]);

  useEffect(() => {
    if (user) client.get('/addresses').then(({ data }) => setSavedAddresses(data.addresses)).catch(() => {});
  }, [user]);

  const pricingPending = Boolean(quoteInput?.pricingPending);

  if (!quoteInput || (!selectedQuote && !pricingPending)) {
    return (
      <div className="wrap section-narrow" style={{ textAlign: 'center' }}>
        <p className="lead">Start by getting an instant quote first.</p>
        <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/quote')}>Get a quote</button>
      </div>
    );
  }

  function updateField(setter) {
    return (field, value) => setter((prev) => ({ ...prev, [field]: value }));
  }
  const updateSender = updateField(setSender);
  const updateReceiver = updateField(setReceiver);

  function toAddressPayload(addr) {
    return {
      contactName: addr.contactName,
      phone: `${addr.dialCode.split(' ')[1]} ${addr.phoneNumber}`.trim(),
      email: addr.email,
      instructions: addr.instructions,
      line1: addr.line1,
      line2: addr.line2,
      city: addr.city,
      state: addr.state,
      postcode: addr.postcode,
      countryCode: addr.countryCode,
    };
  }

  function newBooking() {
    clearBooking();
    navigate('/quote');
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await client.post('/orders', {
        serviceCode: pricingPending ? undefined : selectedQuote.service.code,
        sender: toAddressPayload(sender),
        receiver: toAddressPayload(receiver),
        items: quoteInput.items,
        declaredValue: Number(declaredValue) || 0,
        contentsDescription,
        pricingPending,
      });
      setBooking({ order: data.order });
      navigate('/payment');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create the order. Please check the details and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div id="stepper-details"><Stepper activeKey="details" /></div>
      <div className="section" style={{ paddingTop: 20, maxWidth: 900, margin: '0 auto' }}>
        <form onSubmit={submit}>
          <div className="card summary-card">
            <div className="summary-top"><h3>Booking summary</h3></div>
            <div className="addr-grid">
              <div className="addr-block"><div className="lbl">Origin</div><p>India</p></div>
              <div className="addr-block"><div className="lbl">Destination</div><p>{pricingPending ? quoteInput.destinationCountryName : selectedQuote.zone.name}</p></div>
            </div>

            {quoteInput.items.map((it, idx) => (
              <div className="item-line" key={idx}>
                <div className="tag-group">
                  <span><b style={{ color: 'var(--ink)' }}>Item {idx + 1}</b> · {it.itemType}</span>
                  {!pricingPending && <span>Weight: {it.actualWeightKg} kg</span>}
                  <span>Qty: {String(it.quantity).padStart(2, '0')}</span>
                </div>
              </div>
            ))}
            {pricingPending ? (
              <div className="item-line" style={{ borderTop: '1px dashed var(--line)', marginTop: 10, paddingTop: 14 }}>
                <div className="tag-group"><span>Pickup booking — weight &amp; price assessed at pickup</span></div>
                <div className="price" style={{ fontSize: 14 }}>Pay cash on collection</div>
              </div>
            ) : (
              <div className="item-line" style={{ borderTop: '1px dashed var(--line)', marginTop: 10, paddingTop: 14 }}>
                <div className="tag-group"><span>{selectedQuote.service.name} · {selectedQuote.weight.chargeableWeightKg} kg billed</span></div>
                <div className="price">₹{selectedQuote.pricing.grandTotal.toFixed(2)}</div>
              </div>
            )}

            <div className="grid-2" style={{ marginTop: 18 }}>
              <div className="field">
                <label>Goods description</label>
                <input className="input" placeholder="Documents, clothes, decorative items" value={contentsDescription} onChange={(e) => setContentsDescription(e.target.value)} />
              </div>
              <div className="field">
                <label>Value of goods</label>
                <input className="input" type="number" min="0" placeholder="₹5,000" value={declaredValue} onChange={(e) => setDeclaredValue(e.target.value)} />
              </div>
            </div>

            <div className="form-section-title inline"><div className="badge">1</div><h4>Receiver details</h4></div>
            <AddressFields
              value={receiver}
              onChange={updateReceiver}
              instructionsLabel="Delivery instructions"
              autoFillNote="Country auto-filled from your quote's destination"
              savedAddresses={savedAddresses}
              onSelectSaved={(id) => { const a = savedAddresses.find((s) => s.id === id); if (a) setReceiver(fromSavedAddress(a)); }}
            />
          </div>

          <div className="form-section-title"><div className="badge">2</div><h4>Sender details</h4></div>
          <div className="card" style={{ padding: 26 }}>
            <AddressFields
              value={sender}
              onChange={updateSender}
              instructionsLabel="Instructions"
              autoFillNote="Country auto-filled from your quote's origin"
              savedAddresses={savedAddresses}
              onSelectSaved={(id) => { const a = savedAddresses.find((s) => s.id === id); if (a) setSender(fromSavedAddress(a)); }}
            />
          </div>

          {error && <div className="error-text" style={{ marginTop: 14 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 14, marginTop: 26 }}>
            <button type="button" className="btn btn-outline" style={{ flex: 1, padding: 13 }} onClick={newBooking}>New booking</button>
            <button className="btn btn-primary" style={{ flex: 1, padding: 13 }} disabled={loading}>
              {loading ? 'Booking…' : 'Book now →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddressFields({ value, onChange, instructionsLabel, autoFillNote, savedAddresses = [], onSelectSaved }) {
  return (
    <>
      {savedAddresses.length > 0 && (
        <div className="field" style={{ marginBottom: 14 }}>
          <label>Use a saved address</label>
          <select className="select" defaultValue="" onChange={(e) => { if (e.target.value) onSelectSaved(e.target.value); e.target.value = ''; }}>
            <option value="">Select a saved address…</option>
            {savedAddresses.map((a) => (
              <option key={a.id} value={a.id}>{a.label || a.contactName} — {a.city}, {a.countryCode}</option>
            ))}
          </select>
        </div>
      )}
      <div className="grid-2">
        <div className="field">
          <label>Name</label>
          <input className="input" placeholder="Enter full name" required value={value.contactName} onChange={(e) => onChange('contactName', e.target.value)} />
        </div>
        <div className="field">
          <label>Phone</label>
          <div className="input-group">
            <select className="flag" value={value.dialCode} onChange={(e) => onChange('dialCode', e.target.value)}>
              {COUNTRY_CODES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <input placeholder="00000 00000" required value={value.phoneNumber} onChange={(e) => onChange('phoneNumber', e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>Email</label>
          <input className="input" type="email" placeholder="example@gmail.com" value={value.email} onChange={(e) => onChange('email', e.target.value)} />
        </div>
        <div className="field">
          <label>{instructionsLabel}</label>
          <input className="input" placeholder="Optional" value={value.instructions} onChange={(e) => onChange('instructions', e.target.value)} />
        </div>
      </div>
      <div className="grid-2" style={{ marginTop: 14 }}>
        <div className="field">
          <label>Address Line 1</label>
          <input className="input" placeholder="House / street" required value={value.line1} onChange={(e) => onChange('line1', e.target.value)} />
        </div>
        <div className="field">
          <label>Address Line 2</label>
          <input className="input" placeholder="Apartment, suite (optional)" value={value.line2} onChange={(e) => onChange('line2', e.target.value)} />
        </div>
      </div>
      <div className="grid-2" style={{ marginTop: 14 }}>
        <div className="field">
          <label>City / Town</label>
          <input className="input" placeholder="Hyderabad" required value={value.city} onChange={(e) => onChange('city', e.target.value)} />
        </div>
        <div className="field">
          <label>State</label>
          <input className="input" placeholder="Telangana" value={value.state} onChange={(e) => onChange('state', e.target.value)} />
        </div>
      </div>
      <div className="grid-2" style={{ marginTop: 14 }}>
        <div className="field" style={{ maxWidth: 220 }}>
          <label>Pin code</label>
          <input className="input" required value={value.postcode} onChange={(e) => onChange('postcode', e.target.value)} />
        </div>
        <div className="field" style={{ maxWidth: 220 }}>
          <label>Country code</label>
          <input className="input" required maxLength={2} value={value.countryCode} onChange={(e) => onChange('countryCode', e.target.value.toUpperCase())} />
        </div>
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--slate-light)', marginTop: 6 }}>✓ {autoFillNote}</p>
    </>
  );
}
