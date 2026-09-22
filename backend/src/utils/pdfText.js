/**
 * PDFKit's standard 14 fonts (Helvetica etc., used by every PDF this app
 * generates) only reliably render WinAnsi/Latin-1-range characters —
 * "smart" typographic punctuation from Word/Google Docs copy-paste (curly
 * quotes, em/en dashes, non-breaking spaces, trademark/copyright/registered
 * symbols) renders as garbled glyphs otherwise, e.g. "Ltd™" showing up
 * mangled, or a non-breaking space before a word showing as "'Â word".
 * That second pattern is actually a *different*, more corrosive bug: it's
 * the classic signature of UTF-8 bytes that got misread one-byte-at-a-time
 * as Latin-1 somewhere upstream (a non-breaking space, UTF-8 bytes C2 A0,
 * decoded as Latin-1 becomes "Â" + a literal space) — this repairs that
 * too, but only when the tell-tale byte pattern is actually present, so
 * correctly-encoded text is never touched.
 */
function sanitizePdfText(input) {
  if (!input) return input;
  let str = String(input);

  if (/Â|â€/.test(str)) {
    try {
      const repaired = Buffer.from(str, 'latin1').toString('utf8');
      if (!repaired.includes('�')) str = repaired;
    } catch {
      // leave as-is — not actually mojibake, just contains these letters legitimately
    }
  }

  return str
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
    .replace(/™/g, '(TM)')
    .replace(/®/g, '(R)')
    .replace(/©/g, '(C)')
    // Anything still outside Latin-1 has no glyph in these fonts at all —
    // stripped rather than left to render as tofu/garbage.
    .replace(/[^\x00-\xFF]/g, '');
}

module.exports = { sanitizePdfText };
