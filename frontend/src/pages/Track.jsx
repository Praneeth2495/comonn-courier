import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import client from '../api/client';

const SHIP_STAGES = ['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'];
const STAGE_LABELS = { PICKED_UP: 'Picked up', IN_TRANSIT: 'At hub', OUT_FOR_DELIVERY: 'Out for delivery', DELIVERED: 'Delivered' };
const STATUS_PILL = {
  DRAFT: 'pill-warn',
  PENDING_PAYMENT: 'pill-warn',
  PAID: 'pill-cobalt',
  LABEL_GENERATED: 'pill-cobalt',
  PICKED_UP: 'pill-cobalt',
  IN_TRANSIT: 'pill-cobalt',
  OUT_FOR_DELIVERY: 'pill-cobalt',
  DELIVERED: 'pill-success',
  CANCELLED: 'pill-danger',
  EXCEPTION: 'pill-danger',
};

export default function Track() {
  const [searchParams] = useSearchParams();
  const [trackingNumber, setTrackingNumber] = useState(searchParams.get('id') || '');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function runTrack(number) {
    setError('');
    setResult(null);
    setLoading(true);
    try {
      const { data } = await client.get(`/track/${encodeURIComponent(number.trim())}`);
      setResult(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Shipment not found');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const id = searchParams.get('id');
    if (id) runTrack(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit(e) {
    e.preventDefault();
    runTrack(trackingNumber);
  }

  const stageIndex = result ? SHIP_STAGES.indexOf(result.status) : -1;
  const isFinal = result && (result.status === 'DELIVERED' || result.status === 'CANCELLED' || result.status === 'EXCEPTION');
  const progressPct = stageIndex >= 0 ? ((stageIndex + 1) / SHIP_STAGES.length) * 100 : 0;
  const nextStage = !isFinal && stageIndex < SHIP_STAGES.length - 1 ? SHIP_STAGES[stageIndex + 1] : null;

  return (
    <div>
      <div className="track-hero">
        <h1>Track your order</h1>
        <p style={{ color: '#AEB6D2', marginTop: 8 }}>Enter your order ID for live status and delivery ETA.</p>
        <form className="track-box" onSubmit={submit}>
          <input placeholder="e.g. 180701" value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} required />
          <button className="btn btn-primary" disabled={loading}>{loading ? 'Searching…' : 'Track'}</button>
        </form>
      </div>

      {error && <div className="wrap" style={{ maxWidth: 760, margin: '20px auto 0', textAlign: 'center' }}><div className="error-text">{error}</div></div>}

      {result && (
        <>
          <div className="card track-status-card">
            <div className="track-status-top">
              <div>
                <h3>Destination: {result.destination.city}{result.destination.state ? `, ${result.destination.state}` : ''}</h3>
                <p style={{ fontSize: 12.5, color: 'var(--slate)', marginTop: 4 }}>
                  Order ID: <span className="mono">{result.orderNumber}</span>
                </p>
              </div>
              <span className={`pill ${STATUS_PILL[result.status] || 'pill-navy'}`}>{result.status.replace(/_/g, ' ')}</span>
            </div>
            <div className="progress-bar"><div className="fill" style={{ width: `${progressPct}%` }} /></div>
            <div className="progress-labels">
              {SHIP_STAGES.map((s, i) => (
                <span key={s} className={i <= stageIndex ? 'on' : ''}>{STAGE_LABELS[s]}</span>
              ))}
            </div>
          </div>

          <div className="timeline">
            {result.events.map((ev, i) => (
              <div className="tl-item" key={i}>
                <div className="tl-dot">✓</div>
                <div className="tl-body">
                  <b>{ev.status.replace(/_/g, ' ')}</b>
                  <span>
                    {new Date(ev.occurredAt).toLocaleString()} {ev.location ? `· ${ev.location}` : ''}
                  </span>
                  {ev.note && <div style={{ fontSize: 12.5, color: 'var(--slate)', marginTop: 2 }}>{ev.note}</div>}
                </div>
              </div>
            ))}
            {result.events.length === 0 && <p style={{ fontSize: 13, color: 'var(--slate-light)' }}>No tracking events yet.</p>}
            {nextStage && (
              <div className="tl-item">
                <div className="tl-dot pending">●</div>
                <div className="tl-body"><b>{STAGE_LABELS[nextStage]}</b><span>Pending</span></div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
