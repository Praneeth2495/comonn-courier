import { createContext, useContext, useState } from 'react';

const BookingContext = createContext(null);

const initial = () => {
  const raw = sessionStorage.getItem('comonn_booking');
  return raw ? JSON.parse(raw) : { quoteInput: null, selectedQuote: null, order: null };
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
    setBookingState({ quoteInput: null, selectedQuote: null, order: null });
  }

  return (
    <BookingContext.Provider value={{ ...booking, setBooking, clearBooking }}>
      {children}
    </BookingContext.Provider>
  );
}

export function useBooking() {
  return useContext(BookingContext);
}
