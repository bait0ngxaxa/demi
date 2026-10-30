-- AS-1 (ADR-0022): the hospital's own Achieve score per opened service round (AS-D1, AS-D2). A separate table
-- because the round row is frozen once completed (20261124100000), while the score may still be recorded or
-- corrected after completion as long as the Program is ACTIVE (service rule).

-- CreateTable
CREATE TABLE "PatientProgramRoundAchieveScore" (
    "id" UUID NOT NULL,
    "patientProgramId" UUID NOT NULL,
    "patientHospitalRelationshipId" UUID NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "score" DECIMAL(4,1),
    "recordedByUserId" UUID NOT NULL,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "submissionNonce" UUID NOT NULL,

    CONSTRAINT "PatientProgramRoundAchieveScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PatientProgramRoundAchieveScore_submissionNonce_key" ON "PatientProgramRoundAchieveScore"("submissionNonce");

-- CreateIndex
CREATE INDEX "PatientProgramRoundAchieveScore_recordedByUserId_recordedAt_idx" ON "PatientProgramRoundAchieveScore"("recordedByUserId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PatientProgramRoundAchieveScore_patientProgramId_roundNumbe_key" ON "PatientProgramRoundAchieveScore"("patientProgramId", "roundNumber");

-- AddForeignKey
ALTER TABLE "PatientProgramRoundAchieveScore" ADD CONSTRAINT "PatientProgramRoundAchieveScore_patientProgramId_patientHo_fkey" FOREIGN KEY ("patientProgramId", "patientHospitalRelationshipId", "roundNumber") REFERENCES "PatientProgramRound"("patientProgramId", "patientHospitalRelationshipId", "roundNumber") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientProgramRoundAchieveScore" ADD CONSTRAINT "PatientProgramRoundAchieveScore_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Value guards that Prisma cannot express. A null score is a cleared score.
ALTER TABLE "PatientProgramRoundAchieveScore"
    ADD CONSTRAINT "PatientProgramRoundAchieveScore_score_check"
    CHECK ("score" IS NULL OR "score" BETWEEN 0 AND 100);

ALTER TABLE "PatientProgramRoundAchieveScore"
    ADD CONSTRAINT "PatientProgramRoundAchieveScore_round_range_check"
    CHECK ("roundNumber" BETWEEN 1 AND 12);

-- A score row is never removed (only the demo/test reset may, with the transaction-local switch of
-- 20261102100000) and always belongs to the same round.
CREATE FUNCTION "guard_patient_program_round_achieve_score"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_setting('demi.service_area_purge', true) = 'demo-reset' THEN
      RETURN OLD;
    END IF;

    RAISE EXCEPTION 'Round achieve scores are cleared, not removed' USING ERRCODE = '23514';
  END IF;

  IF NEW."patientProgramId" IS DISTINCT FROM OLD."patientProgramId"
    OR NEW."patientHospitalRelationshipId" IS DISTINCT FROM OLD."patientHospitalRelationshipId"
    OR NEW."roundNumber" IS DISTINCT FROM OLD."roundNumber" THEN
    RAISE EXCEPTION 'The round of an achieve score cannot be changed' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public;

CREATE TRIGGER "patient_program_round_achieve_score_guard"
BEFORE UPDATE OR DELETE ON "PatientProgramRoundAchieveScore"
FOR EACH ROW EXECUTE FUNCTION "guard_patient_program_round_achieve_score"();

-- The score row carries only its latest request token, so every recorded change also keeps an immutable,
-- audited nonce receipt: a retry of an older request can never reapply its value after a later correction.
DROP INDEX "AuditEvent_round_plan_submission_nonce_key";
CREATE UNIQUE INDEX "AuditEvent_round_plan_submission_nonce_key"
ON "AuditEvent" (("metadata"->>'submissionNonce'))
WHERE "action" IN (
  'patient_program_round_plan_item.added',
  'patient_program_round_plan_item.removed',
  'patient_program_round_plan_item.done',
  'patient_program_round_plan_item.undone',
  'patient_program_round.recording_request',
  'patient_program_round.achieve_score_recorded'
);
