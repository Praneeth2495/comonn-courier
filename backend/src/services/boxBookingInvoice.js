const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const STORAGE_DIR = process.env.LABEL_STORAGE_DIR || path.join(__dirname, '../../storage/labels');
const LOGO_PATH = path.join(__dirname, '../assets/logo-full.png');
const LOGO_ICON_PATH = path.join(__dirname, '../assets/logo-icon.png');

function ensureStorageDir() {
  if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

// PDFKit's standard Helvetica font doesn't include the ₹ glyph — use "Rs."
// in generated PDFs, same as invoiceService.js/partyInvoicePdf.js.
function money(n) {
  return `Rs. ${Number(n).toFixed(2)}`;
}

function line(doc, label, value, opts = {}) {
  const y = doc.y;
  doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.size || 10).text(label, 50, y, { continued: false });
  doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.size || 10).text(value, 400, y, { width: 145, align: 'right' });
}

function drawWatermark(doc) {
  if (!fs.existsSync(LOGO_ICON_PATH)) return;
  const size = 320;
  const x = (doc.page.width - size) / 2;
  const y = (doc.page.height - size) / 2;
  doc.opacity(0.06).image(LOGO_ICON_PATH, x, y, { width: size, height: size });
  doc.opacity(1);
}

/**
 * Generates an A4 invoice PDF for a paid BoxBooking (Storage rental). Safe
 * to regenerate on the fly from DB fields if the file goes missing on
 * redeploy — same pattern as invoiceService.js/partyInvoicePdf.js. Box
 * Storage has no GST field (unlike PartyInvoice), so totalAmount is shown
 * as the final line with no tax breakdown.
 */
async function generateBoxBookingInvoicePdf(booking) {
  ensureStorageDir();
  const fileName = `${booking.invoiceNumber}.pdf`;
  const filePath = path.join(STORAGE_DIR, fileName);

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    drawWatermark(doc);

    const headerTop = doc.y;
    if (fs.existsSync(LOGO_PATH)) {
      const logoWidth = 110;
      doc.image(LOGO_PATH, 545 - logoWidth, headerTop, { width: logoWidth });
    } else {
      doc.font('Helvetica-Bold').fontSize(16).text('COMONN', 50, headerTop, { align: 'right', width: 495 });
    }
    doc.font('Helvetica-Bold').fontSize(20).text('Storage Invoice', 50, headerTop + 4);
    doc.y = headerTop + 36;
    doc.moveDown(1);

    doc.fontSize(10);
    doc.font('Helvetica-Bold').text('Invoice #  ', 50, doc.y, { continued: true });
    doc.font('Helvetica').text(booking.invoiceNumber);
    doc.font('Helvetica-Bold').text('Date  ', 50, doc.y, { continued: true });
    doc.font('Helvetica').text(new Date(booking.createdAt).toLocaleDateString('en-IN'));
    doc.moveDown(1);

    const partyTop = doc.y;
    doc.font('Helvetica-Bold').fontSize(10).text('Bill To', 50, partyTop);
    doc.font('Helvetica').fontSize(9).text(
      [booking.customer?.fullName, booking.customer?.email, booking.customer?.phone].filter(Boolean).join('\n'),
      50, partyTop + 14, { width: 320 }
    );
    doc.y = Math.max(doc.y, partyTop + 70);
    doc.moveDown(1);

    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);

    line(doc, 'Description', 'Amount', { bold: true });
    doc.moveDown(0.3);
    line(doc, `${booking.boxSize?.name} storage — ${booking.days} day${booking.days === 1 ? '' : 's'} (Box ${booking.box?.number ?? ''})`, money(booking.totalAmount));

    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);
    line(doc, 'Total', `${money(booking.totalAmount)} ${booking.currency}`, { bold: true, size: 12 });
    doc.moveDown(2);

    doc.font('Helvetica-Bold').fontSize(10).text('Storage period', 50, doc.y);
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(9).text(
      `${new Date(booking.startDate).toLocaleDateString('en-IN')} — ${new Date(booking.endDate).toLocaleDateString('en-IN')}`
    );

    doc.moveDown(1);
    doc.font('Helvetica-Bold').fontSize(10).text('Payment', 50, doc.y);
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(9).text('Paid');

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  return { filePath, fileName };
}

module.exports = { generateBoxBookingInvoicePdf, STORAGE_DIR };
