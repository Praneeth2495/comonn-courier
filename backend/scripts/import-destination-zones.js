/**
 * Re-syncs PostcodeZone from the "Total Zones - Zones" table in
 * backend/data/Total-Zones.db, without touching PostcodeSuggestion (which is
 * a separate, much larger, ~2.96M row import — see import-postcode-data.js).
 * Safe to re-run any time the Zones sheet gains a new country or postcode:
 * existing countries are rebuilt from the same source data they were
 * imported from last time, so nothing changes for them unless the source
 * file did.
 *
 * Usage: node scripts/import-destination-zones.js
 */
const path = require('path');
const Database = require('better-sqlite3');
const { prisma } = require('../src/config/db');
const { importZones } = require('./import-postcode-data');

async function main() {
  const filePath = path.join(__dirname, '../data/Total-Zones.db');
  const db = new Database(filePath, { readonly: true });
  await importZones(db);
  db.close();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
