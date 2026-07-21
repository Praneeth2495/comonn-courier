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

/**
 * POST /api/locations — ADMIN/STAFF only
 * Every location must map to a real order status — the label is just a
 * human-friendly description of that checkpoint (used in the note logged on
 * scanned orders), not a separate informational-only mode.
 */
async function createLocation(req, res, next) {
  try {
    const { name, barcodeValue, status, label } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
    if (!barcodeValue || !barcodeValue.trim()) return res.status(400).json({ error: 'barcodeValue is required' });
    if (!status) return res.status(400).json({ error: 'status is required' });
    if (!label || !label.trim()) return res.status(400).json({ error: 'label is required' });

    const location = await prisma.scanLocation.create({
      data: {
        name: name.trim(),
        barcodeValue: barcodeValue.trim(),
        status,
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
    const { name, barcodeValue, status, label } = req.body;
    if (status !== undefined && !status) return res.status(400).json({ error: 'status is required' });
    if (label !== undefined && !(label && label.trim())) return res.status(400).json({ error: 'label is required' });

    const data = {};
    if (name !== undefined) data.name = name.trim();
    if (barcodeValue !== undefined) data.barcodeValue = barcodeValue.trim();
    if (status !== undefined) data.status = status;
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
    doc.font('Helvetica').fontSize(8).text(`${location.label} — sets status: ${location.status.replace(/_/g, ' ')}`, { align: 'center' });

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
