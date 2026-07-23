const { generateQuote } = require('../services/pricingEngine');
const { sendEmail } = require('../services/emailService');
const { prisma } = require('../config/db');

function renderQuoteEmailHtml(quote) {
  const itemRows = quote.items
    .map(
      (it) =>
        `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee;">${it.itemType} x${it.quantity}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;">${it.lengthCm && it.widthCm && it.heightCm ? `${it.lengthCm}×${it.widthCm}×${it.heightCm} cm` : '—'}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;">${it.actualWeightKg} kg each</td></tr>`
    )
    .join('');

  return `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#171C2C;">
      <h2 style="color:#0E1B3D;">Your Comonn quote</h2>
      <p style="color:#5B6478;">${quote.service.name} to ${quote.zone.name}</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13.5px;">
        <thead><tr style="text-align:left;color:#8A93A6;font-size:11.5px;text-transform:uppercase;">
          <th style="padding:6px 10px;">Item</th><th style="padding:6px 10px;">Dimensions</th><th style="padding:6px 10px;">Weight</th>
        </tr></thead>
        <tbody>${itemRows}</tbody>
      </table>
      <p style="font-size:13.5px;color:#5B6478;">Chargeable weight: <b>${quote.weight.chargeableWeightKg} kg</b></p>
      <p style="font-size:24px;font-weight:700;color:#0E1B3D;margin-top:20px;">₹${quote.pricing.grandTotal.toFixed(2)} ${quote.pricing.currency}</p>
      <p style="font-size:12px;color:#8A93A6;">This quote is valid for a limited time and may vary based on final parcel weight/dimensions at pickup.</p>
    </div>
  `;
}

/**
 * POST /api/quote
 * Public instant-quote endpoint. Does not require login or create an order.
 * Body: {
 *   serviceCode, destinationCountryCode,
 *   items: [{ itemType, actualWeightKg, lengthCm, widthCm, heightCm, quantity }],
 *   declaredValue
 * }
 */
async function getInstantQuote(req, res, next) {
  try {
    const { serviceCode, destinationCountryCode, items, declaredValue, originPostcode } = req.body;

    if (!destinationCountryCode || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        error: 'destinationCountryCode and at least one item are required',
      });
    }
    // Dimensions are optional — if omitted, pricing falls back to actual
    // weight (chargeable weight = max(actual, volumetric), volumetric = 0).
    for (const [i, item] of items.entries()) {
      if (!item.actualWeightKg) return res.status(400).json({ error: `items[${i}].actualWeightKg is required` });
    }

    // If no service specified, quote every active service so the frontend
    // can render a comparison list. Service has no natural sort column, so
    // order explicitly (Express first, then Economy, then anything else).
    const SERVICE_ORDER = ['EXPRESS', 'ECONOMY'];
    let services;
    if (serviceCode) {
      services = [{ code: serviceCode }];
    } else {
      services = await prisma.service.findMany({ where: { isActive: true }, select: { code: true } });
      services.sort((a, b) => {
        const ai = SERVICE_ORDER.indexOf(a.code);
        const bi = SERVICE_ORDER.indexOf(b.code);
        return (ai === -1 ? SERVICE_ORDER.length : ai) - (bi === -1 ? SERVICE_ORDER.length : bi);
      });
    }

    const quotes = [];
    for (const s of services) {
      try {
        const quote = await generateQuote({
          serviceCode: s.code,
          destinationCountryCode,
          items,
          declaredValue,
          originCountryCode: originPostcode ? 'IN' : undefined,
          originPostcode,
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

/**
 * GET /api/quote/postcode-suggestions?postcode=532001 — India-only for now.
 * One postcode can map to several suburbs (different post offices sharing
 * the same PIN), so this returns every match for the customer to pick from.
 */
async function postcodeSuggestions(req, res, next) {
  try {
    const postcode = (req.query.postcode || '').trim();
    if (postcode.length !== 6 || !/^\d{6}$/.test(postcode)) {
      return res.json({ suggestions: [] });
    }
    const suggestions = await prisma.postcodeSuggestion.findMany({
      where: { countryCode: 'IN', postcode },
      select: { suburb: true, state: true },
      orderBy: { suburb: 'asc' },
    });
    res.json({ suggestions });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/quote/email
 * Re-prices server-side (never trust a client-cached quote for the emailed
 * numbers) and sends the quote to the given address via Resend.
 */
async function emailQuote(req, res, next) {
  try {
    const { email, serviceCode, destinationCountryCode, items, declaredValue, originPostcode } = req.body;

    if (!email || !serviceCode || !destinationCountryCode || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'email, serviceCode, destinationCountryCode and items are required' });
    }

    const quote = await generateQuote({
      serviceCode,
      destinationCountryCode,
      items,
      declaredValue,
      originCountryCode: originPostcode ? 'IN' : undefined,
      originPostcode,
    });

    await sendEmail({
      to: email,
      subject: `Your Comonn quote — ${quote.service.name} to ${quote.zone.name}`,
      html: renderQuoteEmailHtml(quote),
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { getInstantQuote, listCountries, listServices, postcodeSuggestions, emailQuote };
