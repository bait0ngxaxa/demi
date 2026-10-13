-- CreateEnum
CREATE TYPE "WorkforceActivationPurpose" AS ENUM ('ACTIVATION', 'RESET');

-- AlterTable
-- Existing rows are first-time activations with no failed identity verification.
ALTER TABLE "WorkforceActivation"
    ADD COLUMN "purpose" "WorkforceActivationPurpose" NOT NULL DEFAULT 'ACTIVATION',
    ADD COLUMN "failedVerificationCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "WorkforceActivation"
    ADD CONSTRAINT "WorkforceActivation_failedVerificationCount_check"
    CHECK ("failedVerificationCount" >= 0);
