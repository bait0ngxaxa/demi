-- ADR-0022 (FR-1b): a step skip belongs to one plan item, the ledger accepts rounds 1-12 and a round opens
-- only after the round before it is completed.

-- Target of the skips' composite foreign key: a skip's step and round always equal its item's.
CREATE UNIQUE INDEX "PatientProgramRoundPlanItem_skip_target_key" ON "PatientProgramRoundPlanItem"("id", "patientProgramId", "roundNumber", "stepCode");

ALTER TABLE "PatientProgramRoundStepSkip" ADD COLUMN "planItemId" UUID;

-- BEGIN FR-1b data step
-- Every existing skip names a non-CUSTOM guideline step, so its round has exactly one item of that step.
DO $$
DECLARE
  "unmatched" integer;
BEGIN
  SELECT count(*) INTO "unmatched"
  FROM "PatientProgramRoundStepSkip" AS "skip"
  WHERE (
    SELECT count(*) FROM "PatientProgramRoundPlanItem" AS "item"
    WHERE "item"."patientProgramId" = "skip"."patientProgramId"
      AND "item"."roundNumber" = "skip"."roundNumber"
      AND "item"."stepCode" = "skip"."stepCode"
  ) <> 1;

  IF "unmatched" > 0 THEN
    RAISE EXCEPTION '% round step skip(s) do not match exactly one plan item', "unmatched";
  END IF;
END;
$$;

-- Skips of completed rounds are frozen (20261102100000); linking them to their item is not a change of the skip.
ALTER TABLE "PatientProgramRoundStepSkip" DISABLE TRIGGER "patient_program_round_step_skip_guard";

UPDATE "PatientProgramRoundStepSkip" AS "skip"
SET "planItemId" = "item"."id"
FROM "PatientProgramRoundPlanItem" AS "item"
WHERE "item"."patientProgramId" = "skip"."patientProgramId"
  AND "item"."roundNumber" = "skip"."roundNumber"
  AND "item"."stepCode" = "skip"."stepCode";

ALTER TABLE "PatientProgramRoundStepSkip" ENABLE TRIGGER "patient_program_round_step_skip_guard";
-- END FR-1b data step

ALTER TABLE "PatientProgramRoundStepSkip" ALTER COLUMN "planItemId" SET NOT NULL;

-- One skip per plan item: several CUSTOM items of a round can each be skipped, and a re-added item starts
-- without the removed item's skip.
DROP INDEX "PatientProgramRoundStepSkip_patientProgramId_roundNumber_st_key";

CREATE UNIQUE INDEX "PatientProgramRoundStepSkip_planItemId_key" ON "PatientProgramRoundStepSkip"("planItemId");

CREATE INDEX "PatientProgramRoundStepSkip_patientProgramId_roundNumber_idx" ON "PatientProgramRoundStepSkip"("patientProgramId", "roundNumber");

ALTER TABLE "PatientProgramRoundStepSkip" ADD CONSTRAINT "PatientProgramRoundStepSkip_planItem_fkey" FOREIGN KEY ("planItemId", "patientProgramId", "roundNumber", "stepCode") REFERENCES "PatientProgramRoundPlanItem"("id", "patientProgramId", "roundNumber", "stepCode") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A skip is recorded only on an active (not removed) plan item.
CREATE FUNCTION "require_active_round_step_skip_plan_item"() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "PatientProgramRoundPlanItem"
    WHERE "id" = NEW."planItemId" AND "removedAt" IS NULL
  ) THEN
    RAISE EXCEPTION 'A step skip needs an active plan item' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public;

CREATE TRIGGER "patient_program_round_step_skip_plan_item_required"
BEFORE INSERT OR UPDATE ON "PatientProgramRoundStepSkip"
FOR EACH ROW EXECUTE FUNCTION "require_active_round_step_skip_plan_item"();

-- A skipped item is unskipped before it is removed, so a removal never hides a skip.
CREATE FUNCTION "guard_patient_program_round_plan_item_removal"() RETURNS trigger AS $$
BEGIN
  IF OLD."removedAt" IS NULL AND NEW."removedAt" IS NOT NULL AND EXISTS (
    SELECT 1 FROM "PatientProgramRoundStepSkip" WHERE "planItemId" = OLD."id"
  ) THEN
    RAISE EXCEPTION 'A skipped plan item is unskipped before it is removed' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public;

CREATE TRIGGER "patient_program_round_plan_item_removal_guard"
BEFORE UPDATE ON "PatientProgramRoundPlanItem"
FOR EACH ROW EXECUTE FUNCTION "guard_patient_program_round_plan_item_removal"();

-- Ledger rows follow the numbered rounds 1-12 (MAX_PROGRAM_ROUNDS).
ALTER TABLE "PatientProgramRoundActivity" DROP CONSTRAINT "PatientProgramRoundActivity_round_range_check";

ALTER TABLE "PatientProgramRoundActivity"
    ADD CONSTRAINT "PatientProgramRoundActivity_round_range_check"
    CHECK ("roundNumber" BETWEEN 1 AND 12);

-- SR-D5 for opened rounds: round 1 opens with its Program, round n only after round n - 1 is completed.
-- Rows written by the FR-1 data step predate this trigger.
CREATE FUNCTION "require_previous_program_round_completed"() RETURNS trigger AS $$
BEGIN
  IF NEW."roundNumber" <> 1 AND NOT EXISTS (
    SELECT 1 FROM "PatientProgramRoundCompletion"
    WHERE "patientProgramId" = NEW."patientProgramId" AND "roundNumber" = NEW."roundNumber" - 1
  ) THEN
    RAISE EXCEPTION 'A program round opens only after the previous round is completed' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public;

CREATE TRIGGER "patient_program_round_previous_completed"
BEFORE INSERT ON "PatientProgramRound"
FOR EACH ROW EXECUTE FUNCTION "require_previous_program_round_completed"();
