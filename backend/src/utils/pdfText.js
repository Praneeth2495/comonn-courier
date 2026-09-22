/**
 * PDFKit's standard 14 fonts (Helvetica etc., used by every PDF this app
 * generates) only reliably render WinAnsi/Latin-1-range printable
 * characters. Two distinct failure modes both show up as garbled address
 * text:
 *
 * 1. Raw TAB/control characters and non-breaking spaces ending up in
 *    stored address fields — traced to a real production batch where
 *    copy-pasting out of a spreadsheet left literal tab characters and a
 *    non-breaking space trailing the business name/pin/street (e.g.
 *    "Bellis Australia Pty Ltd \t\t"). These aren't in Helvetica's
 *    printable glyph set, so PDFKit renders something else in their place
 *    — this is what showed up as a stray "™" and garbage characters
 *    swallowing the start of "Australia" in the reported bug.
 * 2. "Smart" typographic punctuation from Word/Google Docs copy-paste
 *    (curly quotes, em/en dashes, ellipsis, trademark/copyright/registered
 *    symbols) — valid Unicode, just outside what these fonts render
 *    correctly.
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
