const cron = require('node-cron');
const { prisma } = require('../config/db');
const { generatePartyInvoiceNumber } = require('../utils/invoiceNumber');
const { generatePartyInvoicePdf } = require('./partyInvoicePdf');

function advance(date, recurrence) {
  const next = new Date(date);
  if (recurrence === 'WEEKLY') next.setDate(next.getDate() + 7);
  else if (recurrence === 'MONTHLY') next.setMonth(next.getMonth() + 1);
  else if (recurrence === 'YEARLY') next.setFullYear(next.getFullYear() + 1);
  return next;
}

/**
 * Clones each due recurring root invoice onto a fresh UNPAID child (new
 * number, new due date, same amount/party/description), then advances the
 * root's own nextRecurrenceAt. Children never carry their own recurrence —
 * only the root drives the schedule, so a series can't fork. Deliberately
 * does not auto-email the new invoice; staff review and send it themselves
 * (see plan notes) so nothing goes out to a real vendor/client unreviewed.
 * Per-invoice try/catch, mirroring generateMerchantInvoices, so one
 * failure doesn't block the rest of the batch.
 */
async function processRecurringInvoices() {
  const now = new Date();
  const dueRoots = await prisma.partyInvoice.findMany({
    where: { recurrence: { not: 'NONE' }, nextRecurrenceAt: { lte: now } },
  });

  let processedCount = 0;
  for (const root of dueRoots) {
    try {
      const dueOffsetMs = new Date(root.dueDate).getTime() - new Date(root.createdAt).getTime();
      const invoiceNumber = await generatePartyInvoiceNumber(root.direction);
      const dueDate = new Date(root.nextRecurrenceAt.getTime() + dueOffsetMs);

      const child = await prisma.partyInvoice.create({
        data: {
          direction: root.direction,
          invoiceNumber,
          partyName: root.partyName,
          businessName: root.businessName,
          description: root.description,
          amount: root.amount,
          gstPercent: root.gstPercent,
          totalAmount: root.totalAmount,
          currency: root.currency,
          dueDate,
          email: root.email,
          phone: root.phone,
          status: 'UNPAID',
          recurrence: 'NONE',
          parentInvoiceId: root.id,
          createdById: root.createdById,
        },
      });

      const { fileName } = await generatePartyInvoicePdf(child);
      await prisma.partyInvoice.update({ where: { id: child.id }, data: { pdfFileUrl: fileName } });

      await prisma.partyInvoice.update({
        where: { id: root.id },
        data: { nextRecurrenceAt: advance(root.nextRecurrenceAt, root.recurrence) },
      });

      processedCount += 1;
    } catch (err) {
      console.error(`partyInvoiceRecurrence failed for invoice ${root.id}:`, err.message);
    }
  }
  return processedCount;
}

function startPartyInvoiceRecurrenceJob() {
  // A different slot from the merchant-invoice (00:05) and driver-unassign
  // jobs to avoid piling everything onto the same tick.
  cron.schedule('10 0 * * *', () => {
    processRecurringInvoices().catch((err) => console.error('partyInvoiceRecurrence job failed:', err.message));
  }, { timezone: 'Asia/Kolkata' });
}

module.exports = { startPartyInvoiceRecurrenceJob, processRecurringInvoices, advance };
