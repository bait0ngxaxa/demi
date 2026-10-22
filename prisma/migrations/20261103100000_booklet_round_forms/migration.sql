-- Phase R2 (Product Owner, 2026-10-22): booklet-exact PAM, PROMs, health plan, plan review and round forms.
-- Additive only: existing columns keep their values; legacy rows stay readable.

-- R2-C: PAM and PROMs are separate instruments. Existing rows are the legacy combined set.
CREATE TYPE "ScreeningInstrument" AS ENUM ('COMBINED', 'PAM', 'PROMS');

ALTER TABLE "ScreeningAssessment" ADD COLUMN "instrument" "ScreeningInstrument" NOT NULL DEFAULT 'COMBINED';
ALTER TABLE "ScreeningAssessment" ALTER COLUMN "instrument" DROP DEFAULT;

-- One screening per Program becomes one per (Program, instrument). Existing data holds at most one row per
-- Program, so the new unique index cannot conflict. The Program FK references PatientProgram's own key.
DROP INDEX "ScreeningAssessment_patientProgramId_key";
DROP INDEX "ScreeningAssessment_patientProgramId_patientHospitalRelatio_key";
CREATE UNIQUE INDEX "ScreeningAssessment_patientProgramId_instrument_key" ON "ScreeningAssessment"("patientProgramId", "instrument");

-- R2-D / R2-F: Program Follow-up height, plan review answer and expert advice.
ALTER TABLE "PatientFollowup" ADD COLUMN "heightCm" DOUBLE PRECISION,
ADD COLUMN "followedPlan" BOOLEAN,
ADD COLUMN "expertAdvice" VARCHAR(1000);

ALTER TABLE "PatientFollowup"
    ADD CONSTRAINT "PatientFollowup_expert_advice_check"
    CHECK ("expertAdvice" IS NULL OR ("expertAdvice" = btrim("expertAdvice") AND "expertAdvice" <> ''));

-- R2-E: แผน "สุขภาพดี" ของฉัน (Goal Plan template booklet-v1).
ALTER TABLE "PatientGoalPlan" ADD COLUMN "goalWeightLossKg" DOUBLE PRECISION,
ADD COLUMN "goalWaistCm" DOUBLE PRECISION,
ADD COLUMN "goalBloodSugarMgDl" DOUBLE PRECISION,
ADD COLUMN "goalHba1cPercent" DOUBLE PRECISION,
ADD COLUMN "goalCustomText" VARCHAR(1000),
ADD COLUMN "foodPlanText" VARCHAR(1000),
ADD COLUMN "foodStartDate" DATE,
ADD COLUMN "foodNotSet" BOOLEAN,
ADD COLUMN "exercisePlanText" VARCHAR(1000),
ADD COLUMN "exerciseStartDate" DATE,
ADD COLUMN "exerciseNotSet" BOOLEAN,
ADD COLUMN "problemsAfterOneMonth" VARCHAR(2000),
ADD COLUMN "patientSignatureName" VARCHAR(200),
ADD COLUMN "witnessSignatureName" VARCHAR(200);

-- A section marked "ไม่ได้ตั้งเป้า" carries no text or start date.
ALTER TABLE "PatientGoalPlan"
    ADD CONSTRAINT "PatientGoalPlan_booklet_sections_check"
    CHECK (
        ("foodNotSet" IS NOT TRUE OR ("foodPlanText" IS NULL AND "foodStartDate" IS NULL))
        AND ("exerciseNotSet" IS NOT TRUE OR ("exercisePlanText" IS NULL AND "exerciseStartDate" IS NULL))
    );

-- R2-E: photo of the signed plan page through the existing evidence association.
ALTER TABLE "PatientProgramServiceOneArtifactAssociation" ADD COLUMN "goalPlanId" UUID;

CREATE UNIQUE INDEX "PatientProgramServiceOneArtifactAssociation_goalPlanId_pati_key" ON "PatientProgramServiceOneArtifactAssociation"("goalPlanId", "patientProgramId", "patientHospitalRelationshipId");

ALTER TABLE "PatientProgramServiceOneArtifactAssociation" ADD CONSTRAINT "PatientProgramServiceOneArtifactAssociation_goalPlanId_pat_fkey" FOREIGN KEY ("goalPlanId", "patientProgramId", "patientHospitalRelationshipId") REFERENCES "PatientGoalPlan"("id", "patientProgramId", "patientHospitalRelationshipId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PatientProgramServiceOneArtifactAssociation"
    DROP CONSTRAINT "PatientProgramServiceOneArtifactAssociation_one_activity_check";

ALTER TABLE "PatientProgramServiceOneArtifactAssociation"
    ADD CONSTRAINT "PatientProgramServiceOneArtifactAssociation_one_activity_check"
    CHECK (num_nonnulls("routineId", "floatingChartId", "dreamCardId", "goalPlanId") = 1);

-- R2-G: ความฝันของฉัน booklet fields. A new card has both the dream and this week's small goal.
ALTER TABLE "PatientProgramServiceOneDreamCard" ADD COLUMN "dream" VARCHAR(1000),
ADD COLUMN "obstacle" VARCHAR(1000),
ADD COLUMN "weeklyGoal" VARCHAR(1000);

ALTER TABLE "PatientProgramServiceOneDreamCard"
    ADD CONSTRAINT "PatientProgramServiceOneDreamCard_booklet_check"
    CHECK (
        ("dream" IS NULL AND "obstacle" IS NULL AND "weeklyGoal" IS NULL)
        OR ("dream" IS NOT NULL AND "weeklyGoal" IS NOT NULL)
    );

-- R2-G: ตารางชีวิตของฉัน date and rows.
ALTER TABLE "PatientProgramServiceOneRoutine" ADD COLUMN "routineDate" DATE;

CREATE TABLE "PatientProgramServiceOneRoutineEntry" (
    "id" UUID NOT NULL,
    "routineId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "timeText" VARCHAR(20),
    "activity" VARCHAR(500) NOT NULL,
    "adjustment" VARCHAR(500),

    CONSTRAINT "PatientProgramServiceOneRoutineEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PatientProgramServiceOneRoutineEntry_routineId_sortOrder_key" ON "PatientProgramServiceOneRoutineEntry"("routineId", "sortOrder");

ALTER TABLE "PatientProgramServiceOneRoutineEntry" ADD CONSTRAINT "PatientProgramServiceOneRoutineEntry_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "PatientProgramServiceOneRoutine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PatientProgramServiceOneRoutineEntry"
    ADD CONSTRAINT "PatientProgramServiceOneRoutineEntry_shape_check"
    CHECK (
        "sortOrder" BETWEEN 0 AND 23
        AND "activity" = btrim("activity") AND "activity" <> ''
        AND ("timeText" IS NULL OR ("timeText" = btrim("timeText") AND "timeText" <> ''))
        AND ("adjustment" IS NULL OR ("adjustment" = btrim("adjustment") AND "adjustment" <> ''))
    );
