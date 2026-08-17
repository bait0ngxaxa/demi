-- Phase 9C.0 keeps each Follow-up inside the exact Patient–Hospital relationship.
CREATE TYPE "FollowupActivityProgressStatus" AS ENUM ('DONE', 'PARTIAL', 'NOT_DONE', 'NOT_APPLICABLE');

CREATE TABLE "PatientFollowup" (
    "id" UUID NOT NULL,
    "patientHospitalRelationshipId" UUID NOT NULL,
    "appointmentId" UUID,
    "sourceGoalPlanId" UUID,
    "createdByUserId" UUID NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "submissionNonce" UUID NOT NULL,
    "submissionRequestHash" VARCHAR(64) NOT NULL,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "weight" DOUBLE PRECISION,
    "waistCircumference" DOUBLE PRECISION,
    "systolicBloodPressure" DOUBLE PRECISION,
    "diastolicBloodPressure" DOUBLE PRECISION,
    "bloodSugar" DOUBLE PRECISION,
    "confidenceScore" INTEGER,
    "reflectionNote" VARCHAR(2000),
    "confidencePlan" VARCHAR(2000),
    "generalNote" VARCHAR(2000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientFollowup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PatientFollowupActivityProgress" (
    "id" UUID NOT NULL,
    "followupId" UUID NOT NULL,
    "goalActivityCode" VARCHAR(64) NOT NULL,
    "status" "FollowupActivityProgressStatus" NOT NULL,
    "note" VARCHAR(1000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientFollowupActivityProgress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PatientFollowup_submissionNonce_key" ON "PatientFollowup"("submissionNonce");
CREATE UNIQUE INDEX "PatientFollowup_patientHospitalRelationshipId_roundNumber_key"
    ON "PatientFollowup"("patientHospitalRelationshipId", "roundNumber");
CREATE INDEX "PatientFollowup_patientHospitalRelationshipId_recordedAt_idx"
    ON "PatientFollowup"("patientHospitalRelationshipId", "recordedAt");
CREATE INDEX "PatientFollowup_appointmentId_idx" ON "PatientFollowup"("appointmentId");
CREATE INDEX "PatientFollowup_sourceGoalPlanId_idx" ON "PatientFollowup"("sourceGoalPlanId");
CREATE UNIQUE INDEX "PatientFollowupActivityProgress_followupId_goalActivityCode_key"
    ON "PatientFollowupActivityProgress"("followupId", "goalActivityCode");
CREATE INDEX "PatientFollowupActivityProgress_followupId_createdAt_idx"
    ON "PatientFollowupActivityProgress"("followupId", "createdAt");

ALTER TABLE "PatientFollowup"
    ADD CONSTRAINT "PatientFollowup_patientHospitalRelationshipId_fkey"
    FOREIGN KEY ("patientHospitalRelationshipId") REFERENCES "PatientHospitalRelationship"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PatientFollowup"
    ADD CONSTRAINT "PatientFollowup_appointmentId_fkey"
    FOREIGN KEY ("appointmentId") REFERENCES "PatientAppointment"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PatientFollowup"
    ADD CONSTRAINT "PatientFollowup_sourceGoalPlanId_fkey"
    FOREIGN KEY ("sourceGoalPlanId") REFERENCES "PatientGoalPlan"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PatientFollowup"
    ADD CONSTRAINT "PatientFollowup_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PatientFollowupActivityProgress"
    ADD CONSTRAINT "PatientFollowupActivityProgress_followupId_fkey"
    FOREIGN KEY ("followupId") REFERENCES "PatientFollowup"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
