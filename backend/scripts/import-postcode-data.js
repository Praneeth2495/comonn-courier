/**
 * One-time import of backend/data/Total-Zones.db (SQLite) into the DB.
 * Replaces the old Total Zones.xlsx importer now that the source data has
 * grown to multiple countries (import-scale reasons: Excel's ~1M row/sheet
 * cap can't hold this anymore).
 *
 * Table "Total Zones - Suggestion List" -> PostcodeSuggestion (postcode
 * autocomplete for the address forms, and for the Home/Book pages'
 * destination-postcode field). Each row is a country code plus a combined
 * "<postcode>, <suburb>, <state>" string — some countries (SG, DE, ZA...)
 * only have "<postcode>, <suburb>" (no state). A "Region" column is also
 * present (currently only populated for India, e.g. "Srikakulam") — powers
 * the admin Pickup-orders panel's origin state/region filters.
 *
 * Table "Total Zones - Zones" -> PostcodeZone (Country, Postcode, Zone
 * name, e.g. "India 1", "Australia 2"). India's postcodes all map to a
 * single zone name in this file, so — to avoid orphaning the existing
 * production RateCard rows that already point at the real "India-urban"
 * origin zone — every IN row is mapped onto that pre-existing zone rather
 * than a newly created one. AU/NZ zones (Australia 1-4, New Zealand 1-3)
 * are brand new, so those get created fresh; nothing references them yet,
 * so this import alone doesn't change any live pricing — that only happens
 * once rate cards are added for these zones and the destination pricing
 * logic is updated to resolve zones by postcode instead of just by country.
 *
 * Usage: node scripts/import-postcode-data.js
 */
const path = require('path');
const Database = require('better-sqlite3');
const { prisma } = require('../src/config/db');

function slugCode(name) {
  return name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
}

// Splits a combined "<postcode>, <suburb>[, <state>]" string. Some
// countries in this dataset have no state/province segment at all (SG, DE,
// ZA...), so only treat the last segment as `state` when there are 3+
// segments; anything in between is rejoined as the suburb, to survive the
// rare suburb name that itself contains a comma.
function parseCombinedPostcode(raw) {
  const parts = raw.split(',').map((p) => p.replace(/\s+/g, ' ').trim()).filter((p) => p.length);
  if (parts.length === 0) return null;
  const postcode = parts[0];
  if (parts.length === 1) return { postcode, suburb: null, state: null };
  if (parts.length === 2) return { postcode, suburb: parts[1], state: null };
  return { postcode, suburb: parts.slice(1, -1).join(', '), state: parts[parts.length - 1] };
}

async function importSuggestions(db) {
  // GB (the four former UK-constituent-part rows, merged) is by far the
  // largest single country here (~1.83M), bigger than Canada (~900K) which
  // used to hold that spot — importing it last means a disk-space (or any
  // other) failure partway through still leaves every smaller country's
  // data intact.
  const rows = db.prepare(`
    SELECT "Country Code" as countryCode, "Postcode" as combined, "Region" as region, "Airport" as airport
    FROM "Total Zones - Suggestion List"
    ORDER BY CASE
      WHEN "Country Code" = 'GB' THEN 2
      WHEN "Country Code" = 'CA' THEN 1
      ELSE 0
    END, "Country Code"
  `).all();

  const parsed = [];
  for (const { countryCode, combined, region, airport } of rows) {
    if (!countryCode || !combined) continue;
    const p = parseCombinedPostcode(combined);
    if (!p || !p.postcode || !p.suburb) continue; // malformed row — skip rather than guess
    parsed.push({
      countryCode,
      postcode: p.postcode,
      suburb: p.suburb,
      state: p.state,
      region: region ? region.trim() : null,
      airport: airport ? airport.trim() : null,
    });
  }

  console.log(`Suggestions: parsed ${parsed.length} of ${rows.length} rows.`);

  await prisma.postcodeSuggestion.deleteMany({});
  const BATCH = 5000;
  for (let i = 0; i < parsed.length; i += BATCH) {
    await prisma.postcodeSuggestion.createMany({ data: parsed.slice(i, i + BATCH) });
    process.stdout.write(`\rSuggestions imported ${Math.min(i + BATCH, parsed.length)}/${parsed.length}`);
  }
  console.log('');
}

