import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useBooking } from '../api/BookingContext';
import Stepper from '../components/Stepper';

export default function Labels() {
  const { order, clearBooking } = useBooking();
  const navigate = useNavigate();
  const [label, setLabel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!order) return;
    client
      .post(`/labels/${order.id}/generate`)
      .then(({ data }) => setLabel(data))
      .catch((err) => setError(err.response?.data?.error || 'Could not generate the label.'))
      .finally(() => setLoading(false));
  }, [order]);

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
      <div id="stepper-labels"><Stepper activeKey="labels" /></div>
      <div className="wrap section-narrow" style={{ textAlign: 'center' }}>
        <div className="pill pill-success" style={{ marginBottom: 12 }}>Payment confirmed</div>
        <h1 className="h-lg">Your label is ready</h1>
        <p className="lead" style={{ margin: '10px 0 26px' }}>Order {order.orderNumber} · Tracking number {order.trackingNumber || 'assigned after payment'}</p>

        {loading && <p className="lead">Generating your label…</p>}
        {error && <div className="error-text">{error}</div>}

        {label && (
          <div className="card" style={{ padding: 28 }}>
            <p style={{ marginBottom: 16 }}>Barcode: <b className="mono">{label.label.barcodeValue}</b></p>
            <a
              className="btn btn-primary block"
              href={`${import.meta.env.VITE_API_BASE_URL || '/api'}${label.downloadUrl}`}
              target="_blank"
              rel="noreferrer"
            >
              Download label (PDF)
            </a>
            <button
              className="btn btn-outline block"
              style={{ marginTop: 10 }}
              onClick={() => { clearBooking(); navigate('/dashboard'); }}
            >
              Go to my orders
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
