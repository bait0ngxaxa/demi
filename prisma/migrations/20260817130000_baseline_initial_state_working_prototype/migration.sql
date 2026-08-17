-- Phase 10C.0 introduces a dedicated immutable relationship-scoped Baseline.
CREATE TABLE "PatientBaseline" (
    "id" UUID NOT NULL,
    "patientHospitalRelationshipId" UUID NOT NULL,
    "recordedOn" DATE NOT NULL,
    "recordedByUserId" UUID NOT NULL,
    "weight" DOUBLE PRECISION,
    "waistCircumference" DOUBLE PRECISION,
    "bloodPressureSystolic" DOUBLE PRECISION,
    "bloodPressureDiastolic" DOUBLE PRECISION,
    "bloodSugarDtx" DOUBLE PRECISION,
    "adaptationSummary" VARCHAR(2000),
    "adaptationObstacles" VARCHAR(2000),
    "adaptationOpportunities" VARCHAR(2000),
    "confidenceScore" INTEGER,
    "confidenceImprovementPlan" VARCHAR(2000),
    "summary" VARCHAR(2000),
    "recommendations" VARCHAR(2000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientBaseline_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PatientBaseline_patientHospitalRelationshipId_key"
    ON "PatientBaseline"("patientHospitalRelationshipId");

ALTER TABLE "PatientBaseline"
    ADD CONSTRAINT "PatientBaseline_patientHospitalRelationshipId_fkey"
    FOREIGN KEY ("patientHospitalRelationshipId") REFERENCES "PatientHospitalRelationship"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PatientBaseline"
    ADD CONSTRAINT "PatientBaseline_recordedByUserId_fkey"
    FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
