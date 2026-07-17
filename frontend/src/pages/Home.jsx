import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <div>
      <section style={{ background: 'linear-gradient(180deg,var(--navy) 0%, var(--navy-2) 100%)', padding: '64px 32px 88px' }}>
        <div className="wrap" style={{ maxWidth: 720 }}>
          <div className="eyebrow" style={{ color: '#FF9478' }}>International Courier</div>
          <h1 style={{ color: '#fff', fontSize: 44, lineHeight: 1.1, fontWeight: 700 }}>
            Ship anywhere. <span style={{ color: 'var(--coral)' }}>Priced instantly.</span>
          </h1>
          <p className="lead" style={{ color: '#B9C1DE', marginTop: 16, maxWidth: 480 }}>
            Get an instant, zone-based quote by weight and volume, book your shipment, pay
            securely, and print your label — all in one flow.
          </p>
          <div style={{ marginTop: 28, display: 'flex', gap: 12 }}>
            <Link to="/quote" className="btn btn-primary">Get an instant quote</Link>
            <Link to="/track" className="btn btn-outline" style={{ background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,.3)' }}>
              Track a shipment
            </Link>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="eyebrow">How it works</div>
          <h2 className="h-lg">Four steps from quote to delivery</h2>
          <div style={{ display: 'flex', gap: 16, marginTop: 32, flexWrap: 'wrap' }}>
            {[
              ['1', 'Instant quote', 'Enter origin, destination, weight and dimensions for a zone-based price.'],
              ['2', 'Add details', 'Sender, receiver and parcel contents.'],
              ['3', 'Pay securely', 'UPI, card or netbanking via Razorpay, or PayPal for international customers.'],
              ['4', 'Print label', 'Download your shipping label with tracking barcode.'],
            ].map(([n, title, body]) => (
              <div className="card" key={n} style={{ flex: '1 1 220px', padding: 26 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--navy)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Space Grotesk', fontWeight: 700, marginBottom: 14 }}>{n}</div>
                <h4 style={{ marginBottom: 8, color: 'var(--navy)' }}>{title}</h4>
                <p style={{ fontSize: 13.5, color: 'var(--slate)', lineHeight: 1.55 }}>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
