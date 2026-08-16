-- Phase 7B.0 Screening working prototype. Responses and derived results are
-- validated application-owned snapshots; question definitions remain in source code.
CREATE TABLE "ScreeningAssessment" (
    "id" UUID NOT NULL,
    "patientHospitalRelationshipId" UUID NOT NULL,
    "conductedByUserId" UUID NOT NULL,
    "submissionNonce" UUID NOT NULL,
    "questionSetKey" VARCHAR(64) NOT NULL,
    "questionSetVersion" VARCHAR(64) NOT NULL,
    "scoringVersion" VARCHAR(64) NOT NULL,
    "responses" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScreeningAssessment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScreeningAssessment_submissionNonce_key"
    ON "ScreeningAssessment"("submissionNonce");
CREATE INDEX "ScreeningAssessment_patientHospitalRelationshipId_submittedAt_idx"
    ON "ScreeningAssessment"("patientHospitalRelationshipId", "submittedAt");
CREATE INDEX "ScreeningAssessment_conductedByUserId_submittedAt_idx"
    ON "ScreeningAssessment"("conductedByUserId", "submittedAt");

ALTER TABLE "ScreeningAssessment"
ADD CONSTRAINT "ScreeningAssessment_patientHospitalRelationshipId_fkey"
FOREIGN KEY ("patientHospitalRelationshipId") REFERENCES "PatientHospitalRelationship"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "ScreeningAssessment_conductedByUserId_fkey"
FOREIGN KEY ("conductedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
