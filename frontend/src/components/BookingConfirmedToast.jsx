import { useEffect, useState } from 'react';
import { getCountryName } from '../utils/countryNames';

const DISPLAY_MS = 5000;

// Live "someone just booked" popup, fed by a server-sent-events stream —
// see backend/src/services/bookingFeed.js. One event arrives the instant
// any order anywhere reaches PAID or PICKUP_CONFIRMED; only destination
// city/country is shown, never the customer's name or other details.
export default function BookingConfirmedToast() {
  const [queue, setQueue] = useState([]);
  const [current, setCurrent] = useState(null);

  useEffect(() => {
    const base = import.meta.env.VITE_API_BASE_URL || '/api';
    const source = new EventSource(`${base}/public/booking-feed`);
    source.onmessage = (e) => {
      try {
        setQueue((prev) => [...prev, JSON.parse(e.data)]);
      } catch {
        // ignore malformed event
      }
    };
    return () => source.close();
  }, []);

  // Pop the next queued booking once nothing is currently showing — keeps
  // bursts of near-simultaneous confirmations from overlapping/interrupting
  // each other.
  useEffect(() => {
    if (current || queue.length === 0) return;
    const [next, ...rest] = queue;
    setCurrent(next);
    setQueue(rest);
  }, [current, queue]);

  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(() => setCurrent(null), DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [current]);

  if (!current) return null;

  return (
    <div className="booking-toast" role="status">
      <span className="icon">✅</span>
      <div>
        <div className="title">Booking confirmed</div>
        <div className="sub">Destination: {current.city}, {getCountryName(current.countryCode)}</div>
      </div>
    </div>
  );
}
