import { useEffect, useRef, useState } from 'react';
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

function isAddressFilled(addr) {
  return !!(addr.contactName && addr.phoneNumber && addr.line1 && addr.city && addr.postcode && addr.countryCode);
}

export default function Details() {
  const { quoteInput, selectedQuote, order: bookingOrder, savedBookings, setBooking, addSavedBooking } = useBooking();
  const { user } = useAuth();
  const navigate = useNavigate();
  // A completed (paid/labeled) order left over in context from a previous,
  // already-finished booking must never prefill a new one — only an order
  // still actually in progress (or one staff are deliberately editing)
  // should be treated as "this is the same booking, not a fresh one".
  // Otherwise a guest starting a second booking in the same tab would see
  // the previous customer's name/address auto-filled in these fields.
  const isEditingExisting = Boolean(bookingOrder && (['UNFINISHED', 'PENDING_PAYMENT'].includes(bookingOrder.status) || ['ADMIN', 'STAFF'].includes(user?.role)));
  const [sender, setSender] = useState(() => {
    if (isEditingExisting) return fromSavedAddress(bookingOrder.senderAddress);
    // Pre-fill from the pickup pincode entered on the Quote page's Origin
    // field, if the customer picked a suggestion there.
    const base = emptyAddress('IN');
    if (quoteInput?.originPostcode) base.postcode = quoteInput.originPostcode;
    if (quoteInput?.originSuburb) base.city = quoteInput.originSuburb;
    if (quoteInput?.originState) base.state = quoteInput.originState;
    return base;
  });
  const [receiver, setReceiver] = useState(() => (isEditingExisting ? fromSavedAddress(bookingOrder.receiverAddress) : emptyAddress(quoteInput?.destinationCountryCode || '')));
  const [contentsDescription, setContentsDescription] = useState(isEditingExisting ? bookingOrder.contentsDescription || '' : '');
  const [declaredValue, setDeclaredValue] = useState(isEditingExisting && bookingOrder.declaredValue ? String(bookingOrder.declaredValue) : '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [showNewBookingConfirm, setShowNewBookingConfirm] = useState(false);

  useEffect(() => {
    if (user) client.get('/addresses').then(({ data }) => setSavedAddresses(data.addresses)).catch(() => {});
  }, [user]);

  const pricingPending = Boolean(quoteInput?.pricingPending);
  // Staff/admin editing an existing booking can still correct a mistyped
  // sender pincode directly; regular customers must go back to the Book
  // page (which re-quotes) to change their pickup location.
  const senderLocked = !['ADMIN', 'STAFF'].includes(user?.role);

  const norm = (s) => (s || '').trim().toLowerCase();
  // Only surface saved addresses that actually match this quote's chosen
  // pickup/destination — not the customer's whole address book.
  const senderSavedAddresses = savedAddresses.filter(
    (a) => sender.postcode && norm(a.postcode) === norm(sender.postcode) && norm(a.city) === norm(sender.city) && norm(a.state) === norm(sender.state)
  );
  const receiverSavedAddresses = savedAddresses.filter(
    (a) => quoteInput?.destinationCountryCode && a.countryCode === quoteInput.destinationCountryCode
  );

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

  // Shared by the normal "Book now" submit and "New booking" (which saves
  // the current one before starting the next) — creates or updates the
  // order and returns it.
  async function saveOrder() {
    const payload = {
      serviceCode: pricingPending ? undefined : selectedQuote.service.code,
      sender: toAddressPayload(sender),
      receiver: toAddressPayload(receiver),
      items: quoteInput.items,
      declaredValue: Number(declaredValue) || 0,
      contentsDescription,
      pricingPending,
    };
    // If an order already exists from a prior visit to this step (e.g. the
    // customer went back and changed something, or staff are editing an
    // existing booking), update it in place rather than creating a
    // duplicate order — see isEditingExisting above for what counts as
    // "the same in-progress booking" vs. a stale completed one.
    const { data } = isEditingExisting
      ? await client.patch(`/orders/${bookingOrder.id}/details`, payload)
      : await client.post('/orders', payload);
    // amountPaid/balance (only present on the edit/PATCH response) ride
    // along on the order object so Payment.jsx can show an updated
    // invoice with any due/credit balance for orders edited after payment.
    return isEditingExisting ? { ...data.order, amountPaid: data.amountPaid, balance: data.balance } : data.order;
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const nextOrder = await saveOrder();
      setBooking({ order: nextOrder });
      navigate('/payment');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save the order. Please check the details and try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleNewBookingClick() {
    if (!isAddressFilled(sender) || !isAddressFilled(receiver)) {
      setShowNewBookingConfirm(true);
      return;
    }
    saveCurrentAndStartNew();
  }

  async function saveCurrentAndStartNew() {
    setShowNewBookingConfirm(false);
    setError('');
    setLoading(true);
    try {
      const savedOrder = await saveOrder();
      addSavedBooking(savedOrder);
      navigate('/quote');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save this booking. Please check the details and try again.');
    } finally {
      setLoading(false);
    }
  }

  // "Cancel" in the confirm popup — discard the current, not-yet-filled-in
  // attempt (but keep any other bookings already saved this session) and
  // start fresh.
  function discardAndStartNew() {
    setShowNewBookingConfirm(false);
    setBooking({ quoteInput: null, selectedQuote: null, order: null });
    navigate('/quote');
  }

  return (
    <div>
      <div id="stepper-details"><Stepper activeKey="details" /></div>
      <div className="section" style={{ paddingTop: 20, maxWidth: 900, margin: '0 auto' }}>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          style={{ marginBottom: 16 }}
          onClick={() => navigate('/quote')}
        >
          ← Back
        </button>

        {savedBookings?.length > 0 && (
          <div className="card" style={{ padding: '14px 18px', marginBottom: 16, background: 'var(--paper)' }}>
            <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--slate-light)', fontWeight: 700, marginBottom: 8 }}>
              {savedBookings.length} other booking{savedBookings.length > 1 ? 's' : ''} saved this session
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {savedBookings.map((b) => (
                <span key={b.id} className="pill pill-navy" style={{ fontSize: 12 }}>
                  {b.orderNumber} · {b.senderAddress?.city} → {b.receiverAddress?.city}
                </span>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={submit}>
          <div className="card summary-card">
            <div className="summary-top"><h3>Booking summary</h3></div>
            <div className="addr-grid">
              <div className="addr-block">
                <div className="lbl">Origin</div>
                <p>
                  {quoteInput.originPostcode
                    ? [quoteInput.originPostcode, quoteInput.originSuburb, quoteInput.originState].filter(Boolean).join(', ')
                    : 'India'}
                </p>
              </div>
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
              </div>
            ) : (
              <div className="item-line" style={{ borderTop: '1px dashed var(--line)', marginTop: 10, paddingTop: 14 }}>
                <div className="tag-group"><span>{selectedQuote.service.name} · {selectedQuote.weight.chargeableWeightKg} kg billed</span></div>
                <div className="price">₹{selectedQuote.pricing.grandTotal.toFixed(2)}</div>
              </div>
            )}

            <div className="grid-2" style={{ marginTop: 18 }}>
              <div className="field">
                <label>Goods description <span style={{ color: 'var(--danger)', fontSize: 12 }}>*</span></label>
                <input className="input" required placeholder="Documents, clothes, decorative items" value={contentsDescription} onChange={(e) => setContentsDescription(e.target.value)} />
              </div>
              <div className="field">
                <label>Value of goods <span style={{ color: 'var(--danger)', fontSize: 12 }}>*</span></label>
                <input className="input" type="number" min="0" required placeholder="₹5,000" value={declaredValue} onChange={(e) => setDeclaredValue(e.target.value)} />
              </div>
            </div>

            <div className="form-section-title inline"><div className="badge">1</div><h4>Receiver details</h4></div>
            <AddressFields
              value={receiver}
              onChange={updateReceiver}
              instructionsLabel="Delivery instructions"
              autoFillNote="Country auto-filled from your quote's destination"
              hideCityStatePlaceholder
              savedAddresses={receiverSavedAddresses}
              onSelectSaved={(id) => { const a = savedAddresses.find((s) => s.id === id); if (a) setReceiver(fromSavedAddress(a)); }}
            />
          </div>

          <div className="form-section-title"><div className="badge">2</div><h4>Sender details</h4></div>
          <div className="card" style={{ padding: 26 }}>
            <AddressFields
              value={sender}
              onChange={updateSender}
              instructionsLabel="Instructions"
              autoFillNote={senderLocked ? "Locked to your quote's pickup postcode — go back to the Book page to change it" : "Country auto-filled from your quote's origin"}
              savedAddresses={senderSavedAddresses}
              onSelectSaved={(id) => { const a = savedAddresses.find((s) => s.id === id); if (a) setSender(fromSavedAddress(a)); }}
              lockedFields={senderLocked ? ['postcode', 'city', 'state', 'countryCode'] : []}
              enforceIndianPhone
            />
          </div>

          {error && <div className="error-text" style={{ marginTop: 14 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 14, marginTop: 26 }}>
            <button type="button" className="btn btn-outline" style={{ flex: 1, padding: 13 }} disabled={loading} onClick={handleNewBookingClick}>
              {loading ? 'Saving…' : 'New booking'}
            </button>
            <button className="btn btn-primary" style={{ flex: 1, padding: 13 }} disabled={loading}>
              {loading ? 'Booking…' : 'Book now →'}
            </button>
          </div>
        </form>
      </div>

      {showNewBookingConfirm && (
        <div className="modal-overlay open" onClick={() => setShowNewBookingConfirm(false)}>
          <div className="modal-box" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: 8 }}>Details not added</h3>
            <p className="lead" style={{ fontSize: 13.5, marginBottom: 22 }}>
              This booking's receiver/sender details aren't filled in yet. Continue filling them in, or cancel this booking to start a new one.
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={discardAndStartNew}>Cancel</button>
              <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={() => setShowNewBookingConfirm(false)}>Continue to add details</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AddressFields({ value, onChange, instructionsLabel, autoFillNote, savedAddresses = [], onSelectSaved, lockedFields = [], hideCityStatePlaceholder = false, enforceIndianPhone = false }) {
  const [pinSuggestions, setPinSuggestions] = useState([]);
  const debounceRef = useRef(null);
  const isLocked = (field) => lockedFields.includes(field);

  function handlePostcodeChange(v) {
    onChange('postcode', v);
    clearTimeout(debounceRef.current);
    if (!/^\d{6}$/.test(v) || value.countryCode !== 'IN') {
      setPinSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      client.get('/quote/postcode-suggestions', { params: { postcode: v } })
        .then(({ data }) => setPinSuggestions(data.suggestions))
        .catch(() => setPinSuggestions([]));
    }, 400);
  }

  function pickSuggestion(s) {
    onChange('city', s.suburb);
    onChange('state', s.state);
    setPinSuggestions([]);
  }

  function handlePhoneChange(v) {
    onChange('phoneNumber', enforceIndianPhone ? v.replace(/\D/g, '').slice(0, 10) : v);
  }

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
            <input
              placeholder={enforceIndianPhone ? '10 digit number' : '00000 00000'}
              required
              value={value.phoneNumber}
              onChange={(e) => handlePhoneChange(e.target.value)}
              {...(enforceIndianPhone ? { maxLength: 10, inputMode: 'numeric', pattern: '\\d{10}', title: 'Enter exactly 10 digits' } : {})}
            />
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
          <input
            className="input"
            placeholder={hideCityStatePlaceholder ? '' : 'Hyderabad'}
            required
            disabled={isLocked('city')}
            value={value.city}
            onChange={(e) => onChange('city', e.target.value)}
          />
        </div>
        <div className="field">
          <label>State</label>
          <input
            className="input"
            placeholder={hideCityStatePlaceholder ? '' : 'Telangana'}
            disabled={isLocked('state')}
            value={value.state}
            onChange={(e) => onChange('state', e.target.value)}
          />
        </div>
      </div>
      <div className="grid-2" style={{ marginTop: 14 }}>
        <div className="field" style={{ maxWidth: 220, position: 'relative' }}>
          <label>Pin code</label>
          <input className="input" required disabled={isLocked('postcode')} value={value.postcode} onChange={(e) => handlePostcodeChange(e.target.value)} />
          {pinSuggestions.length > 0 && (
            <div className="card" style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, padding: 6, maxHeight: 220, overflowY: 'auto', zIndex: 20 }}>
              {pinSuggestions.map((s, i) => (
                <button
                  type="button"
                  key={i}
                  className="acct-menu-item"
                  onClick={() => pickSuggestion(s)}
                >
                  {value.postcode}, {s.suburb}, {s.state}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="field" style={{ maxWidth: 220 }}>
          <label>Country code</label>
          <input className="input" required maxLength={2} disabled={isLocked('countryCode')} value={value.countryCode} onChange={(e) => onChange('countryCode', e.target.value.toUpperCase())} />
        </div>
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--slate-light)', marginTop: 6 }}>✓ {autoFillNote}</p>
    </>
  );
}
