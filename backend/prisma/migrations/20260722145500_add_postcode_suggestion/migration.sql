-- Postcode -> suburb/state autocomplete data for the address forms.
CREATE TABLE "PostcodeSuggestion" (
    "id" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "postcode" TEXT NOT NULL,
    "suburb" TEXT NOT NULL,
    "state" TEXT NOT NULL,

    CONSTRAINT "PostcodeSuggestion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PostcodeSuggestion_countryCode_postcode_idx" ON "PostcodeSuggestion"("countryCode", "postcode");
