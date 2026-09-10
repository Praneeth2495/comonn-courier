import { useEffect, useState } from 'react';
import client from '../api/client';
import LoadingLogo from './LoadingLogo';

const STATUS_LABEL = {
  PICKUP_CONFIRMED: 'Pickup Confirmed',
  PAID: 'Paid',
  LABEL_GENERATED: 'Label Generated',
  PICKED_UP: 'Picked Up',
  IN_TRANSIT: 'In Transit',
  CLEARED_DESTINATION_CUSTOMS: 'Cleared Destination Customs',
  OUT_FOR_DELIVERY: 'Out For Delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

const ACTIVE_STATUSES = ['PICKUP_CONFIRMED', 'PAID', 'LABEL_GENERATED'];

function formatAddress(a) {
  if (!a) return '—';
  return `${a.line1}${a.line2 ? `, ${a.line2}` : ''}, ${a.city}${a.state ? `, ${a.state}` : ''} ${a.postcode}, ${a.countryCode}`;
}

function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
}

/**
 * Admin/Staff-facing view into a single rider's dashboard — active jobs,
 * job history, and last known location. Read-only: status changes still
 * only happen from the rider's own app (DriverDashboard.jsx), this is just
 * for dispatch/oversight so staff don't need the rider's phone in hand.
 */
export default function RidersPanel() {
  const [drivers, setDrivers] = useState(null);
  const [selectedId, setSelectedId] = useState('');
  const [dashboard, setDashboard] = useState(null);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    client.get('/admin/drivers').then(({ data }) => setDrivers(data.drivers)).catch(() => setDrivers([]));
  }, []);

  useEffect(() => {
    if (!selectedId) { setDashboard(null); return; }
    setLoadingDashboard(true);
    setError('');
    client.get(`/admin/drivers/${selectedId}/dashboard`)
      .then(({ data }) => setDashboard(data))
      .catch((err) => setError(err.response?.data?.error || 'Could not load this rider.'))
      .finally(() => setLoadingDashboard(false));
  }, [selectedId]);

  const jobs = dashboard?.jobs || [];
  const activeJobs = jobs.filter((j) => ACTIVE_STATUSES.includes(j.status));
  const historyJobs = jobs.filter((j) => !ACTIVE_STATUSES.includes(j.status));
  const loc = dashboard?.lastLocation;

  return (
    <div>
      <h1 className="h-lg" style={{ marginBottom: 4 }}>Riders</h1>
      <p className="lead" style={{ marginBottom: 16 }}>Pick a rider to see their active jobs, job history, and last known location.</p>

      <div className="card date-toolbar" style={{ marginBottom: 20, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, color: 'var(--slate)', fontWeight: 600 }}>Rider</span>
        {drivers === null ? (
          <span style={{ fontSize: 13, color: 'var(--slate-light)' }}>Loading riders…</span>
        ) : (
          <select className="select" style={{ maxWidth: 280 }} value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            <option value="">Select a rider…</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>{d.fullName}{d.driverRegion ? ` (${d.driverRegion})` : ''}</option>
            ))}
          </select>
        )}
      </div>

      {error && <div className="error-text" style={{ marginBottom: 14 }}>{error}</div>}

      {!selectedId ? (
        <p className="lead">No rider selected.</p>
      ) : loadingDashboard ? (
        <LoadingLogo />
      ) : dashboard ? (
        <>
          <div className="card" style={{ padding: 20, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h3 style={{ fontSize: 16 }}>{dashboard.driver.fullName}</h3>
                <div style={{ fontSize: 12.5, color: 'var(--slate-light)' }}>{dashboard.driver.email}{dashboard.driver.phone ? ` · ${dashboard.driver.phone}` : ''}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className="lbl" style={{ display: 'block', marginBottom: 4 }}>Last known location</span>
                {loc ? (
                  <>
                    <span className={`pill ${loc.clockedIn ? 'pill-success' : 'pill-navy'}`}>{loc.clockedIn ? 'Clocked in' : 'Clocked out'}</span>
                    <div style={{ fontSize: 13, marginTop: 6 }}>
                      {loc.lat && loc.lng ? (
                        <a href={`https://www.google.com/maps?q=${loc.lat},${loc.lng}`} target="_blank" rel="noreferrer">{loc.area || `${loc.lat}, ${loc.lng}`}</a>
                      ) : (loc.area || '—')}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--slate-light)' }}>as of {fmtTime(loc.at)}</div>
                  </>
                ) : (
                  <div style={{ fontSize: 13, color: 'var(--slate-light)' }}>No attendance recorded yet</div>
                )}
              </div>
            </div>
          </div>

          <h3 className="h-md" style={{ marginBottom: 12 }}>Active jobs</h3>
          {activeJobs.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 28 }}>
              {activeJobs.map((j) => <JobCard key={j.id} job={j} />)}
            </div>
          ) : (
            <p className="lead" style={{ fontSize: 13.5, marginBottom: 28 }}>No active jobs.</p>
          )}

          <h3 className="h-md" style={{ marginBottom: 12 }}>Job history</h3>
          {historyJobs.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {historyJobs.map((j) => <JobCard key={j.id} job={j} />)}
            </div>
          ) : (
            <p className="lead" style={{ fontSize: 13.5 }}>No completed jobs yet.</p>
          )}
        </>
      ) : null}
    </div>
  );
}

function JobCard({ job }) {
  const totalBoxQty = job.items?.reduce((sum, it) => sum + it.quantity, 0) || 1;
  const stage = job.status === 'PICKED_UP' ? 'Picked up' : job.driverArrivedAt ? 'Arrived' : null;

  return (
    <div className="card" style={{ padding: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <div>
          <h3 style={{ fontSize: 16 }}>Order <span className="mono">{job.orderNumber}</span></h3>
          <span
            className={`pill ${job.status === 'CANCELLED' ? 'pill-danger' : ['PICKED_UP', 'IN_TRANSIT', 'CLEARED_DESTINATION_CUSTOMS', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(job.status) ? 'pill-success' : 'pill-cobalt'}`}
            style={{ marginTop: 6, display: 'inline-block' }}
          >
            {STATUS_LABEL[job.status] || job.status}
          </span>
          {stage && <span className="pill pill-navy" style={{ marginTop: 6, marginLeft: 6, display: 'inline-block' }}>{stage}</span>}
        </div>
        {job.pickupDate && <div style={{ fontSize: 13, color: 'var(--slate)', textAlign: 'right' }}>Pickup date<br /><b>{job.pickupDate}</b></div>}
      </div>

      <div className="detail-grid">
        <div className="detail-row" style={{ gridColumn: '1/-1' }}>
          <span className="k">Pickup from</span>
          <span className="v">{job.senderAddress?.contactName} · {job.senderAddress?.phone}</span>
        </div>
        <div className="detail-row" style={{ gridColumn: '1/-1' }}>
          <span className="k">Address</span>
          <span className="v">{formatAddress(job.senderAddress)}</span>
        </div>
        <div className="detail-row"><span className="k">Service</span><span className="v">{job.service?.name}</span></div>
        <div className="detail-row"><span className="k">Items</span><span className="v">{totalBoxQty} {totalBoxQty === 1 ? 'package' : 'packages'}</span></div>
        <div className="detail-row" style={{ gridColumn: '1/-1' }}>
          <span className="k">Destination</span>
          <span className="v">{job.receiverAddress?.city}{job.receiverAddress?.state ? `, ${job.receiverAddress.state}` : ''}, {job.receiverAddress?.countryCode}</span>
        </div>
      </div>
    </div>
  );
}
