/**
 * Pricing Engine
 * ---------------------------------------------------------------
 * International courier pricing = f(zone, chargeable weight, service)
 *
 *  1. ZONE     -> destination country is mapped to a Zone via CountryZone
 *  2. WEIGHT   -> chargeable weight = max(actual weight, volumetric weight)
 *                 volumetric weight = (L x W x H in cm) / volumetricDivisor
 *  3. RATE     -> look up the RateCard bracket for (service, zone, chargeableWeight)
 *                 - if weight <= bracket ceiling: use bracket basePrice
 *                 - if weight exceeds every bracket: use the highest bracket's
 *                   basePrice + perKgOverage * (weight - that bracket's ceiling)
 *  4. SURCHARGE-> flat or percentage fees layered on top (fuel, remote area...)
 *  5. TAX      -> GST/VAT if applicable (domestic leg only, configurable)
 * ---------------------------------------------------------------
 */
const { prisma } = require('../config/db');

/** Round to 2 decimal places safely for currency math */
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Compute volumetric weight (kg) from cm dimensions and a divisor.
 * Standard international air-freight divisor is 5000 (cm3/kg);
 * some carriers use 4000 for domestic/road.
 */
function calcVolumetricWeightKg({ lengthCm, widthCm, heightCm, divisor = 5000 }) {
  const volumeCm3 = Number(lengthCm) * Number(widthCm) * Number(heightCm);
  return volumeCm3 / divisor;
}

function calcChargeableWeightKg({ actualWeightKg, volumetricWeightKg }) {
  return Math.max(Number(actualWeightKg), Number(volumetricWeightKg));
}

/** Resolve a destination country code to its pricing Zone */
async function resolveZoneForCountry(countryCode) {
  const mapping = await prisma.countryZone.findUnique({
    where: { countryCode: countryCode.toUpperCase() },
    include: { zone: true },
  });
  if (!mapping) {
    const err = new Error(`No pricing zone configured for country "${countryCode}"`);
    err.status = 422;
    err.code = 'ZONE_NOT_FOUND';
    throw err;
  }
  return mapping.zone;
}

/**
 * Find the correct rate bracket for a given service/zone/chargeable weight.
 * Brackets are contiguous, non-overlapping [weightFromKg, weightToKg] ranges.
 * If the weight is heavier than the top bracket, we extrapolate using that
 * bracket's perKgOverage rate.
 */
async function findRateBracket({ serviceId, zoneId, chargeableWeightKg }) {
  const brackets = await prisma.rateCard.findMany({
    where: { serviceId, zoneId, isActive: true },
    orderBy: { weightFromKg: 'asc' },
  });

  if (brackets.length === 0) {
    const err = new Error('No rate card configured for this service/zone');
    err.status = 422;
    err.code = 'RATE_CARD_NOT_FOUND';
    throw err;
  }

  const exact = brackets.find(
    (b) => chargeableWeightKg >= Number(b.weightFromKg) && chargeableWeightKg <= Number(b.weightToKg)
  );
  if (exact) return { bracket: exact, extrapolated: false };

  // heavier than every defined bracket -> extrapolate off the top bracket
  const top = brackets[brackets.length - 1];
  if (chargeableWeightKg > Number(top.weightToKg)) {
    return { bracket: top, extrapolated: true };
  }

  // lighter than the smallest bracket floor (shouldn't normally happen since
  // brackets should start at 0) -> fall back to the lowest bracket
  return { bracket: brackets[0], extrapolated: false };
}

/** Apply active surcharges for a service. Returns { total, items[] } */
async function applySurcharges({ serviceId, baseFreight }) {
  const surcharges = await prisma.surcharge.findMany({
    where: {
      isActive: true,
      OR: [{ appliesToServiceId: serviceId }, { appliesToServiceId: null }],
    },
  });

  let total = 0;
  const items = surcharges.map((s) => {
    const amount =
      s.type === 'PERCENT' ? round2(baseFreight * Number(s.value)) : round2(Number(s.value));
    total += amount;
    return { code: s.code, name: s.name, type: s.type, amount };
  });

  return { total: round2(total), items };
}

/**
 * Main entry point: produce a full, itemised quote.
 * @param {Object} input
 * @param {string} input.serviceCode  e.g. "EXPRESS"
 * @param {string} input.originCountryCode
 * @param {string} input.destinationCountryCode
 * @param {number} input.actualWeightKg
 * @param {number} input.lengthCm
 * @param {number} input.widthCm
 * @param {number} input.heightCm
 * @param {number} [input.quantity=1]
 * @param {number} [input.declaredValue=0]
 * @param {number} [input.taxRate=0] fractional, e.g. 0.10 for 10% GST
 */
async function generateQuote(input) {
  const {
    serviceCode,
    destinationCountryCode,
    actualWeightKg,
    lengthCm,
    widthCm,
    heightCm,
    quantity = 1,
    declaredValue = 0,
    taxRate = 0,
  } = input;

  const service = await prisma.service.findUnique({ where: { code: serviceCode } });
  if (!service || !service.isActive) {
    const err = new Error(`Unknown or inactive service "${serviceCode}"`);
    err.status = 422;
    err.code = 'SERVICE_NOT_FOUND';
    throw err;
  }

  const zone = await resolveZoneForCountry(destinationCountryCode);

  const volumetricWeightKg = calcVolumetricWeightKg({
    lengthCm,
    widthCm,
    heightCm,
    divisor: service.volumetricDivisor,
  });
  const chargeableWeightKgSingle = calcChargeableWeightKg({ actualWeightKg, volumetricWeightKg });
  const chargeableWeightKg = round2(chargeableWeightKgSingle * quantity);

  const { bracket, extrapolated } = await findRateBracket({
    serviceId: service.id,
    zoneId: zone.id,
    chargeableWeightKg,
  });

  let baseFreight;
  if (extrapolated) {
    const overageKg = chargeableWeightKg - Number(bracket.weightToKg);
    baseFreight = round2(Number(bracket.basePrice) + overageKg * Number(bracket.perKgOverage));
  } else {
    baseFreight = Number(bracket.basePrice);
  }

  const { total: surchargesTotal, items: surchargeItems } = await applySurcharges({
    serviceId: service.id,
    baseFreight,
  });

  const taxTotal = round2((baseFreight + surchargesTotal) * taxRate);
  const grandTotal = round2(baseFreight + surchargesTotal + taxTotal);

  return {
    service: { code: service.code, name: service.name, transitDays: `${service.transitDaysMin}-${service.transitDaysMax}` },
    zone: { code: zone.code, name: zone.name },
    weight: {
      actualWeightKg: Number(actualWeightKg),
      volumetricWeightKg: round2(volumetricWeightKg),
      chargeableWeightKg,
      divisorUsed: service.volumetricDivisor,
    },
    pricing: {
      baseFreight,
      surcharges: surchargeItems,
      surchargesTotal,
      taxRate,
      taxTotal,
      grandTotal,
      currency: bracket.currency,
    },
    declaredValue,
    rateBracketId: bracket.id,
    extrapolatedBeyondTopBracket: extrapolated,
  };
}

module.exports = {
  round2,
  calcVolumetricWeightKg,
  calcChargeableWeightKg,
  resolveZoneForCountry,
  findRateBracket,
  applySurcharges,
  generateQuote,
};
