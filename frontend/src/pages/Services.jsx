import { useState } from 'react';
import client from '../api/client';

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
  const [showTalkModal, setShowTalkModal] = useState(false);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  function openTalkModal() {
    setSubject('');
    setDescription('');
    setContactEmail('');
    setContactPhone('');
    setSent(false);
    setError('');
    setShowTalkModal(true);
  }

  async function sendTalkMessage(e) {
    e.preventDefault();
    setSending(true);
    setError('');
    try {
      await client.post('/contact', { subject, description, email: contactEmail, phone: contactPhone });
      setSent(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not send your message — please try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <div className="svc-hero">
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
            <button type="button" className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={openTalkModal}>Talk to us</button>
          </div>
        </div>
      </div>

      <div className="section" style={{ background: '#fff' }}>
        <div className="wrap" style={{ textAlign: 'center', marginBottom: 32 }}>
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

      <div className={`modal-overlay ${showTalkModal ? 'open' : ''}`} onClick={() => setShowTalkModal(false)}>
        {showTalkModal && (
          <div className="modal-box" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            {sent ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={() => setShowTalkModal(false)} style={{ background: 'var(--paper)', border: 'none', width: 44, height: 44, borderRadius: '50%', fontSize: 15, color: 'var(--slate)', cursor: 'pointer', flex: 'none' }}>✕</button>
                </div>
                <h3 style={{ marginBottom: 8 }}>✓ Message sent</h3>
                <p style={{ fontSize: 13.5, color: 'var(--slate)', marginBottom: 20 }}>
                  Thanks — our team will get back to you shortly.
                </p>
                <button className="btn btn-primary block" onClick={() => setShowTalkModal(false)}>Close</button>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <h3>Talk to us</h3>
                  <button onClick={() => setShowTalkModal(false)} style={{ background: 'var(--paper)', border: 'none', width: 44, height: 44, borderRadius: '50%', fontSize: 15, color: 'var(--slate)', cursor: 'pointer', flex: 'none' }}>✕</button>
                </div>
                <p style={{ fontSize: 13.5, color: 'var(--slate)', marginBottom: 18 }}>
                  Tell us what you need — we'll reply by email.
                </p>
                <form onSubmit={sendTalkMessage} className="form-stack">
                  <div className="field">
                    <label>Subject</label>
                    <input className="input" required value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Bulk shipment pricing" />
                  </div>
                  <div className="field">
                    <label>Description</label>
                    <textarea
                      className="input"
                      required
                      rows={4}
                      style={{ resize: 'vertical', minHeight: 100 }}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Tell us a bit more…"
                    />
                  </div>
                  <div className="field">
                    <label>Email</label>
                    <input className="input" type="email" required value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="you@email.com" />
                  </div>
                  <div className="field">
                    <label>Mobile</label>
                    <input className="input" type="tel" required value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+91 98765 43210" />
                  </div>
                  {error && <div className="error-text">{error}</div>}
                  <button className="btn btn-primary block" style={{ padding: 12 }} disabled={sending}>
                    {sending ? 'Sending…' : 'Send'}
                  </button>
                </form>
                <p style={{ fontSize: 12.5, color: 'var(--slate-light)', textAlign: 'center', marginTop: 18 }}>
                  Contact: +919108038783
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
