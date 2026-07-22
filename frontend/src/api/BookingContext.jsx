import { createContext, useContext, useState } from 'react';

const BookingContext = createContext(null);

const initial = () => {
  const raw = sessionStorage.getItem('comonn_booking');
  const parsed = raw ? JSON.parse(raw) : {};
  // savedBookings: other bookings started in this same session that were
  // set aside (via "New booking" on the Details page) to add another
  // shipment before paying — each still needs payment. Independent of the
  // single "active" quoteInput/selectedQuote/order below.
  return { quoteInput: null, selectedQuote: null, order: null, savedBookings: [], ...parsed };
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

  function clearBooking() {
    sessionStorage.removeItem('comonn_booking');
    setBookingState({ quoteInput: null, selectedQuote: null, order: null, savedBookings: [] });
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
