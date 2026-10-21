-- Phase R1 (SR-D1..D13, Product Owner 2026-10-21): must-complete service rounds.
-- No backfill: the system holds test data only (Product Owner, 2026-10-21).

-- CreateEnum
CREATE TYPE "PatientProgramRoundStepCode" AS ENUM ('VITALS', 'KNOW_SELF', 'PAM', 'PROMS', 'FLOATING_CHART', 'CONFIDENCE_RULER', 'ROUTINE', 'HEALTH_PATH', 'HEALTH_PLAN_REVIEW', 'DREAM_CARD', 'HEALTHY_PLAN', 'HEALTH_PATH_REVIEW');

-- CreateEnum
CREATE TYPE "PatientProgramRoundSkipReason" AS ENUM ('PATIENT_DECLINED', 'PATIENT_UNABLE', 'EQUIPMENT_UNAVAILABLE', 'OTHER');

-- DropIndex
DROP INDEX "PatientProgramServiceOneConfidence_patientProgramId_key";

-- DropIndex
DROP INDEX "PatientProgramServiceOneDreamCard_patientProgramId_key";

-- DropIndex
DROP INDEX "PatientProgramServiceOneFloatingChart_patientProgramId_key";

-- DropIndex
DROP INDEX "PatientProgramServiceOneRoutine_patientProgramId_key";

-- AlterTable
ALTER TABLE "PatientHospitalProfile" ADD COLUMN     "preferredName" VARCHAR(100);

-- AlterTable
ALTER TABLE "PatientProgramServiceOneConfidence" ADD COLUMN     "roundNumber" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "PatientProgramServiceOneDreamCard" ADD COLUMN     "roundNumber" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "PatientProgramServiceOneFloatingChart" ADD COLUMN     "roundNumber" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "PatientProgramServiceOneRoutine" ADD COLUMN     "roundNumber" INTEGER NOT NULL;

