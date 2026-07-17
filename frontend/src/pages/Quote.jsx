import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useBooking } from '../api/BookingContext';
import Stepper from '../components/Stepper';

const emptyForm = {
  originCountryCode: 'AU',
  destinationCountryCode: '',
  actualWeightKg: '',
  lengthCm: '',
  widthCm: '',
  heightCm: '',
  quantity: 1,
  declaredValue: '',
};

export default function Quote() {
  const [countries, setCountries] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [quotes, setQuotes] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { setBooking } = useBooking();
  const navigate = useNavigate();

  useEffect(() => {
    client.get('/quote/countries').then(({ data }) => setCountries(data.countries)).catch(() => {});
  }, []);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function submitQuote(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    setQuotes(null);
    setSelected(null);
    try {
      const { data } = await client.post('/quote', {
        ...form,
        actualWeightKg: Number(form.actualWeightKg),
        lengthCm: Number(form.lengthCm),
        widthCm: Number(form.widthCm),
        heightCm: Number(form.heightCm),
        quantity: Number(form.quantity) || 1,
        declaredValue: Number(form.declaredValue) || 0,
      });
      setQuotes(data.quotes);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not get a quote — please check the details and try again.');
    } finally {
      setLoading(false);
    }
  }

  function continueToDetails() {
    if (!selected) return;
    setBooking({ quoteInput: form, selectedQuote: selected, order: null });
    navigate('/details');
  }

  return (
    <div>
      <div id="stepper-quote"><Stepper activeKey="quote" /></div>
      <div className="wrap" style={{ maxWidth: 760, padding: '20px 32px 80px' }}>
        <h1 className="h-lg" style={{ marginBottom: 6 }}>Get an instant quote</h1>
        <p className="lead" style={{ marginBottom: 24 }}>Pricing is calculated from destination zone, actual weight and volumetric weight.</p>

        <form className="card" style={{ padding: 28 }} onSubmit={submitQuote}>
          <div className="grid-2">
            <div className="field">
              <label>Origin country</label>
              <input className="input" value={form.originCountryCode} onChange={(e) => update('originCountryCode', e.target.value.toUpperCase())} maxLength={2} />
            </div>
            <div className="field">
              <label>Destination country</label>
              <select className="select" required value={form.destinationCountryCode} onChange={(e) => update('destinationCountryCode', e.target.value)}>
                <option value="">Select destination…</option>
                {countries.map((c) => (
                  <option key={c.countryCode} value={c.countryCode}>{c.countryName} — {c.zone.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid-2" style={{ marginTop: 14 }}>
            <div className="field">
              <label>Actual weight (kg)</label>
              <input className="input" type="number" min="0.01" step="0.01" required value={form.actualWeightKg} onChange={(e) => update('actualWeightKg', e.target.value)} placeholder="e.g. 2.5" />
            </div>
            <div className="field">
              <label>Quantity</label>
              <input className="input" type="number" min="1" value={form.quantity} onChange={(e) => update('quantity', e.target.value)} />
            </div>
          </div>

          <div className="field" style={{ marginTop: 14 }}>
            <label>Dimensions (cm) — used to calculate volumetric weight</label>
            <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <input className="input" type="number" min="1" required placeholder="Length" value={form.lengthCm} onChange={(e) => update('lengthCm', e.target.value)} />
              <input className="input" type="number" min="1" required placeholder="Width" value={form.widthCm} onChange={(e) => update('widthCm', e.target.value)} />
              <input className="input" type="number" min="1" required placeholder="Height" value={form.heightCm} onChange={(e) => update('heightCm', e.target.value)} />
            </div>
            <span className="hint">Volumetric weight = (L × W × H) ÷ 5000. The higher of actual vs volumetric weight is charged.</span>
          </div>

          <div className="field" style={{ marginTop: 14 }}>
            <label>Declared value (optional)</label>
            <input className="input" type="number" min="0" step="0.01" value={form.declaredValue} onChange={(e) => update('declaredValue', e.target.value)} placeholder="For insurance / customs purposes" />
          </div>

          {error && <div className="error-text" style={{ marginTop: 14 }}>{error}</div>}

          <button className="btn btn-primary block" style={{ marginTop: 20 }} disabled={loading}>
            {loading ? 'Calculating…' : 'Get instant quote'}
          </button>
        </form>

        {quotes && (
          <div style={{ marginTop: 28 }}>
            <h3 className="h-md" style={{ marginBottom: 14 }}>Choose a service</h3>
            {quotes.map((q) => (
              <div
                key={q.service.code}
                className={`rate-card ${selected?.service.code === q.service.code ? 'selected' : ''}`}
                onClick={() => setSelected(q)}
              >
                <div>
                  <h4>{q.service.name}</h4>
                  <div className="transit">Delivered in {q.service.transitDays} business days · {q.zone.name}</div>
                  <div className="transit">Chargeable weight: {q.weight.chargeableWeightKg} kg (actual {q.weight.actualWeightKg}kg / volumetric {q.weight.volumetricWeightKg}kg)</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="price">₹{q.pricing.grandTotal.toFixed ? q.pricing.grandTotal.toFixed(2) : q.pricing.grandTotal} {q.pricing.currency}</div>
                  <button type="button" className={selected?.service.code === q.service.code ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'} style={{ marginTop: 8 }}>
                    {selected?.service.code === q.service.code ? 'Selected' : 'Select'}
                  </button>
                </div>
              </div>
            ))}

            <button className="btn btn-primary block" disabled={!selected} onClick={continueToDetails} style={{ marginTop: 8 }}>
              Continue to details
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
