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
  // Dimensions are optional — if any is missing, skip the volumetric
  // calculation entirely so chargeable weight falls back to actual weight.
  if (!lengthCm || !widthCm || !heightCm) return 0;
  const volumeCm3 = Number(lengthCm) * Number(widthCm) * Number(heightCm);
  // Rounded up to the next whole kg (e.g. 23.4kg -> 24kg), matching standard
  // courier practice of billing volumetric weight in whole-kg increments.
  return Math.ceil(volumeCm3 / divisor);
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
 * Resolve a pickup (origin) postcode to its origin Zone id, e.g.
 * "India-urban" — used to optionally narrow RateCard selection by
 * fromZoneId. Returns null if the postcode isn't known (or wasn't
 * supplied yet, e.g. at the instant-quote-preview stage before the sender
 * address is entered) — callers then fall back to the zone-agnostic
 * (fromZoneId: null) rate brackets, i.e. today's default behavior.
 */
async function resolveFromZoneForPostcode(countryCode, postcode) {
  if (!countryCode || !postcode) return null;
  const mapping = await prisma.postcodeZone.findUnique({
    where: { countryCode_postcode: { countryCode: countryCode.toUpperCase(), postcode: String(postcode).trim() } },
  });
  return mapping ? mapping.zoneId : null;
}

/**
 * Find the correct rate bracket for a given service/zone/chargeable weight.
 * Brackets may be contiguous ranges (old-style, e.g. 0-0.5, 0.5-1, 1-2.5...)
 * or single-point brackets used for linear per-kg pricing (e.g. 1-1, 5-5,
 * 10-10...). If the weight doesn't land exactly inside any bracket — either
 * because it's above every bracket, or in a gap between two single-point
 * brackets — we extrapolate from the nearest bracket *below* it using that
 * bracket's perKgOverage rate, not just whichever bracket happens to be
 * first or last.
 *
 * If fromZoneId resolves to an origin zone (see resolveFromZoneForPostcode)
 * and brackets exist scoped to it, those are preferred; otherwise falls
 * back to the zone-agnostic brackets (fromZoneId: null) that every
 * pre-existing rate card already uses — so nothing changes in price until
 * an admin actually adds origin-specific brackets.
 */
