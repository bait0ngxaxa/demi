CREATE TYPE "WorkforceActivationOperationState" AS ENUM (
  'NOT_STARTED', 'CLAIMED', 'PROVIDER_STARTED', 'PROVIDER_CONFIRMED', 'FINALIZED', 'RECONCILIATION_REQUIRED'
);
ALTER TABLE "WorkforceActivation" ADD COLUMN "operationState" "WorkforceActivationOperationState" NOT NULL DEFAULT 'NOT_STARTED';
UPDATE "WorkforceActivation" SET "operationState" = CASE
  WHEN "usedAt" IS NOT NULL THEN 'FINALIZED'::"WorkforceActivationOperationState"
  WHEN "claimedAt" IS NOT NULL THEN 'RECONCILIATION_REQUIRED'::"WorkforceActivationOperationState"
  ELSE 'NOT_STARTED'::"WorkforceActivationOperationState" END;
UPDATE "WorkforceActivation" SET "reconciliationRequiredAt" = COALESCE("reconciliationRequiredAt", CURRENT_TIMESTAMP)
WHERE "operationState" = 'RECONCILIATION_REQUIRED';
