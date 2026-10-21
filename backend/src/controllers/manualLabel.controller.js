const fs = require('fs');
const path = require('path');
const { prisma } = require('../config/db');
const { generateLabelPdf, generateMasterLabelPdf, STORAGE_DIR } = require('../services/labelService');
const { generateConsignmentSheet } = require('../services/consignmentPdf');
const { generateLoadSheet } = require('../services/loadSheetPdf');
const { nextMonthlySequence, getIstDateParts } = require('../utils/orderNumber');
const { COUNTRY_NAMES } = require('../utils/countryNames');

// Distinct from generateOrderNumber's plain "day+month+seq" — prefixed so
// it's never mistaken for a real order/tracking number when staff search
// for it (Print Label's scan-to-reprint box, this Label's barcode itself).
async function generateManualLabelNumber() {
  const { year, month, day } = getIstDateParts(new Date());
  const seq = await nextMonthlySequence('manual-label', year, month);
  return `ML${day}${month}${seq}`;
}

const MANUAL_LABEL_SERVICES = ['Express', 'Economy'];

function validateAddress(addr, label) {
  if (!addr || typeof addr !== 'object') return `${label} address is required`;
  if (!addr.street?.trim()) return `${label} street is required`;
  if (!addr.state?.trim()) return `${label} state is required`;
  if (!addr.countryCode || !COUNTRY_NAMES[addr.countryCode]) return `${label} country must be one of the countries we serve`;
  return null;
}

// A copy-pasted spreadsheet cell can carry trailing tabs/non-breaking
// spaces into these fields (e.g. "Bellis Australia Pty Ltd \t\t") — those
// survive into fromAddress/toAddress verbatim if not trimmed here, which
// then render as garbled glyphs wherever this batch's address is printed
// later (labels, invoice, consignment sheet — see pdfText.js). Trimming at
// save time, not just at render time, means the stored record itself is
// clean for every future reprint.
function trimAddressFields(addr) {
  const trimmed = {};
  for (const [key, value] of Object.entries(addr)) {
    trimmed[key] = typeof value === 'string' ? value.trim() : value;
  }
  return trimmed;
}

function toLabelShape(addr, instructions) {
  return {
    businessName: addr.businessName?.trim() || null,
    contactName: null,
    line1: addr.street.trim(),
    line2: addr.suburb?.trim() || '',
    city: addr.city?.trim() || '',
    state: addr.state.trim(),
    postcode: addr.pin?.trim() || '',
    countryCode: addr.countryCode,
    phone: null,
    ...(instructions !== undefined ? { instructions } : {}),
  };
}

// batch.pdfData/masterPdfData are never included in list responses — served
// separately via the dedicated download routes, same care as
// partyInvoice.controller.js's attachmentData omission.
function toBatchResponse(batch) {
  const { masterPdfData, ...rest } = batch;
  return { ...rest, hasMaster: Boolean(masterPdfData) };
}

// Validates and normalizes the request's `items` array — mirrors
// Quote.jsx/order-creation's per-item shape (itemType, weight, optional
// dims, quantity), just flattened onto a manual label batch instead of a
// real Order. Returns { items, error } — items is null when error is set.
function parseItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { items: null, error: 'At least one item is required' };
  }
  const items = [];
  for (const raw of rawItems) {
    const numericQuantity = Number(raw?.quantity);
    if (!Number.isInteger(numericQuantity) || numericQuantity < 1 || numericQuantity > 100) {
      return { items: null, error: 'Each item quantity must be a whole number between 1 and 100' };
    }
    const numericWeight = Number(raw?.actualWeightKg);
    if (!Number.isFinite(numericWeight) || numericWeight <= 0) {
      return { items: null, error: 'Each item needs a positive weight' };
    }
    items.push({
      itemType: raw?.itemType?.trim() || 'Box',
      actualWeightKg: numericWeight,
      lengthCm: raw?.lengthCm ? Number(raw.lengthCm) : 0,
      widthCm: raw?.widthCm ? Number(raw.widthCm) : 0,
      heightCm: raw?.heightCm ? Number(raw.heightCm) : 0,
      quantity: numericQuantity,
    });
  }
  const totalQuantity = items.reduce((sum, it) => sum + it.quantity, 0);
  if (totalQuantity > 100) {
    return { items: null, error: 'Total quantity across all items cannot exceed 100' };
  }
  return { items, error: null };
}

// Flattens items (each with its own quantity) into one entry per physical
// unit — mirrors label.controller.js's buildPackages for real orders, so a
// batch with e.g. 2 Boxes + 1 Pallet prints 3 labels, each showing its own
// item's weight/dims rather than the whole batch's first item.
function buildPackages(items) {
  const packages = [];
  for (const it of items) {
    for (let i = 0; i < it.quantity; i++) packages.push(it);
  }
  return packages;
}

