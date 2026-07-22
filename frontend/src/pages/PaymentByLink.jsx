import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import client from '../api/client';
import { useBooking } from '../api/BookingContext';
import Payment from './Payment';

// Public entry point for a shared payment link (see order.controller.js's
// getOrderForPayment) — fetches the order fresh and hydrates BookingContext
// with it before handing off to the normal Payment page, so a customer on
// their own device/browser (no prior quote/details session) can complete
// DG ack, OTP and payment themselves.
export default function PaymentByLink() {
  const { orderId } = useParams();
  const { setBooking } = useBooking();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    client.get(`/orders/${orderId}/pay`).then(({ data }) => {
      setBooking({ order: data.order });
      setLoading(false);
    }).catch((err) => {
      setError(err.response?.data?.error || 'This payment link is invalid or no longer active.');
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  if (loading) return <p className="lead" style={{ textAlign: 'center', marginTop: 60 }}>Loading…</p>;
  if (error) {
    return (
      <div className="wrap section-narrow" style={{ textAlign: 'center' }}>
        <p className="lead">{error}</p>
      </div>
    );
  }
  return <Payment />;
}
