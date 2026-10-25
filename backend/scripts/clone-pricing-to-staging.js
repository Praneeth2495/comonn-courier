/**
 * One-off: clones Zone / CountryZone / Service / RateCard / Surcharge from
 * production into a target staging database, mapped by natural keys (Zone
 * .code, Service.code) rather than raw ids, since those differ across
 * databases. Needed because import-postcode-data.js only covers
 * PostcodeSuggestion/PostcodeZone (postcode-level data), not pricing — a
 * fresh seed.js run alone has no real rate cards, so /api/quote returns
 * "No service available" for every destination until this runs.
 *
 * Usage: PROD_DATABASE_URL=... STAGING_DATABASE_URL=... node scripts/clone-pricing-to-staging.js
 */
const { PrismaClient } = require('@prisma/client');

const prod = new PrismaClient({ datasources: { db: { url: process.env.PROD_DATABASE_URL } } });
const staging = new PrismaClient({ datasources: { db: { url: process.env.STAGING_DATABASE_URL } } });

async function main() {
  const [zones, countryZones, services, rateCards, surcharges] = await Promise.all([
    prod.zone.findMany(),
    prod.countryZone.findMany(),
    prod.service.findMany(),
    prod.rateCard.findMany(),
    prod.surcharge.findMany(),
  ]);

  const zoneIdByCode = {};
  for (const z of zones) {
    const existing = await staging.zone.findUnique({ where: { code: z.code } });
    const row = existing
      ? await staging.zone.update({ where: { code: z.code }, data: { name: z.name, kind: z.kind } })
      : await staging.zone.create({ data: { code: z.code, name: z.name, kind: z.kind } });
    zoneIdByCode[z.code] = row.id;
  }
  console.log(`Zones: ${zones.length} synced`);

  for (const cz of countryZones) {
    const prodZone = zones.find((z) => z.id === cz.zoneId);
    if (!prodZone) continue;
    await staging.countryZone.upsert({
      where: { countryCode: cz.countryCode },
      update: { countryName: cz.countryName, zoneId: zoneIdByCode[prodZone.code] },
      create: { countryCode: cz.countryCode, countryName: cz.countryName, zoneId: zoneIdByCode[prodZone.code] },
    });
  }
  console.log(`CountryZones: ${countryZones.length} synced`);

  const serviceIdByCode = {};
  for (const s of services) {
    const row = await staging.service.upsert({
      where: { code: s.code },
      update: {
        name: s.name, description: s.description, transitDaysMin: s.transitDaysMin,
        transitDaysMax: s.transitDaysMax, volumetricDivisor: s.volumetricDivisor, isActive: s.isActive,
      },
      create: {
        code: s.code, name: s.name, description: s.description, transitDaysMin: s.transitDaysMin,
        transitDaysMax: s.transitDaysMax, volumetricDivisor: s.volumetricDivisor, isActive: s.isActive,
      },
    });
    serviceIdByCode[s.code] = row.id;
  }
  console.log(`Services: ${services.length} synced`);

  // RateCards have no natural unique key of their own — clear and
  // recreate wholesale each run rather than trying to diff/upsert.
  await staging.rateCard.deleteMany({});
  let rcCount = 0;
  for (const rc of rateCards) {
    const service = services.find((s) => s.id === rc.serviceId);
    const zone = zones.find((z) => z.id === rc.zoneId);
    const fromZone = rc.fromZoneId ? zones.find((z) => z.id === rc.fromZoneId) : null;
    if (!service || !zone) continue;
    await staging.rateCard.create({
      data: {
        serviceId: serviceIdByCode[service.code],
        zoneId: zoneIdByCode[zone.code],
        fromZoneId: fromZone ? zoneIdByCode[fromZone.code] : null,
        weightFromKg: rc.weightFromKg,
        weightToKg: rc.weightToKg,
        basePrice: rc.basePrice,
        perKgOverage: rc.perKgOverage,
        currency: rc.currency,
        transitDaysMin: rc.transitDaysMin,
        transitDaysMax: rc.transitDaysMax,
      },
    });
    rcCount += 1;
  }
  console.log(`RateCards: ${rcCount} synced`);

  for (const su of surcharges) {
    const appliesService = su.appliesToServiceId ? services.find((s) => s.id === su.appliesToServiceId) : null;
    await staging.surcharge.upsert({
      where: { code: su.code },
      update: {
        name: su.name, type: su.type, value: su.value, isActive: su.isActive,
        appliesToServiceId: appliesService ? serviceIdByCode[appliesService.code] : null,
      },
      create: {
        code: su.code, name: su.name, type: su.type, value: su.value, isActive: su.isActive,
        appliesToServiceId: appliesService ? serviceIdByCode[appliesService.code] : null,
      },
    });
  }
  console.log(`Surcharges: ${surcharges.length} synced`);

  await prod.$disconnect();
  await staging.$disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
