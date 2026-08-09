-- AlterTable
ALTER TABLE "User" ADD COLUMN "allowedPages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Backfill existing STAFF/ACCOUNTS users with the same page breadth their
-- role already had before this per-user toggle existed, so nothing changes
-- for anyone on the day this ships. ADMIN/CUSTOMER/DRIVER are unaffected
-- (allowedPages is meaningless for them, left as the empty default).
UPDATE "User" SET "allowedPages" = ARRAY['orders', 'inventory', 'batchscan', 'printlabel'] WHERE "role" = 'STAFF';
UPDATE "User" SET "allowedPages" = ARRAY['orders', 'accounts', 'inventory', 'onboarding', 'storage'] WHERE "role" = 'ACCOUNTS';
