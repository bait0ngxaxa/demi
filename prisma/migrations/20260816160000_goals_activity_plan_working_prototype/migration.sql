-- Phase 8B.0 Goals & Activity Plan working prototype.
-- Goal plans are immutable historical rounds with source-defined template snapshots.
CREATE TABLE "PatientGoalPlan" (
    "id" UUID NOT NULL,
    "patientHospitalRelationshipId" UUID NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "sourceScreeningAssessmentId" UUID,
    "submissionNonce" UUID NOT NULL,
    "templateKey" VARCHAR(64) NOT NULL,
    "templateVersion" VARCHAR(64) NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "primaryGoalCode" VARCHAR(64) NOT NULL,
    "primaryGoalNote" VARCHAR(1000),
    "weeklyNote" VARCHAR(2000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientGoalPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PatientGoalItem" (
    "id" UUID NOT NULL,
    "goalPlanId" UUID NOT NULL,
    "activityCode" VARCHAR(64) NOT NULL,
    "targetDays" INTEGER NOT NULL,
    "targetValue" DOUBLE PRECISION,
    "targetUnit" VARCHAR(32),
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientGoalItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PatientGoalPlan_submissionNonce_key"
    ON "PatientGoalPlan"("submissionNonce");
CREATE UNIQUE INDEX "PatientGoalPlan_patientHospitalRelationshipId_roundNumber_key"
    ON "PatientGoalPlan"("patientHospitalRelationshipId", "roundNumber");
CREATE INDEX "PatientGoalPlan_patientHospitalRelationshipId_createdAt_idx"
    ON "PatientGoalPlan"("patientHospitalRelationshipId", "createdAt");
CREATE UNIQUE INDEX "PatientGoalItem_goalPlanId_activityCode_key"
    ON "PatientGoalItem"("goalPlanId", "activityCode");
CREATE INDEX "PatientGoalItem_goalPlanId_sortOrder_idx"
    ON "PatientGoalItem"("goalPlanId", "sortOrder");

ALTER TABLE "PatientGoalPlan"
ADD CONSTRAINT "PatientGoalPlan_patientHospitalRelationshipId_fkey"
FOREIGN KEY ("patientHospitalRelationshipId") REFERENCES "PatientHospitalRelationship"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "PatientGoalPlan_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "PatientGoalPlan_sourceScreeningAssessmentId_fkey"
FOREIGN KEY ("sourceScreeningAssessmentId") REFERENCES "ScreeningAssessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PatientGoalItem"
ADD CONSTRAINT "PatientGoalItem_goalPlanId_fkey"
FOREIGN KEY ("goalPlanId") REFERENCES "PatientGoalPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
