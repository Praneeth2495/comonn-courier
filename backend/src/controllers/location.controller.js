const PDFDocument = require('pdfkit');
const { prisma } = require('../config/db');
const { renderBarcode } = require('../services/labelService');

/** GET /api/locations — available to ADMIN, STAFF, DRIVER (used during scanning) */
async function listLocations(req, res, next) {
  try {
    const locations = await prisma.scanLocation.findMany({
      include: { createdBy: { select: { fullName: true } } },
      orderBy: { name: 'asc' },
    });
    res.json({ locations });
  } catch (err) {
    next(err);
  }
}

/** Atomically advances a simple counter for auto-generated location barcodes. */
async function nextLocationSeq() {
  const counter = await prisma.sequenceCounter.upsert({
    where: { key: 'location' },
    update: { value: { increment: 1 } },
    create: { key: 'location', value: 1 },
  });
  return counter.value;
}

/**
 * POST /api/locations — ADMIN/STAFF only
 * The barcode value is auto-generated (LOC1, LOC2...) — staff just name the
 * location and describe it; "Print label" turns that barcode into a
 * physical sticker. Scanning it sets the label as the literal new status on
 * every matched order, and logs the same text as a comment.
 */
async function createLocation(req, res, next) {
  try {
    const { name, label } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
    if (!label || !label.trim()) return res.status(400).json({ error: 'label is required' });

    const seq = await nextLocationSeq();
    const location = await prisma.scanLocation.create({
      data: {
        name: name.trim(),
        barcodeValue: `LOC${seq}`,
        label: label.trim(),
        createdById: req.user.id,
      },
      include: { createdBy: { select: { fullName: true } } },
    });
    res.status(201).json({ location });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'This barcode is already assigned to a location' });
    next(err);
  }
}

/** PATCH /api/locations/:id — ADMIN/STAFF only */
async function updateLocation(req, res, next) {
  try {
    const { name, barcodeValue, label } = req.body;
    if (label !== undefined && !(label && label.trim())) return res.status(400).json({ error: 'label is required' });

    const data = {};
    if (name !== undefined) data.name = name.trim();
    if (barcodeValue !== undefined) data.barcodeValue = barcodeValue.trim();
    if (label !== undefined) data.label = label.trim();

    const location = await prisma.scanLocation.update({
      where: { id: req.params.id },
      data,
      include: { createdBy: { select: { fullName: true } } },
    });
    res.json({ location });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'This barcode is already assigned to a location' });
    next(err);
  }
}

/**
 * GET /api/locations/:id/barcode.pdf
 * A small printable sticker (4in x 3in) with the location's Code128
 * barcode — same rendering (bwip-js) used for real shipping labels — so it
 * can be printed and stuck up at the physical location it represents.
 */
async function printLocationBarcode(req, res, next) {
  try {
    const location = await prisma.scanLocation.findUnique({ where: { id: req.params.id } });
    if (!location) return res.status(404).json({ error: 'Location not found' });

    const barcodePng = await renderBarcode(location.barcodeValue);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="location-${location.name.replace(/\s+/g, '-')}.pdf"`);

    const doc = new PDFDocument({ size: [288, 216], margin: 16 }); // 4in x 3in @72dpi
    doc.pipe(res);

    doc.font('Helvetica-Bold').fontSize(14).text('COMONN', { align: 'center' });
    doc.font('Helvetica').fontSize(9).text('Barcode location', { align: 'center' });
    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(16).text(location.name, { align: 'center' });
    doc.moveDown(0.6);

    const barcodeTop = doc.y;
    const barcodeHeight = 70;
    doc.image(barcodePng, { fit: [230, barcodeHeight], align: 'center' });
    doc.y = barcodeTop + barcodeHeight + 8;
    doc.font('Helvetica-Bold').fontSize(11).text(location.barcodeValue, { align: 'center' });
    doc.font('Helvetica').fontSize(8).text(`Sets status: ${location.label}`, { align: 'center' });

    doc.end();
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/locations/:id — ADMIN/STAFF only */
async function deleteLocation(req, res, next) {
  try {
    await prisma.scanLocation.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

module.exports = { listLocations, createLocation, updateLocation, deleteLocation, printLocationBarcode };