async function importZones(db) {
  const rows = db.prepare(`SELECT field1 as countryCode, field2 as postcode, field3 as zoneName FROM "Total Zones - Zones" WHERE field1 != 'Country'`).all();

  // India already has real rate cards pointing at the existing production
  // origin zone — reuse it instead of creating a new "India 1" zone, which
  // would silently break domestic pricing (no rate card would match it).
  const existingOriginZones = await prisma.zone.findMany({ where: { kind: 'origin' } });
  if (existingOriginZones.length !== 1) {
    throw new Error(
      `Expected exactly one existing origin zone to map India onto, found ${existingOriginZones.length}. ` +
      `Resolve manually before re-running this import.`
    );
  }
  const indiaZoneId = existingOriginZones[0].id;
  console.log(`India -> reusing existing origin zone "${existingOriginZones[0].name}" (${existingOriginZones[0].code})`);

  const zoneIdByKey = {}; // `${countryCode}:${zoneName}` -> zone id
  const otherRows = rows.filter((r) => r.countryCode !== 'IN');
  const otherZoneNames = [...new Set(otherRows.map((r) => r.zoneName))];
  for (const name of otherZoneNames) {
    const zone = await prisma.zone.upsert({
      where: { code: slugCode(name) },
      update: { name, kind: 'destination' },
      create: { code: slugCode(name), name, kind: 'destination' },
    });
    console.log(`Zone "${name}" -> ${zone.code} (${zone.id})`);
    for (const cc of new Set(otherRows.filter((r) => r.zoneName === name).map((r) => r.countryCode))) {
      zoneIdByKey[`${cc}:${name}`] = zone.id;
    }
  }

  // The source sheet has a handful of (country, postcode) keys entered more
  // than once — usually harmless exact duplicates, but sometimes the same
  // postcode was assigned to two different zones (a real conflict in the
  // source data, not something safe to resolve by guessing). Dedupe the
  // former; drop + report the latter rather than silently picking one.
  const zoneNamesByKey = new Map(); // `${countryCode}:${postcode}` -> Set<zoneName>
  for (const r of rows) {
    const key = `${r.countryCode}:${r.postcode.trim().toUpperCase()}`;
    if (!zoneNamesByKey.has(key)) zoneNamesByKey.set(key, new Set());
    zoneNamesByKey.get(key).add(r.zoneName);
  }
  const conflicts = [...zoneNamesByKey.entries()].filter(([, names]) => names.size > 1);
  if (conflicts.length) {
    console.log(`\nWARNING: ${conflicts.length} postcode(s) map to more than one zone in the source data — skipping these, resolve manually:`);
    for (const [key, names] of conflicts) console.log(`  ${key} -> ${[...names].join(' / ')}`);
    console.log('');
  }
  const conflictKeys = new Set(conflicts.map(([key]) => key));

  const seenKeys = new Set();
  const parsed = [];
  for (const r of rows) {
    const key = `${r.countryCode}:${r.postcode.trim().toUpperCase()}`;
    if (conflictKeys.has(key) || seenKeys.has(key)) continue;
    seenKeys.add(key);
    const zoneId = r.countryCode === 'IN' ? indiaZoneId : zoneIdByKey[`${r.countryCode}:${r.zoneName}`];
    if (!zoneId) continue;
    parsed.push({ countryCode: r.countryCode, postcode: r.postcode, zoneId });
  }

  console.log(`Zones: parsed ${parsed.length} of ${rows.length} rows (${conflictKeys.size} conflicting keys skipped).`);

  await prisma.postcodeZone.deleteMany({});
  const BATCH = 5000;
  for (let i = 0; i < parsed.length; i += BATCH) {
    await prisma.postcodeZone.createMany({ data: parsed.slice(i, i + BATCH), skipDuplicates: true });
    process.stdout.write(`\rZones imported ${Math.min(i + BATCH, parsed.length)}/${parsed.length}`);
  }
  console.log('');
}

async function main() {
  const filePath = path.join(__dirname, '../data/Total-Zones.db');
  const db = new Database(filePath, { readonly: true });

  await importZones(db);
  await importSuggestions(db);

  db.close();
}

module.exports = { importZones, importSuggestions };

if (require.main === module) {
  main()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
