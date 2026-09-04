const fs = require('fs');
const path = require('path');
const { prisma } = require('../config/db');
const { generateLabelPdf, generateMasterLabelPdf, STORAGE_DIR } = require('../services/labelService');
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

function validateAddress(addr, label) {
  if (!addr || typeof addr !== 'object') return `${label} address is required`;
  if (!addr.street?.trim()) return `${label} street is required`;
  if (!addr.state?.trim()) return `${label} state is required`;
  if (!addr.countryCode || !COUNTRY_NAMES[addr.countryCode]) return `${label} country must be one of the countries we serve`;
  return null;
}

function toLabelShape(addr, instructions) {
  return {
    contactName: null,
    line1: addr.street.trim(),
    line2: addr.suburb?.trim() || '',
    city: addr.city?.trim() || '',
    state: addr.state.trim(),
    postcode: '',
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

/**
 * POST /api/labels/manual — the Print Label page's Manual Label tab.
 * Generates `quantity` independently-barcoded labels for an ad-hoc shipment
 * that has no real Order behind it (e.g. an internal transfer) — same PDF
 * layout/barcode format as an order's own labels, just not linked to one.
 * quantity > 1 also gets one combined "master label" PDF (all pages in one
 * file) alongside the individual ones.
 */
async function createManualLabels(req, res, next) {
  try {
    const { fromAddress, toAddress, quantity, itemType, actualWeightKg, lengthCm, widthCm, heightCm, instructions } = req.body;

    const fromError = validateAddress(fromAddress, 'From');
    if (fromError) return res.status(400).json({ error: fromError });
    const toError = validateAddress(toAddress, 'To');
    if (toError) return res.status(400).json({ error: toError });

    const numericQuantity = Number(quantity);
    if (!Number.isInteger(numericQuantity) || numericQuantity < 1 || numericQuantity > 100) {
      return res.status(400).json({ error: 'Quantity must be a whole number between 1 and 100' });
    }
    const numericWeight = Number(actualWeightKg);
    if (!Number.isFinite(numericWeight) || numericWeight <= 0) {
      return res.status(400).json({ error: 'Weight must be a positive number' });
    }

    const referenceNumber = await generateManualLabelNumber();
    const trimmedInstructions = instructions?.trim() || null;
    const fakeOrder = {
      orderNumber: referenceNumber,
      trackingNumber: referenceNumber,
      service: { name: 'Manual label' },
      zoneCode: 'MANUAL',
      contentsDescription: null,
      receiverAddress: toLabelShape(toAddress, trimmedInstructions),
      senderAddress: toLabelShape(fromAddress),
    };
    const item = {
      itemType: itemType?.trim() || 'Box',
      actualWeightKg: numericWeight,
      lengthCm: lengthCm ? Number(lengthCm) : 0,
      widthCm: widthCm ? Number(widthCm) : 0,
      heightCm: heightCm ? Number(heightCm) : 0,
    };

    const batch = await prisma.manualLabelBatch.create({
      data: {
        referenceNumber,
        fromAddress,
        toAddress,
        quantity: numericQuantity,
        itemType: item.itemType,
        actualWeightKg: item.actualWeightKg,
        lengthCm: item.lengthCm || null,
        widthCm: item.widthCm || null,
        heightCm: item.heightCm || null,
        instructions: trimmedInstructions,
        createdById: req.user.id,
      },
    });

    const pages = [];
    const labels = [];
    for (let i = 1; i <= numericQuantity; i++) {
      const barcodeValue = numericQuantity > 1 ? `${referenceNumber}-${i}` : referenceNumber;
      const pageArgs = { packageIndex: i, totalPackages: numericQuantity, item, barcodeValue };
      pages.push(pageArgs);
      const { fileName, filePath } = await generateLabelPdf(fakeOrder, pageArgs);
      const pdfData = fs.readFileSync(filePath);
      const label = await prisma.label.create({
        data: { orderId: null, batchId: batch.id, packageIndex: i, itemType: item.itemType, fileUrl: fileName, barcodeValue, pdfData },
      });
      labels.push(label);
    }

    let updatedBatch = batch;
    if (numericQuantity > 1) {
      const masterFileName = `${referenceNumber}-master.pdf`;
      const { filePath: masterFilePath } = await generateMasterLabelPdf(fakeOrder, pages, masterFileName);
      const masterPdfData = fs.readFileSync(masterFilePath);
      updatedBatch = await prisma.manualLabelBatch.update({
        where: { id: batch.id },
        data: { masterFileUrl: masterFileName, masterPdfData },
      });
    }

    res.status(201).json({
      batch: toBatchResponse({ ...updatedBatch, createdBy: { fullName: req.user.fullName } }),
      labels: labels.map(({ pdfData, ...rest }) => rest),
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

module.exports = { createManualLabels, listManualLabelBatches, downloadMasterLabel };
