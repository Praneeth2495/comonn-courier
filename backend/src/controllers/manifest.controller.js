const fs = require('fs');
const path = require('path');
const { prisma } = require('../config/db');
const { generateManifestNumber, generatePartyInvoiceNumber } = require('../utils/invoiceNumber');
const { MANIFEST_COST_CATEGORIES, PARTY_INVOICE_CATEGORY_LABELS } = require('../constants/partyInvoiceCategories');
const { generateManifestPdf, STORAGE_DIR } = require('../services/manifestPdf');
const { PAYABLE_STATUSES, buildOrdersWhere } = require('./order.controller');
const { EUROPE_COUNTRY_CODES } = require('../constants/regions');

// Sentinel stored in Manifest.countryCode when a manifest combines several
// European countries — a real ISO code never collides with this, and it's
// a free-form String column (not an enum/FK), so no schema change needed.
const EUROPE_SENTINEL = 'EU';

const ORDER_INCLUDE = { senderAddress: true, receiverAddress: true, items: true };

function withQty(order) {
  const qty = (order.items || []).reduce((sum, it) => sum + it.quantity, 0);
  return { ...order, qty };
}

/**
 * GET /api/admin/manifests/eligible-orders?countryCode=&airportCode= —
 * orders that can be added to a manifest: not already in a (different)
 * manifest, and confirmed (excludes PAYABLE_STATUSES, i.e. unpaid/
 * unconfirmed orders) — everything else, including pickup bookings, is
 * included per the "straight from order placement" requirement.
 * countryCode is always required and may be comma-separated to combine
 * several destination countries into one manifest — allowed only when
 * every one of them is in EUROPE_COUNTRY_CODES (every other country still
 * requires exactly one). The literal value "EU" is shorthand for "every
 * European country" — used when adding more orders to a manifest that was
 * already created as a combined-Europe one (see Manifest.countryCode).
 * airportCode narrows to one or more specific airports within the
 * selected countries (comma-separated) — omit it to see every airport at
 * once, which is what makes combining several airports/countries into one
 * manifest possible. Reuses buildOrdersWhere so STAFF still only see
 * orders in their assigned zones.
 */
