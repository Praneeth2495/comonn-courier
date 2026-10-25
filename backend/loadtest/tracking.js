// Tracking scenario — GET /api/track/:orderNumber, a read-only lookup.
// Cycles through 51 real orders seeded in staging (order numbers 25101
// through 251051) so VUs aren't all hammering the exact same row.
import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL, scenarioFor, vusFromEnv } from './common.js';

export const options = {
  scenarios: { tracking: scenarioFor(vusFromEnv()) },
  thresholds: {
    http_req_failed: ['rate<0.05'],
  },
};

const ORDER_NUMBERS = [
  '25101', '25102', '25103', '25104', '25105', '25106', '25107', '25108', '25109', '251010',
  '251011', '251012', '251013', '251014', '251015', '251016', '251017', '251018', '251019', '251020',
  '251021', '251022', '251023', '251024', '251025', '251026', '251027', '251028', '251029', '251030',
  '251031', '251032', '251033', '251034', '251035', '251036', '251037', '251038', '251039', '251040',
  '251041', '251042', '251043', '251044', '251045', '251046', '251047', '251048', '251049', '251050',
  '251051',
];

export default function () {
  const orderNumber = ORDER_NUMBERS[Math.floor(Math.random() * ORDER_NUMBERS.length)];
  const res = http.get(`${BASE_URL}/api/track/${orderNumber}`, { timeout: '10s' });
  check(res, {
    'status is 200': (r) => r.status === 200,
    'has orderNumber': (r) => {
      try { return !!JSON.parse(r.body).orderNumber; } catch { return false; }
    },
  });
}
