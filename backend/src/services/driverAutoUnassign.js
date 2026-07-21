const cron = require('node-cron');
const { prisma } = require('../config/db');

// Jobs still awaiting physical pickup — PICKED_UP or later means the driver
// already completed it, so it's never a candidate for auto-unassignment.
const ACTIVE_PICKUP_STATUSES = ['PICKUP_CONFIRMED', 'PAID', 'LABEL_GENERATED'];

// order.pickupDate is a display string set at booking time, e.g.
// "Wednesday, 23 July" — no year, since it's always chosen within 7 days of
// booking (see Payment.jsx's nextPickupDates()). Reconstruct a real Date by
// assuming the current year, rolling forward a year if that guess would
// place it implausibly far in the past (a booking made in late December for
// an early-January pickup).
function parsePickupDate(pickupDateStr, referenceDate) {
  if (!pickupDateStr) return null;
  const year = referenceDate.getFullYear();
  let parsed = new Date(`${pickupDateStr} ${year}`);
  if (Number.isNaN(parsed.getTime())) return null;
  const diffDays = (referenceDate - parsed) / 86400000;
  if (diffDays > 270) parsed = new Date(`${pickupDateStr} ${year + 1}`);
  return parsed;
}

/**
 * Any pickup job still assigned to a driver whose scheduled pickup day has
 * fully elapsed (IST) without being marked picked up gets unassigned —
 * it disappears from that driver's job list and reappears as "Unassigned"
 * in the admin/staff Pickup orders tab.
 */
async function unassignOverdueDriverJobs() {
  const now = new Date();
  const jobs = await prisma.order.findMany({
    where: { assignedDriverId: { not: null }, status: { in: ACTIVE_PICKUP_STATUSES } },
    include: { assignedDriver: { select: { fullName: true } } },
  });

  let unassignedCount = 0;
  for (const job of jobs) {
    const pickupDate = parsePickupDate(job.pickupDate, now);
    if (!pickupDate) continue;

    const endOfPickupDayIst = new Date(pickupDate);
    endOfPickupDayIst.setDate(endOfPickupDayIst.getDate() + 1);
    endOfPickupDayIst.setHours(0, 0, 0, 0);
    if (now < endOfPickupDayIst) continue;

    await prisma.order.update({
      where: { id: job.id },
      data: {
        assignedDriverId: null,
        driverAssignedAt: null,
        driverArrivedAt: null,
        trackingEvents: {
          create: {
            status: job.status,
            note: `Auto-unassigned from ${job.assignedDriver?.fullName || 'driver'} — pickup date (${job.pickupDate}) passed without completion.`,
          },
        },
      },
    });
    unassignedCount += 1;
  }
  return unassignedCount;
}

function startDriverAutoUnassignJob() {
  // A few minutes after IST midnight, once "yesterday" has fully ended.
  cron.schedule('5 0 * * *', () => {
    unassignOverdueDriverJobs().catch((err) => console.error('driverAutoUnassign job failed:', err));
  }, { timezone: 'Asia/Kolkata' });
}

module.exports = { startDriverAutoUnassignJob, unassignOverdueDriverJobs };
