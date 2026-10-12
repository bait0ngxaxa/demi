-- Workbook DoD (BF-GAP-WB-00) BR-01/04/06/07: structured Follow-up facts.
-- Columns stay nullable so Follow-ups recorded before this change remain valid history;
-- the application requires them for every new Follow-up.
ALTER TABLE "PatientFollowup"
    ADD COLUMN "serviceDate" DATE,
    ADD COLUMN "planAdjusted" BOOLEAN,
    ADD COLUMN "hasObstacle" BOOLEAN,
    ADD COLUMN "obstacleNote" VARCHAR(1000);

ALTER TABLE "PatientFollowup"
    ADD CONSTRAINT "PatientFollowup_obstacleNote_requires_obstacle_check"
    CHECK ("obstacleNote" IS NULL OR "hasObstacle" = TRUE);

ALTER TABLE "PatientFollowupActivityProgress"
    ADD COLUMN "achievedDays" INTEGER;

ALTER TABLE "PatientFollowupActivityProgress"
    ADD CONSTRAINT "PatientFollowupActivityProgress_achievedDays_range_check"
    CHECK ("achievedDays" IS NULL OR ("achievedDays" >= 0 AND "achievedDays" <= 7));

ALTER TABLE "PatientFollowupActivityProgress"
    ADD CONSTRAINT "PatientFollowupActivityProgress_achievedDays_not_applicable_check"
    CHECK ("status" <> 'NOT_APPLICABLE' OR "achievedDays" IS NULL);
