-- Workbook DoD (BF-GAP-WB-00) BR-06: link the Goal Plan created after a Follow-up answered
-- "ปรับแผน" to that Follow-up. The composite FK keeps both in the same Program and
-- relationship; the unique index allows at most one adjusted plan per Follow-up.
ALTER TABLE "PatientGoalPlan" ADD COLUMN "sourceFollowupId" UUID;

CREATE UNIQUE INDEX "PatientGoalPlan_sourceFollowupId_key" ON "PatientGoalPlan"("sourceFollowupId");

CREATE UNIQUE INDEX "PatientFollowup_id_patientProgramId_patientHospitalRelationshipId_key"
    ON "PatientFollowup"("id", "patientProgramId", "patientHospitalRelationshipId");

ALTER TABLE "PatientGoalPlan"
    ADD CONSTRAINT "PatientGoalPlan_sourceFollowupId_patientProgramId_patientHospitalRelationshipId_fkey"
    FOREIGN KEY ("sourceFollowupId", "patientProgramId", "patientHospitalRelationshipId")
    REFERENCES "PatientFollowup"("id", "patientProgramId", "patientHospitalRelationshipId")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- The composite FK is only enforced when every column is non-null, so a linked plan must be Program-scoped.
ALTER TABLE "PatientGoalPlan"
    ADD CONSTRAINT "PatientGoalPlan_sourceFollowup_requires_program_check"
    CHECK ("sourceFollowupId" IS NULL OR "patientProgramId" IS NOT NULL);
