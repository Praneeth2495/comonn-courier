const { generateQuote } = require('../services/pricingEngine');
const { sendEmail } = require('../services/emailService');
const { prisma } = require('../config/db');

// Mirrors the Book page's Instant Booking box + "Choose a service" row so
// the email reads like a snapshot of what the customer saw on screen.
function renderQuoteEmailHtml(quote, { originText, resumeUrl }) {
  const itemRows = quote.items
    .map(
      (it) =>
        `<tr><td style="padding:6px 10px;border-bottom:1px solid #EDEAE2;font-size:13px;">${it.itemType} x${it.quantity}</td><td style="padding:6px 10px;border-bottom:1px solid #EDEAE2;font-size:13px;">${it.lengthCm && it.widthCm && it.heightCm ? `${it.lengthCm}×${it.widthCm}×${it.heightCm} cm` : '—'}</td><td style="padding:6px 10px;border-bottom:1px solid #EDEAE2;font-size:13px;">${it.actualWeightKg} kg each</td></tr>`
    )
    .join('');

  return `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#171C2C;background:#F7F5F0;padding:22px;">
      <div style="background:#fff;border-radius:14px;padding:22px;border:1px solid #E7E3DA;">
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
          <tr>
            <td style="font-size:17px;font-weight:700;color:#171C2C;">Instant Booking</td>
            <td style="text-align:right;">
              <span style="background:#EAF0FF;color:#2451FF;font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px;">Get a quote in 4 clicks</span>
            </td>
          </tr>
        </table>
        <table style="width:100%;border-collapse:collapse;margin-bottom:14px;">
          <tr>
            <td style="width:50%;vertical-align:top;padding-right:10px;">
              <div style="font-size:11px;color:#8A93A6;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px;">Origin</div>
              <div style="font-size:14px;font-weight:600;">${originText || 'India'}</div>
            </td>
            <td style="width:50%;vertical-align:top;">
              <div style="font-size:11px;color:#8A93A6;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px;">Destination</div>
              <div style="font-size:14px;font-weight:600;">${quote.zone.name}</div>
            </td>
          </tr>
        </table>
        <table style="width:100%;border-collapse:collapse;border-top:1px dashed #E7E3DA;padding-top:10px;">
          <thead><tr style="text-align:left;color:#8A93A6;font-size:11px;text-transform:uppercase;">
            <th style="padding:8px 10px 6px;">Item</th><th style="padding:8px 10px 6px;">Dimensions</th><th style="padding:8px 10px 6px;">Weight</th>
          </tr></thead>
          <tbody>${itemRows}</tbody>
        </table>
      </div>

      <div style="background:#fff;border-radius:14px;padding:20px 22px;margin-top:16px;border:1px solid #E7E3DA;">
        <h3 style="margin:0 0 14px;font-size:15px;color:#171C2C;">Choose a service</h3>
        <table style="width:100%;border-collapse:collapse;border:1.5px solid #2451FF;border-radius:10px;">
          <tr>
            <td style="padding:14px 16px;">
              <div style="font-weight:700;font-size:14px;color:#171C2C;">${quote.service.name}</div>
              <div style="font-size:12px;color:#8A93A6;margin-top:2px;">${quote.service.transitDays} business days · ${quote.zone.name}</div>
            </td>
            <td style="padding:14px 16px;text-align:right;white-space:nowrap;">
              <div style="font-size:20px;font-weight:700;color:#0E1B3D;">₹${quote.pricing.grandTotal.toFixed(2)}</div>
              <div style="font-size:11px;color:#8A93A6;margin-top:2px;">${quote.weight.chargeableWeightKg} kg billed</div>
            </td>
          </tr>
        </table>
      </div>

      ${resumeUrl ? `<a href="${resumeUrl}" style="display:block;text-align:center;margin-top:18px;background:#FF5A36;color:#fff;text-decoration:none;font-weight:700;padding:14px;border-radius:10px;font-size:15px;">Continue booking →</a>` : ''}

      <p style="font-size:12px;color:#8A93A6;text-align:center;margin-top:16px;">This quote is valid for a limited time and may vary based on final parcel weight/dimensions at pickup.</p>
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
    const { email, serviceCode, destinationCountryCode, items, declaredValue, originPostcode, originSuburb, originState } = req.body;

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

    const originText = originPostcode ? [originPostcode, originSuburb, originState].filter(Boolean).join(', ') : undefined;

    // "Continue booking" resumes the Book page with everything pre-filled
    // and auto-fetches services immediately, same as the Home page handoff.
    const resumePayload = { destinationCountryCode, items, originPostcode, originSuburb, originState, autoFetch: true };
    const base = (process.env.CLIENT_ORIGIN || 'https://www.comonn.in').split(',')[0].trim();
    const resumeUrl = `${base}/quote?resume=${Buffer.from(JSON.stringify(resumePayload)).toString('base64url')}`;

    await sendEmail({
      to: email,
      subject: `Your Comonn quote — ${quote.service.name} to ${quote.zone.name}`,
      html: renderQuoteEmailHtml(quote, { originText, resumeUrl }),
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { getInstantQuote, listCountries, listServices, postcodeSuggestions, emailQuote };
