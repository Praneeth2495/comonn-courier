import { Fragment, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const WEIGHT_OPTIONS = ['Not sure', ...Array.from({ length: 25 }, (_, i) => `${i + 1} kg`)];

// Standard international air-freight volumetric divisor (cm3/kg) — matches
// the pricing engine's default, used here only to preview the max size a
// customer could pack at their chosen weight before it costs more than the
// actual-weight price (final pricing still runs server-side on the Quote page).
const STANDARD_DIVISOR = 5000;

function maxDimsHint(weightPreset) {
  if (!weightPreset || weightPreset === 'Not sure') return null;
  const weightKg = Number(weightPreset.replace(' kg', ''));
  if (!weightKg) return null;
  const side = Math.cbrt(weightKg * STANDARD_DIVISOR);
  const sumCm = Math.round(side * 3 * 10) / 10;
  return `${sumCm} cm (sum of length + width + height)`;
}

function IndiaChakra() {
  return (
    <svg viewBox="0 0 60 40" xmlns="http://www.w3.org/2000/svg" width="18" height="12">
      <rect width="60" height="40" fill="#FF9933" />
      <rect y="13.3" width="60" height="13.3" fill="#FFFFFF" />
      <rect y="26.6" width="60" height="13.4" fill="#138808" />
      <circle cx="30" cy="20" r="5.6" fill="none" stroke="#00008B" strokeWidth="0.9" />
      <circle cx="30" cy="20" r="1.1" fill="#00008B" />
    </svg>
  );
}

function FlagAustralia() {
  return (
    <svg viewBox="0 0 60 40" xmlns="http://www.w3.org/2000/svg">
      <rect width="60" height="40" fill="#00247D" />
      <rect x="0" y="0" width="30" height="20" fill="#00247D" />
      <line x1="0" y1="0" x2="30" y2="20" stroke="#FFFFFF" strokeWidth="4" />
      <line x1="30" y1="0" x2="0" y2="20" stroke="#FFFFFF" strokeWidth="4" />
      <line x1="0" y1="0" x2="30" y2="20" stroke="#CF142B" strokeWidth="1.6" />
      <line x1="30" y1="0" x2="0" y2="20" stroke="#CF142B" strokeWidth="1.6" />
      <rect x="12" y="0" width="6" height="20" fill="#FFFFFF" />
      <rect x="0" y="7" width="30" height="6" fill="#FFFFFF" />
      <rect x="13.5" y="0" width="3" height="20" fill="#CF142B" />
      <rect x="0" y="8.5" width="30" height="3" fill="#CF142B" />
      <circle cx="15" cy="29" r="3" fill="#FFFFFF" />
      <circle cx="46" cy="9" r="2.6" fill="#FFFFFF" />
      <circle cx="51" cy="18" r="2.6" fill="#FFFFFF" />
      <circle cx="46" cy="29" r="2.6" fill="#FFFFFF" />
      <circle cx="39" cy="24" r="2" fill="#FFFFFF" />
      <circle cx="41" cy="14" r="1.8" fill="#FFFFFF" />
    </svg>
  );
}

function FlagCanada() {
  return (
    <svg viewBox="0 0 60 40" xmlns="http://www.w3.org/2000/svg">
      <rect width="60" height="40" fill="#FFFFFF" />
      <rect x="0" y="0" width="15" height="40" fill="#D52B1E" />
      <rect x="45" y="0" width="15" height="40" fill="#D52B1E" />
      <path d="M30 8 L32 15 L38 13 L34 19 L39 22 L33 23 L34 30 L30 26 L26 30 L27 23 L21 22 L26 19 L22 13 L28 15 Z" fill="#D52B1E" />
    </svg>
  );
}

function FlagNewZealand() {
  return (
    <svg viewBox="0 0 60 40" xmlns="http://www.w3.org/2000/svg">
      <rect width="60" height="40" fill="#00247D" />
      <rect x="0" y="0" width="30" height="20" fill="#00247D" />
      <line x1="0" y1="0" x2="30" y2="20" stroke="#FFFFFF" strokeWidth="4" />
      <line x1="30" y1="0" x2="0" y2="20" stroke="#FFFFFF" strokeWidth="4" />
      <line x1="0" y1="0" x2="30" y2="20" stroke="#CF142B" strokeWidth="1.6" />
      <line x1="30" y1="0" x2="0" y2="20" stroke="#CF142B" strokeWidth="1.6" />
      <rect x="12" y="0" width="6" height="20" fill="#FFFFFF" />
      <rect x="0" y="7" width="30" height="6" fill="#FFFFFF" />
      <rect x="13.5" y="0" width="3" height="20" fill="#CF142B" />
      <rect x="0" y="8.5" width="30" height="3" fill="#CF142B" />
      <circle cx="46" cy="9" r="2.8" fill="#CF142B" stroke="#FFFFFF" strokeWidth="0.8" />
      <circle cx="52" cy="17" r="2.4" fill="#CF142B" stroke="#FFFFFF" strokeWidth="0.8" />
      <circle cx="46" cy="27" r="2.8" fill="#CF142B" stroke="#FFFFFF" strokeWidth="0.8" />
      <circle cx="41" cy="20" r="2.2" fill="#CF142B" stroke="#FFFFFF" strokeWidth="0.8" />
    </svg>
  );
}

function FlagUK() {
  return (
    <svg viewBox="0 0 60 40" xmlns="http://www.w3.org/2000/svg">
      <rect width="60" height="40" fill="#00247D" />
      <line x1="0" y1="0" x2="60" y2="40" stroke="#FFFFFF" strokeWidth="7" />
      <line x1="60" y1="0" x2="0" y2="40" stroke="#FFFFFF" strokeWidth="7" />
      <line x1="0" y1="0" x2="60" y2="40" stroke="#CF142B" strokeWidth="3" />
      <line x1="60" y1="0" x2="0" y2="40" stroke="#CF142B" strokeWidth="3" />
      <rect x="24" y="0" width="12" height="40" fill="#FFFFFF" />
      <rect x="0" y="14" width="60" height="12" fill="#FFFFFF" />
      <rect x="27" y="0" width="6" height="40" fill="#CF142B" />
      <rect x="0" y="17" width="60" height="6" fill="#CF142B" />
    </svg>
  );
}

function FlagUSA() {
  return (
    <svg viewBox="0 0 60 40" xmlns="http://www.w3.org/2000/svg">
      <rect width="60" height="40" fill="#FFFFFF" />
      <rect x="0" y="0" width="60" height="3.08" fill="#B22234" />
      <rect x="0" y="6.15" width="60" height="3.08" fill="#B22234" />
      <rect x="0" y="12.3" width="60" height="3.08" fill="#B22234" />
      <rect x="0" y="18.46" width="60" height="3.08" fill="#B22234" />
      <rect x="0" y="24.6" width="60" height="3.08" fill="#B22234" />
      <rect x="0" y="30.77" width="60" height="3.08" fill="#B22234" />
      <rect x="0" y="36.9" width="60" height="3.08" fill="#B22234" />
      <rect x="0" y="0" width="26" height="21.5" fill="#3C3B6E" />
    </svg>
  );
}

const COUNTRIES = [
  { name: 'Australia', Flag: FlagAustralia },
  { name: 'Canada', Flag: FlagCanada },
  { name: 'New Zealand', Flag: FlagNewZealand },
  { name: 'UK', Flag: FlagUK },
  { name: 'USA', Flag: FlagUSA },
];

const HIW_STEPS = [
  ['1', 'Make a booking', 'Get an instant quote and schedule your pickup online in minutes.'],
  ['2', 'We collect', 'Our courier picks up your package from your doorstep, on schedule.'],
  ['3', 'Delivery', 'Track every milestone until it lands safely at its destination.'],
];

const SHIP_CATEGORIES = [
  { icon: '🧳', bg: '#EAF0FF', title: 'Personal Cargo', items: ['Clothes & shoes', 'Sweets & pickles', 'Household goods', 'Gifts & packed foods'] },
  { icon: '📦', bg: 'var(--warn-bg)', title: 'Commercial Cargo', items: ['Goods for resale', 'Raw materials', 'Commercial samples', 'Business equipment'] },
  { icon: '🎪', bg: 'var(--success-bg)', title: 'Project Cargo', items: ['Events equipment', 'Sports equipment', 'Medical & healthcare cargo'] },
];

const NEWS = [
  ['Australia', 'Price beat guarantee, explained', "Found a cheaper quote for the same route and service level? We'll beat it by 5%."],
  ['Middle East', 'Transit warranty now ₹1,50,000', 'Low-cost, high-coverage protection on every Premium shipment for just ₹1,000.'],
  ['USA', 'Understanding US tariff changes', 'What recent tariff updates mean for parcels heading into the United States.'],
  ['Packaging', 'Heavy-duty double-layer cartons', 'Export-quality cartons for just ₹1,000 — extra protection the whole journey.'],
  ['UK', 'UK customs: what to expect', 'Your goods are financially protected with warranty coverage up to ₹1,50,000.'],
];

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 12h15M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const [qty, setQty] = useState(1);
  const [trackId, setTrackId] = useState('');
  const [weightPreset, setWeightPreset] = useState('');
  const [showDims, setShowDims] = useState(false);
  const [lengthCm, setLengthCm] = useState('');
  const [widthCm, setWidthCm] = useState('');
  const [heightCm, setHeightCm] = useState('');

  function handleGetQuote(e) {
    e.preventDefault();
    navigate('/quote');
  }

  function handleTrack(e) {
    e.preventDefault();
    navigate(trackId ? `/track?id=${encodeURIComponent(trackId)}` : '/track');
  }

  return (
    <div>
      <div className="hero">
        <div className="hero-row">
          <div className="hero-copy">
            <div className="eyebrow with-badge">
              <span className="eyebrow-chakra"><IndiaChakra /></span>
              India → World
            </div>
            <h1>Committed to deliver, <span className="hl">on time</span>, every time.</h1>
            <p className="lead">
              Book an international shipment in under two minutes.
            </p>
            <div className="trust-row">
              <div className="trust-item"><div className="ic">🛡️</div><span>Warranty up to ₹1,50,000</span></div>
              <div className="trust-item"><div className="ic">📍</div><span>Live shipment tracking</span></div>
              <div className="trust-item"><div className="ic">💸</div><span>We beat any price by 5%</span></div>
            </div>
          </div>

          <form className="card" style={{ overflow: 'hidden' }} onSubmit={handleGetQuote}>
            <div className="airmail-edge" />
            <div style={{ padding: 26 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                <h3 style={{ fontSize: 17 }}>Instant Booking</h3>
                <span className="pill pill-cobalt">Get a quote in 4 clicks</span>
              </div>

              <div className="field">
                <label>Origin</label>
                <div className="input-group">
                  <select className="flag" defaultValue="🇮🇳 IN">
                    <option>🇮🇳 IN</option>
                    <option>🇦🇺 AU</option>
                    <option>🇨🇦 CA</option>
                    <option>🇳🇿 NZ</option>
                    <option>🇬🇧 GB</option>
                    <option>🇺🇸 US</option>
                    <option>🇪🇺 EU</option>
                  </select>
                  <input placeholder="Enter pickup location" />
                </div>
              </div>

              <div className="route-line" />

              <div className="field" style={{ marginBottom: 14 }}>
                <label>Destination</label>
                <div className="input-group">
                  <select className="flag" defaultValue="🇦🇺 AU">
                    <option>🇦🇺 AU</option>
                    <option>🇨🇦 CA</option>
                    <option>🇳🇿 NZ</option>
                    <option>🇬🇧 GB</option>
                    <option>🇺🇸 US</option>
                    <option>🇪🇺 EU</option>
                    <option>🇮🇳 IN</option>
                  </select>
                  <input placeholder="Enter delivery location" />
                </div>
              </div>

              <div className="field" style={{ marginBottom: 6 }}>
                <label>Item 1</label>
                <div className="item-row equal">
                  <select className="select"><option>Box</option><option>Pallet</option><option>Document</option><option>Envelope</option></select>
                  <select className="select" value={weightPreset} onChange={(e) => setWeightPreset(e.target.value)}>
                    <option disabled value="">Weight (kg)</option>
                    {WEIGHT_OPTIONS.map((w) => <option key={w} value={w}>{w}</option>)}
                  </select>
                  <div className="qty-stepper">
                    <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))}>–</button>
                    <div className="val"><span className="qty-tag">Qty</span><span className="qty-num">{String(qty).padStart(2, '0')}</span></div>
                    <button type="button" onClick={() => setQty((q) => q + 1)}>+</button>
                  </div>
                </div>

                {weightPreset === 'Not sure' ? (
                  <p style={{ fontSize: 12.5, color: 'var(--slate)', marginTop: 8 }}>
                    We'll weigh and measure this at pickup, then collect payment in cash.
                  </p>
                ) : (
                  <>
                    {!showDims && maxDimsHint(weightPreset) && (
                      <p style={{ fontSize: 12, color: 'var(--slate-light)', marginTop: 8 }}>
                        Max allowed dimensions for this weight: {maxDimsHint(weightPreset)}
                      </p>
                    )}
                    {showDims ? (
                      <div className="item-row equal" style={{ marginTop: 8 }}>
                        <div>
                          <div className="lbl" style={{ marginBottom: 4 }}>Length (cm)</div>
                          <input className="input" type="number" min="1" value={lengthCm} onChange={(e) => setLengthCm(e.target.value)} />
                        </div>
                        <div>
                          <div className="lbl" style={{ marginBottom: 4 }}>Width (cm)</div>
                          <input className="input" type="number" min="1" value={widthCm} onChange={(e) => setWidthCm(e.target.value)} />
                        </div>
                        <div>
                          <div className="lbl" style={{ marginBottom: 4 }}>Height (cm)</div>
                          <input className="input" type="number" min="1" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
                        </div>
                      </div>
                    ) : (
                      <p style={{ fontSize: 12.5, color: 'var(--slate)', marginTop: 4 }}>
                        (<a href="#" style={{ color: 'var(--cobalt)', fontWeight: 700 }} onClick={(e) => { e.preventDefault(); setShowDims(true); }}>Click here</a>, if dimensions are known)
                      </p>
                    )}
                  </>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
                <a href="#" style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }} onClick={(e) => e.preventDefault()}>+ Add another item</a>
              </div>

              <button className="btn btn-primary block" style={{ marginTop: 18, padding: 13 }}>Get Instant Quote</button>
              <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--slate-light)', marginTop: 12 }}>📞 Enquiries: +91 91080 38783 (24/7)</p>
            </div>
          </form>
        </div>
      </div>

      <div className="banner-strip">
        <div className="banner-grid">
          <div className="banner-card accent-cobalt">
            <h4>📦 Track your order</h4>
            <p>Punch in your order ID for live status, ETA and delivery proof.</p>
            <form className="track-inline" onSubmit={handleTrack}>
              <input placeholder="Enter Order ID" value={trackId} onChange={(e) => setTrackId(e.target.value)} />
              <button className="btn btn-primary btn-sm">Track</button>
            </form>
          </div>
          <div className="banner-card accent-coral">
            <h4>💸 Price beat guaranteed</h4>
            <p>Found a better rate elsewhere for the same service? Show us and we'll beat it by 5%.</p>
            <button className="btn btn-outline btn-sm" style={{ alignSelf: 'flex-start', background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,.4)' }}>
              Learn more
            </button>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="wrap" style={{ textAlign: 'center', marginBottom: 36 }}>
          <h2 className="h-lg">How it works</h2>
        </div>
        <div className="wrap steps-row">
          {HIW_STEPS.map(([n, title, body], i) => (
            <Fragment key={n}>
              <div className="hiw-card"><div className="hiw-num">{n}</div><h4>{title}</h4><p>{body}</p></div>
              {i < HIW_STEPS.length - 1 && <div className="hiw-arrow"><ArrowIcon /></div>}
            </Fragment>
          ))}
        </div>
      </div>

      <div className="section" style={{ background: '#fff', paddingTop: 48, paddingBottom: 48 }}>
        <div className="wrap" style={{ textAlign: 'center', marginBottom: 26 }}>
          <h2 className="h-md">Countries we're servicing</h2>
        </div>
        <div className="wrap country-row">
          {COUNTRIES.map(({ name, Flag }) => (
            <div className="country-card" key={name}>
              <div className="flag-img"><Flag /></div>
              <span>{name}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="section">
        <div className="wrap" style={{ textAlign: 'center', marginBottom: 36 }}>
          <h2 className="h-lg">What we ship</h2>
        </div>
        <div className="wrap grid-3">
          {SHIP_CATEGORIES.map(({ icon, bg, title, items }) => (
            <div className="card ship-card" key={title}>
              <div className="icon-circle" style={{ background: bg }}>{icon}</div>
              <h4>{title}</h4>
              <ul>{items.map((it) => <li key={it}>{it}</li>)}</ul>
            </div>
          ))}
        </div>
      </div>

      <div className="section" style={{ background: '#fff' }}>
        <div className="wrap" style={{ textAlign: 'center', marginBottom: 32 }}>
          <h2 className="h-lg">News &amp; updates</h2>
        </div>
        <div className="wrap grid-5">
          {NEWS.map(([tag, title, body]) => (
            <div className="card news-card" key={title}>
              <span className="pill pill-navy tag">{tag}</span>
              <h4>{title}</h4>
              <p>{body}</p>
              <a className="more" href="#" onClick={(e) => e.preventDefault()}>Read more →</a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
