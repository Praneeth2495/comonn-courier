/**
 * One-off targeted add of Netherlands (NL) postcode suggestions — same
 * situation as Ireland (see add-ireland-postcodes.js): NL isn't a serviced
 * destination yet (no Zone/CountryZone/rate cards/phone code), this only
 * seeds PostcodeSuggestion data.
 *
 * Unlike Ireland's ~139 routing keys, Dutch postcodes are 4-digit + 2-letter
 * (e.g. "1012 AB"), too granular (hundreds of thousands of codes) for a
 * hand-verifiable list — instead this uses GeoNames' free/CC-licensed
 * postal-code dataset (download.geonames.org/export/zip/NL.zip), which only
 * publishes the 4-digit prefix per area (NL is one of the countries GeoNames
 * deliberately truncates, alongside CA/GB, rather than the full code) — the
 * same granularity as Germany's 5-digit PostcodeSuggestion data already in
 * this system. Source file checked in at data/nl-postcodes-geonames.txt
 * (tab-separated: country, postcode, place name, province, ...). Known
 * limitation (like the existing NZ postcode gap): this is a free community
 * dataset, not an official PostNL product, so treat it as best-effort
 * rather than fully authoritative.
 *
 * Usage: node scripts/add-netherlands-postcodes.js
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { prisma } = require('../src/config/db');

function parseRows() {
  const filePath = path.join(__dirname, '../data/nl-postcodes-geonames.txt');
  const lines = fs.readFileSync(filePath, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
  const rows = [];
  for (const line of lines) {
    const cols = line.split('\t');
    const postcode = cols[1]?.trim();
    const place = cols[2]?.trim();
    const province = cols[3]?.trim();
    if (!postcode || !place) continue;
    rows.push([postcode, place, province || null]);
  }
  return rows;
}

async function main() {
  const rows = parseRows();
  console.log(`Parsed ${rows.length} NL rows from source file.`);

  const dbPath = path.join(__dirname, '../data/Total-Zones.db');
  const db = new Database(dbPath);
  db.prepare(`DELETE FROM "Total Zones - Suggestion List" WHERE "Country Code" = 'NL'`).run();
  const insertRow = db.prepare(`INSERT INTO "Total Zones - Suggestion List" ("Country Code", "Postcode", "Region", "Airport") VALUES (?, ?, NULL, NULL)`);
  const insertMany = db.transaction((rs) => {
    for (const [postcode, place, province] of rs) {
      const combined = province ? `${postcode}, ${place}, ${province}` : `${postcode}, ${place}`;
      insertRow.run('NL', combined);
    }
  });
  insertMany(rows);
  console.log(`Total-Zones.db: inserted ${rows.length} NL rows.`);
  db.close();

  await prisma.postcodeSuggestion.deleteMany({ where: { countryCode: 'NL' } });
  const data = rows.map(([postcode, place, province]) => ({
    countryCode: 'NL',
    postcode,
    suburb: place,
    state: province,
    region: null,
    airport: null,
  }));
  const BATCH = 1000;
  for (let i = 0; i < data.length; i += BATCH) {
    await prisma.postcodeSuggestion.createMany({ data: data.slice(i, i + BATCH) });
  }
  console.log(`Production PostcodeSuggestion: inserted ${data.length} NL rows.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
