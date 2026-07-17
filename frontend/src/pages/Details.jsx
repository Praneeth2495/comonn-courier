import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useBooking } from '../api/BookingContext';
import Stepper from '../components/Stepper';

const emptyAddress = { contactName: '', phone: '', line1: '', line2: '', city: '', state: '', postcode: '', countryCode: '' };

export default function Details() {
  const { quoteInput, selectedQuote, setBooking } = useBooking();
  const navigate = useNavigate();
  const [sender, setSender] = useState({ ...emptyAddress, countryCode: 'IN' });
  const [receiver, setReceiver] = useState({ ...emptyAddress, countryCode: quoteInput?.destinationCountryCode || '' });
  const [contentsDescription, setContentsDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!quoteInput || !selectedQuote) {
    return (
      <div className="wrap section-narrow" style={{ textAlign: 'center' }}>
        <p className="lead">Start by getting an instant quote first.</p>
        <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/quote')}>Get a quote</button>
      </div>
    );
  }

  function updateField(setter) {
    return (field, value) => setter((prev) => ({ ...prev, [field]: value }));
  }
  const updateSender = updateField(setSender);
  const updateReceiver = updateField(setReceiver);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await client.post('/orders', {
        serviceCode: selectedQuote.service.code,
        sender,
        receiver,
        items: quoteInput.items,
        declaredValue: Number(quoteInput.declaredValue) || 0,
        contentsDescription,
      });
      setBooking({ order: data.order });
      navigate('/payment');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create the order. Please check the details and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div id="stepper-details"><Stepper activeKey="details" /></div>
      <div className="wrap" style={{ maxWidth: 860, padding: '20px 32px 80px' }}>
        <h1 className="h-lg">Add shipment details</h1>
        <p className="lead" style={{ marginBottom: 24 }}>
          {selectedQuote.service.name} · ₹{Number(selectedQuote.pricing.grandTotal).toFixed(2)} {selectedQuote.pricing.currency}
        </p>

        <form onSubmit={submit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <AddressCard title="Sender" value={sender} onChange={updateSender} />
            <AddressCard title="Receiver" value={receiver} onChange={updateReceiver} />
          </div>

          <div className="field card" style={{ padding: 20, marginTop: 20 }}>
            <label>Contents description</label>
            <input className="input" value={contentsDescription} onChange={(e) => setContentsDescription(e.target.value)} placeholder="e.g. Clothing, gifts, documents" />
          </div>

          {error && <div className="error-text" style={{ marginTop: 14 }}>{error}</div>}

          <button className="btn btn-primary block" style={{ marginTop: 20 }} disabled={loading}>
            {loading ? 'Creating order…' : 'Continue to payment'}
          </button>
        </form>
      </div>
    </div>
  );
}

function AddressCard({ title, value, onChange }) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <h4 style={{ marginBottom: 14, color: 'var(--navy)' }}>{title}</h4>
      <div className="form-stack">
        <div className="field">
          <label>Full name</label>
          <input className="input" required value={value.contactName} onChange={(e) => onChange('contactName', e.target.value)} />
        </div>
        <div className="field">
          <label>Phone</label>
          <input className="input" required value={value.phone} onChange={(e) => onChange('phone', e.target.value)} />
        </div>
        <div className="field">
          <label>Address line 1</label>
          <input className="input" required value={value.line1} onChange={(e) => onChange('line1', e.target.value)} />
        </div>
        <div className="field">
          <label>Address line 2 (optional)</label>
          <input className="input" value={value.line2} onChange={(e) => onChange('line2', e.target.value)} />
        </div>
        <div className="grid-2">
          <div className="field">
            <label>City</label>
            <input className="input" required value={value.city} onChange={(e) => onChange('city', e.target.value)} />
          </div>
          <div className="field">
            <label>State / region</label>
            <input className="input" value={value.state} onChange={(e) => onChange('state', e.target.value)} />
          </div>
        </div>
        <div className="grid-2">
          <div className="field">
            <label>Postcode</label>
            <input className="input" required value={value.postcode} onChange={(e) => onChange('postcode', e.target.value)} />
          </div>
          <div className="field">
            <label>Country code</label>
            <input className="input" required maxLength={2} value={value.countryCode} onChange={(e) => onChange('countryCode', e.target.value.toUpperCase())} />
          </div>
        </div>
      </div>
    </div>
  );
}
