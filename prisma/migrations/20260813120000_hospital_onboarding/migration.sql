-- Phase 3B introduces canonical Hospital Master identity and the reviewable
-- onboarding application lifecycle. Existing Hospital rows must be reconciled
-- with an approved canonical code before this migration is applied; guessing a
-- code from a free-text name would corrupt organization identity.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Hospital") THEN
    RAISE EXCEPTION 'Hospital rows exist without canonical codes; reconcile them before applying the Phase 3B migration';
  END IF;
END $$;

-- CreateEnum
CREATE TYPE "HospitalOnboardingApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Hospital"
ADD COLUMN "hospitalCode" VARCHAR(32) NOT NULL,
ADD COLUMN "parentHospitalId" UUID;

-- CreateTable
CREATE TABLE "HospitalOnboardingApplication" (
    "id" UUID NOT NULL,
    "hospitalId" UUID NOT NULL,
    "applicantUserId" UUID NOT NULL,
    "status" "HospitalOnboardingApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" UUID,
    "rejectionReason" VARCHAR(500),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalOnboardingApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Hospital_hospitalCode_key" ON "Hospital"("hospitalCode");
CREATE INDEX "Hospital_status_name_idx" ON "Hospital"("status", "name");
CREATE INDEX "HospitalOnboardingApplication_status_createdAt_idx" ON "HospitalOnboardingApplication"("status", "createdAt");
CREATE INDEX "HospitalOnboardingApplication_hospitalId_status_idx" ON "HospitalOnboardingApplication"("hospitalId", "status");
CREATE INDEX "HospitalOnboardingApplication_applicantUserId_status_idx" ON "HospitalOnboardingApplication"("applicantUserId", "status");

-- Only one unresolved claim may exist for a hospital at a time. Rejected and
-- approved history remains queryable and is not overwritten by this guard.
CREATE UNIQUE INDEX "HospitalOnboardingApplication_pending_hospital_key"
ON "HospitalOnboardingApplication"("hospitalId")
WHERE "status" = 'PENDING';

-- AddForeignKey
ALTER TABLE "Hospital"
ADD CONSTRAINT "Hospital_parentHospitalId_fkey"
FOREIGN KEY ("parentHospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "HospitalOnboardingApplication"
ADD CONSTRAINT "HospitalOnboardingApplication_hospitalId_fkey"
FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "HospitalOnboardingApplication_applicantUserId_fkey"
FOREIGN KEY ("applicantUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "HospitalOnboardingApplication_reviewedByUserId_fkey"
FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
