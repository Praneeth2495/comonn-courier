const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const STORAGE_DIR = process.env.LABEL_STORAGE_DIR || path.join(__dirname, '../../storage/labels');

function ensureStorageDir() {
  if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

// PDFKit's standard Helvetica font doesn't include the ₹ glyph (renders as
// a mangled superscript) — use "Rs." in generated PDFs. The web UI is
// unaffected since browsers render ₹ fine with real fonts.
function money(n) {
  return `Rs. ${Number(n).toFixed(2)}`;
}

function line(doc, label, value, opts = {}) {
  const y = doc.y;
  doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.size || 10).text(label, 50, y, { continued: false });
  doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.size || 10).text(value, 400, y, { width: 145, align: 'right' });
}

function formatAddress(addr) {
  return [addr.contactName, addr.line1, addr.line2, `${addr.city}${addr.state ? ', ' + addr.state : ''} ${addr.postcode}`, addr.countryCode]
    .filter(Boolean)
    .join('\n');
}

/**
 * Generates an A4 invoice PDF for the order (one invoice per order,
 * regardless of how many physical packages/labels it has).
 */
async function generateInvoicePdf(order) {
  ensureStorageDir();
  const fileName = `${order.orderNumber}-invoice.pdf`;
  const filePath = path.join(STORAGE_DIR, fileName);

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    doc.font('Helvetica-Bold').fontSize(20).text('COMONN', { continued: true });
    doc.font('Helvetica').fontSize(11).text('  International Courier');
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(14).text('Tax Invoice');
    doc.moveDown(1);

    doc.font('Helvetica').fontSize(10);
    line(doc, 'Invoice #', `INV-${order.orderNumber}`);
    line(doc, 'Order #', order.orderNumber);
    line(doc, 'Date', new Date(order.createdAt).toLocaleDateString('en-IN'));
    doc.moveDown(1);

    const colTop = doc.y;
    doc.font('Helvetica-Bold').fontSize(10).text('Bill To', 50, colTop);
    doc.font('Helvetica').fontSize(9).text(formatAddress(order.senderAddress), 50, colTop + 14, { width: 220 });
    doc.font('Helvetica-Bold').fontSize(10).text('Ship To', 320, colTop);
    doc.font('Helvetica').fontSize(9).text(formatAddress(order.receiverAddress), 320, colTop + 14, { width: 220 });
    doc.y = Math.max(doc.y, colTop + 100);
    doc.moveDown(1);

    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);

    if (order.pricingPending) {
      doc.font('Helvetica').fontSize(9).text(
        'Weight, dimensions and price will be assessed by our courier at the time of pickup. A final invoice will be issued after collection.',
        50, doc.y, { width: 495 }
      );
      doc.moveDown(1.5);
    } else {
      line(doc, 'Description', 'Amount', { bold: true });
      doc.moveDown(0.3);
      line(doc, `Freight — ${order.service.name}`, money(order.baseFreight));

      const surcharges = order.pricingBreakdown?.pricing?.surcharges || [];
      for (const s of surcharges) {
        line(doc, s.name, money(s.amount));
      }

      for (const a of order.addons || []) {
        line(doc, a.label, Number(a.amount) > 0 ? money(a.amount) : 'Free');
      }

      if (Number(order.discountTotal) > 0) {
        line(doc, `Discount (${order.promoCode || ''})`, `-${money(order.discountTotal)}`);
      }
      if (Number(order.taxTotal) > 0) {
        line(doc, `Tax (${(Number(order.taxRate) * 100).toFixed(0)}%)`, money(order.taxTotal));
      }

      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.5);
      line(doc, 'Total', `${money(order.grandTotal)} ${order.currency}`, { bold: true, size: 12 });
      doc.moveDown(2);
    }

    doc.font('Helvetica-Bold').fontSize(10).text('Payment', 50, doc.y);
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(9);
    const paymentStatusLabel =
      order.payment?.method === 'cash'
        ? 'Cash — to be collected at pickup'
        : order.payment?.status === 'SUCCEEDED' ? 'Paid' : order.payment?.status || 'Pending';
    doc.text(`Status: ${paymentStatusLabel}`);
    if (order.payment?.method) doc.text(`Method: ${order.payment.method}`);
    if (order.payment?.method !== 'cash' && order.payment?.updatedAt) doc.text(`Paid on: ${new Date(order.payment.updatedAt).toLocaleString('en-IN')}`);

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  return { filePath, fileName };
}

module.exports = { generateInvoicePdf, STORAGE_DIR };
