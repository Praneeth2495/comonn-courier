const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const bwipjs = require('bwip-js');

const STORAGE_DIR = process.env.LABEL_STORAGE_DIR || path.join(__dirname, '../../storage/labels');

function ensureStorageDir() {
  if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

/** Renders a Code128 barcode PNG buffer for the tracking number */
async function renderBarcode(trackingNumber) {
  return bwipjs.toBuffer({
    bcid: 'code128',
    text: trackingNumber,
    scale: 3,
    height: 14,
    includetext: true,
    textxalign: 'center',
  });
}

/**
 * Generates a 4x6-inch style shipping label PDF for the order and writes it
 * to disk. Returns the relative file path for storage on the Label model.
 */
async function generateLabelPdf(order) {
  ensureStorageDir();
  const fileName = `${order.orderNumber}.pdf`;
  const filePath = path.join(STORAGE_DIR, fileName);

  const barcodePng = await renderBarcode(order.trackingNumber);

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [288, 432], margin: 16 }); // 4in x 6in @72dpi
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // Header
    doc.font('Helvetica-Bold').fontSize(16).text('COMONN', { continued: true });
    doc.font('Helvetica').fontSize(9).text('  International Courier', { align: 'left' });
    doc.moveDown(0.3);
    doc.fontSize(9).text(`Service: ${order.service.name}`);
    doc.text(`Order: ${order.orderNumber}`);
    doc.moveDown(0.6);

    // Sender / Receiver
    doc.font('Helvetica-Bold').fontSize(9).text('FROM');
    doc.font('Helvetica').fontSize(9).text(formatAddress(order.senderAddress));
    doc.moveDown(0.4);
    doc.font('Helvetica-Bold').fontSize(11).text('TO');
    doc.font('Helvetica-Bold').fontSize(11).text(formatAddress(order.receiverAddress));
    doc.moveDown(0.6);

    // Parcel details
    doc.font('Helvetica').fontSize(8).text(
      `Weight: ${order.chargeableWeightKg} kg (chargeable)  |  Zone: ${order.zoneCode}`
    );
    const itemCount = order.items.reduce((sum, it) => sum + it.quantity, 0);
    doc.text(`Items: ${itemCount}`);
    for (const it of order.items) {
      doc.text(`  • ${it.itemType} x${it.quantity}: ${it.lengthCm}x${it.widthCm}x${it.heightCm}cm, ${it.actualWeightKg}kg each`);
    }
    if (order.contentsDescription) doc.text(`Contents: ${order.contentsDescription}`);
    doc.moveDown(0.6);

    // Barcode
    doc.image(barcodePng, { fit: [256, 80], align: 'center' });
    doc.moveDown(0.2);
    doc.font('Helvetica-Bold').fontSize(12).text(order.trackingNumber, { align: 'center' });

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  return { filePath, fileName };
}

function formatAddress(addr) {
  return [
    addr.contactName,
    addr.line1,
    addr.line2,
    `${addr.city}${addr.state ? ', ' + addr.state : ''} ${addr.postcode}`,
    addr.countryCode,
    addr.phone,
  ]
    .filter(Boolean)
    .join('\n');
}

module.exports = { generateLabelPdf, renderBarcode, STORAGE_DIR };
