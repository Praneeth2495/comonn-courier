const { prisma } = require('../config/db');

// Each real India region (PostcodeSuggestion.region — a district, e.g.
// "Krishna", "Hyderabad") has its own real Hub record with the exact same
// name (see the Hub-per-region migration note in admin.controller.js) — a
// branch/hub key is just that region name, resolved from an order's
// sender postcode. Shared between admin.controller.js (Accounts Overview's
// branch filter/cost split, Revenue-by-hub) and manifest.controller.js
// (the Build Manifest table's Hub column) rather than defined twice.

// Fetched once per request (not per order) — every caller needs this same
// postcode -> region map to resolve any number of addresses.
async function loadRegionPostcodeMap() {
  const rows = await prisma.postcodeSuggestion.findMany({
    where: { countryCode: 'IN', region: { not: null } },
    select: { postcode: true, region: true },
  });
  return new Map(rows.map((r) => [r.postcode, r.region]));
}

// The branch/hub a single address resolves to, given a map already loaded
// via loadRegionPostcodeMap above.
function branchOfAddress(addr, regionMap) {
  if (!addr) return null;
  return regionMap.get(addr.postcode) || null;
}

module.exports = { loadRegionPostcodeMap, branchOfAddress };
