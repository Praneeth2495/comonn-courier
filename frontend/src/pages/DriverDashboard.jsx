import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../api/AuthContext';
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

export default function DriverDashboard() {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [error, setError] = useState('');

  function load() {
    setLoading(true);
    client.get('/driver/jobs').then(({ data }) => {
      setJobs(data.jobs);
      setLoading(false);
    }).catch(() => setLoading(false));
  }
  useEffect(load, []);

  async function markPickedUp(id) {
    setUpdatingId(id);
    setError('');
    try {
      await client.patch(`/driver/jobs/${id}/picked-up`);
      setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, status: 'PICKED_UP' } : j)));
    } catch (err) {
      setError(err.response?.data?.error || 'Could not update this job.');
    } finally {
      setUpdatingId(null);
    }
  }

  const pendingJobs = jobs.filter((j) => j.status !== 'PICKED_UP' && !['DELIVERED', 'CANCELLED'].includes(j.status));
  const doneJobs = jobs.filter((j) => j.status === 'PICKED_UP' || ['DELIVERED', 'CANCELLED'].includes(j.status));

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
        <button className="app-navlink active">My Jobs</button>
        <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,.1)' }}>
          <Link to="/" className="app-navlink">← Back to site</Link>
          <button className="app-navlink" onClick={logout}>Log out</button>
        </div>
      </aside>
      <main className="app-main">
        <h1 className="h-lg" style={{ marginBottom: 4 }}>My pickup jobs</h1>
        <p className="lead" style={{ marginBottom: 20 }}>{user?.fullName}</p>

        {loading ? (
          <p className="lead">Loading…</p>
        ) : jobs.length === 0 ? (
          <p className="lead">No pickup jobs assigned to you right now.</p>
        ) : (
          <>
            {error && <div className="error-text" style={{ marginBottom: 14 }}>{error}</div>}

            {pendingJobs.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: doneJobs.length ? 28 : 0 }}>
                {pendingJobs.map((j) => (
                  <JobCard key={j.id} job={j} updating={updatingId === j.id} onMarkPickedUp={() => markPickedUp(j.id)} />
                ))}
              </div>
            )}

            {doneJobs.length > 0 && (
              <>
                <h3 className="h-md" style={{ marginBottom: 12 }}>Completed</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {doneJobs.map((j) => (
                    <JobCard key={j.id} job={j} updating={false} onMarkPickedUp={null} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function JobCard({ job, updating, onMarkPickedUp }) {
  const totalBoxQty = job.items?.reduce((sum, it) => sum + it.quantity, 0) || 1;
  return (
    <div className="card" style={{ padding: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <div>
          <h3 style={{ fontSize: 16 }}>Order <span className="mono">{job.orderNumber}</span></h3>
          <span className={`pill ${job.status === 'PICKED_UP' ? 'pill-success' : 'pill-cobalt'}`} style={{ marginTop: 6, display: 'inline-block' }}>
            {STATUS_LABEL[job.status] || job.status}
          </span>
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

      {onMarkPickedUp && (
        <button className="btn btn-primary" style={{ marginTop: 16, padding: '12px 22px' }} disabled={updating} onClick={onMarkPickedUp}>
          {updating ? 'Updating…' : 'Mark picked up'}
        </button>
      )}
    </div>
  );
}
