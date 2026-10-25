// Quote calculator scenario — POST /api/quote, pure computation + DB
// reads (zone/rate-card lookup), no writes. Uses a real India->Australia
// postcode pair confirmed resolvable in the staging DB (cloned pricing
// data + imported postcode data).
import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL, scenarioFor, vusFromEnv } from './common.js';

export const options = {
  scenarios: { quote: scenarioFor(vusFromEnv()) },
  thresholds: {
    http_req_failed: ['rate<0.05'],
  },
};

const payload = JSON.stringify({
  originPostcode: '532001',
  destinationCountryCode: 'AU',
  destinationPostcode: '2620',
  items: [{ itemType: 'Box', actualWeightKg: 5, quantity: 1 }],
  declaredValue: 1000,
});

export default function () {
  const res = http.post(`${BASE_URL}/api/quote`, payload, {
    headers: { 'Content-Type': 'application/json' },
  });
  check(res, {
    'status is 200': (r) => r.status === 200,
    'has quotes': (r) => {
      try { return JSON.parse(r.body).quotes?.length > 0; } catch { return false; }
    },
  });
}
