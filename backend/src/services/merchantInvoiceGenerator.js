const cron = require('node-cron');
const { prisma } = require('../config/db');
const { createPaymentLink } = require('./paymentService');

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // India doesn't observe DST, so a fixed offset is safe

// Invoices are due 2 days after invoiceDate. Once a merchant has any
// invoice past this without being marked paid, new shipments are blocked
// (see requireInvoicesCurrent in merchantApi.controller.js) until they
// settle it — no automatic reinstatement beyond that.
const INVOICE_DUE_DAYS = 2;

// Boundaries of "yesterday" as an IST calendar day, expressed in UTC —
// works regardless of the server's own local timezone. Cron itself already
// fires at 00:05 IST (see startMerchantInvoiceGenerationJob), so "yesterday"
// here is the full previous IST day.
function getYesterdayIstRange(now) {
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  const startOfTodayIst = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate()) - IST_OFFSET_MS);
  const startOfYesterdayIst = new Date(startOfTodayIst.getTime() - 24 * 60 * 60 * 1000);
  return { start: startOfYesterdayIst, end: startOfTodayIst, invoiceDate: startOfYesterdayIst };
}

/**
 * Rolls up each active merchant's previous IST day of shipments into one
 * MerchantInvoice with a Razorpay Payment Link for the total — no
 * per-shipment checkout, merchants are billed on postpaid credit (see
 * merchantApi.controller.js). Per-merchant try/catch so one merchant's
 * Razorpay failure doesn't block the others. Safe to re-run: an invoice
 * already fully set up (has a payment link) is skipped; one that exists
 * but is missing its link (a prior run failed after creating it) just
 * gets the link retried.
 */
async function generateMerchantInvoices() {
  const { start, end, invoiceDate } = getYesterdayIstRange(new Date());
  const merchants = await prisma.merchant.findMany({ where: { isActive: true } });

  let processedCount = 0;
  for (const merchant of merchants) {
    try {
      let invoice = await prisma.merchantInvoice.findUnique({
        where: { merchantId_invoiceDate: { merchantId: merchant.id, invoiceDate } },
      });
      if (invoice?.paymentLinkUrl) continue;

      if (!invoice) {
        const orders = await prisma.order.findMany({
          where: { merchantId: merchant.id, merchantInvoiceId: null, createdAt: { gte: start, lt: end } },
        });
        if (!orders.length) continue;

        const totalAmount = orders.reduce((sum, o) => sum + Number(o.grandTotal), 0);
        invoice = await prisma.merchantInvoice.create({
          data: { merchantId: merchant.id, invoiceDate, totalAmount, currency: orders[0].currency, status: 'UNPAID' },
        });
        await prisma.order.updateMany({
          where: { id: { in: orders.map((o) => o.id) } },
          data: { merchantInvoiceId: invoice.id },
        });
      }

      const link = await createPaymentLink({
        amount: invoice.totalAmount,
        currency: invoice.currency,
        description: `Comonn shipments — ${merchant.name} — ${invoiceDate.toISOString().slice(0, 10)}`,
        customerName: merchant.name,
        customerEmail: merchant.contactEmail,
        notes: { merchantInvoiceId: invoice.id },
      });
      await prisma.merchantInvoice.update({
        where: { id: invoice.id },
        data: { paymentLinkUrl: link.short_url, paymentLinkId: link.id },
      });
      processedCount += 1;
    } catch (err) {
      console.error(`merchantInvoiceGenerator failed for merchant ${merchant.id}:`, err.message);
    }
  }
  return processedCount;
}

function startMerchantInvoiceGenerationJob() {
  // Same daily-at-IST-midnight slot as driverAutoUnassign.
  cron.schedule('5 0 * * *', () => {
    generateMerchantInvoices().catch((err) => console.error('merchantInvoiceGenerator job failed:', err.message));
  }, { timezone: 'Asia/Kolkata' });
}

module.exports = { startMerchantInvoiceGenerationJob, generateMerchantInvoices, INVOICE_DUE_DAYS };
