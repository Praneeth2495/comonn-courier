-- Convert enum-typed status columns to free text so a barcode location's
-- label can become a genuine new order status, not just one of the fixed
-- lifecycle values.

-- AlterTable: Order.status
ALTER TABLE "Order" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Order" ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT;
ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- AlterTable: TrackingEvent.status
ALTER TABLE "TrackingEvent" ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT;

-- AlterTable: ScanBatch.status
ALTER TABLE "ScanBatch" ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT;

-- AlterTable: ScanLocation — drop the separate status column (label now
-- doubles as the literal status applied when scanned) and make label
-- required.
ALTER TABLE "ScanLocation" DROP COLUMN "status";
ALTER TABLE "ScanLocation" ALTER COLUMN "label" SET NOT NULL;

-- Nothing references the enum type anymore; drop it.
DROP TYPE "OrderStatus";