async function findRateBracket({ serviceId, zoneId, fromZoneId, chargeableWeightKg }) {
  function selectFrom(brackets) {
    if (brackets.length === 0) return null;
    const exact = brackets.find(
      (b) => chargeableWeightKg >= Number(b.weightFromKg) && chargeableWeightKg <= Number(b.weightToKg)
    );
    if (exact) return { bracket: exact, extrapolated: false };

    // no exact match -> extrapolate from the nearest bracket whose ceiling
    // is still below the requested weight (covers both "heavier than every
    // bracket" and "falls in a gap between two brackets")
    let nearestLower = null;
    for (const b of brackets) {
      if (Number(b.weightToKg) <= chargeableWeightKg) {
        if (!nearestLower || Number(b.weightToKg) > Number(nearestLower.weightToKg)) nearestLower = b;
      }
    }
    if (nearestLower) return { bracket: nearestLower, extrapolated: true };

    // lighter than every bracket's floor -> fall back to the lowest bracket
    return { bracket: brackets[0], extrapolated: false };
  }

  const allBrackets = await prisma.rateCard.findMany({
    where: { serviceId, zoneId, isActive: true },
    orderBy: { weightFromKg: 'asc' },
  });

  if (fromZoneId) {
    const specific = selectFrom(allBrackets.filter((b) => b.fromZoneId === fromZoneId));
    if (specific) return specific;
  }

  const wildcard = selectFrom(allBrackets.filter((b) => b.fromZoneId === null));
  if (!wildcard) {
    const err = new Error('No rate card configured for this service/zone');
    err.status = 422;
    err.code = 'RATE_CARD_NOT_FOUND';
    throw err;
  }
  return wildcard;
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
 * Prices one OrderItem line (per-unit dims/weight * quantity).
 * Returns per-unit volumetric/chargeable plus this line's totals.
 */
function priceItem(item, divisor) {
  const { itemType = 'Box', actualWeightKg, lengthCm, widthCm, heightCm, quantity = 1 } = item;
  const volumetricWeightKg = calcVolumetricWeightKg({ lengthCm, widthCm, heightCm, divisor });
  const chargeableWeightKgPerUnit = calcChargeableWeightKg({ actualWeightKg, volumetricWeightKg });
  return {
    itemType,
    actualWeightKg: Number(actualWeightKg),
    lengthCm: lengthCm ? Number(lengthCm) : 0,
    widthCm: widthCm ? Number(widthCm) : 0,
    heightCm: heightCm ? Number(heightCm) : 0,
    quantity: Number(quantity),
    volumetricWeightKg: round2(volumetricWeightKg),
    chargeableWeightKg: round2(chargeableWeightKgPerUnit * Number(quantity)),
    actualWeightKgTotal: round2(Number(actualWeightKg) * Number(quantity)),
    volumetricWeightKgTotal: round2(volumetricWeightKg * Number(quantity)),
  };
}

/**
 * Main entry point: produce a full, itemised quote for a (possibly
 * multi-item) shipment. Each item in `items` is priced individually
 * (chargeable weight = max(actual, volumetric) per unit * quantity), then
 * summed into a single total chargeable weight for the whole shipment,
 * which is what determines the rate bracket — matching how couriers
 * actually bill multi-package shipments as one consignment.
 *
 * @param {Object} input
 * @param {string} input.serviceCode  e.g. "EXPRESS"
 * @param {string} input.destinationCountryCode
 * @param {Array<{itemType?:string, actualWeightKg:number, lengthCm:number, widthCm:number, heightCm:number, quantity?:number}>} input.items
 * @param {number} [input.declaredValue=0]
 * @param {number} [input.taxRate=0] fractional, e.g. 0.10 for 10% GST
 * @param {string} [input.originCountryCode]  sender's country, e.g. "IN" —
 *   only known once the Details step is filled in, not at the initial
 *   instant-quote-preview stage
 * @param {string} [input.originPostcode]  sender's pickup postcode
 */
async function generateQuote(input) {
  const {
    serviceCode,
    destinationCountryCode,
    items,
    declaredValue = 0,
    taxRate = 0,
    originCountryCode,
    originPostcode,
  } = input;

  if (!Array.isArray(items) || items.length === 0) {
    const err = new Error('At least one item is required');
    err.status = 400;
    err.code = 'ITEMS_REQUIRED';
    throw err;
  }

  const service = await prisma.service.findUnique({ where: { code: serviceCode } });
  if (!service || !service.isActive) {
    const err = new Error(`Unknown or inactive service "${serviceCode}"`);
    err.status = 422;
    err.code = 'SERVICE_NOT_FOUND';
    throw err;
  }

  const zone = await resolveZoneForCountry(destinationCountryCode);

  const pricedItems = items.map((it) => priceItem(it, service.volumetricDivisor));

  const actualWeightKg = round2(pricedItems.reduce((sum, it) => sum + it.actualWeightKgTotal, 0));
  const volumetricWeightKg = round2(pricedItems.reduce((sum, it) => sum + it.volumetricWeightKgTotal, 0));
  const chargeableWeightKg = round2(pricedItems.reduce((sum, it) => sum + it.chargeableWeightKg, 0));

  const fromZoneId = await resolveFromZoneForPostcode(originCountryCode, originPostcode);
  const { bracket, extrapolated } = await findRateBracket({
    serviceId: service.id,
    zoneId: zone.id,
    fromZoneId,
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

  // A bracket can override the service's default delivery timeframe (e.g.
  // a rural-origin bracket taking longer than the service's usual window).
  const transitDaysMin = bracket.transitDaysMin ?? service.transitDaysMin;
  const transitDaysMax = bracket.transitDaysMax ?? service.transitDaysMax;

  return {
    service: { code: service.code, name: service.name, transitDays: `${transitDaysMin}-${transitDaysMax}` },
    zone: { code: zone.code, name: zone.name },
    items: pricedItems.map(({ actualWeightKgTotal, volumetricWeightKgTotal, ...rest }) => rest),
    weight: {
      actualWeightKg,
      volumetricWeightKg,
      chargeableWeightKg,
      divisorUsed: service.volumetricDivisor,
    },
    pricing: {
      baseFreight,
      unitPrice: round2(baseFreight / chargeableWeightKg),
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

/**
 * Recomputes an order's addonsTotal/discountTotal/taxTotal/grandTotal from
 * its current baseFreight/surchargesTotal (fixed at booking time), its live
 * OrderAddon rows, and its applied promo code (if any). Called whenever
 * add-ons or a promo code change on the Payment page, before the order is
 * paid.
 */
async function recomputeOrderTotals(orderId) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { addons: true } });
  if (!order) {
    const err = new Error('Order not found');
    err.status = 404;
    throw err;
  }

  const addonsTotal = round2(order.addons.reduce((sum, a) => sum + Number(a.amount), 0));
  const subtotal = Number(order.baseFreight) + Number(order.surchargesTotal) + addonsTotal;

  let discountTotal = 0;
  if (order.promoCode) {
    const promo = await prisma.promoCode.findUnique({ where: { code: order.promoCode } });
    if (promo && promo.isActive) {
      discountTotal = promo.type === 'PERCENT' ? subtotal * Number(promo.value) : Number(promo.value);
      discountTotal = Math.min(round2(discountTotal), subtotal);
    }
  }

  const taxable = subtotal - discountTotal;
  const taxTotal = round2(taxable * Number(order.taxRate));
  const grandTotal = round2(taxable + taxTotal);

  return prisma.order.update({
    where: { id: orderId },
    data: { addonsTotal, discountTotal: round2(discountTotal), taxTotal, grandTotal },
    include: { addons: true, items: true, service: true, senderAddress: true, receiverAddress: true },
  });
}

module.exports = {
  round2,
  calcVolumetricWeightKg,
  calcChargeableWeightKg,
  resolveZoneForCountry,
  resolveFromZoneForPostcode,
  findRateBracket,
  applySurcharges,
  generateQuote,
  recomputeOrderTotals,
};
