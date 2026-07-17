/**
 * Seed script — loads example zones/countries/services/rate cards so the
 * app is immediately testable. Replace the ZONES / RATE_CARDS / SURCHARGES
 * arrays below with your real data (or write a CSV importer that maps to
 * the same shape) once you have your final rate tables.
 *
 * Run: npm run seed
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

// ---------------------------------------------------------------
// EXAMPLE data — origin assumed India. Replace with your real
// zone map and rate cards.
// ---------------------------------------------------------------
const ZONES = [
  { code: 'ZONE_A', name: 'Zone A — New Zealand & Pacific', countries: [
    ['NZ', 'New Zealand'], ['FJ', 'Fiji'], ['PG', 'Papua New Guinea'],
  ]},
  { code: 'ZONE_B', name: 'Zone B — Asia', countries: [
    ['SG', 'Singapore'], ['MY', 'Malaysia'], ['HK', 'Hong Kong'], ['JP', 'Japan'],
    ['CN', 'China'], ['IN', 'India'], ['TH', 'Thailand'], ['PH', 'Philippines'], ['ID', 'Indonesia'],
  ]},
  { code: 'ZONE_C', name: 'Zone C — North America', countries: [
    ['US', 'United States'], ['CA', 'Canada'],
  ]},
  { code: 'ZONE_D', name: 'Zone D — Europe & UK', countries: [
    ['GB', 'United Kingdom'], ['DE', 'Germany'], ['FR', 'France'], ['IT', 'Italy'],
    ['ES', 'Spain'], ['NL', 'Netherlands'], ['IE', 'Ireland'],
  ]},
  { code: 'ZONE_E', name: 'Zone E — Rest of World', countries: [
    ['ZA', 'South Africa'], ['BR', 'Brazil'], ['AE', 'United Arab Emirates'], ['SA', 'Saudi Arabia'],
  ]},
];

const SERVICES = [
  { code: 'EXPRESS', name: 'Express Worldwide', description: 'Fastest door-to-door international express', transitDaysMin: 2, transitDaysMax: 4, volumetricDivisor: 5000 },
  { code: 'ECONOMY', name: 'Economy International', description: 'Cost-effective international delivery', transitDaysMin: 6, transitDaysMax: 12, volumetricDivisor: 5000 },
  { code: 'DOCUMENTS', name: 'Document Express', description: 'For envelopes and paperwork under 0.5kg', transitDaysMin: 2, transitDaysMax: 5, volumetricDivisor: 5000 },
];

// Example weight-break pricing (INR). basePrice = price for the whole
// bracket; perKgOverage = ₹/kg once weight exceeds the TOP bracket.
// !! Replace with your real published rate card. !!
function bracketsFor(zoneMultiplier) {
  const base = [
    { from: 0, to: 0.5, price: 1000 },
    { from: 0.5, to: 1, price: 1350 },
    { from: 1, to: 2.5, price: 1900 },
    { from: 2.5, to: 5, price: 2900 },
    { from: 5, to: 10, price: 4350 },
    { from: 10, to: 20, price: 7150 },
    { from: 20, to: 30, price: 9950 },
  ];
  return base.map((b) => ({
    weightFromKg: b.from,
    weightToKg: b.to,
    basePrice: Math.round(b.price * zoneMultiplier * 100) / 100,
    perKgOverage: Math.round(zoneMultiplier * 530 * 100) / 100,
  }));
}

const ZONE_MULTIPLIER = { ZONE_A: 1, ZONE_B: 1.3, ZONE_C: 1.6, ZONE_D: 1.7, ZONE_E: 2.0 };
const SERVICE_MULTIPLIER = { EXPRESS: 1, ECONOMY: 0.7, DOCUMENTS: 0.55 };

const SURCHARGES = [
  { code: 'FUEL', name: 'Fuel surcharge', type: 'PERCENT', value: 0.145, appliesToServiceId: null },
  { code: 'REMOTE_AREA', name: 'Remote area delivery fee', type: 'FLAT', value: 700, appliesToServiceId: null },
];

async function main() {
  console.log('Seeding...');

  // Admin user
  const adminPasswordHash = await bcrypt.hash('ChangeMe123!', 12);
  await prisma.user.upsert({
    where: { email: 'admin@comonn.com' },
    update: {},
    create: {
      email: 'admin@comonn.com',
      passwordHash: adminPasswordHash,
      fullName: 'Comonn Admin',
      role: 'ADMIN',
    },
  });

  // Zones + countries
  const zoneIdByCode = {};
  for (const z of ZONES) {
    const zone = await prisma.zone.upsert({
      where: { code: z.code },
      update: { name: z.name },
      create: { code: z.code, name: z.name },
    });
    zoneIdByCode[z.code] = zone.id;
    for (const [countryCode, countryName] of z.countries) {
      await prisma.countryZone.upsert({
        where: { countryCode },
        update: { countryName, zoneId: zone.id },
        create: { countryCode, countryName, zoneId: zone.id },
      });
    }
  }

  // Services
  const serviceIdByCode = {};
  for (const s of SERVICES) {
    const service = await prisma.service.upsert({
      where: { code: s.code },
      update: s,
      create: s,
    });
    serviceIdByCode[s.code] = service.id;
  }

  // Rate cards: every service x every zone
  for (const serviceCode of Object.keys(serviceIdByCode)) {
    for (const zoneCode of Object.keys(zoneIdByCode)) {
      const multiplier = ZONE_MULTIPLIER[zoneCode] * SERVICE_MULTIPLIER[serviceCode];
      const brackets = bracketsFor(multiplier);
      for (const b of brackets) {
        await prisma.rateCard.create({
          data: {
            serviceId: serviceIdByCode[serviceCode],
            zoneId: zoneIdByCode[zoneCode],
            weightFromKg: b.weightFromKg,
            weightToKg: b.weightToKg,
            basePrice: b.basePrice,
            perKgOverage: b.perKgOverage,
            currency: 'INR',
          },
        });
      }
    }
  }

  // Surcharges
  for (const s of SURCHARGES) {
    await prisma.surcharge.upsert({
      where: { code: s.code },
      update: s,
      create: s,
    });
  }

  console.log('Seed complete. Admin login: admin@comonn.com / ChangeMe123!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
