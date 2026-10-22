const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { getCountryName } = require('../utils/countryNames');
const { sanitizePdfText } = require('../utils/pdfText');

const LOGO_PATH = path.join(__dirname, '../assets/logo-full.png');
const LOGO_ICON_PATH = path.join(__dirname, '../assets/logo-icon.png');

// Same faint centered watermark as consignmentPdf.js/invoiceService.js/
// labelService.js — the checkmark icon, not the full wordmark.
function drawWatermark(doc) {
  if (!fs.existsSync(LOGO_ICON_PATH)) return;
  const usableHeight = doc.page.height - doc.page.margins.top - doc.page.margins.bottom;
  const size = Math.min(260, usableHeight * 0.85);
  const x = (doc.page.width - size) / 2;
  const y = doc.page.margins.top + (usableHeight - size) / 2;
  doc.opacity(0.06).image(LOGO_ICON_PATH, x, y, { width: size, height: size });
  doc.opacity(1);
}

function formatAddress(a) {
  if (!a) return '—';
  return [a.businessName, a.street, a.suburb, a.city, a.state, a.pin, getCountryName(a.countryCode)]
    .filter(Boolean).map(sanitizePdfText).join(', ');
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

// Draws one header-cell-plus-value row of the shipment details table —
// label in the left (narrow) column, value word-wrapped in the right (wide)
// column, row height following whichever of the two taller.
function drawDetailRow(doc, label, value, x, y, labelWidth, valueWidth) {
  const startY = doc.y;
  doc.font('Helvetica-Bold').fontSize(8.5).text(label, x, y, { width: labelWidth });
  const labelBottom = doc.y;
  doc.font('Helvetica').fontSize(8.5).text(value || '—', x + labelWidth, y, { width: valueWidth });
  const valueBottom = doc.y;
  doc.y = startY;
  return Math.max(labelBottom, valueBottom);
}

// Simple ruled table — fixed column widths, header row shaded, body rows
// auto-growing to fit wrapped text (item type / dims can run long).
function drawItemsTable(doc, items, x, y, columns) {
  const rowPadding = 5;
  const totalWidth = columns.reduce((sum, c) => sum + c.width, 0);

  function drawRow(cells, isHeader) {
    const rowTop = y;
    doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5);
    let cx = x;
    let maxBottom = rowTop + rowPadding;
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      doc.text(String(cells[i] ?? ''), cx + 4, rowTop + rowPadding, { width: col.width - 8, align: col.align || 'left' });
      maxBottom = Math.max(maxBottom, doc.y);
      cx += col.width;
    }
    const rowHeight = maxBottom - rowTop + rowPadding;
    if (isHeader) {
      doc.rect(x, rowTop, totalWidth, rowHeight).fill('#F0F0F0');
      doc.fillColor('black');
      doc.font('Helvetica-Bold').fontSize(8.5);
      cx = x;
      for (let i = 0; i < columns.length; i++) {
        doc.text(String(cells[i] ?? ''), cx + 4, rowTop + rowPadding, { width: columns[i].width - 8, align: columns[i].align || 'left' });
        cx += columns[i].width;
      }
    }
    cx = x;
    for (let i = 0; i <= columns.length; i++) {
      doc.moveTo(cx, rowTop).lineTo(cx, rowTop + rowHeight).stroke('#CCCCCC');
      if (i < columns.length) cx += columns[i].width;
    }
    doc.moveTo(x, rowTop + rowHeight).lineTo(x + totalWidth, rowTop + rowHeight).stroke('#CCCCCC');
    y = rowTop + rowHeight;
  }

  doc.moveTo(x, y).lineTo(x + totalWidth, y).stroke('#CCCCCC');
  drawRow(columns.map((c) => c.header), true);
  for (const row of items) drawRow(row, false);
  return y;
}

/**
 * Streams a one-page landscape A4 load sheet straight to `res` — every
 * field staff entered when creating a Manual Label batch (shipment details
 * + a full items table), laid out for warehouse/loading-dock use rather
 * than the Consignment Note's signature-capture purpose. Not persisted
 * (same as the consignment sheet) — regenerated fresh from the batch row
 * each time it's downloaded.
 */
function generateLoadSheet(batch, res) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="load-sheet-${batch.orderId || batch.referenceNumber}.pdf"`);
  doc.pipe(res);

  drawWatermark(doc);

  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  let y = doc.page.margins.top;

  if (fs.existsSync(LOGO_PATH)) {
    doc.image(LOGO_PATH, left, y, { width: 90 });
  }
  doc.font('Helvetica-Bold').fontSize(16).text('Load Sheet', left, y + 2, { width, align: 'right' });
  y += 36;
  doc.moveTo(left, y).lineTo(left + width, y).stroke('#CCCCCC');
  y += 12;

  // Shipment details — two-column key/value table (Order ID / Reference /
  // Service / Date on the left pair, From / To / Instructions on the right
  // pair), each row sized to its own wrapped content.
  const halfWidth = width / 2 - 10;
  const labelWidth = 70;
  const valueWidth = halfWidth - labelWidth;

  let leftY = y;
  leftY = drawDetailRow(doc, 'Order ID', sanitizePdfText(batch.orderId || batch.referenceNumber), left, leftY, labelWidth, valueWidth) + 8;
  leftY = drawDetailRow(doc, 'Reference', sanitizePdfText(batch.refNumber), left, leftY, labelWidth, valueWidth) + 8;
  leftY = drawDetailRow(doc, 'Service', sanitizePdfText(batch.service), left, leftY, labelWidth, valueWidth) + 8;
  leftY = drawDetailRow(doc, 'Date', fmtDate(batch.createdAt), left, leftY, labelWidth, valueWidth) + 8;

  const rightX = left + halfWidth + 20;
  let rightY = y;
  rightY = drawDetailRow(doc, 'Sender', formatAddress(batch.fromAddress), rightX, rightY, labelWidth, valueWidth) + 8;
  rightY = drawDetailRow(doc, 'Receiver', formatAddress(batch.toAddress), rightX, rightY, labelWidth, valueWidth) + 8;
  rightY = drawDetailRow(doc, 'Instructions', sanitizePdfText(batch.instructions), rightX, rightY, labelWidth, valueWidth) + 8;

  y = Math.max(leftY, rightY) + 12;
  doc.moveTo(left, y).lineTo(left + width, y).stroke('#CCCCCC');
  y += 14;

  doc.font('Helvetica-Bold').fontSize(10).text('Items', left, y);
  y += 16;

  const columns = [
    { header: '#', width: 30, align: 'center' },
    { header: 'Item type', width: 150 },
    { header: 'Quantity', width: 80, align: 'center' },
    { header: 'Weight (kg)', width: 100, align: 'center' },
    { header: 'Length (cm)', width: 100, align: 'center' },
    { header: 'Width (cm)', width: 100, align: 'center' },
    { header: 'Height (cm)', width: 100, align: 'center' },
  ];
  const rows = (batch.items || []).map((it, i) => [
    String(i + 1),
    sanitizePdfText(it.itemType),
    String(it.quantity),
    String(it.actualWeightKg),
    it.lengthCm || '—',
    it.widthCm || '—',
    it.heightCm || '—',
  ]);
  drawItemsTable(doc, rows, left, y, columns);

  doc.end();
}

module.exports = { generateLoadSheet };
