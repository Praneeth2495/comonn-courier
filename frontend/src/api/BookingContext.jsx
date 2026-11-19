import { createContext, useContext, useEffect, useState } from 'react';

const BookingContext = createContext(null);

// How long the browser keeps auto-resuming an unpaid "Book now"ed order
// before it stops offering it back automatically — NOT how long the order
// itself survives. The order row stays in the database exactly as it
// always has (nothing here ever deletes or touches it); this only decides
// when Quote.jsx/Details.jsx stop treating it as "what I was just working
// on" and show a blank form instead. A signed-up customer loses nothing
// real either way — they can still finish the exact same order anytime
// via My Account → "Continue booking", which re-fetches it from the
// server by id and doesn't depend on this at all. order.userId (set only
// when the customer was logged in at the moment "Book now" was clicked —
// see createOrder in order.controller.js) is what distinguishes the two
// thresholds below, without this context needing to know about auth state
// itself.
const SIGNED_UP_EXPIRY_MS = 36 * 60 * 60 * 1000;
const GUEST_EXPIRY_MS = 24 * 60 * 60 * 1000;

function isExpired(booking) {
  if (!booking.order || !booking.bookedAt) return false;
  const threshold = booking.order.userId ? SIGNED_UP_EXPIRY_MS : GUEST_EXPIRY_MS;
  return Date.now() - booking.bookedAt > threshold;
}

function dropActiveBooking(booking) {
  return { ...booking, order: null, quoteInput: null, selectedQuote: null, bookedAt: null };
}

const initial = () => {
  const raw = sessionStorage.getItem('comonn_booking');
  const parsed = raw ? JSON.parse(raw) : {};
  // savedBookings: other bookings started in this same session that were
  // set aside (via "New booking" on the Details page) to add another
  // shipment before paying — each still needs payment. Independent of the
  // single "active" quoteInput/selectedQuote/order below.
  let base = { quoteInput: null, selectedQuote: null, order: null, bookedAt: null, savedBookings: [], ...parsed };
  if (isExpired(base)) base = dropActiveBooking(base);
  return base;
};

export function BookingProvider({ children }) {
  const [booking, setBookingState] = useState(initial);

  function setBooking(patch) {
    setBookingState((prev) => {
      const next = { ...prev, ...patch };
      sessionStorage.setItem('comonn_booking', JSON.stringify(next));
      return next;
    });
  }

  // "Minimised the window" (or just switched tabs) and came back later —
  // the useState initializer above only runs once per real page load, so
  // this is what actually catches someone who left a tab open past the
  // expiry window without ever reloading it.
  useEffect(() => {
    function recheck() {
      if (document.visibilityState !== 'visible') return;
      setBookingState((prev) => {
        if (!isExpired(prev)) return prev;
        const next = dropActiveBooking(prev);
        sessionStorage.setItem('comonn_booking', JSON.stringify(next));
        return next;
      });
    }
    document.addEventListener('visibilitychange', recheck);
    return () => document.removeEventListener('visibilitychange', recheck);
  }, []);

  function clearBooking() {
    sessionStorage.removeItem('comonn_booking');
    setBookingState({ quoteInput: null, selectedQuote: null, order: null, bookedAt: null, savedBookings: [] });
  }

  // Sets aside the current order as "saved, still needs payment" and clears
  // the active quoteInput/selectedQuote/order so a new booking can start —
  // savedBookings itself is untouched by clearBooking-less resets elsewhere.
  function addSavedBooking(order) {
    setBookingState((prev) => {
      const next = {
        ...prev,
        quoteInput: null,
        selectedQuote: null,
        order: null,
        savedBookings: [...(prev.savedBookings || []), order],
      };
      sessionStorage.setItem('comonn_booking', JSON.stringify(next));
      return next;
    });
  }

  function removeSavedBooking(id) {
    setBookingState((prev) => {
      const next = { ...prev, savedBookings: (prev.savedBookings || []).filter((b) => b.id !== id) };
      sessionStorage.setItem('comonn_booking', JSON.stringify(next));
      return next;
    });
  }

  return (
    <BookingContext.Provider value={{ ...booking, setBooking, clearBooking, addSavedBooking, removeSavedBooking }}>
      {children}
    </BookingContext.Provider>
  );
}

export function useBooking() {
  return useContext(BookingContext);
}