-- CreateTable
CREATE TABLE "PatientProgramRoundCompletion" (
    "id" UUID NOT NULL,
    "patientProgramId" UUID NOT NULL,
    "patientHospitalRelationshipId" UUID NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "completedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedByUserId" UUID NOT NULL,
    "submissionNonce" UUID NOT NULL,

    CONSTRAINT "PatientProgramRoundCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientProgramRoundStepSkip" (
    "id" UUID NOT NULL,
    "patientProgramId" UUID NOT NULL,
    "patientHospitalRelationshipId" UUID NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "stepCode" "PatientProgramRoundStepCode" NOT NULL,
    "reasonCode" "PatientProgramRoundSkipReason" NOT NULL,
    "note" VARCHAR(500),
    "skippedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientProgramRoundStepSkip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PatientProgramRoundCompletion_submissionNonce_key" ON "PatientProgramRoundCompletion"("submissionNonce");

-- CreateIndex
CREATE INDEX "PatientProgramRoundCompletion_completedByUserId_completedAt_idx" ON "PatientProgramRoundCompletion"("completedByUserId", "completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PatientProgramRoundCompletion_patientProgramId_roundNumber_key" ON "PatientProgramRoundCompletion"("patientProgramId", "roundNumber");

-- CreateIndex
CREATE INDEX "PatientProgramRoundStepSkip_skippedByUserId_createdAt_idx" ON "PatientProgramRoundStepSkip"("skippedByUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PatientProgramRoundStepSkip_patientProgramId_roundNumber_st_key" ON "PatientProgramRoundStepSkip"("patientProgramId", "roundNumber", "stepCode");

-- CreateIndex
CREATE UNIQUE INDEX "PatientProgramServiceOneConfidence_patientProgramId_roundNu_key" ON "PatientProgramServiceOneConfidence"("patientProgramId", "roundNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PatientProgramServiceOneDreamCard_patientProgramId_roundNum_key" ON "PatientProgramServiceOneDreamCard"("patientProgramId", "roundNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PatientProgramServiceOneFloatingChart_patientProgramId_roun_key" ON "PatientProgramServiceOneFloatingChart"("patientProgramId", "roundNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PatientProgramServiceOneRoutine_patientProgramId_roundNumbe_key" ON "PatientProgramServiceOneRoutine"("patientProgramId", "roundNumber");

-- AddForeignKey
ALTER TABLE "PatientProgramRoundCompletion" ADD CONSTRAINT "PatientProgramRoundCompletion_patientProgramId_patientHosp_fkey" FOREIGN KEY ("patientProgramId", "patientHospitalRelationshipId") REFERENCES "PatientProgram"("id", "patientHospitalRelationshipId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientProgramRoundCompletion" ADD CONSTRAINT "PatientProgramRoundCompletion_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientProgramRoundStepSkip" ADD CONSTRAINT "PatientProgramRoundStepSkip_patientProgramId_patientHospit_fkey" FOREIGN KEY ("patientProgramId", "patientHospitalRelationshipId") REFERENCES "PatientProgram"("id", "patientHospitalRelationshipId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientProgramRoundStepSkip" ADD CONSTRAINT "PatientProgramRoundStepSkip_skippedByUserId_fkey" FOREIGN KEY ("skippedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Value and shape guards that Prisma cannot express.
-- SR-D8/SR-D11: a per-round tool result exists only in a round whose checklist lists the tool.
ALTER TABLE "PatientProgramServiceOneConfidence"
    ADD CONSTRAINT "PatientProgramServiceOneConfidence_round_check"
    CHECK ("roundNumber" IN (1, 2, 3, 4, 6));

ALTER TABLE "PatientProgramServiceOneRoutine"
    ADD CONSTRAINT "PatientProgramServiceOneRoutine_round_check"
    CHECK ("roundNumber" IN (1, 2, 4, 5));

ALTER TABLE "PatientProgramServiceOneFloatingChart"
    ADD CONSTRAINT "PatientProgramServiceOneFloatingChart_round_check"
    CHECK ("roundNumber" IN (1, 4));

ALTER TABLE "PatientProgramServiceOneDreamCard"
    ADD CONSTRAINT "PatientProgramServiceOneDreamCard_round_check"
    CHECK ("roundNumber" = 3);

-- SR-D12: trimmed and never blank.
ALTER TABLE "PatientHospitalProfile"
    ADD CONSTRAINT "PatientHospitalProfile_preferred_name_check"
    CHECK ("preferredName" IS NULL OR ("preferredName" = btrim("preferredName") AND "preferredName" <> ''));

ALTER TABLE "PatientProgramRoundCompletion"
    ADD CONSTRAINT "PatientProgramRoundCompletion_round_range_check"
    CHECK ("roundNumber" BETWEEN 1 AND 6);

ALTER TABLE "PatientProgramRoundStepSkip"
    ADD CONSTRAINT "PatientProgramRoundStepSkip_round_range_check"
    CHECK ("roundNumber" BETWEEN 1 AND 6);

-- SR-D3: OTHER needs a note; a note is trimmed and never blank.
ALTER TABLE "PatientProgramRoundStepSkip"
    ADD CONSTRAINT "PatientProgramRoundStepSkip_note_check"
    CHECK (
        ("note" IS NULL OR ("note" = btrim("note") AND "note" <> ''))
        AND ("reasonCode" <> 'OTHER' OR "note" IS NOT NULL)
    );

-- SR-D4: a completion is final (no reopen in this phase). Only the demo/test reset may remove rows,
-- with the same transaction-local switch as HospitalRetirementEvent.
CREATE FUNCTION "guard_patient_program_round_completion"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('demi.service_area_purge', true) = 'demo-reset' THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'Completed program round cannot be changed or removed' USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public;

CREATE TRIGGER "patient_program_round_completion_guard"
BEFORE UPDATE OR DELETE ON "PatientProgramRoundCompletion"
FOR EACH ROW EXECUTE FUNCTION "guard_patient_program_round_completion"();

-- SR-D3/SR-D4: skips are frozen once their round is completed (OLD and NEW round both checked).
CREATE FUNCTION "guard_patient_program_round_step_skip"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('demi.service_area_purge', true) = 'demo-reset' THEN
    RETURN OLD;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') AND EXISTS (
    SELECT 1 FROM "PatientProgramRoundCompletion"
    WHERE "patientProgramId" = OLD."patientProgramId" AND "roundNumber" = OLD."roundNumber"
  ) THEN
    RAISE EXCEPTION 'Step skips of a completed program round cannot be changed' USING ERRCODE = '23514';
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') AND EXISTS (
    SELECT 1 FROM "PatientProgramRoundCompletion"
    WHERE "patientProgramId" = NEW."patientProgramId" AND "roundNumber" = NEW."roundNumber"
  ) THEN
    RAISE EXCEPTION 'Step skips of a completed program round cannot be changed' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public;

CREATE TRIGGER "patient_program_round_step_skip_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "PatientProgramRoundStepSkip"
FOR EACH ROW EXECUTE FUNCTION "guard_patient_program_round_step_skip"();
