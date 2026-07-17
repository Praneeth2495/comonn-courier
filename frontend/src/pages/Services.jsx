import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';

export default function Services() {
  const [services, setServices] = useState([]);

  useEffect(() => {
    client.get('/quote/services').then(({ data }) => setServices(data.services)).catch(() => {});
  }, []);

  return (
    <div className="wrap section">
      <div className="eyebrow">Services</div>
      <h1 className="h-lg" style={{ marginBottom: 24 }}>Choose how you ship</h1>
      <div className="grid-3">
        {services.map((s) => (
          <div className="card" key={s.id} style={{ padding: 24 }}>
            <h4 style={{ marginBottom: 8, color: 'var(--navy)' }}>{s.name}</h4>
            <p style={{ fontSize: 13.5, color: 'var(--slate)', lineHeight: 1.55, marginBottom: 12 }}>{s.description}</p>
            <p style={{ fontSize: 12.5, color: 'var(--slate-light)' }}>{s.transitDaysMin}–{s.transitDaysMax} business days</p>
          </div>
        ))}
      </div>
      <Link to="/quote" className="btn btn-primary" style={{ marginTop: 28 }}>Get an instant quote</Link>
    </div>
  );
}
