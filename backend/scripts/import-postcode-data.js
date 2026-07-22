/**
 * One-time import of backend/data/Total Zones.xlsx into the DB.
 *
 * "Suggestion List" sheet -> PostcodeSuggestion (postcode/suburb/state
 * autocomplete for the address forms). Each row is "IN" + a combined
 * string "<postcode>, <suburb>, <state>" — split by taking the first part
 * as postcode and the last part as state, rejoining anything in between
 * as the suburb name (handles the rare row where the suburb itself
 * contains a comma, e.g. "Raja,mpalli").
 *
 * "Zones" sheet -> PostcodeZone (Country, Postcode, Zone name, e.g.
 * "India-urban"). Each distinct zone name gets its own origin Zone row
 * (kind="origin"), auto-coded from the name, so admin can pick it as a
 * RateCard.fromZoneId once more zones (e.g. "India-rural") are added.
 *
 * Usage: node scripts/import-postcode-data.js
 */
const path = require('path');
const XLSX = require('xlsx');
const { prisma } = require('../src/config/db');

function slugCode(name) {
  return name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
}

async function importSuggestions(wb) {
  const sheet = wb.Sheets['Suggestion List'];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }).filter((r) => r[0] && r[1]);

  const parsed = [];
  for (const [countryCode, combined] of rows) {
    const parts = combined.split(',').map((p) => p.trim());
    if (parts.length < 3) continue; // malformed row — skip rather than guess
    const postcode = parts[0];
    const state = parts[parts.length - 1];
    const suburb = parts.slice(1, -1).join(',');
    parsed.push({ countryCode, postcode, suburb, state });
  }

  console.log(`Suggestions: parsed ${parsed.length} of ${rows.length} rows.`);

  await prisma.postcodeSuggestion.deleteMany({});
  const BATCH = 1000;
  for (let i = 0; i < parsed.length; i += BATCH) {
    await prisma.postcodeSuggestion.createMany({ data: parsed.slice(i, i + BATCH) });
    process.stdout.write(`\rSuggestions imported ${Math.min(i + BATCH, parsed.length)}/${parsed.length}`);
  }
  console.log('');
}

async function importZones(wb) {
  const sheet = wb.Sheets['Zones'];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null })
    .filter((r) => r[0] && r[0] !== 'Country' && r[1] && r[2]);

  const zoneIdByName = {};
  const zoneNames = [...new Set(rows.map((r) => String(r[2])))];
  for (const name of zoneNames) {
    const zone = await prisma.zone.upsert({
      where: { code: slugCode(name) },
      update: { name, kind: 'origin' },
      create: { code: slugCode(name), name, kind: 'origin' },
    });
    zoneIdByName[name] = zone.id;
    console.log(`Zone "${name}" -> ${zone.code} (${zone.id})`);
  }

  const parsed = rows.map((r) => ({
    countryCode: String(r[0]),
    postcode: String(r[1]),
    zoneId: zoneIdByName[String(r[2])],
  }));

  console.log(`Zones: parsed ${parsed.length} of ${rows.length} rows.`);

  await prisma.postcodeZone.deleteMany({});
  const BATCH = 1000;
  for (let i = 0; i < parsed.length; i += BATCH) {
    await prisma.postcodeZone.createMany({ data: parsed.slice(i, i + BATCH) });
    process.stdout.write(`\rZones imported ${Math.min(i + BATCH, parsed.length)}/${parsed.length}`);
  }
  console.log('');
}

async function main() {
  const filePath = path.join(__dirname, '../data/Total Zones.xlsx');
  const wb = XLSX.readFile(filePath);

  await importSuggestions(wb);
  await importZones(wb);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
