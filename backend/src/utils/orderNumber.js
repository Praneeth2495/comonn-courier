const { nextMonthlySequence, nextYearlySequence, getIstDateParts } = require('./sequenceCounter');

/**
 * Generates DM<seq> e.g. 881 for the 1st order created on 8 August (IST).
 * Day and month are plain numbers, never zero-padded (8, not 08; January is
 * 1, not 01). The sequence resets to 1 once a year (1 January IST), not
 * monthly — the visible number has no year in it, so day+month+seq staying
 * unique for the whole year (not just within one month) is what actually
 * matters here.
 */
async function generateOrderNumber() {
  const { year, month, day } = getIstDateParts(new Date());
  const seq = await nextYearlySequence('order', year);
  return `${day}${month}${seq}`;
}

module.exports = { generateOrderNumber, nextMonthlySequence, nextYearlySequence, getIstDateParts };
