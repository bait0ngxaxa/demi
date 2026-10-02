-- CreateEnum
CREATE TYPE "CaregiverAppointmentGrantStatus" AS ENUM ('PENDING', 'ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "CaregiverAppointmentGrant" (
    "id" UUID NOT NULL,
    "caregiverRelationshipId" UUID NOT NULL,
    "patientProfileId" UUID NOT NULL,
    "patientPersonId" UUID NOT NULL,
    "caregiverUserId" UUID NOT NULL,
    "caregiverPersonId" UUID NOT NULL,
    "patientHospitalRelationshipId" UUID NOT NULL,
    "contractVersion" VARCHAR(64) NOT NULL,
    "status" "CaregiverAppointmentGrantStatus" NOT NULL DEFAULT 'PENDING',
    "proposedByUserId" UUID NOT NULL,
    "proposedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedByUserId" UUID,
    "acceptedAt" TIMESTAMPTZ(3),
    "revokedByUserId" UUID,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CaregiverAppointmentGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CaregiverAppointmentGrant_patientProfileId_createdAt_idx" ON "CaregiverAppointmentGrant"("patientProfileId", "createdAt");

-- CreateIndex
CREATE INDEX "CaregiverAppointmentGrant_caregiverUserId_createdAt_idx" ON "CaregiverAppointmentGrant"("caregiverUserId", "createdAt");

-- CreateIndex
CREATE INDEX "CaregiverAppointmentGrant_caregiverRelationshipId_idx" ON "CaregiverAppointmentGrant"("caregiverRelationshipId");

-- CreateIndex
CREATE INDEX "CaregiverAppointmentGrant_patientHospitalRelationshipId_idx" ON "CaregiverAppointmentGrant"("patientHospitalRelationshipId");

-- CreateIndex
CREATE INDEX "CaregiverAppointmentGrant_proposedByUserId_idx" ON "CaregiverAppointmentGrant"("proposedByUserId");

-- CreateIndex
CREATE INDEX "CaregiverAppointmentGrant_acceptedByUserId_idx" ON "CaregiverAppointmentGrant"("acceptedByUserId");

-- CreateIndex
CREATE INDEX "CaregiverAppointmentGrant_revokedByUserId_idx" ON "CaregiverAppointmentGrant"("revokedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientProfile_id_personId_key" ON "PatientProfile"("id", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientHospitalRelationship_id_patientProfileId_key" ON "PatientHospitalRelationship"("id", "patientProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "CaregiverRelationship_id_patientProfileId_caregiverUserId_key" ON "CaregiverRelationship"("id", "patientProfileId", "caregiverUserId");

-- AddForeignKey
ALTER TABLE "CaregiverAppointmentGrant" ADD CONSTRAINT "CaregiverAppointmentGrant_caregiverRelationshipId_patientP_fkey" FOREIGN KEY ("caregiverRelationshipId", "patientProfileId", "caregiverUserId") REFERENCES "CaregiverRelationship"("id", "patientProfileId", "caregiverUserId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CaregiverAppointmentGrant" ADD CONSTRAINT "CaregiverAppointmentGrant_patientProfileId_patientPersonId_fkey" FOREIGN KEY ("patientProfileId", "patientPersonId") REFERENCES "PatientProfile"("id", "personId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CaregiverAppointmentGrant" ADD CONSTRAINT "CaregiverAppointmentGrant_caregiverUserId_caregiverPersonI_fkey" FOREIGN KEY ("caregiverUserId", "caregiverPersonId") REFERENCES "User"("id", "personId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CaregiverAppointmentGrant" ADD CONSTRAINT "CaregiverAppointmentGrant_patientHospitalRelationshipId_pa_fkey" FOREIGN KEY ("patientHospitalRelationshipId", "patientProfileId") REFERENCES "PatientHospitalRelationship"("id", "patientProfileId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CaregiverAppointmentGrant" ADD CONSTRAINT "CaregiverAppointmentGrant_proposedByUserId_patientPersonId_fkey" FOREIGN KEY ("proposedByUserId", "patientPersonId") REFERENCES "User"("id", "personId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CaregiverAppointmentGrant" ADD CONSTRAINT "CaregiverAppointmentGrant_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaregiverAppointmentGrant" ADD CONSTRAINT "CaregiverAppointmentGrant_revokedByUserId_fkey" FOREIGN KEY ("revokedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One actionable lifecycle per exact scope/version; historical revoked rows never block a new share.
CREATE UNIQUE INDEX "CaregiverAppointmentGrant_actionable_scope_key"
ON "CaregiverAppointmentGrant" ("caregiverRelationshipId", "patientHospitalRelationshipId", "contractVersion")
WHERE "status" IN ('PENDING', 'ACTIVE');

ALTER TABLE "CaregiverAppointmentGrant" ADD CONSTRAINT "CaregiverAppointmentGrant_lifecycle_check" CHECK (
  ("acceptedAt" IS NULL AND "acceptedByUserId" IS NULL OR
   "acceptedAt" IS NOT NULL AND "acceptedByUserId" IS NOT NULL AND "acceptedByUserId" = "caregiverUserId")
  AND (
    "status" = 'PENDING' AND "acceptedAt" IS NULL AND "revokedAt" IS NULL AND "revokedByUserId" IS NULL
    OR "status" = 'ACTIVE' AND "acceptedAt" IS NOT NULL AND "revokedAt" IS NULL AND "revokedByUserId" IS NULL
    OR "status" = 'REVOKED' AND "revokedAt" IS NOT NULL AND "revokedByUserId" IS NOT NULL AND "revokedByUserId" = "proposedByUserId"
  )
);

-- Preserve accepted semantics and history, even for accidental direct database updates.
CREATE FUNCTION "guard_caregiver_appointment_grant_update"() RETURNS trigger AS $$
BEGIN
  IF ROW(NEW."caregiverRelationshipId", NEW."patientProfileId", NEW."patientPersonId", NEW."caregiverUserId", NEW."caregiverPersonId", NEW."patientHospitalRelationshipId", NEW."contractVersion", NEW."proposedByUserId", NEW."proposedAt", NEW."id", NEW."createdAt")
    IS DISTINCT FROM ROW(OLD."caregiverRelationshipId", OLD."patientProfileId", OLD."patientPersonId", OLD."caregiverUserId", OLD."caregiverPersonId", OLD."patientHospitalRelationshipId", OLD."contractVersion", OLD."proposedByUserId", OLD."proposedAt", OLD."id", OLD."createdAt")
    OR OLD."status" = 'REVOKED'
    OR OLD."status" = 'ACTIVE' AND (NEW."status" NOT IN ('ACTIVE', 'REVOKED') OR NEW."acceptedAt" IS DISTINCT FROM OLD."acceptedAt" OR NEW."acceptedByUserId" IS DISTINCT FROM OLD."acceptedByUserId")
  THEN RAISE EXCEPTION 'Invalid appointment grant transition' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "CaregiverAppointmentGrant_immutable_lifecycle"
BEFORE UPDATE ON "CaregiverAppointmentGrant"
FOR EACH ROW EXECUTE FUNCTION "guard_caregiver_appointment_grant_update"();
