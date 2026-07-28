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
// in generated PDFs, same as invoiceService.js.
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
 * Generates an A4 PDF for a PartyInvoice (Receivable or Payable). Safe to
 * regenerate on the fly from DB fields — unlike a staff-uploaded
 * attachment, nothing here is lost if the file goes missing on redeploy.
 */
async function generatePartyInvoicePdf(invoice) {
  ensureStorageDir();
  const fileName = `${invoice.invoiceNumber}.pdf`;
  const filePath = path.join(STORAGE_DIR, fileName);
  const title = invoice.direction === 'PAYABLE' ? 'Payable Invoice' : 'Receivable Invoice';

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
    doc.font('Helvetica-Bold').fontSize(20).text(title, 50, headerTop + 4);
    doc.y = headerTop + 36;
    doc.moveDown(1);

    doc.fontSize(10);
    doc.font('Helvetica-Bold').text('Invoice #  ', 50, doc.y, { continued: true });
    doc.font('Helvetica').text(invoice.invoiceNumber);
    doc.font('Helvetica-Bold').text('Date  ', 50, doc.y, { continued: true });
    doc.font('Helvetica').text(new Date(invoice.createdAt).toLocaleDateString('en-IN'));
    doc.font('Helvetica-Bold').text('Due date  ', 50, doc.y, { continued: true });
    doc.font('Helvetica').text(new Date(invoice.dueDate).toLocaleDateString('en-IN'));
    doc.moveDown(1);

    const partyTop = doc.y;
    doc.font('Helvetica-Bold').fontSize(10).text(invoice.direction === 'PAYABLE' ? 'Payable To' : 'Bill To', 50, partyTop);
    doc.font('Helvetica').fontSize(9).text(
      [invoice.partyName, invoice.businessName, invoice.email, invoice.phone].filter(Boolean).join('\n'),
      50, partyTop + 14, { width: 320 }
    );
    doc.y = Math.max(doc.y, partyTop + 70);
    doc.moveDown(1);

    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);

    line(doc, 'Description', 'Amount', { bold: true });
    doc.moveDown(0.3);
    line(doc, invoice.description, money(invoice.amount));
    if (Number(invoice.gstPercent) > 0) {
      const gstAmount = Number(invoice.amount) * Number(invoice.gstPercent) / 100;
      line(doc, `GST (${Number(invoice.gstPercent).toFixed(2)}%)`, money(gstAmount));
    }

    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);
    line(doc, 'Total', `${money(invoice.totalAmount)} ${invoice.currency}`, { bold: true, size: 12 });
    doc.moveDown(2);

    doc.font('Helvetica-Bold').fontSize(10).text('Status', 50, doc.y);
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(9).text(invoice.status === 'PAID' ? 'Paid' : `Unpaid — due ${new Date(invoice.dueDate).toLocaleDateString('en-IN')}`);

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  return { filePath, fileName };
}

module.exports = { generatePartyInvoicePdf, STORAGE_DIR };
