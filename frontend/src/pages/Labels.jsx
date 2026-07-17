import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useBooking } from '../api/BookingContext';
import Stepper from '../components/Stepper';

export default function Labels() {
  const { order, clearBooking } = useBooking();
  const navigate = useNavigate();
  const [labels, setLabels] = useState(null);
  const [invoice, setInvoice] = useState(null);
  const [emailedTo, setEmailedTo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const didGenerate = useRef(false);

  useEffect(() => {
    if (!order || didGenerate.current) return;
    didGenerate.current = true;
    client
      .post(`/labels/${order.id}/generate`)
      .then(({ data }) => {
        setLabels(data.labels);
        setInvoice(data.invoice);
        setEmailedTo(data.emailedTo);
      })
      .catch((err) => setError(err.response?.data?.error || 'Could not generate your labels.'))
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
      <div className="section" style={{ paddingTop: 20, maxWidth: 960, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <span className="pill pill-success" style={{ marginBottom: 14 }}>✓ Booking confirmed</span>
          <h2 className="h-lg" style={{ marginTop: 10 }}>Download your shipping labels</h2>
          <p className="lead" style={{ marginTop: 8 }}>Print and attach these to each package before pickup.</p>
        </div>

        {loading && <p className="lead" style={{ textAlign: 'center' }}>Generating your labels…</p>}
        {error && <div className="error-text" style={{ textAlign: 'center' }}>{error}</div>}

        {labels && (
          <>
            <div className="table-wrap" style={{ marginTop: 30 }}>
              <div className="label-row" style={{ background: 'var(--paper)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--slate-light)', fontWeight: 700 }}>
                <div>Order ID</div><div>Origin</div><div>Destination</div><div>Label</div>
              </div>
              {labels.map((l) => (
                <div className="label-row" key={l.id}>
                  <div className="oid">{order.orderNumber}{labels.length > 1 ? ` (${l.packageIndex}/${labels.length})` : ''}</div>
                  <div className="addr"><b>Pickup</b>{order.senderAddress?.city}, {order.senderAddress?.countryCode}</div>
                  <div className="addr"><b>Delivery</b>{order.receiverAddress?.city}, {order.receiverAddress?.countryCode}</div>
                  <div>
                    <a
                      className="btn btn-dark btn-sm"
                      href={`${import.meta.env.VITE_API_BASE_URL || '/api'}${l.downloadUrl}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      ⬇ Download
                    </a>
                  </div>
                </div>
              ))}
            </div>

            {invoice && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                <a
                  className="btn btn-outline btn-sm"
                  href={`${import.meta.env.VITE_API_BASE_URL || '/api'}${invoice.downloadUrl}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  ⬇ Download invoice
                </a>
              </div>
            )}

            {emailedTo && (
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: 'var(--success-bg)', borderRadius: 12, padding: '16px 18px', marginTop: 22 }}>
                <span style={{ fontSize: 18, lineHeight: 1 }}>✉️</span>
                <p style={{ fontSize: 13.5, color: 'var(--success)' }}>
                  These labels and your invoice have also been emailed to your verified address — <b>{emailedTo}</b>.
                </p>
              </div>
            )}

            <button
              className="btn btn-outline block"
              style={{ marginTop: 22 }}
              onClick={() => { clearBooking(); navigate('/dashboard'); }}
            >
              Go to my orders
            </button>
          </>
        )}
      </div>
    </div>
  );
}
