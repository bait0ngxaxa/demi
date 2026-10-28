-- Plan edits keep their immutable request receipt in the audited event. Program locks serialize edits
-- within one Program; this index also prevents a nonce being consumed concurrently across Programs.
CREATE UNIQUE INDEX "AuditEvent_round_plan_submission_nonce_key"
ON "AuditEvent" (("metadata"->>'submissionNonce'))
WHERE "action" IN (
  'patient_program_round_plan_item.added',
  'patient_program_round_plan_item.removed',
  'patient_program_round_plan_item.done',
  'patient_program_round_plan_item.undone'
);