// Generates the individual sticker labels (+ combined master, if more than
// one) for a batch and persists them — shared by createManualLabels (fresh
// batch) and generateForExistingBatch (staff adding the Label piece later
// via Edit, after only generating the Consignment/Load sheet at first).
// Never called when the batch already has labels — see the `hasLabels`
// guard at each call site — so this never duplicates or re-barcodes a
// batch that was already printed.
async function generateLabelsForBatch(batch) {
  const items = batch.items;
  const fakeOrder = {
    orderNumber: batch.referenceNumber,
    trackingNumber: batch.referenceNumber,
    service: { name: batch.service },
    zoneCode: 'MANUAL',
    contentsDescription: null,
    receiverAddress: toLabelShape(batch.toAddress, batch.instructions),
    senderAddress: toLabelShape(batch.fromAddress),
  };

  const packages = buildPackages(items);
  const totalQuantity = packages.length;

  const pages = [];
  const labels = [];
  for (let i = 0; i < packages.length; i++) {
    const packageIndex = i + 1;
    const barcodeValue = totalQuantity > 1 ? `${batch.referenceNumber}-${packageIndex}` : batch.referenceNumber;
    const pageArgs = {
      packageIndex, totalPackages: totalQuantity, item: packages[i], barcodeValue,
      hideShipmentTracking: true, hideBarcodeText: true,
      numberLabel: batch.orderId, referenceLabel: batch.refNumber,
    };
    pages.push(pageArgs);
    const { fileName, filePath } = await generateLabelPdf(fakeOrder, pageArgs);
    const pdfData = fs.readFileSync(filePath);
    const label = await prisma.label.create({
      data: { orderId: null, batchId: batch.id, packageIndex, itemType: packages[i].itemType, fileUrl: fileName, barcodeValue, pdfData },
    });
    labels.push(label);
  }

  let updatedBatch = batch;
  if (totalQuantity > 1) {
    const masterFileName = `${batch.referenceNumber}-master.pdf`;
    const { filePath: masterFilePath } = await generateMasterLabelPdf(fakeOrder, pages, masterFileName);
    const masterPdfData = fs.readFileSync(masterFilePath);
    updatedBatch = await prisma.manualLabelBatch.update({
      where: { id: batch.id },
      data: { masterFileUrl: masterFileName, masterPdfData },
    });
  }

  return { batch: updatedBatch, labels };
}

/**
 * POST /api/labels/manual — the Print Label page's Manual Label tab.
 * Staff pick which document(s) to generate for this shipment via two
 * checkboxes — Label and Consignment (and, now, Load sheet) — any
 * combination, at least one required. Label generates one independently-
 * barcoded sticker per unit across every item in `items` (same PDF layout/
 * barcode format as an order's own labels, just not linked to a real
 * Order), plus a combined master label if more than one. Consignment/Load
 * sheet aren't pre-rendered here — see generateConsignmentSheet/
 * generateLoadSheet, which render fresh from the batch row on every
 * download — this just flags them as "generated" so their links show up
 * in the history view. Whatever wasn't checked here can be added later
 * without re-entering anything, via the Edit action (generateForExistingBatch).
 */
