import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../api/AuthContext';
import ChangePassword from '../components/ChangePassword';
import BatchScanPanel from '../components/BatchScanPanel';
import logoFooter from '../assets/logo-footer.png';

const STATUS_LABEL = {
  PICKUP_CONFIRMED: 'Pickup Confirmed',
  PAID: 'Paid',
  LABEL_GENERATED: 'Label Generated',
  PICKED_UP: 'Picked Up',
  IN_TRANSIT: 'In Transit',
  OUT_FOR_DELIVERY: 'Out For Delivery',
  DELIVERED: 'Delivered',
};

function formatAddress(a) {
  if (!a) return '—';
  return `${a.line1}${a.line2 ? `, ${a.line2}` : ''}, ${a.city}${a.state ? `, ${a.state}` : ''} ${a.postcode}, ${a.countryCode}`;
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
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
        <button className={`app-navlink ${tab === 'batchscan' ? 'active' : ''}`} onClick={() => selectTab('batchscan')}>Batch Scan</button>
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

  const pendingJobs = jobs.filter((j) => j.status !== 'PICKED_UP' && !['DELIVERED', 'CANCELLED'].includes(j.status));
  const doneJobs = jobs
    .filter((j) => j.status === 'PICKED_UP' || ['DELIVERED', 'CANCELLED'].includes(j.status))
    .filter((j) => {
      if (!j.pickedUpAt) return true;
      return j.pickedUpAt.slice(0, 10) === selectedDate;
    });

  return (
    <div>
      <h1 className="h-lg" style={{ marginBottom: 4 }}>My pickup jobs</h1>
      <p className="lead" style={{ marginBottom: 16 }}>{userName}</p>

      <div className="card" style={{ padding: 14, marginBottom: 20, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, color: 'var(--slate)', fontWeight: 600 }}>View jobs completed on</span>
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
        <p className="lead">Loading…</p>
      ) : jobs.length === 0 ? (
        <p className="lead">No pickup jobs assigned to you right now.</p>
      ) : (
        <>
          {error && <div className="error-text" style={{ marginBottom: 14 }}>{error}</div>}

          {pendingJobs.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 28 }}>
              {pendingJobs.map((j) => (
                <JobCard key={j.id} job={j} updating={updatingId === j.id} onStatusChange={(v) => handleStatusChange(j.id, v)} />
              ))}
            </div>
          )}

          <h3 className="h-md" style={{ marginBottom: 12 }}>Completed</h3>

          {doneJobs.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {doneJobs.map((j) => (
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
          <span className={`pill ${job.status === 'PICKED_UP' ? 'pill-success' : 'pill-cobalt'}`} style={{ marginTop: 6, display: 'inline-block' }}>
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
