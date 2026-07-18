-- Replace the per-year OrderNumberCounter with a general-purpose,
-- per-month SequenceCounter (order numbers/tracking numbers switch to
-- the DDMM0<seq> format, seq resetting each calendar month).
CREATE TABLE "SequenceCounter" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "SequenceCounter_pkey" PRIMARY KEY ("key")
);

DROP TABLE "OrderNumberCounter";
