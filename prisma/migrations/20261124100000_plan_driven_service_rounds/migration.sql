-- ADR-0022 (FR-1, Product Owner 2026-10-28): plan-driven service rounds foundation.
-- Opened rounds and their per-round plans are materialized rows; the guideline only seeds them.
-- ADD VALUE cannot share a transaction with its first use, so this migration compares the two new enum
-- values as text and never parses them as enum literals.

-- AlterEnum
ALTER TYPE "PatientProgramRoundStepCode" ADD VALUE 'CUSTOM';

-- AlterEnum
ALTER TYPE "PatientProgramRoundSkipReason" ADD VALUE 'NOT_DONE_AT_CLOSE';

-- CreateEnum
CREATE TYPE "PatientProgramRoundOrigin" AS ENUM ('GUIDELINE', 'EXTRA');

-- CreateEnum
CREATE TYPE "PatientProgramRoundPlanItemOrigin" AS ENUM ('GUIDELINE', 'ADDED');

-- CreateTable
CREATE TABLE "PatientProgramRound" (
    "id" UUID NOT NULL,
    "patientProgramId" UUID NOT NULL,
    "patientHospitalRelationshipId" UUID NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "origin" "PatientProgramRoundOrigin" NOT NULL,
    "openedAt" TIMESTAMPTZ(3) NOT NULL,
    "openedByUserId" UUID NOT NULL,
    "submissionNonce" UUID NOT NULL,

    CONSTRAINT "PatientProgramRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientProgramRoundPlanItem" (
    "id" UUID NOT NULL,
    "patientProgramId" UUID NOT NULL,
    "patientHospitalRelationshipId" UUID NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "stepCode" "PatientProgramRoundStepCode" NOT NULL,
    "customTitle" VARCHAR(120),
    "position" INTEGER NOT NULL,
    "origin" "PatientProgramRoundPlanItemOrigin" NOT NULL,
    "addedByUserId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMPTZ(3),
    "removedByUserId" UUID,
    "doneAt" TIMESTAMPTZ(3),
    "doneByUserId" UUID,
    "doneNote" VARCHAR(500),

    CONSTRAINT "PatientProgramRoundPlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PatientProgramRound_submissionNonce_key" ON "PatientProgramRound"("submissionNonce");

-- CreateIndex
CREATE INDEX "PatientProgramRound_openedByUserId_openedAt_idx" ON "PatientProgramRound"("openedByUserId", "openedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PatientProgramRound_patientProgramId_roundNumber_key" ON "PatientProgramRound"("patientProgramId", "roundNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PatientProgramRound_patientProgramId_patientHospitalRelatio_key" ON "PatientProgramRound"("patientProgramId", "patientHospitalRelationshipId", "roundNumber");

-- CreateIndex
CREATE INDEX "PatientProgramRoundPlanItem_patientProgramId_patientHospita_idx" ON "PatientProgramRoundPlanItem"("patientProgramId", "patientHospitalRelationshipId", "roundNumber", "position");

-- CreateIndex
CREATE INDEX "PatientProgramRoundPlanItem_addedByUserId_idx" ON "PatientProgramRoundPlanItem"("addedByUserId");

-- CreateIndex
CREATE INDEX "PatientProgramRoundPlanItem_removedByUserId_idx" ON "PatientProgramRoundPlanItem"("removedByUserId");

-- CreateIndex
CREATE INDEX "PatientProgramRoundPlanItem_doneByUserId_idx" ON "PatientProgramRoundPlanItem"("doneByUserId");

-- AddForeignKey
ALTER TABLE "PatientProgramRound" ADD CONSTRAINT "PatientProgramRound_patientProgramId_patientHospitalRelati_fkey" FOREIGN KEY ("patientProgramId", "patientHospitalRelationshipId") REFERENCES "PatientProgram"("id", "patientHospitalRelationshipId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientProgramRound" ADD CONSTRAINT "PatientProgramRound_openedByUserId_fkey" FOREIGN KEY ("openedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientProgramRoundPlanItem" ADD CONSTRAINT "PatientProgramRoundPlanItem_patientProgramId_patientHospit_fkey" FOREIGN KEY ("patientProgramId", "patientHospitalRelationshipId", "roundNumber") REFERENCES "PatientProgramRound"("patientProgramId", "patientHospitalRelationshipId", "roundNumber") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientProgramRoundPlanItem" ADD CONSTRAINT "PatientProgramRoundPlanItem_addedByUserId_fkey" FOREIGN KEY ("addedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientProgramRoundPlanItem" ADD CONSTRAINT "PatientProgramRoundPlanItem_removedByUserId_fkey" FOREIGN KEY ("removedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientProgramRoundPlanItem" ADD CONSTRAINT "PatientProgramRoundPlanItem_doneByUserId_fkey" FOREIGN KEY ("doneByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Value and shape guards that Prisma cannot express.
-- FR-D3: rounds 1-6 come from the guideline; staff may add rounds 7-12.
ALTER TABLE "PatientProgramRound"
    ADD CONSTRAINT "PatientProgramRound_round_range_check"
    CHECK ("roundNumber" BETWEEN 1 AND 12);

ALTER TABLE "PatientProgramRound"
    ADD CONSTRAINT "PatientProgramRound_origin_check"
    CHECK (("origin" = 'GUIDELINE') = ("roundNumber" <= 6));

ALTER TABLE "PatientProgramRoundPlanItem"
    ADD CONSTRAINT "PatientProgramRoundPlanItem_position_check"
    CHECK ("position" >= 1);

-- FR-D2: a CUSTOM item, and only a CUSTOM item, has a trimmed, non-blank title.
ALTER TABLE "PatientProgramRoundPlanItem"
    ADD CONSTRAINT "PatientProgramRoundPlanItem_custom_title_check"
    CHECK (
        ("customTitle" IS NULL OR ("customTitle" = btrim("customTitle") AND "customTitle" <> ''))
        AND (("customTitle" IS NOT NULL) = ("stepCode"::text = 'CUSTOM'))
    );

-- FR-D2: "ทำแล้ว" belongs to CUSTOM items (other steps are done by their own records); the recorder is
-- not role-constrained because patients record their own items (FR-D4a). A note needs the done mark.
ALTER TABLE "PatientProgramRoundPlanItem"
    ADD CONSTRAINT "PatientProgramRoundPlanItem_done_check"
    CHECK (
        ("doneAt" IS NULL) = ("doneByUserId" IS NULL)
        AND ("doneAt" IS NULL OR "stepCode"::text = 'CUSTOM')
        AND ("doneNote" IS NULL OR "doneAt" IS NOT NULL)
        AND ("doneNote" IS NULL OR ("doneNote" = btrim("doneNote") AND "doneNote" <> ''))
    );

-- FR-D7: a soft removal records both when and who.
ALTER TABLE "PatientProgramRoundPlanItem"
    ADD CONSTRAINT "PatientProgramRoundPlanItem_removed_check"
    CHECK (("removedAt" IS NULL) = ("removedByUserId" IS NULL));

ALTER TABLE "PatientProgramRoundPlanItem"
    ADD CONSTRAINT "PatientProgramRoundPlanItem_added_by_check"
    CHECK (("addedByUserId" IS NOT NULL) = ("origin" = 'ADDED'));

-- One active item per non-CUSTOM step and round; a removed step can be added again. "customTitle IS NULL"
-- is exactly "stepCode <> 'CUSTOM'" (custom_title_check) and, unlike an enum-to-text cast, is immutable.
CREATE UNIQUE INDEX "PatientProgramRoundPlanItem_active_step_key"
    ON "PatientProgramRoundPlanItem"("patientProgramId", "roundNumber", "stepCode")
    WHERE "removedAt" IS NULL AND "customTitle" IS NULL;

-- Completions, skips and vitals may belong to any round 1-12 (vitals: FR-4 patient self-recording).
ALTER TABLE "PatientProgramRoundCompletion" DROP CONSTRAINT "PatientProgramRoundCompletion_round_range_check";
ALTER TABLE "PatientProgramRoundCompletion"
    ADD CONSTRAINT "PatientProgramRoundCompletion_round_range_check"
    CHECK ("roundNumber" BETWEEN 1 AND 12);

ALTER TABLE "PatientProgramRoundStepSkip" DROP CONSTRAINT "PatientProgramRoundStepSkip_round_range_check";
ALTER TABLE "PatientProgramRoundStepSkip"
    ADD CONSTRAINT "PatientProgramRoundStepSkip_round_range_check"
    CHECK ("roundNumber" BETWEEN 1 AND 12);

ALTER TABLE "PatientProgramRoundVitals" DROP CONSTRAINT "PatientProgramRoundVitals_round_range_check";
ALTER TABLE "PatientProgramRoundVitals"
    ADD CONSTRAINT "PatientProgramRoundVitals_round_range_check"
    CHECK ("roundNumber" BETWEEN 1 AND 12);

-- The per-round tool sets move from fixed CHECKs to the round's plan (trigger below).
ALTER TABLE "PatientProgramServiceOneConfidence" DROP CONSTRAINT "PatientProgramServiceOneConfidence_round_check";
ALTER TABLE "PatientProgramServiceOneRoutine" DROP CONSTRAINT "PatientProgramServiceOneRoutine_round_check";
ALTER TABLE "PatientProgramServiceOneFloatingChart" DROP CONSTRAINT "PatientProgramServiceOneFloatingChart_round_check";
ALTER TABLE "PatientProgramServiceOneDreamCard" DROP CONSTRAINT "PatientProgramServiceOneDreamCard_round_check";


-- Data step: every existing Program gets round 1 and each guideline round n <= 6 whose round n-1 is
-- completed, with the plan seeded from the guideline. Round 1 is opened by the Program's creator at its
-- start; round n by whoever completed round n-1, at that moment. Runs before the guards below, which
-- would refuse plan items of an already completed round.
-- The VALUES list is the guideline at this migration (ROUND_GUIDELINES in
-- src/modules/patient-program-rounds/domain/round-steps.ts); a unit test keeps them equal and an
-- integration test runs the statements between the markers.
-- BEGIN FR-1 data step
INSERT INTO "PatientProgramRound" ("id", "patientProgramId", "patientHospitalRelationshipId", "roundNumber", "origin", "openedAt", "openedByUserId", "submissionNonce")
SELECT gen_random_uuid(), "program"."id", "program"."patientHospitalRelationshipId", 1, 'GUIDELINE'::"PatientProgramRoundOrigin", "program"."startedAt", "program"."createdByUserId", gen_random_uuid()
FROM "PatientProgram" AS "program"
UNION ALL
SELECT gen_random_uuid(), "previous"."patientProgramId", "previous"."patientHospitalRelationshipId", "previous"."roundNumber" + 1, 'GUIDELINE'::"PatientProgramRoundOrigin", "previous"."completedAt", "previous"."completedByUserId", gen_random_uuid()
FROM "PatientProgramRoundCompletion" AS "previous"
WHERE "previous"."roundNumber" BETWEEN 1 AND 5;

INSERT INTO "PatientProgramRoundPlanItem" ("id", "patientProgramId", "patientHospitalRelationshipId", "roundNumber", "stepCode", "position", "origin", "createdAt")
WITH "guideline" ("roundNumber", "position", "stepCode") AS (
    VALUES
        (1, 1, 'VITALS'), (1, 2, 'KNOW_SELF'), (1, 3, 'PAM'), (1, 4, 'PROMS'), (1, 5, 'FLOATING_CHART'), (1, 6, 'CONFIDENCE_RULER'), (1, 7, 'ROUTINE'), (1, 8, 'HEALTH_PATH'),
        (2, 1, 'VITALS'), (2, 2, 'HEALTH_PLAN_REVIEW'), (2, 3, 'CONFIDENCE_RULER'), (2, 4, 'ROUTINE'),
        (3, 1, 'VITALS'), (3, 2, 'HEALTH_PLAN_REVIEW'), (3, 3, 'CONFIDENCE_RULER'), (3, 4, 'DREAM_CARD'),
        (4, 1, 'VITALS'), (4, 2, 'HEALTH_PLAN_REVIEW'), (4, 3, 'FLOATING_CHART'), (4, 4, 'CONFIDENCE_RULER'), (4, 5, 'ROUTINE'), (4, 6, 'HEALTHY_PLAN'),
        (5, 1, 'VITALS'), (5, 2, 'HEALTH_PLAN_REVIEW'), (5, 3, 'ROUTINE'),
        (6, 1, 'VITALS'), (6, 2, 'HEALTH_PATH_REVIEW'), (6, 3, 'HEALTH_PLAN_REVIEW'), (6, 4, 'CONFIDENCE_RULER')
)
SELECT gen_random_uuid(), "round"."patientProgramId", "round"."patientHospitalRelationshipId", "round"."roundNumber", "guideline"."stepCode"::"PatientProgramRoundStepCode", "guideline"."position", 'GUIDELINE'::"PatientProgramRoundPlanItemOrigin", "round"."openedAt"
FROM "PatientProgramRound" AS "round"
JOIN "guideline" ON "guideline"."roundNumber" = "round"."roundNumber";
-- END FR-1 data step


-- A round is never removed (only the demo/test reset may, with the transaction-local switch of
-- 20261102100000) and is frozen once completed.
CREATE FUNCTION "guard_patient_program_round"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_setting('demi.service_area_purge', true) = 'demo-reset' THEN
      RETURN OLD;
    END IF;

    RAISE EXCEPTION 'Program rounds cannot be removed' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "PatientProgramRoundCompletion"
    WHERE ("patientProgramId" = OLD."patientProgramId" AND "roundNumber" = OLD."roundNumber")
       OR ("patientProgramId" = NEW."patientProgramId" AND "roundNumber" = NEW."roundNumber")
  ) THEN
    RAISE EXCEPTION 'A completed program round cannot be changed' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public;

CREATE TRIGGER "patient_program_round_guard"
BEFORE UPDATE OR DELETE ON "PatientProgramRound"
FOR EACH ROW EXECUTE FUNCTION "guard_patient_program_round"();

-- FR-D7: plan items are removed softly and never deleted (demo/test reset aside); the identity of an item
-- never changes and a removal is final (re-adding creates a new item). The plan of a completed round is
-- frozen (OLD and NEW round both checked).
CREATE FUNCTION "guard_patient_program_round_plan_item"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_setting('demi.service_area_purge', true) = 'demo-reset' THEN
      RETURN OLD;
    END IF;

    RAISE EXCEPTION 'Round plan items are removed by marking them removed' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' AND (
    NEW."patientProgramId" IS DISTINCT FROM OLD."patientProgramId"
    OR NEW."patientHospitalRelationshipId" IS DISTINCT FROM OLD."patientHospitalRelationshipId"
    OR NEW."roundNumber" IS DISTINCT FROM OLD."roundNumber"
    OR NEW."stepCode" IS DISTINCT FROM OLD."stepCode"
    OR NEW."origin" IS DISTINCT FROM OLD."origin"
    OR NEW."addedByUserId" IS DISTINCT FROM OLD."addedByUserId"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
    OR (OLD."removedAt" IS NOT NULL AND (
      NEW."removedAt" IS DISTINCT FROM OLD."removedAt" OR NEW."removedByUserId" IS DISTINCT FROM OLD."removedByUserId"
    ))
  ) THEN
    RAISE EXCEPTION 'Round plan item identity and removal cannot be changed' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "PatientProgramRoundCompletion"
    WHERE "patientProgramId" = NEW."patientProgramId" AND "roundNumber" = NEW."roundNumber"
  ) OR (TG_OP = 'UPDATE' AND EXISTS (
    SELECT 1 FROM "PatientProgramRoundCompletion"
    WHERE "patientProgramId" = OLD."patientProgramId" AND "roundNumber" = OLD."roundNumber"
  )) THEN
    RAISE EXCEPTION 'The plan of a completed program round cannot be changed' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public;

CREATE TRIGGER "patient_program_round_plan_item_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "PatientProgramRoundPlanItem"
FOR EACH ROW EXECUTE FUNCTION "guard_patient_program_round_plan_item"();

-- Completions, skips and round vitals belong to an opened round.
CREATE FUNCTION "require_patient_program_round"() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "PatientProgramRound"
    WHERE "patientProgramId" = NEW."patientProgramId" AND "roundNumber" = NEW."roundNumber"
  ) THEN
    RAISE EXCEPTION 'The program round has not been opened' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public;

CREATE TRIGGER "patient_program_round_completion_round_required"
BEFORE INSERT ON "PatientProgramRoundCompletion"
FOR EACH ROW EXECUTE FUNCTION "require_patient_program_round"();

CREATE TRIGGER "patient_program_round_step_skip_round_required"
BEFORE INSERT OR UPDATE ON "PatientProgramRoundStepSkip"
FOR EACH ROW EXECUTE FUNCTION "require_patient_program_round"();

CREATE TRIGGER "patient_program_round_vitals_round_required"
BEFORE INSERT OR UPDATE ON "PatientProgramRoundVitals"
FOR EACH ROW EXECUTE FUNCTION "require_patient_program_round"();

-- SR-D8 on plans: a per-round tool result exists only in a round whose active plan lists the tool.
-- TG_ARGV[0] is the tool's step code.
CREATE FUNCTION "require_patient_program_round_plan_item"() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "PatientProgramRoundPlanItem"
    WHERE "patientProgramId" = NEW."patientProgramId"
      AND "roundNumber" = NEW."roundNumber"
      AND "stepCode" = TG_ARGV[0]::"PatientProgramRoundStepCode"
      AND "removedAt" IS NULL
  ) THEN
    RAISE EXCEPTION 'The round plan does not list this tool' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public;

CREATE TRIGGER "patient_program_service_one_confidence_plan_required"
BEFORE INSERT OR UPDATE ON "PatientProgramServiceOneConfidence"
FOR EACH ROW EXECUTE FUNCTION "require_patient_program_round_plan_item"('CONFIDENCE_RULER');

CREATE TRIGGER "patient_program_service_one_routine_plan_required"
BEFORE INSERT OR UPDATE ON "PatientProgramServiceOneRoutine"
FOR EACH ROW EXECUTE FUNCTION "require_patient_program_round_plan_item"('ROUTINE');

CREATE TRIGGER "patient_program_service_one_floating_chart_plan_required"
BEFORE INSERT OR UPDATE ON "PatientProgramServiceOneFloatingChart"
FOR EACH ROW EXECUTE FUNCTION "require_patient_program_round_plan_item"('FLOATING_CHART');

CREATE TRIGGER "patient_program_service_one_dream_card_plan_required"
BEFORE INSERT OR UPDATE ON "PatientProgramServiceOneDreamCard"
FOR EACH ROW EXECUTE FUNCTION "require_patient_program_round_plan_item"('DREAM_CARD');
