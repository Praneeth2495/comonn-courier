import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useBooking } from '../api/BookingContext';
import { useAuth } from '../api/AuthContext';
import Stepper from '../components/Stepper';
import { COUNTRY_NAMES, getCountryName } from '../utils/countryNames';
import { PHONE_OPTIONS, getPhoneMeta } from '../utils/phoneCodes';
import { getPostcodeRule, sanitizePostcode } from '../utils/postcodeRules';
import { getRegionFieldConfig, normalizeRegionValue } from '../utils/regionNames';
import { getStoredReferralCode } from '../utils/referral';
import { formatPostcodeSuggestion } from '../utils/addressDisplay';

const emptyAddress = (countryCode) => ({
  contactName: '',
  dialCode: getPhoneMeta(countryCode).code,
  phoneNumber: '',
  email: '',
  instructions: '',
  line1: '',
  line2: '',
  city: '',
  state: '',
  postcode: '',
  eircode: '',
  countryCode,
});

function fromSavedAddress(saved) {
  const byCountry = getPhoneMeta(saved.countryCode);
  const meta = saved.phone?.startsWith(byCountry.dial)
    ? byCountry
    : PHONE_OPTIONS.find((p) => saved.phone?.startsWith(p.dial)) || byCountry;
  const phoneNumber = saved.phone?.startsWith(meta.dial) ? saved.phone.slice(meta.dial.length).trim() : saved.phone || '';
  return {
    contactName: saved.contactName,
    dialCode: meta.code,
    phoneNumber,
    email: saved.email || '',
    instructions: saved.instructions || '',
    line1: saved.line1,
    line2: saved.line2 || '',
    city: saved.city,
    state: normalizeRegionValue(saved.countryCode, saved.state) || '',
    postcode: saved.postcode,
    eircode: saved.eircode || '',
    countryCode: saved.countryCode,
  };
}

function isAddressFilled(addr) {
  const eircodeOk = addr.countryCode !== 'IE' || !!addr.eircode;
  return !!(addr.contactName && addr.phoneNumber && addr.line1 && addr.city && addr.postcode && addr.countryCode) && eircodeOk;
}

// Re-derives the quoteInput/selectedQuote shape this page needs from a
// saved booking's own Order record — used when editing a booking that was
// already set aside via "New booking", since BookingContext only ever
// kept the raw order for those, not the original quote-flow objects.
function quoteInputFromOrder(order) {
  return {
    pricingPending: order.pricingPending,
    items: (order.items || []).map((it) => ({ itemType: it.itemType, actualWeightKg: Number(it.actualWeightKg), quantity: it.quantity })),
    originPostcode: order.senderAddress?.postcode,
    originSuburb: order.senderAddress?.city,
    originState: order.senderAddress?.state,
    destinationPostcode: order.receiverAddress?.postcode,
    destinationEircode: order.receiverAddress?.eircode,
    destinationSuburb: order.receiverAddress?.city,
    destinationState: order.receiverAddress?.state,
    destinationCountryCode: order.receiverAddress?.countryCode,
    destinationCountryName: getCountryName(order.receiverAddress?.countryCode),
  };
}
function selectedQuoteFromOrder(order) {
  if (order.pricingPending) return null;
  return {
    service: { code: order.service?.code, name: order.service?.name },
    weight: { chargeableWeightKg: Number(order.chargeableWeightKg) },
    zone: { name: order.zoneCode },
    pricing: { grandTotal: Number(order.grandTotal) },
  };
}

// Switching which booking is "active" (editing a saved one, or starting a
// new one) only changes BookingContext — it doesn't remount this
// component, so the useState() initializers below (which only ever run
// once, on mount) would keep showing stale form values. Keying the inner
// form on the active order's id forces React to tear down and recreate it
// whenever that changes, which is the simplest fix without touching the
// router.
export default function Details() {
  const { order: bookingOrder } = useBooking();
  return <DetailsForm key={bookingOrder?.id || 'new'} />;
}

