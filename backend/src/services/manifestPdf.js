const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { renderBarcode, STORAGE_DIR } = require('./labelService');

const LOGO_PATH = path.join(__dirname, '../assets/logo-full.png');
const LOGO_ICON_PATH = path.join(__dirname, '../assets/logo-icon.png');

function ensureStorageDir() {
  if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });
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
 * Generates the manifest "sheet" PDF: from/to, date, totals, the manifest's
 * own scannable barcode (reuses labelService's Code128 renderer — the same
 * barcode is what Batch Scan later recognizes to bulk-update every order
 * listed here), and a table of every order currently in the manifest.
 * Regenerable on the fly like every other invoice/label PDF in this app.
 */
async function generateManifestPdf(manifest) {
  ensureStorageDir();
  const fileName = `${manifest.manifestNumber}.pdf`;
  const filePath = path.join(STORAGE_DIR, fileName);
  const barcodePng = await renderBarcode(manifest.barcodeValue);

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
    doc.font('Helvetica-Bold').fontSize(20).text('Manifest', 50, headerTop + 4);
    doc.y = headerTop + 36;
    doc.moveDown(0.5);

    doc.image(barcodePng, 50, doc.y, { fit: [180, 45] });
    doc.font('Helvetica-Bold').fontSize(11).text(manifest.manifestNumber, 50, doc.y + 48);
    doc.y = doc.y + 48 + 16;
    doc.moveDown(0.5);

    const metaTop = doc.y;
    doc.font('Helvetica-Bold').fontSize(10).text('From (Hub)', 50, metaTop);
    doc.font('Helvetica').fontSize(9).text(`${manifest.hub.name}\n${manifest.hub.address}`, 50, metaTop + 14, { width: 220 });
    doc.font('Helvetica-Bold').fontSize(10).text('To (Airport)', 320, metaTop);
    doc.font('Helvetica').fontSize(9).text(manifest.toAddress, 320, metaTop + 14, { width: 220 });
    doc.y = Math.max(doc.y, metaTop + 80);
    doc.moveDown(0.5);

    doc.font('Helvetica-Bold').fontSize(10).text('Manifest date  ', 50, doc.y, { continued: true });
    doc.font('Helvetica').text(new Date(manifest.manifestDate).toLocaleDateString('en-IN'));
    doc.moveDown(1);

    const summaryTop = doc.y;
    const summaryCols = [
      ['Orders', manifest.orderCount],
      ['Total qty', manifest.totalQty],
      ['Total weight', `${Number(manifest.totalWeightKg).toFixed(2)} kg`],
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
    for (const order of manifest.orders) {
      if (doc.y > 760) {
        doc.addPage();
        doc.y = 50;
      }
      const rowY = doc.y;
      const qty = (order.items || []).reduce((sum, it) => sum + it.quantity, 0);
      doc.text(order.orderNumber, colX.order, rowY, { width: 90 });
      doc.text(order.receiverAddress?.contactName || '', colX.receiver, rowY, { width: 150 });
      doc.text(`${order.receiverAddress?.city || ''}, ${order.receiverAddress?.countryCode || ''}`, colX.dest, rowY, { width: 100 });
      doc.text(order.airportCode || '—', colX.airport, rowY, { width: 40 });
      doc.text(String(qty), colX.qty, rowY, { width: 35 });
      doc.text(Number(order.chargeableWeightKg).toFixed(2), colX.weight, rowY, { width: 50 });
      doc.moveDown(0.6);
    }

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  return { filePath, fileName };
}

module.exports = { generateManifestPdf, STORAGE_DIR };
