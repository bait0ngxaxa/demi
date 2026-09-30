-- Hospital-local general profile values and purpose-specific account recovery.
CREATE TYPE "AccountRecoveryDeliveryChannel" AS ENUM ('ASSISTED');

CREATE TABLE "PatientHospitalProfile" (
    "id" UUID NOT NULL,
    "patientHospitalRelationshipId" UUID NOT NULL,
    "gender" VARCHAR(64),
    "phoneNumber" VARCHAR(32),
    "addressText" VARCHAR(500),
    "emergencyContactName" VARCHAR(200),
    "emergencyContactPhone" VARCHAR(32),
    "occupation" VARCHAR(200),
    "educationLevel" VARCHAR(200),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientHospitalProfile_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PatientHospitalProfile_version_check" CHECK ("version" >= 1)
);

CREATE UNIQUE INDEX "PatientHospitalProfile_patientHospitalRelationshipId_key"
    ON "PatientHospitalProfile"("patientHospitalRelationshipId");

ALTER TABLE "PatientHospitalProfile"
ADD CONSTRAINT "PatientHospitalProfile_patientHospitalRelationshipId_fkey"
FOREIGN KEY ("patientHospitalRelationshipId")
REFERENCES "PatientHospitalRelationship"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AccountRecovery" (
    "id" UUID NOT NULL,
    "targetUserId" UUID NOT NULL,
    "patientHospitalRelationshipId" UUID NOT NULL,
    "issuedByUserId" UUID NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "deliveryChannel" "AccountRecoveryDeliveryChannel" NOT NULL DEFAULT 'ASSISTED',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "reconciliationRequiredAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountRecovery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountRecovery_tokenHash_key"
    ON "AccountRecovery"("tokenHash");

-- Prisma schema cannot express this partial unique constraint. Keep one unfinished
-- capability per target User, including in-flight or reconciliation-required claims.
CREATE UNIQUE INDEX "AccountRecovery_one_unfinished_per_target_key"
    ON "AccountRecovery"("targetUserId")
    WHERE "completedAt" IS NULL AND "revokedAt" IS NULL;

CREATE INDEX "AccountRecovery_targetUserId_createdAt_idx"
    ON "AccountRecovery"("targetUserId", "createdAt");

CREATE INDEX "AccountRecovery_expiresAt_idx"
    ON "AccountRecovery"("expiresAt");

CREATE INDEX "AccountRecovery_patientHospitalRelationshipId_createdAt_idx"
    ON "AccountRecovery"("patientHospitalRelationshipId", "createdAt");

ALTER TABLE "AccountRecovery"
ADD CONSTRAINT "AccountRecovery_targetUserId_fkey"
FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "AccountRecovery_patientHospitalRelationshipId_fkey"
FOREIGN KEY ("patientHospitalRelationshipId") REFERENCES "PatientHospitalRelationship"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "AccountRecovery_issuedByUserId_fkey"
FOREIGN KEY ("issuedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
