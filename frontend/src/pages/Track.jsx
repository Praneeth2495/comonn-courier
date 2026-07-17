import { useState } from 'react';
import client from '../api/client';

export default function Track() {
  const [trackingNumber, setTrackingNumber] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setResult(null);
    setLoading(true);
    try {
      const { data } = await client.get(`/track/${encodeURIComponent(trackingNumber.trim())}`);
      setResult(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Shipment not found');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="wrap section-narrow">
      <h1 className="h-lg" style={{ marginBottom: 6 }}>Track your shipment</h1>
      <p className="lead" style={{ marginBottom: 24 }}>Enter the tracking number from your shipping label.</p>

      <form onSubmit={submit} style={{ display: 'flex', gap: 10 }}>
        <input className="input" placeholder="e.g. CN1234567890" value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} required />
        <button className="btn btn-primary" disabled={loading}>{loading ? 'Searching…' : 'Track'}</button>
      </form>

      {error && <div className="error-text" style={{ marginTop: 16 }}>{error}</div>}

      {result && (
        <div className="card" style={{ padding: 24, marginTop: 24 }}>
          <div className="pill pill-cobalt">{result.status.replace(/_/g, ' ')}</div>
          <h3 className="h-md" style={{ margin: '12px 0 4px' }}>{result.orderNumber}</h3>
          <p style={{ color: 'var(--slate)', fontSize: 13.5 }}>
            {result.service} to {result.destination.city}, {result.destination.countryCode}
          </p>

          <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {result.events.map((ev, i) => (
              <div key={i} style={{ display: 'flex', gap: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--coral)', marginTop: 5, flex: 'none' }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{ev.status.replace(/_/g, ' ')}</div>
                  <div style={{ fontSize: 12, color: 'var(--slate-light)' }}>
                    {new Date(ev.occurredAt).toLocaleString()} {ev.location ? `· ${ev.location}` : ''}
                  </div>
                  {ev.note && <div style={{ fontSize: 12.5, color: 'var(--slate)' }}>{ev.note}</div>}
                </div>
              </div>
            ))}
            {result.events.length === 0 && <p style={{ fontSize: 13, color: 'var(--slate-light)' }}>No tracking events yet.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
