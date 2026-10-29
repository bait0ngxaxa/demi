-- FR-D5: legacy extra history must be reconciled before deploying plan-owned follow-ups.
-- Development/demo databases use synthetic fixtures and are reset; never fabricate clinical rounds.
DO $$
DECLARE orphan_count integer;
BEGIN
  SELECT count(*) INTO orphan_count
  FROM "PatientFollowup" AS followup
  WHERE followup."patientProgramId" IS NOT NULL AND followup."roundNumber" >= 5
    AND NOT EXISTS (
      SELECT 1 FROM "PatientProgramRound" AS round
      WHERE round."patientProgramId" = followup."patientProgramId"
        AND round."roundNumber" = followup."roundNumber" + 2
    );
  IF orphan_count > 0 THEN
    RAISE EXCEPTION '% Program follow-up(s) have no opened service round; reset synthetic development/demo data or reconcile before migration', orphan_count;
  END IF;
END;
$$;
