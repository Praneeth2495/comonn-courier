-- Backfill: createSalaryPayment always set businessName to the employee's
-- email (used as the Salary roster's month-matching key) but never set the
-- actual `email` column the Send-invoice button/endpoint reads from, so
-- every salary PartyInvoice created before this fix has email = NULL and
-- can never be emailed. businessName holds exactly the right value for
-- every SALARY-category row (it's never a real business name there), so
-- it's a safe direct copy.
UPDATE "PartyInvoice" SET "email" = "businessName" WHERE "category" = 'SALARY' AND "email" IS NULL AND "businessName" IS NOT NULL;
