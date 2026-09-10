-- Onboarding "share to employee" flow: employee fills their own details via
-- an emailed one-time link, admin then reviews and approves before the
-- account can actually log in. Plus a second ID document.
ALTER TABLE "EmployeeProfile"
  ADD COLUMN "idProofType2" TEXT,
  ADD COLUMN "idProofNumber2" TEXT,
  ADD COLUMN "idProofFileName2" TEXT,
  ADD COLUMN "idProofFileMime2" TEXT,
  ADD COLUMN "idProofFileData2" BYTEA,
  ADD COLUMN "detailsSubmittedAt" TIMESTAMP(3),
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "approvedById" TEXT;

-- Every existing profile was filled by admin directly in one sitting —
-- treat it as already approved so it doesn't show up as "pending review".
UPDATE "EmployeeProfile" SET "approvedAt" = "createdAt" WHERE "approvedAt" IS NULL;

ALTER TABLE "EmployeeProfile"
  ADD CONSTRAINT "EmployeeProfile_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "EmployeeOnboardingToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EmployeeOnboardingToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmployeeOnboardingToken_tokenHash_key" ON "EmployeeOnboardingToken"("tokenHash");
CREATE INDEX "EmployeeOnboardingToken_userId_idx" ON "EmployeeOnboardingToken"("userId");

ALTER TABLE "EmployeeOnboardingToken"
  ADD CONSTRAINT "EmployeeOnboardingToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
