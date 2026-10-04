/**
 * One-off targeted add of France/Portugal/Spain/Italy — real postal-code
 * data (GeoNames, same source/method as the earlier NL/SE rollout) plus
 * Zone/CountryZone/RateCard/ManifestRegion, applied directly to production
 * Postgres AND backend/data/Total-Zones.db (the consolidated source file),
 * without touching any other country's data.
 *
 * Pricing: same tier as Germany/Netherlands/Sweden (user's explicit choice)
 * — Economy Rs3500 base + Rs650/kg, Express Rs4000 base + Rs750/kg, single
 * zone per country (no postcode-level price differentiation).
 *
 * Postcode formats: FR/ES/IT are plain 5-digit numeric. France's dataset
 * also includes ~14k CEDEX (business bulk-mail) rows like "75021 CEDEX 01"
 * — excluded, since they don't fit a residential-shipping postcode field
 * and are a small minority of the data. Portugal's format is "NNNN-NNN"
 * (down to street level, ~207k rows) — kept at full granularity for
 * suggestions, but PostcodeZone is keyed by just the 4-digit prefix before
 * the hyphen (750 unique values) since every prefix maps to the same
 * single zone anyway; see the matching extractZoneMatchKey PT case added
 * to pricingEngine.js alongside this script.
 *
 * Region field: all four use GeoNames admin_name1 as `state`, labeled per
 * each country's own term for that administrative level (France/Spain/
 * Italy: "Region" — Région/Comunidad Autónoma/Regione; Portugal: "District"
 * — Distrito) — see regionNames.js's getRegionFieldConfig.
 *
 * Airport: one hub per country (same simplification as NL->AMS/SE->ARN) —
 * France->CDG, Portugal->LIS, Spain->MAD, Italy->FCO.
 *
 * Usage: node scripts/add-fr-pt-es-it.js
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { prisma } = require('../src/config/db');

const COUNTRIES = [
  { cc: 'FR', name: 'France', zoneCode: 'FRANCE_1', zoneName: 'France 1', airport: 'CDG', airportName: 'Paris Charles de Gaulle Airport', airportCity: 'Paris', file: 'FR_extract/FR.txt' },
  { cc: 'PT', name: 'Portugal', zoneCode: 'PORTUGAL_1', zoneName: 'Portugal 1', airport: 'LIS', airportName: 'Lisbon Airport', airportCity: 'Lisbon', file: 'PT_extract/PT.txt' },
  { cc: 'ES', name: 'Spain', zoneCode: 'SPAIN_1', zoneName: 'Spain 1', airport: 'MAD', airportName: 'Madrid-Barajas Airport', airportCity: 'Madrid', file: 'ES_extract/ES.txt' },
  { cc: 'IT', name: 'Italy', zoneCode: 'ITALY_1', zoneName: 'Italy 1', airport: 'FCO', airportName: 'Rome Fiumicino Airport', airportCity: 'Rome', file: 'IT_extract/IT.txt' },
];

function parseGeonamesFile(filePath, cc) {
  const raw = fs.readFileSync(path.join(__dirname, '../data', filePath), 'utf8');
  const lines = raw.split('\n').filter(Boolean);
  const seen = new Set();
  const rows = [];
  for (const line of lines) {
    const cols = line.split('\t');
    const postcode = (cols[1] || '').trim();
    const place = (cols[2] || '').trim();
    const admin1 = (cols[3] || '').trim();
    if (!postcode || !place) continue;
    if (cc !== 'PT' && !/^\d{5}$/.test(postcode)) continue; // drop FR CEDEX rows etc.
    if (cc === 'PT' && !/^\d{4}-\d{3}$/.test(postcode)) continue;
    const key = `${postcode}|${place}|${admin1}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ postcode, suburb: place, state: admin1 || null });
  }
  return rows;
}

function zoneMatchKey(cc, postcode) {
  return cc === 'PT' ? postcode.split('-')[0] : postcode;
}

async function main() {
  const originZones = await prisma.zone.findMany({ where: { kind: 'origin' } });
  if (originZones.length !== 1) throw new Error(`Expected exactly one origin zone, found ${originZones.length}`);
  const fromZoneId = originZones[0].id;

  const services = await prisma.service.findMany({ where: { code: { in: ['ECONOMY', 'EXPRESS'] } } });
  const serviceByCode = Object.fromEntries(services.map((s) => [s.code, s]));

  const sqliteDb = new Database(path.join(__dirname, '../data/Total-Zones.db'));
  const insertSuggestion = sqliteDb.prepare(
    `INSERT INTO "Total Zones - Suggestion List" ("Country Code", "Postcode", "Region", "Airport") VALUES (?, ?, ?, ?)`
  );
  const insertZoneRow = sqliteDb.prepare(
    `INSERT INTO "Total Zones - Zones" ("Country", "Postcode", "Zone") VALUES (?, ?, ?)`
  );

  for (const country of COUNTRIES) {
    console.log(`\n=== ${country.name} (${country.cc}) ===`);
    const rows = parseGeonamesFile(country.file, country.cc);
    console.log(`Parsed ${rows.length} unique suggestion rows.`);

    // Zone + CountryZone
    const zone = await prisma.zone.upsert({
      where: { code: country.zoneCode },
      update: { name: country.zoneName, kind: 'destination' },
      create: { code: country.zoneCode, name: country.zoneName, kind: 'destination' },
    });
    await prisma.countryZone.upsert({
      where: { countryCode: country.cc },
      update: { countryName: country.name, zoneId: zone.id },
      create: { countryCode: country.cc, countryName: country.name, zoneId: zone.id },
    });
    console.log(`Zone ${zone.code} (${zone.id}) ready.`);

    // Rate cards (Economy + Express, same tier as DE/NL/SE)
    const rateCardDefs = [
      { code: 'ECONOMY', basePrice: 3500, perKgOverage: 650, transitDaysMin: 5, transitDaysMax: 7 },
      { code: 'EXPRESS', basePrice: 4000, perKgOverage: 750, transitDaysMin: 3, transitDaysMax: 5 },
    ];
    for (const def of rateCardDefs) {
      const service = serviceByCode[def.code];
      const existing = await prisma.rateCard.findFirst({ where: { serviceId: service.id, zoneId: zone.id, fromZoneId } });
      if (existing) {
        console.log(`Rate card ${def.code} already exists, skipping.`);
        continue;
      }
      await prisma.rateCard.create({
        data: {
          serviceId: service.id,
          zoneId: zone.id,
          fromZoneId,
          weightFromKg: 1,
          weightToKg: 5,
          basePrice: def.basePrice,
          perKgOverage: def.perKgOverage,
          currency: 'INR',
          transitDaysMin: def.transitDaysMin,
          transitDaysMax: def.transitDaysMax,
        },
      });
      console.log(`Rate card ${def.code} created.`);
    }

    // ManifestRegion (airport)
    await prisma.manifestRegion.upsert({
      where: { code: country.airport },
      update: { name: country.airportName, countryCode: country.cc, airportAddress: country.airportCity },
      create: { code: country.airport, name: country.airportName, countryCode: country.cc, airportAddress: country.airportCity },
    });
    console.log(`ManifestRegion ${country.airport} ready.`);

    // PostcodeSuggestion (production) + Total-Zones.db suggestion rows
    const suggestionData = rows.map((r) => ({
      countryCode: country.cc,
      postcode: r.postcode,
      suburb: r.suburb,
      state: r.state,
      region: null,
      airport: country.airport,
    }));
    const BATCH = 5000;
    for (let i = 0; i < suggestionData.length; i += BATCH) {
      const batch = suggestionData.slice(i, i + BATCH);
      await prisma.postcodeSuggestion.createMany({ data: batch });
      process.stdout.write(`\rSuggestions imported ${Math.min(i + BATCH, suggestionData.length)}/${suggestionData.length}`);
    }
    console.log('');

    const insertSuggestions = sqliteDb.transaction((items) => {
      for (const r of items) {
        const combined = r.state ? `${r.postcode}, ${r.suburb}, ${r.state}` : `${r.postcode}, ${r.suburb}`;
        insertSuggestion.run(country.cc, combined, null, country.airport);
      }
    });
    insertSuggestions(rows);
    console.log(`Total-Zones.db: ${rows.length} suggestion rows added.`);

    // PostcodeZone (production) — deduped by zone-match-key
    const uniqueKeys = [...new Set(rows.map((r) => zoneMatchKey(country.cc, r.postcode)))];
    const zoneRowData = uniqueKeys.map((key) => ({ countryCode: country.cc, postcode: key, zoneId: zone.id }));
    for (let i = 0; i < zoneRowData.length; i += BATCH) {
      const batch = zoneRowData.slice(i, i + BATCH);
      await prisma.postcodeZone.createMany({ data: batch, skipDuplicates: true });
    }
    console.log(`PostcodeZone: ${zoneRowData.length} unique keys imported.`);

    const insertZoneRows = sqliteDb.transaction((keys) => {
      for (const key of keys) insertZoneRow.run(country.cc, key, country.zoneName);
    });
    insertZoneRows(uniqueKeys);
    console.log(`Total-Zones.db: ${uniqueKeys.length} zone rows added.`);
  }

  sqliteDb.close();
  console.log('\nDone.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
