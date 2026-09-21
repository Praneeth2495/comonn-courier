/**
 * One-off targeted add of Sweden (SE) postcode suggestions — same approach
 * as Netherlands (see add-netherlands-postcodes.js): full postcode
 * granularity from GeoNames' free/CC-licensed dataset
 * (download.geonames.org/export/zip/SE.zip), not an official PostNord
 * product, so best-effort like the existing NZ gap.
 *
 * Sweden's postcodes are 5 digits, formatted in the source as "XXX XX"
 * (e.g. "624 66") — stripped of the space on import so they store/compare
 * the same plain-digit way as DE/MY/SG/ZA already do (customer types 5
 * digits, no space). Source file checked in at
 * data/se-postcodes-geonames.txt (tab-separated: country, postcode, place
 * name, county, ...).
 *
 * Usage: node scripts/add-sweden-postcodes.js
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { prisma } = require('../src/config/db');

function parseRows() {
  const filePath = path.join(__dirname, '../data/se-postcodes-geonames.txt');
  const lines = fs.readFileSync(filePath, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
  const rows = [];
  for (const line of lines) {
    const cols = line.split('\t');
    const postcode = cols[1]?.replace(/\s+/g, '').trim();
    const place = cols[2]?.trim();
    const county = cols[3]?.trim();
    if (!postcode || !place) continue;
    rows.push([postcode, place, county || null]);
  }
  return rows;
}

async function main() {
  const rows = parseRows();
  console.log(`Parsed ${rows.length} SE rows from source file.`);

  const dbPath = path.join(__dirname, '../data/Total-Zones.db');
  const db = new Database(dbPath);
  db.prepare(`DELETE FROM "Total Zones - Suggestion List" WHERE "Country Code" = 'SE'`).run();
  const insertRow = db.prepare(`INSERT INTO "Total Zones - Suggestion List" ("Country Code", "Postcode", "Region", "Airport") VALUES (?, ?, NULL, NULL)`);
  const insertMany = db.transaction((rs) => {
    for (const [postcode, place, county] of rs) {
      const combined = county ? `${postcode}, ${place}, ${county}` : `${postcode}, ${place}`;
      insertRow.run('SE', combined);
    }
  });
  insertMany(rows);
  console.log(`Total-Zones.db: inserted ${rows.length} SE rows.`);
  db.close();

  await prisma.postcodeSuggestion.deleteMany({ where: { countryCode: 'SE' } });
  const data = rows.map(([postcode, place, county]) => ({
    countryCode: 'SE',
    postcode,
    suburb: place,
    state: county,
    region: null,
    airport: null,
  }));
  const BATCH = 1000;
  for (let i = 0; i < data.length; i += BATCH) {
    await prisma.postcodeSuggestion.createMany({ data: data.slice(i, i + BATCH) });
  }
  console.log(`Production PostcodeSuggestion: inserted ${data.length} SE rows.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
