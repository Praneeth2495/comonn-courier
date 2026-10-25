const cron = require('node-cron');
const { prisma } = require('../config/db');
const { getIstDateParts } = require('../utils/orderNumber');
const { parsePickupDate } = require('./driverAutoUnassign');
const { sendTemplateMessage } = require('./whatsappService');

// Same loose "calendar-date mapped to UTC midnight" convention admin
// controller's Overview KPIs already use — see that file's isoDateIst
// comment for why this is deliberate, not a bug.
function todayIstWindow() {
  const { year, month, day } = getIstDateParts(new Date());
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { iso, gte: new Date(`${iso}T00:00:00.000Z`), lte: new Date(`${iso}T23:59:59.999Z`) };
}

// Pickup orders still awaiting collection — same status set the Pickup
// orders tab (ORDER_TABS in AdminDashboard.jsx) queries.
const ACTIVE_PICKUP_STATUSES = ['PENDING_PAYMENT', 'PICKUP_CONFIRMED', 'PAID', 'LABEL_GENERATED'];

/**
 * Three end-of-day ops numbers for the admin WhatsApp summary:
 *  - totalToday: orders placed today (any status) — same "Total orders"
 *    definition the Overview stat card already uses (computeOrderTotals).
 *  - collectedToday: orders physically picked up by the courier today
 *    (pickedUpAt, not payment-collected — see pickedUpAt on Order).
 *  - overdueToday: pickup orders whose scheduled pickupDate has passed
 *    without being picked up yet — mirrors the Pickup orders tab's own
 *    __overdue calculation (AdminDashboard.jsx) and
 *    driverAutoUnassign.js's parsePickupDate, just without the
 *    assignedDriverId requirement (overdue counts every such order, not
 *    only ones currently assigned to a rider).
 */
async function computeDailySummary() {
  const { gte, lte } = todayIstWindow();
  const now = new Date();

  const [totalToday, collectedToday, activePickupOrders] = await Promise.all([
    prisma.order.count({ where: { createdAt: { gte, lte } } }),
    prisma.order.count({ where: { pickedUpAt: { gte, lte } } }),
    prisma.order.findMany({
      where: { status: { in: ACTIVE_PICKUP_STATUSES } },
      select: { pickupDate: true },
    }),
  ]);

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const overdueToday = activePickupOrders.filter((o) => {
    const parsed = parsePickupDate(o.pickupDate, now);
    return !!parsed && parsed < todayStart;
  }).length;

  return { totalToday, collectedToday, overdueToday };
}

async function sendDailySummaryWhatsApp() {
  const to = process.env.ADMIN_WHATSAPP_NUMBER;
  if (!to) return;
  const { iso } = todayIstWindow();
  const { totalToday, collectedToday, overdueToday } = await computeDailySummary();
  try {
    await sendTemplateMessage({
      to,
      templateName: 'daily_order_summary',
      params: [iso, String(totalToday), String(collectedToday), String(overdueToday)],
    });
  } catch (err) {
    console.error('dailyOrderSummary WhatsApp send failed:', err.message);
  }
}

function startDailyOrderSummaryJob() {
  cron.schedule('0 21 * * *', () => {
    sendDailySummaryWhatsApp().catch((err) => console.error('dailyOrderSummary job failed:', err));
  }, { timezone: 'Asia/Kolkata' });
}

module.exports = { startDailyOrderSummaryJob, computeDailySummary, sendDailySummaryWhatsApp };
