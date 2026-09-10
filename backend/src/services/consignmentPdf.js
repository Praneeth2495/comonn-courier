const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { getCountryName } = require('../utils/countryNames');

const LOGO_PATH = path.join(__dirname, '../assets/logo-full.png');

function formatAddress(a) {
  if (!a) return '—';
  return [a.businessName, a.street, a.suburb, a.city, a.state, a.pin, getCountryName(a.countryCode)]
    .filter(Boolean).join(', ');
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

function drawSignatureBlock(doc, role, x, y, width) {
  doc.font('Helvetica-Bold').fontSize(8.5).text(`${role} name`, x, y);
  doc.moveTo(x, y + 15).lineTo(x + width, y + 15).stroke();
  doc.font('Helvetica-Bold').fontSize(8.5).text(`${role} signature`, x, y + 22);
  doc.moveTo(x, y + 37).lineTo(x + width, y + 37).stroke();
}

// Draws one copy (sender's or receiver's, by which half of the sheet it's
// printed on) of the consignment note. Both halves carry the exact same
// content — shipment details plus BOTH parties' name/signature lines — so
// whichever half ends up torn off and kept still stands alone as full proof
// of custody, rather than only half the story.
function drawCopy(doc, batch, top, copyLabel) {
  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  let y = top + 10;

  if (fs.existsSync(LOGO_PATH)) {
    doc.image(LOGO_PATH, left, y, { width: 85 });
  }
  doc.font('Helvetica-Bold').fontSize(10).text(copyLabel, left, y + 4, { width, align: 'right' });
  y += 30;

  doc.font('Helvetica-Bold').fontSize(12).text('Consignment Note', left, y);
  y += 16;

  doc.font('Helvetica').fontSize(8.5);
  doc.text(`Order ID: ${batch.orderId || batch.referenceNumber}`, left, y, { continued: true, width });
  doc.text(`     Date: ${fmtDate(batch.createdAt)}`);
  y = doc.y + 6;

  const colWidth = (width - 20) / 2;
  const colTop = y;
  doc.font('Helvetica-Bold').fontSize(8.5).text('FROM (Sender)', left, colTop);
  doc.font('Helvetica').fontSize(8).text(formatAddress(batch.fromAddress), left, colTop + 11, { width: colWidth });
  doc.font('Helvetica-Bold').fontSize(8.5).text('TO (Receiver)', left + colWidth + 20, colTop);
  doc.font('Helvetica').fontSize(8).text(formatAddress(batch.toAddress), left + colWidth + 20, colTop + 11, { width: colWidth });
  y = Math.max(doc.y, colTop + 50) + 8;

  const dimsPart = batch.lengthCm && batch.widthCm && batch.heightCm ? `, ${batch.lengthCm}x${batch.widthCm}x${batch.heightCm} cm` : '';
  doc.font('Helvetica').fontSize(8).text(
    `Item: ${batch.itemType} | Qty: ${batch.quantity} | Weight: ${batch.actualWeightKg} kg${dimsPart}`,
    left, y, { width }
  );
  y = doc.y + 16;

  const sigColWidth = (width - 20) / 2;
  drawSignatureBlock(doc, 'Sender', left, y, sigColWidth);
  drawSignatureBlock(doc, 'Receiver', left + sigColWidth + 20, y, sigColWidth);
}

/**
 * Streams a one-page A4 consignment sheet straight to `res` — top half a
 * "SENDER COPY", bottom half a "RECEIVER COPY", split by a dashed cut-line
 * — for a Manual Label batch. Not persisted anywhere (unlike labels/master,
 * which cache pdfData for reprint durability): this is a blank printable
 * form for physical signatures, cheap to regenerate on demand each time.
 */
function generateConsignmentSheet(batch, res) {
  const doc = new PDFDocument({ size: 'A4', margin: 30 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="consignment-${batch.orderId || batch.referenceNumber}.pdf"`);
  doc.pipe(res);

  const usableHeight = doc.page.height - doc.page.margins.top - doc.page.margins.bottom;
  const halfHeight = usableHeight / 2;
  const topStart = doc.page.margins.top;
  const midY = topStart + halfHeight;

  drawCopy(doc, batch, topStart, 'SENDER COPY');

  doc.dash(4, { space: 4 }).moveTo(doc.page.margins.left, midY).lineTo(doc.page.width - doc.page.margins.right, midY).stroke().undash();
  doc.font('Helvetica').fontSize(7).fillColor('#999').text('cut here', doc.page.margins.left, midY - 9);
  doc.fillColor('black');

  drawCopy(doc, batch, midY, 'RECEIVER COPY');

  doc.end();
}

module.exports = { generateConsignmentSheet };
