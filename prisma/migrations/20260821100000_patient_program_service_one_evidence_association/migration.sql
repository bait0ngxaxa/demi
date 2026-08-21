-- Phase 15B.2 adds one explicit Service 1 evidence association boundary.
-- Existing activity and evidence rows remain valid and receive no backfill.

CREATE UNIQUE INDEX "PatientProgram_id_patientHospitalRelationshipId_key"
    ON "PatientProgram"("id", "patientHospitalRelationshipId");

CREATE UNIQUE INDEX "PatientEvidenceArtifact_id_patientHospitalRelationshipId_key"
    ON "PatientEvidenceArtifact"("id", "patientHospitalRelationshipId");

CREATE UNIQUE INDEX "PatientProgramServiceOneRoutine_id_patientProgramId_key"
    ON "PatientProgramServiceOneRoutine"("id", "patientProgramId");

CREATE UNIQUE INDEX "PatientProgramServiceOneFloatingChart_id_patientProgramId_key"
    ON "PatientProgramServiceOneFloatingChart"("id", "patientProgramId");

CREATE UNIQUE INDEX "PatientProgramServiceOneDreamCard_id_patientProgramId_key"
    ON "PatientProgramServiceOneDreamCard"("id", "patientProgramId");

CREATE TABLE "PatientProgramServiceOneArtifactAssociation" (
    "id" UUID NOT NULL,
    "patientProgramId" UUID NOT NULL,
    "patientHospitalRelationshipId" UUID NOT NULL,
    "patientEvidenceArtifactId" UUID NOT NULL,
    "routineId" UUID,
    "floatingChartId" UUID,
    "dreamCardId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientProgramServiceOneArtifactAssociation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PatientProgramServiceOneArtifactAssociation_one_activity_check"
        CHECK (num_nonnulls("routineId", "floatingChartId", "dreamCardId") = 1)
);

CREATE UNIQUE INDEX "PatientProgramServiceOneArtifactAssociation_patientEvidenceArtifactId_patientHospitalRelationshipId_key"
    ON "PatientProgramServiceOneArtifactAssociation"("patientEvidenceArtifactId", "patientHospitalRelationshipId");

CREATE UNIQUE INDEX "PatientProgramServiceOneArtifactAssociation_routineId_patientProgramId_key"
    ON "PatientProgramServiceOneArtifactAssociation"("routineId", "patientProgramId");

CREATE UNIQUE INDEX "PatientProgramServiceOneArtifactAssociation_floatingChartId_patientProgramId_key"
    ON "PatientProgramServiceOneArtifactAssociation"("floatingChartId", "patientProgramId");

CREATE UNIQUE INDEX "PatientProgramServiceOneArtifactAssociation_dreamCardId_patientProgramId_key"
    ON "PatientProgramServiceOneArtifactAssociation"("dreamCardId", "patientProgramId");

CREATE INDEX "PatientProgramServiceOneArtifactAssociation_patientProgramId_createdAt_idx"
    ON "PatientProgramServiceOneArtifactAssociation"("patientProgramId", "createdAt");

CREATE INDEX "PatientProgramServiceOneArtifactAssociation_patientHospitalRelationshipId_createdAt_idx"
    ON "PatientProgramServiceOneArtifactAssociation"("patientHospitalRelationshipId", "createdAt");

ALTER TABLE "PatientProgramServiceOneArtifactAssociation"
    ADD CONSTRAINT "PatientProgramServiceOneArtifactAssociation_patientProgramId_patientHospitalRelationshipId_fkey"
    FOREIGN KEY ("patientProgramId", "patientHospitalRelationshipId")
    REFERENCES "PatientProgram"("id", "patientHospitalRelationshipId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "PatientProgramServiceOneArtifactAssociation_patientEvidenceArtifactId_patientHospitalRelationshipId_fkey"
    FOREIGN KEY ("patientEvidenceArtifactId", "patientHospitalRelationshipId")
    REFERENCES "PatientEvidenceArtifact"("id", "patientHospitalRelationshipId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "PatientProgramServiceOneArtifactAssociation_routineId_patientProgramId_fkey"
    FOREIGN KEY ("routineId", "patientProgramId")
    REFERENCES "PatientProgramServiceOneRoutine"("id", "patientProgramId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "PatientProgramServiceOneArtifactAssociation_floatingChartId_patientProgramId_fkey"
    FOREIGN KEY ("floatingChartId", "patientProgramId")
    REFERENCES "PatientProgramServiceOneFloatingChart"("id", "patientProgramId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "PatientProgramServiceOneArtifactAssociation_dreamCardId_patientProgramId_fkey"
    FOREIGN KEY ("dreamCardId", "patientProgramId")
    REFERENCES "PatientProgramServiceOneDreamCard"("id", "patientProgramId")
    ON DELETE RESTRICT ON UPDATE CASCADE;
