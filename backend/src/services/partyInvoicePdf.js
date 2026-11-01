const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { sanitizePdfText } = require('../utils/pdfText');
const { STORAGE_DIR, LOGO_PATH, ensureStorageDir, money, drawLine: line, drawWatermark } = require('../utils/pdfHelpers');

/**
 * The document's own name, shown as its heading here and reused for the
 * email subject/body in partyInvoice.controller.js's sendInvoiceEmail — a
 * SALARY payable is a Pay Slip (paid to an employee, not billed to a
 * vendor), a Receivable is a Remittance Advice (confirming an amount
 * owed/settled, not a request to pay), and every other Payable keeps the
 * plain "Payable Invoice" wording.
 */
function documentLabel(invoice) {
  if (invoice.category === 'SALARY') return 'Pay Slip';
  if (invoice.direction === 'RECEIVABLE') return 'Remittance Advice';
  return 'Payable Invoice';
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
  const title = documentLabel(invoice);

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
      [invoice.partyName, invoice.businessName, invoice.email, invoice.phone].filter(Boolean).map(sanitizePdfText).join('\n'),
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

module.exports = { generatePartyInvoicePdf, documentLabel, STORAGE_DIR };
