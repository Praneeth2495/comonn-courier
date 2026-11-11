const fs = require('fs');
const PDFDocument = require('pdfkit');
const { sanitizePdfText } = require('../utils/pdfText');
const { drawWatermark, LOGO_PATH } = require('../utils/pdfHelpers');

// Landscape A4 (~842x595pt at 72dpi) with 30pt margins — 782pt usable
// width, split across these 7 columns. Sender/Receiver get the lion's
// share since "full details & address" is a long combined string; the
// others are short, fixed-shape values.
const COLUMNS = [
  { key: 'Order ID', width: 65 },
  { key: 'Sender Full Details & Address', width: 250 },
  { key: 'Receiver Full Details & Address', width: 250 },
  { key: 'Pickup Date', width: 65 },
  { key: 'Status', width: 90 },
  { key: 'Weight (kg)', width: 62, align: 'right' },
];

/**
 * Streams a ruled, multi-page landscape A4 table of order rows straight to
 * `res` — same row shape (and same column set/order) as the .xlsx export,
 * just rendered as a PDF instead. Not persisted anywhere, regenerated
 * fresh from whatever's currently filtered each time it's downloaded, same
 * as the consignment/load sheets.
 */
function generateOrdersPdf(rows, res) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="orders-${new Date().toISOString().slice(0, 10)}.pdf"`);
  doc.pipe(res);

  const left = doc.page.margins.left;
  const top = doc.page.margins.top;
  const pageBottom = doc.page.height - doc.page.margins.bottom;
  const totalWidth = COLUMNS.reduce((sum, c) => sum + c.width, 0);
  const rowPadding = 5;

  function drawHeaderBand(y) {
    doc.font('Helvetica-Bold').fontSize(8);
    let cx = left;
    doc.rect(left, y, totalWidth, 20).fill('#F0F0F0');
    doc.fillColor('black');
    for (const col of COLUMNS) {
      // Always centered, regardless of the column's own body-cell
      // alignment — Weight's label ("Weight (kg)") was wrapping to two
      // lines under its right-aligned body alignment and reading as
      // off-center; headers read better centered either way.
      doc.text(col.key, cx + 4, y + rowPadding, { width: col.width - 8, align: 'center' });
      cx += col.width;
    }
    cx = left;
    for (let i = 0; i <= COLUMNS.length; i++) {
      doc.moveTo(cx, y).lineTo(cx, y + 20).stroke('#CCCCCC');
      if (i < COLUMNS.length) cx += COLUMNS[i].width;
    }
    doc.moveTo(left, y + 20).lineTo(left + totalWidth, y + 20).stroke('#CCCCCC');
    return y + 20;
  }

  const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  // Logo top-left + title right-aligned in the same row — same layout
  // loadSheetPdf.js uses for its own landscape header. Repeated on every
  // page (not just the first), same as the header band below it.
  function drawPageHeader() {
    drawWatermark(doc, 260);
    if (fs.existsSync(LOGO_PATH)) {
      doc.image(LOGO_PATH, left, top, { width: 90 });
    }
    doc.font('Helvetica-Bold').fontSize(16).text('Orders', left, top + 2, { width: usableWidth, align: 'right' });
    return drawHeaderBand(top + 36);
  }

  let y = drawPageHeader();

  doc.font('Helvetica').fontSize(8);
  for (const row of rows) {
    const cellTexts = COLUMNS.map((col) => sanitizePdfText(String(row[col.key] ?? '')));

    // Measure wrapped height first (without drawing) so a row that won't
    // fit on the current page starts a fresh page — and its header band —
    // before any of it is drawn, rather than splitting across pages.
    let rowHeight = rowPadding * 2;
    COLUMNS.forEach((col, i) => {
      const h = doc.heightOfString(cellTexts[i], { width: col.width - 8 });
      rowHeight = Math.max(rowHeight, h + rowPadding * 2);
    });

    if (y + rowHeight > pageBottom) {
      doc.addPage({ size: 'A4', layout: 'landscape', margin: 30 });
      y = drawPageHeader();
      doc.font('Helvetica').fontSize(8);
    }

    const rowTop = y;
    let cx = left;
    COLUMNS.forEach((col, i) => {
      doc.text(cellTexts[i], cx + 4, rowTop + rowPadding, { width: col.width - 8, align: col.align || 'left' });
      cx += col.width;
    });
    cx = left;
    doc.strokeColor('#CCCCCC');
    for (let i = 0; i <= COLUMNS.length; i++) {
      doc.moveTo(cx, rowTop).lineTo(cx, rowTop + rowHeight).stroke();
      if (i < COLUMNS.length) cx += COLUMNS[i].width;
    }
    doc.moveTo(left, rowTop + rowHeight).lineTo(left + totalWidth, rowTop + rowHeight).stroke();
    doc.strokeColor('black');
    y = rowTop + rowHeight;
  }

  doc.end();
}

module.exports = { generateOrdersPdf };
