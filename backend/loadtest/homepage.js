// "Homepage" scenario — adapted after discovering the Railway backend
// doesn't serve the frontend at all (that's 100% Vercel's job in
// production; www.comonn.in is explicitly off-limits for this test). The
// real backend load a homepage visit generates is the country-list call
// the quote widget makes on mount (GET /api/quote/countries) — a
// lightweight, read-heavy, unauthenticated endpoint every visitor hits.
// This measures that instead of a literal static-HTML fetch.
import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL, scenarioFor, vusFromEnv } from './common.js';

export const options = {
  scenarios: { homepage: scenarioFor(vusFromEnv()) },
  thresholds: {
    http_req_failed: ['rate<0.05'],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/api/quote/countries`);
  check(res, {
    'status is 200': (r) => r.status === 200,
    'has countries': (r) => {
      try { return JSON.parse(r.body).countries?.length > 0; } catch { return false; }
    },
  });
}
