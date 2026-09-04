const fs = require('fs');
const { prisma } = require('../config/db');
const { generateLabelPdf } = require('../services/labelService');
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
    line2: addr.suburb.trim(),
    city: addr.city.trim(),
    state: addr.state.trim(),
    postcode: '',
    countryCode: addr.countryCode,
    phone: null,
    ...(instructions !== undefined ? { instructions } : {}),
  };
}

/**
 * POST /api/labels/manual — the Print Label page's "Create Label" tool.
 * Generates `quantity` independently-barcoded labels for an ad-hoc shipment
 * that has no real Order behind it (e.g. an internal transfer) — same PDF
 * layout/barcode format as an order's own labels, just not linked to one.
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
    const fakeOrder = {
      orderNumber: referenceNumber,
      trackingNumber: referenceNumber,
      service: { name: 'Manual label' },
      zoneCode: 'MANUAL',
      contentsDescription: null,
      receiverAddress: toLabelShape(toAddress, instructions?.trim() || null),
      senderAddress: toLabelShape(fromAddress),
    };
    const item = {
      itemType: itemType?.trim() || 'Box',
      actualWeightKg: numericWeight,
      lengthCm: lengthCm ? Number(lengthCm) : 0,
      widthCm: widthCm ? Number(widthCm) : 0,
      heightCm: heightCm ? Number(heightCm) : 0,
    };

    const labels = [];
    for (let i = 1; i <= numericQuantity; i++) {
      const barcodeValue = numericQuantity > 1 ? `${referenceNumber}-${i}` : referenceNumber;
      const { fileName, filePath } = await generateLabelPdf(fakeOrder, {
        packageIndex: i,
        totalPackages: numericQuantity,
        item,
        barcodeValue,
      });
      const pdfData = fs.readFileSync(filePath);
      const label = await prisma.label.create({
        data: { orderId: null, packageIndex: i, itemType: item.itemType, fileUrl: fileName, barcodeValue, pdfData },
      });
      labels.push(label);
    }

    res.status(201).json({ referenceNumber, labels: labels.map(({ pdfData, ...rest }) => rest) });
  } catch (err) {
    next(err);
  }
}

module.exports = { createManualLabels };
