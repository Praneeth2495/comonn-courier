-- Separate from manifestDate (when the manifest was prepared) — cargo
-- doesn't always fly out the same day it's manifested. Nullable since
-- existing manifests predate this field.
ALTER TABLE "Manifest" ADD COLUMN "departureDate" TIMESTAMP(3);