async function listEligibleOrders(req, res, next) {
  try {
    const { countryCode, airportCode } = req.query;
    if (!countryCode) return res.status(400).json({ error: 'countryCode is required' });

    const rawCodes = countryCode.split(',').map((c) => c.trim().toUpperCase()).filter(Boolean);
    const countryCodes = rawCodes.length === 1 && rawCodes[0] === EUROPE_SENTINEL
      ? EUROPE_COUNTRY_CODES
      : [...new Set(rawCodes)];
    if (countryCodes.length > 1 && countryCodes.some((c) => !EUROPE_COUNTRY_CODES.includes(c))) {
      return res.status(400).json({ error: 'Multiple destination countries can only be combined into one manifest when every one of them is in Europe.' });
    }

    const where = await buildOrdersWhere({ ...req, query: { ...req.query, notStatus: PAYABLE_STATUSES.join(',') } });
    where.manifestId = null;
    where.airportCode = { not: null };
    where.receiverAddress = { countryCode: countryCodes.length === 1 ? countryCodes[0] : { in: countryCodes } };
    if (airportCode) {
      const codes = airportCode.split(',').map((c) => c.trim()).filter(Boolean);
      if (codes.length) where.airportCode = { in: codes };
    }

    const orders = await prisma.order.findMany({ where, include: ORDER_INCLUDE, orderBy: { createdAt: 'desc' } });
    res.json({ orders: orders.map(withQty) });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/manifests/available-airports — the country/airport chips
 * for the Build Manifest tab: one entry per distinct (destination country,
 * airportCode) pair currently found among manifest-eligible orders (not
 * already in a manifest, not unpaid/unconfirmed), with a live count. Reuses
 * buildOrdersWhere so STAFF only see airports covering their assigned
 * zones. Grouping is done in JS rather than a DB groupBy since it needs the
 * receiver's countryCode, which lives on the related Address, not Order
 * itself — fine at this order volume.
 */
async function listAvailableAirports(req, res, next) {
  try {
    const where = await buildOrdersWhere({ ...req, query: { ...req.query, notStatus: PAYABLE_STATUSES.join(',') } });
    where.manifestId = null;
    where.airportCode = { not: null };

    const orders = await prisma.order.findMany({
      where,
      select: { airportCode: true, receiverAddress: { select: { countryCode: true } } },
    });

    const counts = new Map(); // `${countryCode}:${airportCode}` -> count
    for (const o of orders) {
      const key = `${o.receiverAddress.countryCode}:${o.airportCode}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    const codes = [...new Set(orders.map((o) => o.airportCode))];
    const regions = codes.length ? await prisma.manifestRegion.findMany({ where: { code: { in: codes } } }) : [];
    const regionByCode = new Map(regions.map((r) => [r.code, r]));

    const airports = [...counts.entries()].map(([key, count]) => {
      const [countryCode, airportCode] = key.split(':');
      const region = regionByCode.get(airportCode);
      return { countryCode, airportCode, count, name: region?.name || airportCode, airportAddress: region?.airportAddress || '' };
    });

    res.json({ airports });
  } catch (err) {
    next(err);
  }
}

/**
 * Finds (or auto-creates, with a placeholder name/address) the
 * ManifestRegion for a given airport code — admin can rename it and fix the
 * real cargo address afterward from the Manifest tab's setup panel.
 */
async function findOrCreateRegion(airportCode, countryCode, fallbackAddress) {
  const existing = await prisma.manifestRegion.findUnique({ where: { code: airportCode } });
  if (existing) return existing;
  return prisma.manifestRegion.create({
    data: {
      code: airportCode,
      name: airportCode,
      countryCode: countryCode.toUpperCase(),
      airportAddress: fallbackAddress?.trim() || '',
    },
  });
}

/** Recomputes and persists orderCount/totalQty/totalWeightKg from the manifest's current orders, then regenerates the PDF sheet. Called after every create/add/remove so the numbers and PDF never drift from the real linked orders. */
async function recomputeAndRegenerate(manifestId) {
  const manifest = await prisma.manifest.findUnique({
    where: { id: manifestId },
    include: { hub: true, region: true, orders: { include: ORDER_INCLUDE } },
  });
  const totalQty = manifest.orders.reduce((sum, o) => sum + (o.items || []).reduce((s, it) => s + it.quantity, 0), 0);
  const totalWeightKg = manifest.orders.reduce((sum, o) => sum + Number(o.chargeableWeightKg), 0);
  const updated = await prisma.manifest.update({
    where: { id: manifestId },
    data: { orderCount: manifest.orders.length, totalQty, totalWeightKg },
    include: { hub: true, region: true, orders: { include: ORDER_INCLUDE } },
  });
  const { fileName } = await generateManifestPdf(updated);
  await prisma.manifest.update({ where: { id: manifestId }, data: { pdfFileUrl: fileName } });
  return { ...updated, pdfFileUrl: fileName };
}

/**
 * POST /api/admin/manifests — { orderIds, hubId, toAddress, manifestDate, departureDate }.
 * airportCode is deliberately not client input — the destination country
 * (and whichever specific airport(s), if that turns out to be exactly one)
 * are derived server-side from the selected orders themselves, since a
 * manifest is now free to combine orders bound for several different
 * airports as long as they're all in the same country.
 */
async function createManifest(req, res, next) {
  try {
    const { orderIds, hubId, toAddress, manifestDate, departureDate, fromAirportCode, fromAirportName } = req.body;
    if (!Array.isArray(orderIds) || orderIds.length === 0) return res.status(400).json({ error: 'orderIds is required' });
    if (!toAddress?.trim()) return res.status(400).json({ error: 'toAddress is required' });
    if (!manifestDate) return res.status(400).json({ error: 'manifestDate is required' });

    const orders = await prisma.order.findMany({ where: { id: { in: orderIds } }, include: { receiverAddress: true } });
    if (orders.length === 0) return res.status(400).json({ error: 'orderIds contains no known orders' });
    const countryCodes = [...new Set(orders.map((o) => o.receiverAddress.countryCode))];
    let countryCode;
    if (countryCodes.length > 1) {
      if (countryCodes.some((c) => !EUROPE_COUNTRY_CODES.includes(c))) {
        return res.status(400).json({ error: 'Selected orders must all be destined for the same country to share a manifest (multiple countries are only allowed when every one of them is in Europe).' });
      }
      countryCode = EUROPE_SENTINEL;
    } else {
      countryCode = countryCodes[0];
    }
    const airportCodes = [...new Set(orders.map((o) => o.airportCode).filter(Boolean))];

    let regionId = null;
    if (airportCodes.length === 1) {
      const region = await findOrCreateRegion(airportCodes[0], countryCode, toAddress);
      regionId = region.id;
    }

    const manifestNumber = await generateManifestNumber();
    const manifest = await prisma.$transaction(async (tx) => {
      const created = await tx.manifest.create({
        data: {
          manifestNumber,
          barcodeValue: manifestNumber,
          hubId: hubId || null,
          countryCode,
          regionId,
          toAddress: toAddress.trim(),
          fromAirportCode: fromAirportCode || null,
          fromAirportName: fromAirportName || null,
          manifestDate: new Date(manifestDate),
          departureDate: departureDate ? new Date(departureDate) : null,
          createdById: req.user.id,
        },
      });
      const claimed = await tx.order.updateMany({
        where: {
          id: { in: orderIds },
          manifestId: null,
          status: { notIn: PAYABLE_STATUSES },
          // Matches the real country set validated above (countryCodes),
          // not the stored `countryCode` field — that's "EU" for a
          // combined-Europe manifest, not a real ISO code to filter by.
          receiverAddress: { countryCode: { in: countryCodes } },
        },
        data: { manifestId: created.id },
      });
      if (claimed.count === 0) {
        throw Object.assign(new Error('None of the selected orders are eligible — they may already be in another manifest.'), { status: 409 });
      }
      return created;
    });

    const full = await recomputeAndRegenerate(manifest.id);
    res.status(201).json({ manifest: full });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
}

/** GET /api/admin/manifests */
/**
 * GET /api/admin/manifests?month=YYYY-MM&hubName=HYD — both optional and
 * additive to the plain unfiltered list every other caller (ManifestPanel,
 * the manifest autosuggest) relies on. `month` scopes by createdAt (the
 * date the manifest itself was created, per the Accounts Overview request
 * this came from — not manifestDate/departureDate). `hubName` is an exact,
 * case-sensitive match against Hub.name — see BRANCH_HUB_NAMES in
 * admin.controller.js for why that's the chosen key, not a separate id.
 */
async function listManifests(req, res, next) {
  try {
    const { month, hubName } = req.query;
    const where = {};
    if (month) {
      const start = new Date(`${month}-01T00:00:00.000Z`);
      const end = new Date(start);
      end.setUTCMonth(end.getUTCMonth() + 1);
      where.createdAt = { gte: start, lt: end };
    }
    if (hubName) where.hub = { name: hubName };

    const manifests = await prisma.manifest.findMany({
      where,
      include: { hub: true, region: true, createdBy: { select: { fullName: true } }, _count: { select: { orders: true, partyInvoices: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ manifests });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/manifests/:id */
async function getManifest(req, res, next) {
  try {
    const manifest = await prisma.manifest.findUnique({
      where: { id: req.params.id },
      include: {
        hub: true,
        region: true,
        orders: { include: ORDER_INCLUDE },
        partyInvoices: { select: { id: true, category: true, costMode: true, costRate: true, totalAmount: true, status: true } },
      },
    });
    if (!manifest) return res.status(404).json({ error: 'Manifest not found' });
    res.json({ manifest: { ...manifest, orders: manifest.orders.map(withQty) } });
  } catch (err) {
    next(err);
  }
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * POST /api/admin/manifests/:id/costs — { items: [{ category, mode, value }, ...] }
 * Bulk-computes and saves the manifest's operating cost sheet (Accounts
 * Overview → "Where the cost goes" → click a manifest) — one
 * PartyInvoice(PAYABLE) row per category, upserted against the
 * [manifestId, category] unique index so re-saving the form updates the
 * same rows instead of creating duplicates. mode is FLAT (value is the ₹
 * total), PER_KG (value × the manifest's totalWeightKg), or PERCENT
 * (value% of the manifest orders' combined gross revenue) — see
 * CostInputMode. A category sent with no value (or <= 0) has its row
 * deleted instead, so clearing a field in the form clears the cost line;
 * omitting a category from `items` entirely leaves its existing row
 * untouched (the frontend always sends the full set, but this keeps a
 * partial payload safe either way).
 */
async function saveManifestCosts(req, res, next) {
  try {
    const { items } = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'items is required' });

    const manifest = await prisma.manifest.findUnique({
      where: { id: req.params.id },
      include: { orders: { select: { grandTotal: true, discountTotal: true, taxTotal: true } } },
    });
    if (!manifest) return res.status(404).json({ error: 'Manifest not found' });

    const grossRevenue = manifest.orders.reduce((sum, o) => sum + (Number(o.grandTotal) - Number(o.taxTotal) + Number(o.discountTotal)), 0);
    const weightKg = Number(manifest.totalWeightKg);

    for (const item of items) {
      const { category, mode, value } = item || {};
      if (!MANIFEST_COST_CATEGORIES.includes(category)) continue;
      if (!['FLAT', 'PER_KG', 'PERCENT'].includes(mode)) continue;
      const numValue = Number(value);

      if (!numValue || numValue <= 0) {
        await prisma.partyInvoice.deleteMany({ where: { manifestId: manifest.id, category } });
        continue;
      }

      let amount;
      if (mode === 'PER_KG') amount = numValue * weightKg;
      else if (mode === 'PERCENT') amount = (numValue / 100) * grossRevenue;
      else amount = numValue;
      amount = round2(amount);

      const label = PARTY_INVOICE_CATEGORY_LABELS[category];
      const description = `Manifest ${manifest.manifestNumber} — ${label}`;
      const existing = await prisma.partyInvoice.findUnique({ where: { manifestId_category: { manifestId: manifest.id, category } } });
      if (existing) {
        await prisma.partyInvoice.update({
          where: { id: existing.id },
          data: { amount, totalAmount: amount, costMode: mode, costRate: numValue, description },
        });
      } else {
        const invoiceNumber = await generatePartyInvoiceNumber('PAYABLE');
        await prisma.partyInvoice.create({
          data: {
            direction: 'PAYABLE',
            invoiceNumber,
            partyName: label,
            description,
            amount,
            gstPercent: 0,
            totalAmount: amount,
            dueDate: manifest.manifestDate,
            status: 'UNPAID',
            category,
            costMode: mode,
            costRate: numValue,
            manifestId: manifest.id,
            createdById: req.user.id,
          },
        });
      }
    }

    const current = await prisma.partyInvoice.findMany({
      where: { manifestId: manifest.id },
      select: { id: true, category: true, costMode: true, costRate: true, totalAmount: true, status: true },
    });
    const totalOperatingCost = round2(current.reduce((sum, i) => sum + Number(i.totalAmount), 0));
    const airlineInvoice = current.find((i) => i.category === 'AIRLINE');

    res.json({
      items: current,
      totals: {
        grossRevenue: round2(grossRevenue),
        operatingCost: totalOperatingCost,
        airlineRatePerKg: airlineInvoice && weightKg > 0 ? round2(Number(airlineInvoice.totalAmount) / weightKg) : null,
      },
    });
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/manifests/:id/orders — add more orders to an existing manifest. */
async function addOrdersToManifest(req, res, next) {
  try {
    const { orderIds } = req.body;
    if (!Array.isArray(orderIds) || orderIds.length === 0) return res.status(400).json({ error: 'orderIds is required' });

    const manifest = await prisma.manifest.findUnique({ where: { id: req.params.id } });
    if (!manifest) return res.status(404).json({ error: 'Manifest not found' });

    // Same-country guard only — a manifest may already combine several
    // airports, so any further orders just need to match its country, not
    // one specific airport. A combined-Europe manifest (countryCode "EU")
    // accepts any European country here, not just the specific ones it
    // happened to start with.
    const allowedCountryCodes = manifest.countryCode === EUROPE_SENTINEL ? EUROPE_COUNTRY_CODES : [manifest.countryCode];
    const claimed = await prisma.order.updateMany({
      where: {
        id: { in: orderIds },
        manifestId: null,
        status: { notIn: PAYABLE_STATUSES },
        receiverAddress: { countryCode: { in: allowedCountryCodes } },
      },
      data: { manifestId: req.params.id },
    });
    if (claimed.count === 0) return res.status(409).json({ error: 'None of the selected orders are eligible.' });

    const full = await recomputeAndRegenerate(req.params.id);
    res.json({ manifest: full });
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/admin/manifests/:id/orders/:orderId — remove a single order from the manifest. */
async function removeOrderFromManifest(req, res, next) {
  try {
    const { count } = await prisma.order.updateMany({
      where: { id: req.params.orderId, manifestId: req.params.id },
      data: { manifestId: null },
    });
    if (count === 0) return res.status(404).json({ error: 'Order not found in this manifest' });

    const full = await recomputeAndRegenerate(req.params.id);
    res.json({ manifest: full });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/manifests/:id/download */
async function downloadManifest(req, res, next) {
  try {
    const manifest = await prisma.manifest.findUnique({
      where: { id: req.params.id },
      include: { hub: true, region: true, orders: { include: ORDER_INCLUDE } },
    });
    if (!manifest) return res.status(404).json({ error: 'Manifest not found' });

    const filePath = path.resolve(path.join(STORAGE_DIR, manifest.pdfFileUrl || `${manifest.manifestNumber}.pdf`));
    if (!fs.existsSync(filePath)) await generateManifestPdf(manifest);
    if (req.query.inline) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${path.basename(filePath)}"`);
      return res.sendFile(filePath);
    }
    res.download(filePath);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listEligibleOrders,
  listAvailableAirports,
  createManifest,
  listManifests,
  getManifest,
  addOrdersToManifest,
  removeOrderFromManifest,
  downloadManifest,
  saveManifestCosts,
};
