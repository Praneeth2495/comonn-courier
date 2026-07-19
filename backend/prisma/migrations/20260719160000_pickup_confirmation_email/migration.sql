-- Idempotency guard for the "Not sure, book pickup" booking-confirmation
-- email (these orders never get a Label row, so the existing
-- order.labels.length > 0 check can't be reused to avoid resending).
ALTER TABLE "Order" ADD COLUMN "confirmationEmailSentAt" TIMESTAMP(3);
