const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { renderBarcode } = require('./labelService');
const { sanitizePdfText } = require('../utils/pdfText');
const { STORAGE_DIR, LOGO_PATH, ensureStorageDir, drawWatermark } = require('../utils/pdfHelpers');

/**
 * Generates the hub-to-hub transfer load sheet PDF: from/to hub, transfer-by/
 * reference/contact, the load sheet's own scannable barcode (same
 * labelService Code128 renderer Manifest uses — Batch Scan recognizes it the
 * same way, see resolveBarcodes in batch.controller.js), and a table of
 * every order currently on it. Regenerable on the fly like every other
 * invoice/label/manifest PDF in this app — not the Manual Label batch
 * "Load Sheet" (src/services/loadSheetPdf.js), a separate, unrelated feature
 * that happens to share the plain-English name.
 */
async function generateHubLoadSheetPdf(loadSheet) {
  ensureStorageDir();
  const fileName = `${loadSheet.loadSheetNumber}.pdf`;
  const filePath = path.join(STORAGE_DIR, fileName);
  const barcodePng = await renderBarcode(loadSheet.barcodeValue);

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
    doc.font('Helvetica-Bold').fontSize(20).text('Load Sheet', 50, headerTop + 4);
    doc.y = headerTop + 36;
    doc.moveDown(0.5);

    doc.image(barcodePng, 50, doc.y, { fit: [180, 45] });
    doc.font('Helvetica-Bold').fontSize(11).text(loadSheet.loadSheetNumber, 50, doc.y + 48);
    doc.y = doc.y + 48 + 16;
    doc.moveDown(0.5);

    // Most Hub rows have address === name (the real street address was never
    // filled in, just the branch/city name typed into both fields) — only
    // print the address as its own line when it actually adds information,
    // otherwise the block reads as the same text printed twice.
    function hubBlock(hub) {
      if (!hub) return '—';
      return hub.address && hub.address !== hub.name ? `${hub.name}\n${hub.address}` : hub.name;
    }
    const metaTop = doc.y;
    doc.font('Helvetica-Bold').fontSize(10).text('From Hub', 50, metaTop);
    doc.font('Helvetica').fontSize(9).text(sanitizePdfText(hubBlock(loadSheet.fromHub)), 50, metaTop + 14, { width: 220 });
    doc.font('Helvetica-Bold').fontSize(10).text('To Hub', 320, metaTop);
    doc.font('Helvetica').fontSize(9).text(sanitizePdfText(hubBlock(loadSheet.toHub)), 320, metaTop + 14, { width: 220 });
    doc.y = Math.max(doc.y, metaTop + 56);
    doc.moveDown(0.5);

    doc.font('Helvetica-Bold').fontSize(10).text('Transfer by  ', 50, doc.y, { continued: true });
    doc.font('Helvetica').text(sanitizePdfText(loadSheet.transferBy) || '—');
    if (loadSheet.reference) {
      doc.font('Helvetica-Bold').fontSize(10).text('Reference  ', 50, doc.y, { continued: true });
      doc.font('Helvetica').text(sanitizePdfText(loadSheet.reference));
    }
    if (loadSheet.contactName || loadSheet.contactMobile) {
      doc.font('Helvetica-Bold').fontSize(10).text('Contact  ', 50, doc.y, { continued: true });
      doc.font('Helvetica').text([sanitizePdfText(loadSheet.contactName), sanitizePdfText(loadSheet.contactMobile)].filter(Boolean).join(' · '));
    }
    doc.font('Helvetica-Bold').fontSize(10).text('Date  ', 50, doc.y, { continued: true });
    doc.font('Helvetica').text(new Date(loadSheet.createdAt).toLocaleDateString('en-IN'));
    doc.moveDown(1);

    const summaryTop = doc.y;
    const summaryCols = [
      ['Orders', loadSheet.orderCount],
      ['Total qty', loadSheet.totalQty],
      ['Total weight', `${Number(loadSheet.totalWeightKg).toFixed(2)} kg`],
    ];
    summaryCols.forEach(([label, value], i) => {
      const x = 50 + i * 165;
      doc.font('Helvetica').fontSize(9).text(label, x, summaryTop);
      doc.font('Helvetica-Bold').fontSize(14).text(String(value), x, summaryTop + 12);
    });
    doc.y = summaryTop + 40;
    doc.moveDown(0.5);

    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);

    const colX = { order: 50, receiver: 145, dest: 330, qty: 460, weight: 500 };
    doc.font('Helvetica-Bold').fontSize(8);
    doc.text('Order #', colX.order, doc.y, { continued: false, width: 90 });
    doc.text('Receiver', colX.receiver, doc.y - 9, { width: 180 });
    doc.text('Dest.', colX.dest, doc.y - 9, { width: 120 });
    doc.text('Qty', colX.qty, doc.y - 9, { width: 35 });
    doc.text('Wt (kg)', colX.weight, doc.y - 9, { width: 45 });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.3);

    doc.font('Helvetica').fontSize(8);
    for (const order of loadSheet.orders) {
      if (doc.y > 760) {
        doc.addPage();
        doc.y = 50;
      }
      const rowY = doc.y;
      const qty = (order.items || []).reduce((sum, it) => sum + it.quantity, 0);
      doc.text(sanitizePdfText(order.orderNumber), colX.order, rowY, { width: 90 });
      doc.text(sanitizePdfText(order.receiverAddress?.contactName || ''), colX.receiver, rowY, { width: 180 });
      doc.text(sanitizePdfText(`${order.receiverAddress?.city || ''}, ${order.receiverAddress?.countryCode || ''}`), colX.dest, rowY, { width: 120 });
      doc.text(String(qty), colX.qty, rowY, { width: 35 });
      doc.text(Number(order.chargeableWeightKg).toFixed(2), colX.weight, rowY, { width: 45 });
      doc.moveDown(0.6);
    }

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  return { filePath, fileName };
}

module.exports = { generateHubLoadSheetPdf };
