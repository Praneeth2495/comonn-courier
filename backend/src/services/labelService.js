const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const bwipjs = require('bwip-js');
const { getCountryName } = require('../utils/countryNames');

const STORAGE_DIR = process.env.LABEL_STORAGE_DIR || path.join(__dirname, '../../storage/labels');
const LOGO_PATH = path.join(__dirname, '../assets/logo-full.png');

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

    // Header — logo sits top-right so it never pushes the info column down;
    // the info column starts at the very top of the content area instead.
    const headerLeft = doc.x;
    const headerTop = doc.y;
    const pageRight = doc.page.width - doc.page.margins.right;
    if (fs.existsSync(LOGO_PATH)) {
      const logoWidth = 70;
      doc.image(LOGO_PATH, pageRight - logoWidth, headerTop, { width: logoWidth });
    }
    doc.font('Helvetica-Bold').fontSize(11).text('COMONN', headerLeft, headerTop, { width: 150 });
    doc.font('Helvetica').fontSize(7).text('International Courier', headerLeft, doc.y);
    doc.y = headerTop + 24;
    doc.fontSize(8).font('Helvetica');
    doc.text(`Service: ${order.service.name}`);
    doc.text(`Order: ${order.orderNumber}`);
    doc.text(`Package ${packageIndex} of ${totalPackages}`);
    doc.moveDown(0.5);

    // Sender / Receiver — "To" is the delivery address and is what matters
    // most on the package, so it's rendered noticeably larger/bolder than
    // "From".
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#6B7280').text('FROM');
    doc.font('Helvetica').fontSize(8).fillColor('#6B7280').text(formatAddress(order.senderAddress));
    doc.fillColor('black');
    doc.moveDown(0.4);
    doc.font('Helvetica-Bold').fontSize(13).text('TO');
    doc.font('Helvetica-Bold').fontSize(13).text(formatAddress(order.receiverAddress));
    if (order.receiverAddress.instructions) {
      doc.moveDown(0.15);
      doc.font('Helvetica-Bold').fontSize(8).text('Delivery instructions', { continued: false });
      doc.font('Helvetica').fontSize(8).text(order.receiverAddress.instructions, { width: 256 });
    }
    doc.moveDown(0.5);

    // This package's details — dims are optional at booking time, so omit
    // that segment entirely rather than printing "0x0x0 cm".
    const dimsPart = (Number(item.lengthCm) && Number(item.widthCm) && Number(item.heightCm))
      ? ` | Dims: ${item.lengthCm}x${item.widthCm}x${item.heightCm} cm`
      : '';
    doc.font('Helvetica').fontSize(8).text(
      `${item.itemType} | Weight: ${item.actualWeightKg} kg${dimsPart} | Zone: ${order.zoneCode}`
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
    getCountryName(addr.countryCode),
    addr.phone,
  ]
    .filter(Boolean)
    .join('\n');
}

module.exports = { generateLabelPdf, renderBarcode, STORAGE_DIR };
