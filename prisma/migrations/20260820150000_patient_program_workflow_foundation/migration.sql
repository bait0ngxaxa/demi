-- Phase 15B.0 introduces a bounded Patient Program episode.
CREATE TYPE "PatientProgramStatus" AS ENUM ('ACTIVE', 'COMPLETED');

-- The composite key is used by the Program-to-Baseline foreign key so that
-- the initial Baseline and the Program must share the exact relationship.
CREATE UNIQUE INDEX "PatientBaseline_id_patientHospitalRelationshipId_key"
    ON "PatientBaseline"("id", "patientHospitalRelationshipId");

CREATE TABLE "PatientProgram" (
    "id" UUID NOT NULL,
    "patientHospitalRelationshipId" UUID NOT NULL,
    "initialBaselineId" UUID,
    "createdByUserId" UUID NOT NULL,
    "status" "PatientProgramStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientProgram_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PatientProgram_lifecycle_check"
        CHECK (
            ("status" = 'ACTIVE' AND "completedAt" IS NULL)
            OR ("status" = 'COMPLETED' AND "completedAt" IS NOT NULL)
        ),
    CONSTRAINT "PatientProgram_completion_after_start_check"
        CHECK ("completedAt" IS NULL OR "completedAt" >= "startedAt")
);

CREATE INDEX "PatientProgram_patientHospitalRelationshipId_status_idx"
    ON "PatientProgram"("patientHospitalRelationshipId", "status");

CREATE INDEX "PatientProgram_patientHospitalRelationshipId_startedAt_idx"
    ON "PatientProgram"("patientHospitalRelationshipId", "startedAt");

CREATE INDEX "PatientProgram_initialBaselineId_idx"
    ON "PatientProgram"("initialBaselineId");

-- Prisma schema language does not express a PostgreSQL partial unique index.
-- This database-level invariant prevents two concurrent ACTIVE episodes for
-- the same exact PatientHospitalRelationship.
CREATE UNIQUE INDEX "PatientProgram_one_active_per_relationship_idx"
    ON "PatientProgram"("patientHospitalRelationshipId")
    WHERE "status" = 'ACTIVE';

ALTER TABLE "PatientProgram"
    ADD CONSTRAINT "PatientProgram_patientHospitalRelationshipId_fkey"
    FOREIGN KEY ("patientHospitalRelationshipId")
    REFERENCES "PatientHospitalRelationship"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PatientProgram"
    ADD CONSTRAINT "PatientProgram_initialBaselineId_patientHospitalRelationshipId_fkey"
    FOREIGN KEY ("initialBaselineId", "patientHospitalRelationshipId")
    REFERENCES "PatientBaseline"("id", "patientHospitalRelationshipId")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PatientProgram"
    ADD CONSTRAINT "PatientProgram_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId")
    REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
