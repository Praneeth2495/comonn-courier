import { getCountryName } from './countryNames';

// Re-derives the quoteInput/selectedQuote shape the Quote/Details pages
// need from a saved booking's own Order record — used when editing a
// booking that was already set aside via "Add New Order", since
// BookingContext only ever kept the raw order for those, not the original
// quote-flow objects. Lives in its own util (not inside Details.jsx, even
// though that's the only place that originally needed it) so Quote.jsx can
// reuse it too without creating a static import between two route-level
// lazy() chunks — that would merge them back into one bundle and undo the
// code-splitting both pages were deliberately split out for.
export function quoteInputFromOrder(order) {
  return {
    pricingPending: order.pricingPending,
    items: (order.items || []).map((it) => ({ itemType: it.itemType, actualWeightKg: Number(it.actualWeightKg), quantity: it.quantity })),
    originPostcode: order.senderAddress?.postcode,
    originSuburb: order.senderAddress?.city,
    originState: order.senderAddress?.state,
    destinationPostcode: order.receiverAddress?.postcode,
    destinationEircode: order.receiverAddress?.eircode,
    destinationSuburb: order.receiverAddress?.city,
    destinationState: order.receiverAddress?.state,
    destinationCountryCode: order.receiverAddress?.countryCode,
    destinationCountryName: getCountryName(order.receiverAddress?.countryCode),
  };
}

export function selectedQuoteFromOrder(order) {
  if (order.pricingPending) return null;
  return {
    service: { code: order.service?.code, name: order.service?.name },
    weight: { chargeableWeightKg: Number(order.chargeableWeightKg) },
    zone: { name: order.zoneCode },
    pricing: { grandTotal: Number(order.grandTotal) },
  };
}
