-- Phase 15C.1 adds explicit Program ownership to Goal Plan and Follow-up.
-- Existing relationship-level rows are intentionally left with NULL patientProgramId.

ALTER TABLE "PatientGoalPlan"
    ADD COLUMN "patientProgramId" UUID;

ALTER TABLE "PatientFollowup"
    ADD COLUMN "patientProgramId" UUID;

-- Keep the old single-column Goal Plan FK for historical Follow-up rows and add
-- a nullable composite identity for linked Follow-up provenance.
CREATE UNIQUE INDEX "PatientGoalPlan_id_patientProgramId_patientHospitalRelationshipId_key"
    ON "PatientGoalPlan"("id", "patientProgramId", "patientHospitalRelationshipId");

-- Linked records use Program + round. PostgreSQL permits multiple NULL values
-- in this index; the two partial indexes below preserve legacy uniqueness.
DROP INDEX "PatientGoalPlan_patientHospitalRelationshipId_roundNumber_key";
CREATE UNIQUE INDEX "PatientGoalPlan_patientProgramId_roundNumber_key"
    ON "PatientGoalPlan"("patientProgramId", "roundNumber");
CREATE UNIQUE INDEX "PatientGoalPlan_legacy_relationship_round_key"
    ON "PatientGoalPlan"("patientHospitalRelationshipId", "roundNumber")
    WHERE "patientProgramId" IS NULL;
CREATE INDEX "PatientGoalPlan_patientProgramId_createdAt_idx"
    ON "PatientGoalPlan"("patientProgramId", "createdAt");

DROP INDEX "PatientFollowup_patientHospitalRelationshipId_roundNumber_key";
CREATE UNIQUE INDEX "PatientFollowup_patientProgramId_roundNumber_key"
    ON "PatientFollowup"("patientProgramId", "roundNumber");
CREATE UNIQUE INDEX "PatientFollowup_legacy_relationship_round_key"
    ON "PatientFollowup"("patientHospitalRelationshipId", "roundNumber")
    WHERE "patientProgramId" IS NULL;
CREATE INDEX "PatientFollowup_patientProgramId_recordedAt_idx"
    ON "PatientFollowup"("patientProgramId", "recordedAt");

ALTER TABLE "PatientGoalPlan"
    ADD CONSTRAINT "PatientGoalPlan_patientProgramId_patientHospitalRelationshipId_fkey"
    FOREIGN KEY ("patientProgramId", "patientHospitalRelationshipId")
    REFERENCES "PatientProgram"("id", "patientHospitalRelationshipId")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PatientFollowup"
    ADD CONSTRAINT "PatientFollowup_patientProgramId_patientHospitalRelationshipId_fkey"
    FOREIGN KEY ("patientProgramId", "patientHospitalRelationshipId")
    REFERENCES "PatientProgram"("id", "patientHospitalRelationshipId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "PatientFollowup_sourceGoalPlanId_patientProgramId_patientHospitalRelationshipId_fkey"
    FOREIGN KEY ("sourceGoalPlanId", "patientProgramId", "patientHospitalRelationshipId")
    REFERENCES "PatientGoalPlan"("id", "patientProgramId", "patientHospitalRelationshipId")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- The composite source FK uses PostgreSQL MATCH SIMPLE semantics: historical
-- Follow-ups with NULL patientProgramId continue to resolve through the
-- existing single-column sourceGoalPlan FK, while linked rows must match the
-- exact Program and relationship.
