-- Phase 15D.1 adds one immutable, Program-owned Final Assessment per episode.
-- Existing Programs intentionally receive no backfilled Final Assessment row.

CREATE TABLE "PatientFinalAssessment" (
    "id" UUID NOT NULL,
    "patientProgramId" UUID NOT NULL,
    "patientHospitalRelationshipId" UUID NOT NULL,
    "recordedByUserId" UUID NOT NULL,
    "weight" DOUBLE PRECISION,
    "waistCircumference" DOUBLE PRECISION,
    "systolicBloodPressure" DOUBLE PRECISION,
    "diastolicBloodPressure" DOUBLE PRECISION,
    "bloodSugar" DOUBLE PRECISION,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientFinalAssessment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PatientFinalAssessment_measurement_required_check"
        CHECK (
            "weight" IS NOT NULL
            OR "waistCircumference" IS NOT NULL
            OR "systolicBloodPressure" IS NOT NULL
            OR "diastolicBloodPressure" IS NOT NULL
            OR "bloodSugar" IS NOT NULL
        )
);

CREATE UNIQUE INDEX "PatientFinalAssessment_patientProgramId_key"
    ON "PatientFinalAssessment"("patientProgramId");
CREATE UNIQUE INDEX "PatientFinalAssessment_patientProgramId_patientHospitalRelationshipId_key"
    ON "PatientFinalAssessment"("patientProgramId", "patientHospitalRelationshipId");
CREATE INDEX "PatientFinalAssessment_recordedByUserId_recordedAt_idx"
    ON "PatientFinalAssessment"("recordedByUserId", "recordedAt");

ALTER TABLE "PatientFinalAssessment"
    ADD CONSTRAINT "PatientFinalAssessment_patientProgramId_patientHospitalRelationshipId_fkey"
    FOREIGN KEY ("patientProgramId", "patientHospitalRelationshipId")
    REFERENCES "PatientProgram"("id", "patientHospitalRelationshipId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "PatientFinalAssessment_patientHospitalRelationshipId_fkey"
    FOREIGN KEY ("patientHospitalRelationshipId")
    REFERENCES "PatientHospitalRelationship"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "PatientFinalAssessment_recordedByUserId_fkey"
    FOREIGN KEY ("recordedByUserId")
    REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
