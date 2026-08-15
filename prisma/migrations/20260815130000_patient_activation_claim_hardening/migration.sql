ALTER TABLE "PatientActivation"
ADD COLUMN "claimExpiresAt" TIMESTAMP(3),
ADD COLUMN "reconciliationRequiredAt" TIMESTAMP(3);

-- Existing claims were unbounded in the MVP implementation. Give them a
-- bounded lease from their original claim time; the service still re-checks
-- authoritative User state before recovering them.
UPDATE "PatientActivation"
SET "claimExpiresAt" = "claimedAt" + INTERVAL '5 minutes'
WHERE "claimedAt" IS NOT NULL;

CREATE INDEX "PatientActivation_userId_reconciliationRequiredAt_idx"
    ON "PatientActivation"("userId", "reconciliationRequiredAt");
