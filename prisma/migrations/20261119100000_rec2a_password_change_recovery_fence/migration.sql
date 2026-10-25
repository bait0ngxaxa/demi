ALTER TABLE "User"
ADD COLUMN "passwordChangeOperationId" UUID,
ADD COLUMN "passwordChangeStartedAt" TIMESTAMPTZ(3),
ADD COLUMN "passwordChangeReconciliationRequiredAt" TIMESTAMPTZ(3);

ALTER TABLE "User"
ADD CONSTRAINT "User_passwordChangeOperation_guard_check"
CHECK (
  (("passwordChangeOperationId" IS NULL) = ("passwordChangeStartedAt" IS NULL))
  AND ("passwordChangeOperationId" IS NOT NULL OR "passwordChangeReconciliationRequiredAt" IS NULL)
);

ALTER TABLE "LinePasswordRecoveryCapability"
ALTER COLUMN "tokenHash" DROP NOT NULL;
