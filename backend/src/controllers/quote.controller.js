const { generateQuote } = require('../services/pricingEngine');
const { prisma } = require('../config/db');

/**
 * POST /api/quote
 * Public instant-quote endpoint. Does not require login or create an order.
 * Body: {
 *   serviceCode, originCountryCode, destinationCountryCode,
 *   actualWeightKg, lengthCm, widthCm, heightCm,
 *   quantity, declaredValue
 * }
 */
async function getInstantQuote(req, res, next) {
  try {
    const {
      serviceCode,
      originCountryCode = 'AU',
      destinationCountryCode,
      actualWeightKg,
      lengthCm,
      widthCm,
      heightCm,
      quantity,
      declaredValue,
    } = req.body;

    if (!destinationCountryCode || !actualWeightKg || !lengthCm || !widthCm || !heightCm) {
      return res.status(400).json({
        error:
          'destinationCountryCode, actualWeightKg, lengthCm, widthCm and heightCm are required',
      });
    }

    // If no service specified, quote every active service so the frontend
    // can render a comparison list (Express / Economy / etc).
    const services = serviceCode
      ? [{ code: serviceCode }]
      : await prisma.service.findMany({ where: { isActive: true }, select: { code: true } });

    const quotes = [];
    for (const s of services) {
      try {
        const quote = await generateQuote({
          serviceCode: s.code,
          originCountryCode,
          destinationCountryCode,
          actualWeightKg,
          lengthCm,
          widthCm,
          heightCm,
          quantity,
          declaredValue,
        });
        quotes.push(quote);
      } catch (innerErr) {
        // Skip services that don't have a rate card for this zone rather
        // than failing the whole comparison list.
        if (innerErr.code === 'RATE_CARD_NOT_FOUND') continue;
        throw innerErr;
      }
    }

    if (quotes.length === 0) {
      return res.status(422).json({ error: 'No service available for this destination/weight' });
    }

    res.json({ quotes });
  } catch (err) {
    next(err);
  }
}

/** GET /api/quote/countries — for the destination dropdown, grouped by zone */
async function listCountries(req, res, next) {
  try {
    const countries = await prisma.countryZone.findMany({
      include: { zone: { select: { code: true, name: true } } },
      orderBy: { countryName: 'asc' },
    });
    res.json({ countries });
  } catch (err) {
    next(err);
  }
}

/** GET /api/quote/services */
async function listServices(req, res, next) {
  try {
    const services = await prisma.service.findMany({ where: { isActive: true } });
    res.json({ services });
  } catch (err) {
    next(err);
  }
}

module.exports = { getInstantQuote, listCountries, listServices };
