const { nextYearlySequence } = require('./sequenceCounter');

/**
 * Generates IN<seq> e.g. IN1, IN2, IN3... The sequence only resets when the
 * calendar year changes — unlike order numbers, it does not reset monthly.
 */
async function generateInvoiceNumber() {
  const seq = await nextYearlySequence('invoice', new Date().getFullYear());
  return `IN${seq}`;
}

/**
 * Generates RIN<seq>/PIN<seq> for Receivable/Payable invoices — same
 * yearly-resetting counter mechanism as generateInvoiceNumber, just keyed
 * separately per direction so the two sequences don't interleave.
 */
async function generatePartyInvoiceNumber(direction) {
  const kind = direction === 'PAYABLE' ? 'payable' : 'receivable';
  const prefix = direction === 'PAYABLE' ? 'PIN' : 'RIN';
  const seq = await nextYearlySequence(kind, new Date().getFullYear());
  return `${prefix}${seq}`;
}

/** Generates SIN<seq> (Storage Invoice Number) for Box Storage bookings, same yearly-resetting idiom. */
async function generateBoxInvoiceNumber() {
  const seq = await nextYearlySequence('storage', new Date().getFullYear());
  return `SIN${seq}`;
}

/** Generates MAN<seq> for air-freight manifests, same yearly-resetting idiom. */
async function generateManifestNumber() {
  const seq = await nextYearlySequence('manifest', new Date().getFullYear());
  return `MAN${seq}`;
}

module.exports = { generateInvoiceNumber, generatePartyInvoiceNumber, generateBoxInvoiceNumber, generateManifestNumber, nextYearlySequence };
