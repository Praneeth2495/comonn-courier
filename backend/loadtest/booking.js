// Booking scenario — POST /api/orders (order creation only). Deliberately
// stops here and never completes payment: notifyOrderStatusChange (the
// WhatsApp/email trigger) only ever fires from payment/status-update
// endpoints, never from order creation itself — so this scenario cannot
// send any real message or charge, even before accounting for the
// credential-blanking already done on the staging environment. Each
// iteration uses a unique phone number (via __VU/__ITER) so addresses
// aren't deduped into one customer record.
import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL, scenarioFor, vusFromEnv } from './common.js';

export const options = {
  scenarios: { booking: scenarioFor(vusFromEnv()) },
  thresholds: {
    http_req_failed: ['rate<0.05'],
  },
};

export default function () {
  const uniqueSuffix = `${__VU}-${__ITER}`;
  const payload = JSON.stringify({
    serviceCode: 'EXPRESS',
    sender: {
      contactName: 'LoadTest Sender',
      phone: `9${String(__VU).padStart(5, '0')}${String(__ITER).padStart(4, '0')}`.slice(0, 10),
      line1: '123 Load Test St',
      city: 'Srikakulam',
      state: 'AP',
      postcode: '532001',
      countryCode: 'IN',
    },
    receiver: {
      contactName: `LoadTest Receiver ${uniqueSuffix}`,
      phone: `0400${String(__VU).padStart(3, '0')}${String(__ITER).padStart(3, '0')}`.slice(0, 10),
      line1: '456 Load Test Rd',
      city: 'Paddys River',
      state: 'ACT',
      postcode: '2620',
      countryCode: 'AU',
    },
    items: [{ itemType: 'Box', actualWeightKg: 5, quantity: 1 }],
    declaredValue: 1000,
  });

  const res = http.post(`${BASE_URL}/api/orders`, payload, {
    headers: { 'Content-Type': 'application/json' },
  });
  check(res, {
    'status is 201 or 200': (r) => r.status === 200 || r.status === 201,
    'has order': (r) => {
      try { return !!JSON.parse(r.body).order?.orderNumber; } catch { return false; }
    },
  });
}
