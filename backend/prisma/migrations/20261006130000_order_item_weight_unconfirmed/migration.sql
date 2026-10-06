-- A customer picking the collapsed "1-5 kg" weight option gets priced at
-- the ceiling (5 kg) with this flag set true; staff correct it to the real
-- weight after the parcel's actually weighed at pickup (see
-- AdminDashboard.jsx's red row highlight and Quote.jsx's staff-only
-- discrete 1-25 kg dropdown).
ALTER TABLE "OrderItem" ADD COLUMN "weightUnconfirmed" BOOLEAN NOT NULL DEFAULT false;
