const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const bwipjs = require('bwip-js');

const STORAGE_DIR = process.env.LABEL_STORAGE_DIR || path.join(__dirname, '../../storage/labels');

function ensureStorageDir() {
  if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

/**
 * Renders a Code128 barcode PNG buffer for the given value — bars only.
 * The human-readable value is drawn separately in the PDF (not via bwip-js's
 * own includetext) so we control spacing and can add a second line
 * (shipment tracking number) underneath without overlapping the barcode.
 */
async function renderBarcode(value) {
  return bwipjs.toBuffer({
    bcid: 'code128',
    text: value,
    scale: 3,
    height: 14,
    includetext: false,
  });
}

/**
 * Generates a 4x6-inch style shipping label PDF for ONE physical package
 * within the order and writes it to disk. Returns the relative file path
 * for storage on the Label model.
 */
async function generateLabelPdf(order, { packageIndex, totalPackages, item, barcodeValue }) {
  ensureStorageDir();
  const fileName = `${order.orderNumber}-${packageIndex}.pdf`;
  const filePath = path.join(STORAGE_DIR, fileName);

  const barcodePng = await renderBarcode(barcodeValue);

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
    doc.text(`Package ${packageIndex} of ${totalPackages}`);
    doc.moveDown(0.6);

    // Sender / Receiver
    doc.font('Helvetica-Bold').fontSize(9).text('FROM');
    doc.font('Helvetica').fontSize(9).text(formatAddress(order.senderAddress));
    doc.moveDown(0.4);
    doc.font('Helvetica-Bold').fontSize(11).text('TO');
    doc.font('Helvetica-Bold').fontSize(11).text(formatAddress(order.receiverAddress));
    doc.moveDown(0.6);

    // This package's details
    doc.font('Helvetica').fontSize(8).text(
      `${item.itemType} | Weight: ${item.actualWeightKg} kg | Dims: ${item.lengthCm}x${item.widthCm}x${item.heightCm} cm | Zone: ${order.zoneCode}`
    );
    if (order.contentsDescription) doc.text(`Contents: ${order.contentsDescription}`);
    doc.moveDown(0.6);

    // Barcode — position text explicitly below the image's fitted height,
    // since moveDown() is line-height-based and doesn't know the image size.
    const barcodeTop = doc.y;
    const barcodeHeight = 80;
    doc.image(barcodePng, { fit: [256, barcodeHeight], align: 'center' });
    doc.y = barcodeTop + barcodeHeight + 10;
    doc.font('Helvetica-Bold').fontSize(12).text(barcodeValue, { align: 'center' });
    if (totalPackages > 1) {
      doc.font('Helvetica').fontSize(8).text(`Shipment tracking: ${order.trackingNumber}`, { align: 'center' });
    }

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
