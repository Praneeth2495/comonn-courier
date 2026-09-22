/**
 * One-off load test: creates N real bookings (via the actual POST /api/orders
 * endpoint, over HTTP against a running local server) to every destination
 * country, timing each request and recording any errors. All test orders
 * are tagged with a "LOADTEST" contactName prefix so they can be found and
 * deleted later on request — this run deliberately leaves them in place
 * (see main() below: no cleanup step).
 *
 * Usage: node scripts/load-test-bookings.js [ordersPerCountry] [concurrency]
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const BASE_URL = 'http://localhost:4000/api';
const ORDERS_PER_COUNTRY = Number(process.argv[2]) || 100;
const CONCURRENCY = Number(process.argv[3]) || 10;

const COUNTRIES = ['AU', 'NZ', 'CA', 'GB', 'US', 'DE', 'MY', 'SG', 'ZA', 'IE', 'NL', 'SE', 'AE', 'SA', 'KW'];

const PHONE_META = {
  AU: { dial: '+61', digits: 9 }, NZ: { dial: '+64', digits: 9 }, CA: { dial: '+1', digits: 10 },
  GB: { dial: '+44', digits: 10 }, US: { dial: '+1', digits: 10 }, DE: { dial: '+49', digits: 11 },
  MY: { dial: '+60', digits: 9 }, SG: { dial: '+65', digits: 8 }, ZA: { dial: '+27', digits: 9 },
  IE: { dial: '+353', digits: 9 }, NL: { dial: '+31', digits: 9 }, SE: { dial: '+46', digits: 9 },
  AE: { dial: '+971', digits: 9 }, SA: { dial: '+966', digits: 9 }, KW: { dial: '+965', digits: 8 },
};

function fakePhone(cc, n) {
  const { dial, digits } = PHONE_META[cc];
  const num = String(1000000000 + n).slice(-digits).padStart(digits, '5');
  return `${dial} ${num}`;
}

async function samplePostcodes(countryCode, n) {
  const total = await prisma.postcodeSuggestion.count({ where: { countryCode } });
  const take = Math.min(n, total);
  const offset = total > take ? Math.floor(Math.random() * (total - take)) : 0;
  const rows = await prisma.postcodeSuggestion.findMany({
    where: { countryCode },
    skip: offset,
    take,
    select: { postcode: true, suburb: true, state: true },
  });
  const out = [];
  for (let i = 0; i < n; i++) out.push(rows[i % rows.length]);
  return out;
}

function buildOrderPayload(cc, pick, idx) {
  const eircode = cc === 'IE' ? `${pick.postcode} ${String.fromCharCode(65 + (idx % 26))}${String.fromCharCode(65 + ((idx * 7) % 26))}${(idx % 90) + 10}` : undefined;
  return {
    serviceCode: 'EXPRESS',
    sender: {
      contactName: `LOADTEST Sender ${cc}-${idx}`,
      phone: '+91 9108038783',
      email: 'loadtest-sender@example.com',
      line1: 'Gandhi Bhawan Road',
      city: 'Gandhi Bhawan (Hyderabad)',
      state: 'Telangana',
      postcode: '500001',
      countryCode: 'IN',
    },
    receiver: {
      contactName: `LOADTEST Receiver ${cc}-${idx}`,
      phone: fakePhone(cc, idx),
      email: 'loadtest-receiver@example.com',
      line1: `${idx} Test Street`,
      city: pick.suburb || cc,
      state: pick.state || undefined,
      postcode: pick.postcode,
      eircode,
      countryCode: cc,
    },
    items: [{ itemType: 'Box', actualWeightKg: 2, lengthCm: 20, widthCm: 20, heightCm: 20, quantity: 1 }],
    declaredValue: 3000,
    contentsDescription: 'LOADTEST',
  };
}

async function runPool(tasks, concurrency) {
  const results = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

async function main() {
  console.log(`Load test: ${ORDERS_PER_COUNTRY} orders x ${COUNTRIES.length} countries = ${ORDERS_PER_COUNTRY * COUNTRIES.length} total, concurrency=${CONCURRENCY}\n`);
  const overallStart = Date.now();
  const summary = [];

  for (const cc of COUNTRIES) {
    const picks = await samplePostcodes(cc, ORDERS_PER_COUNTRY);
    const countryStart = Date.now();
    let success = 0;
    const errors = [];
    const latencies = [];

    const tasks = picks.map((pick, idx) => async () => {
      const payload = buildOrderPayload(cc, pick, idx);
      const t0 = Date.now();
      try {
        const res = await fetch(`${BASE_URL}/orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const dt = Date.now() - t0;
        latencies.push(dt);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          errors.push({ idx, postcode: pick.postcode, suburb: pick.suburb, status: res.status, error: body.error || res.statusText });
        } else {
          success++;
        }
      } catch (err) {
        latencies.push(Date.now() - t0);
        errors.push({ idx, postcode: pick.postcode, suburb: pick.suburb, status: 'NETWORK', error: err.message });
      }
    });

    await runPool(tasks, CONCURRENCY);
    const countryMs = Date.now() - countryStart;
    const avg = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
    const max = latencies.length ? Math.max(...latencies) : 0;
    const min = latencies.length ? Math.min(...latencies) : 0;

    console.log(`${cc}: ${success}/${ORDERS_PER_COUNTRY} ok, ${countryMs}ms total, avg ${avg}ms, min ${min}ms, max ${max}ms${errors.length ? `, ${errors.length} errors` : ''}`);
    if (errors.length) {
      errors.slice(0, 10).forEach((e) => console.log(`   - ${e.postcode} (${e.suburb}): ${e.status}: ${e.error}`));
    }
    summary.push({ cc, success, total: ORDERS_PER_COUNTRY, countryMs, avg, min, max, errorCount: errors.length, errors });
  }

  const overallMs = Date.now() - overallStart;
  const totalOrders = ORDERS_PER_COUNTRY * COUNTRIES.length;
  const totalSuccess = summary.reduce((s, r) => s + r.success, 0);
  console.log(`\nTOTAL: ${totalSuccess}/${totalOrders} succeeded in ${overallMs}ms (${(overallMs / 1000).toFixed(1)}s)`);
  console.log('Test orders left in place (tagged "LOADTEST") — delete only when explicitly asked.');

  require('fs').writeFileSync(
    require('path').join(__dirname, '../../load-test-results.json'),
    JSON.stringify({ ordersPerCountry: ORDERS_PER_COUNTRY, concurrency: CONCURRENCY, overallMs, totalOrders, totalSuccess, summary }, null, 2)
  );
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
