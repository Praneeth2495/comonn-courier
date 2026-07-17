import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useBooking } from '../api/BookingContext';
import Stepper from '../components/Stepper';

export default function Payment() {
  const { order, setBooking } = useBooking();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [checkoutData, setCheckoutData] = useState(null);

  useEffect(() => {
    if (!order) return;
    client
      .post(`/payments/${order.id}/order`)
      .then(({ data }) => {
        setCheckoutData(data);
        setReady(true);
      })
      .catch((err) => setError(err.response?.data?.error || 'Could not start payment.'));
  }, [order]);

  async function pollForSuccess() {
    for (let i = 0; i < 8; i++) {
      const { data } = await client.get(`/payments/${order.id}`);
      if (data.payment.status === 'SUCCEEDED') return true;
      await new Promise((r) => setTimeout(r, 1200));
    }
    return false;
  }

  function handlePay() {
    if (!window.Razorpay) {
      setError('Payment checkout failed to load. Please refresh and try again.');
      return;
    }
    setError('');
    setSubmitting(true);

    const rzp = new window.Razorpay({
      key: checkoutData.keyId,
      order_id: checkoutData.payment.providerOrderId,
      name: 'Comonn',
      description: `Order ${order.orderNumber}`,
      handler: async (response) => {
        try {
          await client.post(`/payments/${order.id}/confirm`, response);
          // Webhook is the source of truth; poll briefly for status to flip to SUCCEEDED.
          const succeeded = await pollForSuccess();
          if (succeeded) {
            setBooking({});
            navigate('/labels');
          } else {
            setError('Payment is processing — refresh in a moment or check your order status.');
            setSubmitting(false);
          }
        } catch (err) {
          setError(err.response?.data?.error || 'Could not confirm payment.');
          setSubmitting(false);
        }
      },
      modal: {
        ondismiss: () => setSubmitting(false),
      },
      theme: { color: '#0f172a' },
    });

    rzp.on('payment.failed', () => {
      setError('Payment failed. Please try again.');
      setSubmitting(false);
    });

    rzp.open();
  }

  if (!order) {
    return (
      <div className="wrap section-narrow" style={{ textAlign: 'center' }}>
        <p className="lead">No order in progress yet.</p>
        <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/quote')}>Get a quote</button>
      </div>
    );
  }

  return (
    <div>
      <div id="stepper-payment"><Stepper activeKey="payment" /></div>
      <div className="wrap" style={{ maxWidth: 560, padding: '20px 32px 80px' }}>
        <h1 className="h-lg">Payment</h1>
        <p className="lead" style={{ marginBottom: 20 }}>
          Order {order.orderNumber} · Total due: <b>${Number(order.grandTotal).toFixed(2)} {order.currency}</b>
        </p>

        {error && <div className="error-text" style={{ marginBottom: 16 }}>{error}</div>}

        <div className="card" style={{ padding: 24 }}>
          <button
            className="btn btn-primary block"
            disabled={!ready || submitting}
            onClick={handlePay}
          >
            {submitting ? 'Processing…' : `Pay $${Number(order.grandTotal).toFixed(2)} ${order.currency}`}
          </button>
          <p style={{ fontSize: 13, color: 'var(--slate-light)', marginTop: 12 }}>
            Pay by UPI, card, or netbanking. International cards and PayPal are also supported.
          </p>
        </div>

        <p style={{ fontSize: 12, color: 'var(--slate-light)', marginTop: 16 }}>
          Payments are processed securely by Razorpay. Comonn never stores your card details.
        </p>
      </div>
    </div>
  );
}
