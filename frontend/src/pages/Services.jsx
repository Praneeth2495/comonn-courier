import { Link } from 'react-router-dom';

const SERVICES = [
  { icon: '⚡', bg: 'var(--warn-bg)', pill: 'pill-warn', pillLabel: '3–5 days', title: 'Express Delivery', body: 'Premium, time-definite delivery to all major destinations. A dedicated round-the-clock team manages every milestone — from rapid pickup to customs clearance and final-mile delivery.' },
  { icon: '🚚', bg: 'var(--success-bg)', pill: 'pill-success', pillLabel: '6–9 days', title: 'Standard Delivery', body: 'The perfect balance of cost-efficiency and dependable global transit. Budget-friendly shipping without cutting corners on handling and safety.' },
  { icon: '✈️', bg: '#EAF0FF', title: 'Air Freight', body: 'Built for high-priority shipments — including cold-chain cargo and heavy industrial freight. Fully door-to-door, with paperwork and customs handled end to end.' },
  { icon: '🚢', bg: '#EAF0FF', pill: 'pill-cobalt', pillLabel: 'Scheduled', title: 'Sea Freight', body: 'Dependable ocean network for large-scale cargo — FCL/LCL, temperature-sensitive shipments and Dangerous Goods handling, true door-to-door.' },
  { icon: '🎪', bg: 'var(--warn-bg)', pill: 'pill-warn', pillLabel: 'Specialist', title: 'Project Cargo', body: 'Sports gear, concert infrastructure and live event cargo moved across borders without a hitch — including ATA Carnets for temporary duty-free imports.' },
];

const ADDONS = [
  { icon: '🛡️', bg: 'var(--success-bg)', title: 'Transit Warranty — ₹1,50,000', sub: 'Just ₹1,000 for coverage against loss or damage.', items: ['Peace of mind for international shipping', 'Low cost, high protection', 'Hassle-free claim support'] },
  { icon: '🏷️', bg: '#EAF0FF', title: 'Wrapping & Labelling', sub: 'We ensure your shipment is secure and correctly identified.', items: ['Prevents misrouting & delivery errors', 'Faster customs clearance', 'Clear "Fragile / Handle with Care" tags'] },
  { icon: '📦', bg: 'var(--warn-bg)', title: 'Heavy-Duty Double-Layer Cartons', sub: 'Strong, export-quality cartons for superior protection.', items: ['Better load-bearing capacity', 'Moisture & environmental resistance', 'Reduces risk of crushing & breakage'] },
];

const WHY_US = [
  { icon: '🚀', bg: '#EAF0FF', title: 'Fast, secure & reliable', sub: 'Delivery services built for consistency' },
  { icon: '📡', bg: 'var(--success-bg)', title: 'Real-time tracking', sub: 'Transparent communication, every step' },
  { icon: '🤝', bg: 'var(--warn-bg)', title: 'Dedicated team', sub: 'Experienced people, committed to you' },
];

export default function Services() {
  return (
    <div>
      <div className="svc-hero">
        <div className="eyebrow" style={{ color: '#FF9478' }}>What we offer</div>
        <h1>Our services</h1>
        <p>From express air freight to ocean cargo — pick the speed and coverage that fits your shipment.</p>
      </div>

      <div className="section">
        <div className="wrap grid-3">
          {SERVICES.map((s) => (
            <div className="card svc-card" key={s.title}>
              <div className="svc-card-top">
                <div className="icon-circle" style={{ background: s.bg }}>{s.icon}</div>
                {s.pill && <span className={`pill ${s.pill}`}>{s.pillLabel}</span>}
              </div>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </div>
          ))}
          <div className="card svc-card" style={{ background: 'var(--navy)', border: 'none' }}>
            <div className="svc-card-top"><div className="icon-circle" style={{ background: 'rgba(255,255,255,.1)' }}>💬</div></div>
            <h3 style={{ color: '#fff' }}>Not sure which service fits?</h3>
            <p style={{ color: '#AEB6D2' }}>Tell us your shipment size and timeline — we'll recommend the right option.</p>
            <Link to="/quote" className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>Talk to us</Link>
          </div>
        </div>
      </div>

      <div className="section" style={{ background: '#fff' }}>
        <div className="wrap" style={{ textAlign: 'center', marginBottom: 32 }}>
          <div className="eyebrow">Extra protection</div>
          <h2 className="h-lg">International courier add-ons</h2>
        </div>
        <div className="wrap grid-3">
          {ADDONS.map((a) => (
            <div className="card addon-card" key={a.title}>
              <div className="icon-circle" style={{ background: a.bg }}>{a.icon}</div>
              <h4 style={{ fontSize: 16 }}>{a.title}</h4>
              <p style={{ fontSize: 13, color: 'var(--slate)' }}>{a.sub}</p>
              <ul>{a.items.map((it) => <li key={it}>{it}</li>)}</ul>
            </div>
          ))}
        </div>
      </div>

      <div className="section">
        <div className="wrap why-row">
          {WHY_US.map((w) => (
            <div className="why-card" key={w.title}>
              <div className="icon-circle" style={{ background: w.bg, margin: '0 auto 14px' }}>{w.icon}</div>
              <h4>{w.title}</h4>
              <p style={{ fontSize: 13.5, color: 'var(--slate)' }}>{w.sub}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
