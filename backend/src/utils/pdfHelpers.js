const fs = require('fs');
const path = require('path');

// Shared by every PDFKit-based document (invoices, labels, manifests) —
// previously copy-pasted near-identically across 5 service files.
const STORAGE_DIR = process.env.LABEL_STORAGE_DIR || path.join(__dirname, '../../storage/labels');
const LOGO_PATH = path.join(__dirname, '../assets/logo-full.png');
const LOGO_ICON_PATH = path.join(__dirname, '../assets/logo-icon.png');

function ensureStorageDir() {
  if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

// PDFKit's standard Helvetica font doesn't include the ₹ glyph (renders as
// a mangled superscript) — use "Rs." in generated PDFs. The web UI is
// unaffected since browsers render ₹ fine with real fonts.
function money(n) {
  return `Rs. ${Number(n).toFixed(2)}`;
}

function drawLine(doc, label, value, opts = {}) {
  const y = doc.y;
  doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.size || 10).text(label, 50, y, { continued: false });
  doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.size || 10).text(value, 400, y, { width: 145, align: 'right' });
}

// Large, faint icon centered on the page, behind everything else — drawn
// first (pdfkit has no z-index, later draws sit on top) so all subsequent
// text remains fully legible over it. `size` defaults to the A4-page value
// (320); labelService's smaller 4x6in label page passes 170 instead.
function drawWatermark(doc, size = 320) {
  if (!fs.existsSync(LOGO_ICON_PATH)) return;
  const x = (doc.page.width - size) / 2;
  const y = (doc.page.height - size) / 2;
  doc.opacity(0.06).image(LOGO_ICON_PATH, x, y, { width: size, height: size });
  doc.opacity(1);
}

module.exports = { STORAGE_DIR, LOGO_PATH, LOGO_ICON_PATH, ensureStorageDir, money, drawLine, drawWatermark };
