/**
 * One-time backfill of Order.airportCode for orders created before the
 * Manifest-by-airport feature existed (that field was null at creation
 * time). Resolves each order's destination airport the same way new orders
 * get it — via the receiver's country+postcode against PostcodeSuggestion
 * — so existing orders remain eligible for the Manifest tab.
 *
 * Usage: node scripts/backfill-order-airport-codes.js
 */
const { prisma } = require('../src/config/db');
const { resolveAirportForDestination } = require('../src/services/pricingEngine');

async function main() {
  const orders = await prisma.order.findMany({
    where: { airportCode: null },
    include: { receiverAddress: true },
  });

  let updated = 0;
  let skipped = 0;
  for (const order of orders) {
    const airportCode = await resolveAirportForDestination(
      order.receiverAddress.countryCode,
      order.receiverAddress.postcode
    );
    if (airportCode) {
      await prisma.order.update({ where: { id: order.id }, data: { airportCode } });
      updated++;
    } else {
      skipped++;
    }
  }

  console.log(`Backfilled ${updated} of ${orders.length} orders (${skipped} had no matching airport data for their postcode/country).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