async function createManualLabels(req, res, next) {
  try {
    const {
      orderId, refNumber, service, fromAddress, toAddress, items: rawItems, instructions,
      generateLabel: wantLabel = true, generateConsignment: wantConsignment = true, generateLoadSheet: wantLoadSheet = true,
    } = req.body;

    if (!orderId?.trim()) return res.status(400).json({ error: 'Order ID is required' });
    if (!MANUAL_LABEL_SERVICES.includes(service)) {
      return res.status(400).json({ error: 'Service must be Express or Economy' });
    }
    if (!wantLabel && !wantConsignment && !wantLoadSheet) {
      return res.status(400).json({ error: 'Select at least one of Label, Consignment or Load sheet to generate' });
    }
    const fromError = validateAddress(fromAddress, 'From');
    if (fromError) return res.status(400).json({ error: fromError });
    const toError = validateAddress(toAddress, 'To');
    if (toError) return res.status(400).json({ error: toError });

    const { items, error: itemsError } = parseItems(rawItems);
    if (itemsError) return res.status(400).json({ error: itemsError });

    const referenceNumber = await generateManualLabelNumber();
    const trimmedInstructions = instructions?.trim() || null;
    const trimmedOrderId = orderId?.trim() || null;
    const trimmedRefNumber = refNumber?.trim() || null;

    const totalQuantity = buildPackages(items).length;

    let batch = await prisma.manualLabelBatch.create({
      data: {
        referenceNumber,
        orderId: trimmedOrderId,
        refNumber: trimmedRefNumber,
        service,
        fromAddress: trimAddressFields(fromAddress),
        toAddress: trimAddressFields(toAddress),
        quantity: totalQuantity,
        items,
        instructions: trimmedInstructions,
        consignmentGenerated: Boolean(wantConsignment),
        loadSheetGenerated: Boolean(wantLoadSheet),
        createdById: req.user.id,
      },
    });

    let labels = [];
    if (wantLabel) {
      const result = await generateLabelsForBatch(batch);
      batch = result.batch;
      labels = result.labels;
    }

    res.status(201).json({
      batch: toBatchResponse({ ...batch, createdBy: { fullName: req.user.fullName } }),
      labels: labels.map(({ pdfData, ...rest }) => rest),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/labels/manual/:batchId/generate — the history view's "Edit"
 * action, for adding whichever document(s) staff skipped the first time
 * around. Re-uses the batch's already-saved details rather than asking for
 * them again; idempotent per piece — only generates what's actually
 * missing (an already-generated Label/Consignment/Load sheet checked again
 * is a silent no-op, never re-barcoded/duplicated).
 */
async function generateForExistingBatch(req, res, next) {
  try {
    const batch = await prisma.manualLabelBatch.findUnique({
      where: { id: req.params.batchId },
      include: { labels: { select: { id: true } }, createdBy: { select: { fullName: true } } },
    });
    if (!batch) return res.status(404).json({ error: 'Batch not found' });

    const { generateLabel: wantLabel, generateConsignment: wantConsignment, generateLoadSheet: wantLoadSheet } = req.body;
    const hasLabels = batch.labels.length > 0;

    let updated = batch;
    let labels = [];
    if (wantLabel && !hasLabels) {
      const result = await generateLabelsForBatch(batch);
      updated = { ...updated, ...result.batch };
      labels = result.labels;
    }
    if (wantConsignment && !batch.consignmentGenerated) {
      updated = await prisma.manualLabelBatch.update({ where: { id: batch.id }, data: { consignmentGenerated: true } });
    }
    if (wantLoadSheet && !batch.loadSheetGenerated) {
      updated = await prisma.manualLabelBatch.update({ where: { id: batch.id }, data: { loadSheetGenerated: true } });
    }

    const freshLabels = labels.length ? labels : await prisma.label.findMany({ where: { batchId: batch.id }, orderBy: { packageIndex: 'asc' } });

    res.json({
      batch: toBatchResponse({ ...updated, createdBy: batch.createdBy }),
      labels: freshLabels.map(({ pdfData, ...rest }) => rest),
    });
  } catch (err) {
    next(err);
  }
}

/** GET /api/labels/manual/history — every batch, newest first, with its individual labels */
async function listManualLabelBatches(req, res, next) {
  try {
    const batches = await prisma.manualLabelBatch.findMany({
      include: {
        createdBy: { select: { fullName: true } },
        labels: { select: { id: true, packageIndex: true, barcodeValue: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ batches: batches.map(toBatchResponse) });
  } catch (err) {
    next(err);
  }
}

/** GET /api/labels/manual/:batchId/master — the combined multi-page PDF for a batch */
async function downloadMasterLabel(req, res, next) {
  try {
    const batch = await prisma.manualLabelBatch.findUnique({ where: { id: req.params.batchId } });
    if (!batch) return res.status(404).json({ error: 'Batch not found' });
    if (!batch.masterPdfData) return res.status(404).json({ error: 'No master label for this batch' });

    const filePath = path.resolve(path.join(STORAGE_DIR, batch.masterFileUrl));
    if (!fs.existsSync(filePath)) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, batch.masterPdfData);
    }
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

/** GET /api/labels/manual/:batchId/consignment — sender+receiver signature sheet for a batch, regenerated fresh each time */
async function downloadConsignmentSheet(req, res, next) {
  try {
    const batch = await prisma.manualLabelBatch.findUnique({ where: { id: req.params.batchId } });
    if (!batch) return res.status(404).json({ error: 'Batch not found' });
    generateConsignmentSheet(batch, res);
  } catch (err) {
    next(err);
  }
}

/** GET /api/labels/manual/:batchId/load-sheet — landscape details/items table for a batch, regenerated fresh each time */
async function downloadLoadSheet(req, res, next) {
  try {
    const batch = await prisma.manualLabelBatch.findUnique({ where: { id: req.params.batchId } });
    if (!batch) return res.status(404).json({ error: 'Batch not found' });
    generateLoadSheet(batch, res);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createManualLabels,
  generateForExistingBatch,
  listManualLabelBatches,
  downloadMasterLabel,
  downloadConsignmentSheet,
  downloadLoadSheet,
};
