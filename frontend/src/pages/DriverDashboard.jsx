import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../api/AuthContext';
import ChangePassword from '../components/ChangePassword';
import BatchScanPanel from '../components/BatchScanPanel';
import LoadingLogo from '../components/LoadingLogo';
import logoFooter from '../assets/logo-footer.png';

const STATUS_LABEL = {
  PICKUP_CONFIRMED: 'Pickup Confirmed',
  PAID: 'Paid',
  LABEL_GENERATED: 'Label Generated',
  PICKED_UP: 'Picked Up',
  IN_TRANSIT: 'In Transit',
  OUT_FOR_DELIVERY: 'Out For Delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

function formatAddress(a) {
  if (!a) return '—';
  return `${a.line1}${a.line2 ? `, ${a.line2}` : ''}, ${a.city}${a.state ? `, ${a.state}` : ''} ${a.postcode}, ${a.countryCode}`;
}

// Couriers operate in IST — comparing dates in UTC (toISOString()) would
// misfile any pickup between midnight and 5:30am IST under the previous
// calendar day. en-CA locale formats as YYYY-MM-DD.
function isoDate(d) {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export default function DriverDashboard() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState('jobs');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  function selectTab(key) {
    setTab(key);
    setSidebarOpen(false);
  }

  return (
    <div className="app-shell">
      <div className="app-mobile-bar">
        <button className="app-hamburger" onClick={() => setSidebarOpen(true)} aria-label="Open menu">☰</button>
        <img className="logo-img" src={logoFooter} alt="Comonn" />
      </div>
      {sidebarOpen && <div className="app-sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}
      <aside className={`app-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <button className="app-sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close menu">✕</button>
        <div className="brand">
          <img className="logo-img lg" src={logoFooter} alt="Comonn" />
          <span style={{ fontSize: 12, fontWeight: 700, color: '#93A0C4', textTransform: 'uppercase', letterSpacing: '.06em' }}>Driver</span>
        </div>
        <button className={`app-navlink ${tab === 'jobs' ? 'active' : ''}`} onClick={() => selectTab('jobs')}>My Jobs</button>
        <button className={`app-navlink ${tab === 'batchscan' ? 'active' : ''}`} onClick={() => selectTab('batchscan')}>Scan</button>
        <button className={`app-navlink ${tab === 'profile' ? 'active' : ''}`} onClick={() => selectTab('profile')}>Profile</button>
        <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,.1)' }}>
          <Link to="/" className="app-navlink">← Back to site</Link>
          <button className="app-navlink" onClick={logout}>Log out</button>
        </div>
      </aside>
      <main className="app-main">
        {tab === 'jobs' && <MyJobs userName={user?.fullName} />}
        {tab === 'batchscan' && <BatchScanPanel />}
        {tab === 'profile' && <ChangePassword />}
      </main>
    </div>
  );
}

function MyJobs({ userName }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [error, setError] = useState('');

  const today = new Date();
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const [selectedDate, setSelectedDate] = useState(isoDate(today));

  function load() {
    setLoading(true);
    client.get('/driver/jobs').then(({ data }) => {
      setJobs(data.jobs);
      setLoading(false);
    }).catch(() => setLoading(false));
  }
  useEffect(load, []);

  async function markArrived(id) {
    setUpdatingId(id);
    setError('');
    try {
      const { data } = await client.patch(`/driver/jobs/${id}/arrived`);
      setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, driverArrivedAt: data.order.driverArrivedAt } : j)));
    } catch (err) {
      setError(err.response?.data?.error || 'Could not update this job.');
    } finally {
      setUpdatingId(null);
    }
  }

  async function markPickedUp(id) {
    setUpdatingId(id);
    setError('');
    try {
      const { data } = await client.patch(`/driver/jobs/${id}/picked-up`);
      setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, status: 'PICKED_UP', pickedUpAt: data.order.pickedUpAt } : j)));
    } catch (err) {
      setError(err.response?.data?.error || 'Could not update this job.');
    } finally {
      setUpdatingId(null);
    }
  }

  function handleStatusChange(id, value) {
    if (value === 'ARRIVED') markArrived(id);
    else if (value === 'PICKED_UP') markPickedUp(id);
  }

  // Active = the driver still has something to do (arrive/pick up).
  // Completed = the driver's part is done, regardless of how far the
  // shipment has since moved (IN_TRANSIT/OUT_FOR_DELIVERY/DELIVERED all
  // belong here too, not just PICKED_UP — previously those two statuses
  // fell through neither bucket and wrongly stayed listed as active).
  const ACTIVE_STATUSES = ['PICKUP_CONFIRMED', 'PAID', 'LABEL_GENERATED'];
  const activeJobs = jobs
    .filter((j) => ACTIVE_STATUSES.includes(j.status))
    .filter((j) => {
      if (!j.driverAssignedAt) return true;
      return isoDate(new Date(j.driverAssignedAt)) === selectedDate;
    });
  // The date a completed job is pinned to — pickedUpAt if the driver marked
  // it via the app, else the earliest tracking event that took it past the
  // active statuses (covers jobs whose status was advanced by staff instead,
  // which never sets pickedUpAt). Deliberately NOT updatedAt: that gets
  // touched by any later edit (e.g. staff pushing the status further along
  // after pickup), which would wrongly move an already-completed job to
  // whatever day that unrelated edit happened.
  function completionDate(job) {
    if (job.pickedUpAt) return job.pickedUpAt;
    const firstTerminalEvent = (job.trackingEvents || []).find((t) => !ACTIVE_STATUSES.includes(t.status));
    if (firstTerminalEvent) return firstTerminalEvent.occurredAt;
    return job.updatedAt;
  }
  const completedJobs = jobs
    .filter((j) => !ACTIVE_STATUSES.includes(j.status))
    .filter((j) => {
      const at = completionDate(j);
      if (!at) return true;
      return isoDate(new Date(at)) === selectedDate;
    });

  return (
    <div>
      <h1 className="h-lg" style={{ marginBottom: 4 }}>My pickup jobs</h1>
      <p className="lead" style={{ marginBottom: 16 }}>{userName}</p>

      <div className="card" style={{ padding: 14, marginBottom: 20, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, color: 'var(--slate)', fontWeight: 600 }}>View jobs for</span>
        <input
          className="input"
          type="date"
          style={{ maxWidth: 170 }}
          value={selectedDate}
          min={isoDate(threeMonthsAgo)}
          max={isoDate(today)}
          onChange={(e) => setSelectedDate(e.target.value)}
        />
        {selectedDate !== isoDate(today) && (
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setSelectedDate(isoDate(today))}>Today</button>
        )}
      </div>

      {loading ? (
        <LoadingLogo />
      ) : jobs.length === 0 ? (
        <p className="lead">No pickup jobs assigned to you right now.</p>
      ) : (
        <>
          {error && <div className="error-text" style={{ marginBottom: 14 }}>{error}</div>}

          <h3 className="h-md" style={{ marginBottom: 12 }}>Active jobs</h3>
          {activeJobs.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 28 }}>
              {activeJobs.map((j) => (
                <JobCard key={j.id} job={j} updating={updatingId === j.id} onStatusChange={(v) => handleStatusChange(j.id, v)} />
              ))}
            </div>
          ) : (
            <p className="lead" style={{ fontSize: 13.5, marginBottom: 28 }}>No active jobs on this day.</p>
          )}

          <h3 className="h-md" style={{ marginBottom: 12 }}>Completed jobs</h3>
          {completedJobs.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {completedJobs.map((j) => (
                <JobCard key={j.id} job={j} updating={false} onStatusChange={null} />
              ))}
            </div>
          ) : (
            <p className="lead" style={{ fontSize: 13.5 }}>No completed jobs on this day.</p>
          )}
        </>
      )}
    </div>
  );
}

function JobCard({ job, updating, onStatusChange }) {
  const totalBoxQty = job.items?.reduce((sum, it) => sum + it.quantity, 0) || 1;
  const stage = job.status === 'PICKED_UP' ? 'PICKED_UP' : job.driverArrivedAt ? 'ARRIVED' : '';

  return (
    <div className="card" style={{ padding: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <div>
          <h3 style={{ fontSize: 16 }}>Order <span className="mono">{job.orderNumber}</span></h3>
          <span
            className={`pill ${job.status === 'CANCELLED' ? 'pill-danger' : ['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(job.status) ? 'pill-success' : 'pill-cobalt'}`}
            style={{ marginTop: 6, display: 'inline-block' }}
          >
            {STATUS_LABEL[job.status] || job.status}
          </span>
          {stage === 'ARRIVED' && <span className="pill pill-navy" style={{ marginTop: 6, marginLeft: 6, display: 'inline-block' }}>Arrived</span>}
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
        {job.senderAddress?.instructions && (
          <div className="detail-row" style={{ gridColumn: '1/-1' }}>
            <span className="k">Instructions</span>
            <span className="v">{job.senderAddress.instructions}</span>
          </div>
        )}
        <div className="detail-row"><span className="k">Service</span><span className="v">{job.service?.name}</span></div>
        <div className="detail-row"><span className="k">Items</span><span className="v">{totalBoxQty} {totalBoxQty === 1 ? 'package' : 'packages'}</span></div>
        <div className="detail-row" style={{ gridColumn: '1/-1' }}>
          <span className="k">Destination</span>
          <span className="v">{job.receiverAddress?.city}{job.receiverAddress?.state ? `, ${job.receiverAddress.state}` : ''}, {job.receiverAddress?.countryCode}</span>
        </div>
      </div>

      {job.labels?.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
          {job.labels.map((l) => (
            <a key={l.id} className="btn btn-outline btn-sm" href={`${import.meta.env.VITE_API_BASE_URL || '/api'}/labels/download/${l.id}?inline=1`} target="_blank" rel="noreferrer">
              View label{job.labels.length > 1 ? ` (${l.packageIndex})` : ''}
            </a>
          ))}
        </div>
      )}

      {onStatusChange && (
        <div className="field" style={{ marginTop: 16, maxWidth: 240 }}>
          <label>Update status</label>
          <select className="select" value={stage} disabled={updating} onChange={(e) => onStatusChange(e.target.value)}>
            <option value="" disabled>{updating ? 'Updating…' : 'Select…'}</option>
            <option value="ARRIVED">Arrived for pickup</option>
            <option value="PICKED_UP">Pickup completed</option>
          </select>
        </div>
      )}
    </div>
  );
}
