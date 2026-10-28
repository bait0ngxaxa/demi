BEGIN;

-- Mutable round recordings retain an immutable, audited nonce receipt even after re-recording.
-- Keep the existing cross-Program backstop for plan writes and extend it to recording requests.
DROP INDEX "AuditEvent_round_plan_submission_nonce_key";
CREATE UNIQUE INDEX "AuditEvent_round_plan_submission_nonce_key"
ON "AuditEvent" (("metadata"->>'submissionNonce'))
WHERE "action" IN (
  'patient_program_round_plan_item.added',
  'patient_program_round_plan_item.removed',
  'patient_program_round_plan_item.done',
  'patient_program_round_plan_item.undone',
  'patient_program_round.recording_request'
);

COMMIT;
