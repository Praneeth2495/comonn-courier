import { useNavigate } from 'react-router-dom';

const VALUES = [
  { icon: '🎯', bg: '#EAF0FF', title: 'Reliability first', body: 'We commit to delivery windows and hold ourselves to them.' },
  { icon: '🔍', bg: 'var(--success-bg)', title: 'Full transparency', body: 'Clear pricing, live tracking, no hidden customs surprises.' },
  { icon: '🤝', bg: 'var(--warn-bg)', title: 'People-powered', body: 'A dedicated team handling your cargo at every milestone.' },
];

export default function About() {
  const navigate = useNavigate();

  return (
    <div>
      <div className="about-hero">
        <div className="eyebrow" style={{ color: '#FF9478' }}>About Comonn</div>
        <h1>Built for the everyday international shipper.</h1>
        <p>We started Comonn to make sending a parcel overseas as easy as sending one across town — with honest pricing and real-time visibility, end to end.</p>
      </div>

      <div className="wrap stat-row">
        <div className="card about-stat-card"><b>5+</b><span>Countries served</span></div>
        <div className="card about-stat-card"><b>₹1.5L</b><span>Transit warranty cover</span></div>
        <div className="card about-stat-card"><b>3–5</b><span>Day express delivery</span></div>
        <div className="card about-stat-card"><b>24/7</b><span>Customer support</span></div>
      </div>

      <div className="section about-split">
        <div>
          <div className="eyebrow">Our story</div>
          <h2 className="h-lg" style={{ marginBottom: 16 }}>Shipping shouldn't need a logistics degree.</h2>
          <p className="lead">Comonn was built around a simple idea: international courier services should be transparent, fairly priced, and trackable in real time — whether you're sending a single gift box or running a growing export business from India.</p>
          <p className="lead" style={{ marginTop: 14 }}>Today we move personal, commercial and project cargo out of India to Australia, Canada, New Zealand, the UK and the USA, backed by a price-beat guarantee and up to ₹1,50,000 in transit warranty on every shipment.</p>
        </div>
        <div className="visual">
          <div className="airmail-edge dark" style={{ position: 'absolute', top: '50%', left: '-10%', width: '120%', transform: 'rotate(-8deg)' }} />
        </div>
      </div>

      <div className="section" style={{ background: '#fff' }}>
        <div className="wrap" style={{ textAlign: 'center', marginBottom: 32 }}>
          <div className="eyebrow">What we stand for</div>
          <h2 className="h-lg">Our values</h2>
        </div>
        <div className="wrap values-grid">
          {VALUES.map((v) => (
            <div className="card value-card" key={v.title}>
              <div className="icon-circle" style={{ background: v.bg, marginBottom: 14 }}>{v.icon}</div>
              <h4 style={{ marginBottom: 8 }}>{v.title}</h4>
              <p style={{ fontSize: 13.5, color: 'var(--slate)' }}>{v.body}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="section">
        <div className="wrap cta-band">
          <div>
            <h3>Ready to send your first shipment?</h3>
            <p>Get an instant quote in under two minutes.</p>
          </div>
          <button className="btn btn-primary" style={{ padding: '14px 26px' }} onClick={() => navigate('/quote')}>Get Instant Quote →</button>
        </div>
      </div>
    </div>
  );
}
