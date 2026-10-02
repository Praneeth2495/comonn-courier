-- Payment.providerOrderId is looked up on every Razorpay webhook and
-- payment-confirm call (markOrdersPaidForProviderOrder); TrackingEvent.orderId
-- is included on every order-detail view (admin, driver app, merchant API,
-- customer tracking) — both were missing an index despite every sibling
-- table (BalancePayment, BoxPayment, OrderComment, OrderItem) already
-- having the equivalent one.
CREATE INDEX "Payment_providerOrderId_idx" ON "Payment"("providerOrderId");
CREATE INDEX "TrackingEvent_orderId_idx" ON "TrackingEvent"("orderId");
