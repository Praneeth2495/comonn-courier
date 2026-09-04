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

const LABEL_PAGE_SIZE = { size: [288, 432], margin: 16 }; // 4in x 6in @72dpi

/**
 * Draws one label's full content onto `doc` at its current page — shared by
 * generateLabelPdf (one label = one file) and generateMasterLabelPdf (many
 * labels' pages concatenated into one file), so the two can never visually
 * drift apart. Caller owns the PDFDocument's lifecycle (creation, adding
 * further pages, .end()) — this only draws, it never touches doc.pipe/.end.
 */
async function drawLabelPage(doc, order, { packageIndex, totalPackages, item, barcodeValue }) {
  const barcodePng = await renderBarcode(barcodeValue);

  // Header — logo sits top-right; the info column starts at the very top
  // of the content area on the left, with no COMONN text duplicating it.
  const headerTop = doc.y;
  const pageRight = doc.page.width - doc.page.margins.right;
  if (fs.existsSync(LOGO_PATH)) {
    const logoWidth = 70;
    doc.image(LOGO_PATH, pageRight - logoWidth, headerTop, { width: logoWidth });
  }
  doc.y = headerTop;
  doc.fontSize(8).font('Helvetica');
  doc.text(`Service: ${order.service.name}`);
  doc.text(`Order: ${order.orderNumber}`);
  doc.text(`Package ${packageIndex} of ${totalPackages}`);
  doc.moveDown(0.5);

  // Receiver / Sender — "To" is the delivery address and is what matters
  // most on the package, so it's rendered first and noticeably
  // larger/bolder than "From".
  doc.font('Helvetica-Bold').fontSize(13).text('TO');
  doc.font('Helvetica-Bold').fontSize(13).text(formatAddress(order.receiverAddress));
  if (order.receiverAddress.instructions) {
    doc.moveDown(0.15);
    doc.font('Helvetica-Bold').fontSize(8).text('Delivery instructions', { continued: false });
    doc.font('Helvetica').fontSize(8).text(order.receiverAddress.instructions, { width: 256 });
  }
  doc.moveDown(0.4);
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#6B7280').text('FROM');
  doc.font('Helvetica').fontSize(8).fillColor('#6B7280').text(formatAddress(order.senderAddress));
  doc.fillColor('black');
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

  // Destination country badge — black rectangle, white bold text,
  // centered above the barcode so it's the first thing a sorter sees.
  const countryCode = order.receiverAddress.countryCode;
  if (countryCode) {
    const badgeWidth = 50;
    const badgeHeight = 22;
    const badgeX = (doc.page.width - badgeWidth) / 2;
    const badgeY = doc.y;
    doc.rect(badgeX, badgeY, badgeWidth, badgeHeight).fill('black');
    doc.fillColor('white').font('Helvetica-Bold').fontSize(14).text(countryCode, badgeX, badgeY + 5, { width: badgeWidth, align: 'center' });
    doc.fillColor('black');
    doc.y = badgeY + badgeHeight + 8;
  }

  // Barcode — position text explicitly below the image's fitted height,
  // since moveDown() is line-height-based and doesn't know the image size.
  // x/width are explicit throughout (rather than relying on doc.x) because
  // the badge's text() call above leaves doc.x parked at the badge's left
  // edge, not the page margin — align:'center' alone would center within
  // that leftover narrower box and push everything off to the right.
  const contentLeft = doc.page.margins.left;
  const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const barcodeTop = doc.y;
  const barcodeHeight = 80;
  doc.image(barcodePng, contentLeft, barcodeTop, { fit: [contentWidth, barcodeHeight], align: 'center' });
  doc.y = barcodeTop + barcodeHeight + 10;
  doc.font('Helvetica-Bold').fontSize(12).text(barcodeValue, contentLeft, doc.y, { width: contentWidth, align: 'center' });
  if (totalPackages > 1) {
    doc.font('Helvetica').fontSize(8).text(`Shipment tracking: ${order.trackingNumber}`, contentLeft, doc.y, { width: contentWidth, align: 'center' });
  }
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

  const doc = new PDFDocument(LABEL_PAGE_SIZE);
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);
  const finished = new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  await drawLabelPage(doc, order, { packageIndex, totalPackages, item, barcodeValue });
  doc.end();
  await finished;

  return { filePath, fileName };
}

/**
 * Generates one combined multi-page PDF — one page per label, same content
 * as each label's own individual PDF — for the manual-label tool's "master
 * label" (see manualLabel.controller.js). `pages` is an array of the same
 * shape generateLabelPdf's second argument takes, one entry per label.
 */
async function generateMasterLabelPdf(order, pages, fileName) {
  ensureStorageDir();
  const filePath = path.join(STORAGE_DIR, fileName);

  const doc = new PDFDocument(LABEL_PAGE_SIZE);
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);
  const finished = new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  for (let i = 0; i < pages.length; i++) {
    if (i > 0) doc.addPage(LABEL_PAGE_SIZE);
    await drawLabelPage(doc, order, pages[i]);
  }
  doc.end();
  await finished;

  return { filePath, fileName };
}

function formatAddress(addr) {
  // City/state/postcode are always present for a real order's saved
  // address, but a manual label's city (and suburb, via line2 above) is
  // optional — build this line from whichever parts exist rather than
  // leaving a stray leading comma/space when one's missing.
  const cityStatePostcode = [addr.city, addr.state].filter(Boolean).join(', ') + (addr.postcode ? ` ${addr.postcode}` : '');
  return [
    addr.contactName,
    addr.line1,
    addr.line2,
    cityStatePostcode || null,
    getCountryName(addr.countryCode),
    addr.phone,
  ]
    .filter(Boolean)
    .join('\n');
}

module.exports = { generateLabelPdf, renderBarcode, STORAGE_DIR };