function DetailsForm() {
  const { quoteInput, selectedQuote, order: bookingOrder, savedBookings, setBooking, addSavedBooking, removeSavedBooking } = useBooking();
  const { user } = useAuth();
  const navigate = useNavigate();
  // A completed (paid/labeled) order left over in context from a previous,
  // already-finished booking must never prefill a new one — only an order
  // still actually in progress (or one staff are deliberately editing)
  // should be treated as "this is the same booking, not a fresh one".
  // Otherwise a guest starting a second booking in the same tab would see
  // the previous customer's name/address auto-filled in these fields.
  const isEditingExisting = Boolean(bookingOrder && (['UNFINISHED', 'PENDING_PAYMENT'].includes(bookingOrder.status) || ['ADMIN', 'STAFF', 'ACCOUNTS'].includes(user?.role)));
  const norm = (s) => (s || '').trim().toLowerCase();
  // Same pickup pincode as a booking already saved this session ("New
  // booking") almost always means the same sender is shipping again — see
  // the sender useState below for what gets carried over, and the email
  // field's lockedFields entry further down for why email specifically
  // also gets locked once this matches (request: a second+ order's sender
  // email shouldn't need re-typing or be editable, unlike the other
  // contact fields which stay editable in case a different person is
  // dropping this particular parcel off).
  const matchedSenderBooking = !isEditingExisting && quoteInput?.originPostcode
    ? savedBookings?.find((b) => norm(b.senderAddress?.postcode) === norm(quoteInput.originPostcode))
    : null;
  // Sender email specifically locks to the FIRST saved booking's email for
  // every order after it in the session, regardless of whether this
  // particular order's pickup postcode happens to match (unlike
  // matchedSenderBooking's full prefill above, which only reuses the rest
  // of the sender's details when the pickup location is literally the
  // same) — same sender account placing several orders from different
  // pickup points should still never need to retype or be able to change
  // the email after the first one.
  const firstSenderEmail = !isEditingExisting
    ? savedBookings?.find((b) => b.senderAddress?.email)?.senderAddress?.email || null
    : null;
  const [sender, setSender] = useState(() => {
    if (isEditingExisting) return fromSavedAddress(bookingOrder.senderAddress);
    // Pre-fill from the pickup pincode entered on the Quote page's Origin
    // field, if the customer picked a suggestion there.
    const base = emptyAddress('IN');
    if (quoteInput?.originPostcode) base.postcode = quoteInput.originPostcode;
    if (quoteInput?.originSuburb) base.city = quoteInput.originSuburb;
    if (quoteInput?.originState) base.state = normalizeRegionValue('IN', quoteInput.originState);

    // Carry over just the contact details (name, phone, email, address,
    // instructions) so they don't have to retype them. Postcode/city/
    // state/country stay driven by this booking's own quoted origin above
    // (not the matched booking's) since that's what pricing was actually
    // calculated against.
    if (matchedSenderBooking?.senderAddress) {
      const matchedSender = fromSavedAddress(matchedSenderBooking.senderAddress);
      return {
        ...base,
        contactName: matchedSender.contactName,
        dialCode: matchedSender.dialCode,
        phoneNumber: matchedSender.phoneNumber,
        email: matchedSender.email,
        instructions: matchedSender.instructions,
        line1: matchedSender.line1,
        line2: matchedSender.line2,
      };
    }
    if (firstSenderEmail) return { ...base, email: firstSenderEmail };
    return base;
  });
  const [receiver, setReceiver] = useState(() => {
    if (isEditingExisting) return fromSavedAddress(bookingOrder.receiverAddress);
    // Pre-fill from the destination postcode entered on the Quote page's
    // Destination field, if the customer picked a suggestion there.
    const base = emptyAddress(quoteInput?.destinationCountryCode || '');
    if (quoteInput?.destinationPostcode) base.postcode = quoteInput.destinationPostcode;
    if (quoteInput?.destinationEircode) base.eircode = quoteInput.destinationEircode;
    if (quoteInput?.destinationSuburb) base.city = quoteInput.destinationSuburb;
    if (quoteInput?.destinationState) base.state = normalizeRegionValue(quoteInput.destinationCountryCode, quoteInput.destinationState);
    return base;
  });
  const [contentsDescription, setContentsDescription] = useState(isEditingExisting ? bookingOrder.contentsDescription || '' : '');
  const [declaredValue, setDeclaredValue] = useState(isEditingExisting && bookingOrder.declaredValue ? String(bookingOrder.declaredValue) : '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [showNewBookingConfirm, setShowNewBookingConfirm] = useState(false);
  // Set only when "Edit" was clicked on a saved booking while the current
  // one still needs the confirm-or-discard prompt below (incomplete
  // sender/receiver) — lets that same modal's "discard" button load the
  // requested booking instead of just bouncing to /quote. Null means the
  // modal is there for the plain "New booking" flow instead.
  const [pendingEditTarget, setPendingEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    if (user) client.get('/addresses').then(({ data }) => setSavedAddresses(data.addresses)).catch(() => {});
  }, [user]);

  const pricingPending = Boolean(quoteInput?.pricingPending);
  // Locked for everyone, staff/admin included — postcode/city/state/country
  // here are what the price was actually calculated against (via the Book
  // page's quote), so editing them in place (whether on a new booking or
  // while correcting an existing one) would silently mismatch the shipment
  // from its price. Anyone needing a different pickup location has to go
  // back to the Book page, which re-quotes.
  const senderLocked = true;
  // Same lock for the receiver's postcode/suburb/state — these come from
  // the destination autocomplete picked on the Book page.
  const receiverLocked = true;
  // City still comes from that same autocomplete pick — locking it makes
  // sense normally, but three cases have no real suburb to lock to:
  // countries with zero postcode-suggestion data at all (destinationSuburb
  // was never set), UAE, where the "postcode" field is really an Emirate
  // picker, so its "suburb" is just the Emirate name repeated, and NZ,
  // whose postcode-suggestion coverage is known-incomplete (~1,738 of
  // 3,000+ real combinations) — the auto-filled suburb may not match the
  // customer's actual one. City must stay editable (and required — see
  // AddressFields below) in all three cases, so the customer confirms or
  // corrects it themselves rather than silently trusting a guess.
  const UNRELIABLE_SUBURB_COUNTRIES = ['AE', 'NZ'];
  const receiverCityLocked = isEditingExisting || (Boolean(quoteInput?.destinationSuburb) && !UNRELIABLE_SUBURB_COUNTRIES.includes(quoteInput?.destinationCountryCode));
  // Same idea for Ireland's full Eircode — lock it once we actually have one
  // (from the quote step, or already saved on an existing order), but leave
  // it editable if there's nothing to lock to yet (e.g. an older IE order
  // from before this field existed) so it isn't stuck disabled and blank.
  const receiverEircodeLocked = isEditingExisting
    ? Boolean(bookingOrder?.receiverAddress?.eircode)
    : Boolean(quoteInput?.destinationEircode);

  // Only surface saved addresses that fully match this quote's chosen
  // pickup — postcode, city, and state all have to match (case/whitespace
  // normalized). Note: this means a saved address whose city/state was
  // typed differently from however the quote's postcode-suggestion autofill
  // spells it (e.g. "Vic" vs "Victoria") won't show up even though it's the
  // same real address — known and intentional per explicit request.
  const senderSavedAddresses = savedAddresses.filter(
    (a) => sender.postcode && norm(a.postcode) === norm(sender.postcode) && norm(a.city) === norm(sender.city) && norm(a.state) === norm(sender.state)
  );
  // Destination match: country, postcode, and city/suburb — state is
  // deliberately excluded here, since it's the field most likely to be
  // spelled differently between a saved address and the quote's autofill
  // (e.g. "VIC" vs "Victoria") without actually being a different address.
  const receiverSavedAddresses = savedAddresses.filter(
    (a) =>
      quoteInput?.destinationCountryCode &&
      a.countryCode === quoteInput.destinationCountryCode &&
      receiver.postcode &&
      norm(a.postcode) === norm(receiver.postcode) &&
      norm(a.city) === norm(receiver.city)
  );

  // Only reuse the saved address's contact details — keep the locked
  // postcode/city/state/country exactly as quoted/priced, so picking a
  // saved address can never silently drift the destination away from what
  // was actually priced.
  function pickSavedReceiverAddress(id) {
    const a = savedAddresses.find((s) => s.id === id);
    if (!a) return;
    setReceiver((prev) => ({ ...fromSavedAddress(a), postcode: prev.postcode, city: prev.city, state: prev.state, countryCode: prev.countryCode }));
  }

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
      phone: `${getPhoneMeta(addr.dialCode).dial} ${addr.phoneNumber}`.trim(),
      email: addr.email,
      instructions: addr.instructions,
      line1: addr.line1,
      line2: addr.line2,
      city: addr.city,
      state: addr.state,
      postcode: addr.postcode,
      eircode: addr.countryCode === 'IE' ? addr.eircode : undefined,
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
      // Only meaningful the first time this order is created (see
      // referralService.js — consumed once, when the customer's account
      // itself is first created); harmless to omit on an edit.
      ...(isEditingExisting ? {} : { referralCode: getStoredReferralCode() || undefined }),
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
      setPendingEditTarget(null);
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

  // Loads a saved booking as the active one — the DetailsForm remount
  // (keyed on order id, see the outer Details() wrapper) is what actually
  // makes the form fields refresh to its values. Removed from
  // savedBookings since it's "active" again, not "saved".
  function loadBookingForEdit(booking) {
    removeSavedBooking(booking.id);
    setBooking({ order: booking, quoteInput: quoteInputFromOrder(booking), selectedQuote: selectedQuoteFromOrder(booking) });
  }

  // "Cancel" in the confirm popup — discard the current booking's
  // not-yet-filled-in attempt (but keep any other bookings already saved
  // this session). If this prompt was triggered by clicking Edit on a
  // saved booking (pendingEditTarget set) rather than plain "New
  // booking", load that booking instead of bouncing to /quote — "discard
  // this incomplete one" and "switch to editing that one" are the same
  // action from here.
  function discardAndStartNew() {
    setShowNewBookingConfirm(false);
    if (pendingEditTarget) {
      const target = pendingEditTarget;
      setPendingEditTarget(null);
      loadBookingForEdit(target);
      return;
    }
    setBooking({ quoteInput: null, selectedQuote: null, order: null });
    navigate('/quote');
  }

  // Clicking Edit on a saved booking must never silently throw away
  // whatever's currently on screen — the previous version did exactly
  // that (same bug for a brand-new unsaved booking or for a previously-
  // reopened one), since swapping BookingContext's active order/
  // quoteInput remounts this form from scratch. So: save/stash whatever's
  // currently active first —
  //  - nothing active (no quoteInput) → nothing to lose, proceed
  //  - already a real order (bookingOrder set, i.e. this is itself a
  //    reopened saved booking) → its address fields are always fully
  //    filled already (they came from a real order), so just persist
  //    any edits and put it back in the saved list
  //  - a brand-new booking that hasn't been saved yet → persist it only
  //    if sender+receiver are actually filled in; otherwise fall back to
  //    the same confirm-or-discard prompt "New booking" already uses,
  //    with this booking queued up to load once they decide
  async function editSavedBooking(booking) {
    if (!quoteInput) {
      loadBookingForEdit(booking);
      return;
    }
    if (!bookingOrder && (!isAddressFilled(sender) || !isAddressFilled(receiver))) {
      setPendingEditTarget(booking);
      setShowNewBookingConfirm(true);
      return;
    }
    setError('');
    setLoading(true);
    try {
      const stashed = await saveOrder();
      addSavedBooking(stashed);
      loadBookingForEdit(booking);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save your current booking before switching — nothing was changed.');
    } finally {
      setLoading(false);
    }
  }

  // Only removes it from this session's saved list — the order itself
  // stays on the server as an abandoned PENDING_PAYMENT/UNFINISHED record,
  // same as any booking a customer simply never returns to. There's no
  // customer-facing "delete order" endpoint, and adding one is a bigger
  // change than this button calls for. Gated behind its own confirm
  // modal (deleteTarget) rather than acting immediately — see the request
  // this came from.
  function confirmDeleteSavedBooking() {
    if (deleteTarget) removeSavedBooking(deleteTarget.id);
    setDeleteTarget(null);
  }

  return (
    <div>
      <div id="stepper-details"><Stepper activeKey="details" /></div>
      <div className="section" style={{ paddingTop: 20, maxWidth: 900, margin: '0 auto' }}>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          style={{ marginBottom: 16 }}
          // Flags this as a "came back" arrival via location state (rather
          // than relying on navigate(-1)/history POP, which would land on
          // Payment.jsx instead of Quote.jsx if the customer got here via
          // Payment's own "← Back" button) — Quote.jsx uses this to land at
          // the page top instead of scrolling straight to the results.
          onClick={() => navigate('/quote', { state: { cameFromBack: true } })}
        >
          ← Back
        </button>

        {savedBookings?.length > 0 && (
          <div className="card" style={{ padding: '14px 18px 6px', marginBottom: 16, background: 'var(--paper)' }}>
            <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--slate-light)', fontWeight: 700, marginBottom: 10 }}>
              {savedBookings.length} other booking{savedBookings.length > 1 ? 's' : ''} saved this session
            </p>
            {savedBookings.map((b) => (
              <div
                key={b.id}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: '1px solid var(--line-2)', flexWrap: 'wrap' }}
              >
                <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', fontFamily: "'IBM Plex Mono', monospace" }}>{b.orderNumber}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--slate)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {b.senderAddress?.city} → {b.receiverAddress?.city}, {getCountryName(b.receiverAddress?.countryCode)}
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', flex: 'none' }}>
                  {b.pricingPending ? 'Priced at pickup' : `₹${Number(b.grandTotal).toFixed(2)}`}
                </div>
                <div style={{ display: 'flex', gap: 6, flex: 'none' }}>
                  <button type="button" className="btn btn-outline btn-sm" disabled={loading} onClick={() => editSavedBooking(b)}>Edit</button>
                  <button type="button" className="btn btn-outline btn-sm" style={{ color: 'var(--danger)', borderColor: 'var(--danger-bg)' }} disabled={loading} onClick={() => setDeleteTarget(b)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}

        <form className="details-form" onSubmit={submit}>
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
              <div className="addr-block">
                <div className="lbl">Destination</div>
                <p>
                  {quoteInput.destinationPostcode
                    ? [quoteInput.destinationEircode || quoteInput.destinationPostcode, quoteInput.destinationSuburb, quoteInput.destinationState].filter(Boolean).join(', ')
                    : pricingPending ? quoteInput.destinationCountryName : selectedQuote.zone.name}
                </p>
              </div>
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
              autoFillNote={receiverLocked ? "Locked to your quote's destination postcode — go back to the Book page to change it" : "Country auto-filled from your quote's destination"}
              hideCityStatePlaceholder
              savedAddresses={receiverSavedAddresses}
              onSelectSaved={pickSavedReceiverAddress}
              lockedFields={receiverLocked ? ['postcode', ...(receiverCityLocked ? ['city'] : []), ...(receiverEircodeLocked ? ['eircode'] : []), 'state', 'countryCode'] : []}
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
              onSelectSaved={(id) => {
                const a = savedAddresses.find((s) => s.id === id);
                if (!a) return;
                setSender((prev) => ({ ...fromSavedAddress(a), postcode: prev.postcode, city: prev.city, state: prev.state, countryCode: prev.countryCode }));
              }}
              lockedFields={senderLocked ? ['postcode', 'city', 'state', 'countryCode', ...((matchedSenderBooking || firstSenderEmail) ? ['email'] : [])] : []}
            />
          </div>

          {error && <div className="error-text" style={{ marginTop: 14 }}>{error}</div>}

          <div className="details-submit-row" style={{ display: 'flex', gap: 14, marginTop: 26 }}>
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
        <div className="modal-overlay open" onClick={() => { setShowNewBookingConfirm(false); setPendingEditTarget(null); }}>
          <div className="modal-box" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <h3>Details not added</h3>
              <button onClick={() => { setShowNewBookingConfirm(false); setPendingEditTarget(null); }} style={{ background: 'var(--paper)', border: 'none', width: 44, height: 44, borderRadius: '50%', fontSize: 15, color: 'var(--slate)', cursor: 'pointer', flex: 'none' }}>✕</button>
            </div>
            <p className="lead" style={{ fontSize: 13.5, marginBottom: 22 }}>
              {pendingEditTarget
                ? `This booking's receiver/sender details aren't filled in yet. Continue filling them in, or discard it to edit ${pendingEditTarget.orderNumber} instead.`
                : "This booking's receiver/sender details aren't filled in yet. Continue filling them in, or cancel this booking to start a new one."}
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={discardAndStartNew}>{pendingEditTarget ? 'Discard & edit that one' : 'Cancel'}</button>
              <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={() => { setShowNewBookingConfirm(false); setPendingEditTarget(null); }}>Continue to add details</button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="modal-overlay open" onClick={() => setDeleteTarget(null)}>
          <div className="modal-box" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <h3>Delete {deleteTarget.orderNumber}?</h3>
              <button onClick={() => setDeleteTarget(null)} style={{ background: 'var(--paper)', border: 'none', width: 44, height: 44, borderRadius: '50%', fontSize: 15, color: 'var(--slate)', cursor: 'pointer', flex: 'none' }}>✕</button>
            </div>
            <p className="lead" style={{ fontSize: 13.5, marginBottom: 22 }}>
              This removes it from this session's bookings and it won't be included in payment. This can't be undone.
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button type="button" className="btn btn-primary" style={{ flex: 1, background: 'var(--danger)' }} onClick={confirmDeleteSavedBooking}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AddressFields({ value, onChange, instructionsLabel, autoFillNote, savedAddresses = [], onSelectSaved, lockedFields = [], hideCityStatePlaceholder = false }) {
  const [pinSuggestions, setPinSuggestions] = useState([]);
  const debounceRef = useRef(null);
  const phoneMeta = getPhoneMeta(value.dialCode);
  const regionConfig = getRegionFieldConfig(value.countryCode);
  const isLocked = (field) => lockedFields.includes(field) && !(field === 'state' && regionConfig.alwaysEditable);

  function handlePostcodeChange(raw) {
    const v = sanitizePostcode(raw, value.countryCode);
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
    onChange('state', normalizeRegionValue(value.countryCode, s.state));
    setPinSuggestions([]);
  }

  function handlePhoneChange(v) {
    onChange('phoneNumber', v.replace(/\D/g, '').slice(0, phoneMeta.digits));
  }

  return (
    <>
      {savedAddresses.length > 0 && (
        <div className="field" style={{ marginBottom: 14 }}>
          <label>Use a saved address</label>
          <select className="select" defaultValue="" onChange={(e) => { if (e.target.value) onSelectSaved(e.target.value); e.target.value = ''; }}>
            <option value="">Select a saved address…</option>
            {savedAddresses.map((a) => (
              <option key={a.id} value={a.id}>{a.label || a.contactName} — {a.city}, {getCountryName(a.countryCode)}</option>
            ))}
          </select>
        </div>
      )}
      <div className="grid-2">
        <div className="field">
          <label>Name <span style={{ color: 'var(--danger)', fontSize: 12 }}>*</span></label>
          <input className="input" placeholder="Enter full name" required value={value.contactName} onChange={(e) => onChange('contactName', e.target.value)} />
        </div>
        <div className="field">
          <label>Phone <span style={{ color: 'var(--danger)', fontSize: 12 }}>*</span></label>
          <div className="input-group">
            <select className="flag" value={value.dialCode} onChange={(e) => onChange('dialCode', e.target.value)}>
              {PHONE_OPTIONS.map((p) => <option key={p.code} value={p.code}>{p.flag} {p.dial}</option>)}
            </select>
            <input
              placeholder={`${phoneMeta.digits} digit number`}
              required
              value={value.phoneNumber}
              onChange={(e) => handlePhoneChange(e.target.value)}
              maxLength={phoneMeta.digits}
              inputMode="numeric"
              pattern={`\\d{${phoneMeta.digits}}`}
              title={`Enter exactly ${phoneMeta.digits} digits`}
            />
          </div>
        </div>
        <div className="field">
          <label>Email <span style={{ color: 'var(--danger)', fontSize: 12 }}>*</span></label>
          <input className="input" type="email" placeholder="example@gmail.com" required disabled={isLocked('email')} value={value.email} onChange={(e) => onChange('email', e.target.value)} />
        </div>
        <div className="field">
          <label>{instructionsLabel}</label>
          <input className="input" placeholder="Optional" value={value.instructions} onChange={(e) => onChange('instructions', e.target.value)} />
        </div>
      </div>
      <div className="grid-2" style={{ marginTop: 14 }}>
        <div className="field">
          <label>Address Line 1 <span style={{ color: 'var(--danger)', fontSize: 12 }}>*</span></label>
          <input className="input" placeholder="House / street" required value={value.line1} onChange={(e) => onChange('line1', e.target.value)} />
        </div>
        <div className="field">
          <label>Address Line 2</label>
          <input className="input" placeholder="Apartment, suite (optional)" value={value.line2} onChange={(e) => onChange('line2', e.target.value)} />
        </div>
      </div>
      <div className="grid-2" style={{ marginTop: 14 }}>
        <div className="field" style={{ gridColumn: regionConfig.hidden ? '1 / -1' : undefined }}>
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
        {!regionConfig.hidden && (
          <div className="field">
            <label>{regionConfig.label}{regionConfig.required && <span style={{ color: 'var(--danger)', fontSize: 12 }}> *</span>}</label>
            {regionConfig.options ? (
              <select className="input" required={regionConfig.required} disabled={isLocked('state')} value={value.state} onChange={(e) => onChange('state', e.target.value)}>
                <option value="">Select {regionConfig.label.toLowerCase()}</option>
                {Object.values(regionConfig.options).map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            ) : (
              <input
                className="input"
                placeholder={hideCityStatePlaceholder ? '' : regionConfig.label === 'County' ? 'Surrey' : regionConfig.label === 'Suburb' ? 'Sandton' : 'Telangana'}
                required={regionConfig.required}
                disabled={isLocked('state')}
                value={value.state}
                onChange={(e) => onChange('state', e.target.value)}
              />
            )}
          </div>
        )}
      </div>
      <div className="grid-2" style={{ marginTop: 14 }}>
        {value.countryCode !== 'IE' && (
          <div className="field" style={{ maxWidth: 220, position: 'relative' }}>
            <label>{value.countryCode === 'DE' ? 'PLZ' : 'Pin code'}</label>
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
                    {formatPostcodeSuggestion(value.postcode, s.suburb, s.state, value.countryCode)}
                  </button>
                ))}
              </div>
            )}
            {!isLocked('postcode') && (
              <p style={{ fontSize: 11, color: 'var(--slate-light)', marginTop: 4 }}>{getPostcodeRule(value.countryCode).hint}</p>
            )}
          </div>
        )}
        {/* Ireland shows only the Eircode here (not the 3-character routing
            key it's derived from, which stays locked internally on
            value.postcode for pricing/zone/airport resolution) — same one
            postcode-style field every other country gets. */}
        {value.countryCode === 'IE' && (
          <div className="field" style={{ maxWidth: 220 }}>
            <label>Eircode</label>
            <input
              className="input"
              required
              disabled={isLocked('eircode')}
              placeholder="e.g. D02 AF30"
              maxLength={8}
              value={value.eircode}
              onChange={(e) => onChange('eircode', e.target.value.toUpperCase())}
            />
            <p style={{ fontSize: 11, color: 'var(--slate-light)', marginTop: 4 }}>
              Needed to pinpoint the exact building.
            </p>
          </div>
        )}
        <div className="field" style={{ maxWidth: 220 }}>
          <label>Country</label>
          {isLocked('countryCode') ? (
            <input className="input" disabled value={getCountryName(value.countryCode)} />
          ) : (
            <select className="input" required value={value.countryCode} onChange={(e) => onChange('countryCode', e.target.value)}>
              <option value="" disabled>Select country</option>
              {Object.entries(COUNTRY_NAMES).map(([code, name]) => (
                <option key={code} value={code}>{name}</option>
              ))}
            </select>
          )}
        </div>
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--slate-light)', marginTop: 6 }}>✓ {autoFillNote}</p>
    </>
  );
}
