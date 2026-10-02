/**
 * One-off smoke test: 100 real orders (20 each across 5 destination
 * countries) created via POST /api/orders against the live production API
 * — verifies the optimize/pass-1 merge (parallelized pricing engine,
 * consolidated address validation, new indexes, etc.) still works
 * end-to-end for real requests. Deleted after use.
 *
 * Usage: node scripts/load-test-100-orders.js
 */
const axios = require('axios');

const BASE_URL = 'https://api.comonn.in/api';
const PER_COUNTRY = 20;
const CONCURRENCY = 10;

const DESTINATIONS = [
  { countryCode: 'AU', city: 'Paddys River', state: 'ACT', postcode: '2620' },
  { countryCode: 'GB', city: 'Telford', state: '', postcode: 'TF11 9WS' },
  { countryCode: 'US', city: 'Autaugaville', state: 'AL', postcode: '36003' },
  { countryCode: 'DE', city: 'Berlin', state: '', postcode: '10875' },
  { countryCode: 'MY', city: 'Kota Kinabalu', state: 'SBH', postcode: '88759' },
];

function buildOrderPayload(dest, i) {
  return {
    serviceCode: 'ECONOMY',
    sender: {
      contactName: 'LOADTEST Sender',
      phone: '9999999999',
      line1: '1 Test Street',
      city: 'Hyderabad',
      state: 'Telangana',
      postcode: '500001',
      countryCode: 'IN',
    },
    receiver: {
      contactName: `LOADTEST Receiver ${dest.countryCode}-${i}`,
      phone: '8888888888',
      line1: '1 Test Street',
      city: dest.city,
      state: dest.state,
      postcode: dest.postcode,
      countryCode: dest.countryCode,
    },
    items: [{ itemType: 'Box', actualWeightKg: 2, lengthCm: 20, widthCm: 20, heightCm: 20, quantity: 1 }],
    declaredValue: 1000,
    contentsDescription: 'Test parcel',
    taxRate: 0,
    pricingPending: false,
  };
}

async function createOne(dest, i) {
  const start = Date.now();
  try {
    const { data } = await axios.post(`${BASE_URL}/orders`, buildOrderPayload(dest, i), { timeout: 30000 });
    return { ok: true, ms: Date.now() - start, orderNumber: data.order?.orderNumber, countryCode: dest.countryCode };
  } catch (err) {
    return {
      ok: false,
      ms: Date.now() - start,
      countryCode: dest.countryCode,
      error: err.response?.data?.error || err.message,
      status: err.response?.status,
    };
  }
}

async function main() {
  const jobs = [];
  for (const dest of DESTINATIONS) {
    for (let i = 1; i <= PER_COUNTRY; i++) jobs.push([dest, i]);
  }

  console.log(`Creating ${jobs.length} orders (${PER_COUNTRY} each across ${DESTINATIONS.length} countries), concurrency ${CONCURRENCY}...`);
  const results = [];
  const overallStart = Date.now();

  for (let i = 0; i < jobs.length; i += CONCURRENCY) {
    const batch = jobs.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(([dest, n]) => createOne(dest, n)));
    results.push(...batchResults);
    process.stdout.write(`\r${results.length}/${jobs.length} done`);
  }
  console.log('');

  const totalMs = Date.now() - overallStart;
  const succeeded = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);

  console.log(`\nTotal time: ${(totalMs / 1000).toFixed(1)}s`);
  console.log(`Succeeded: ${succeeded.length}/${results.length}`);
  console.log(`Failed: ${failed.length}/${results.length}`);

  const byCountry = {};
  for (const r of results) {
    byCountry[r.countryCode] = byCountry[r.countryCode] || { ok: 0, fail: 0 };
    byCountry[r.countryCode][r.ok ? 'ok' : 'fail']++;
  }
  console.log('By country:', JSON.stringify(byCountry, null, 2));

  if (failed.length) {
    console.log('\nFailures (up to 20):');
    for (const f of failed.slice(0, 20)) {
      console.log(`  [${f.countryCode}] status=${f.status} error=${f.error}`);
    }
  }

  const avgMs = Math.round(results.reduce((s, r) => s + r.ms, 0) / results.length);
  const maxMs = Math.max(...results.map((r) => r.ms));
  console.log(`\nAvg request time: ${avgMs}ms, max: ${maxMs}ms`);
}

main().catch((err) => {
  console.error('Load test failed:', err);
  process.exit(1);
});
