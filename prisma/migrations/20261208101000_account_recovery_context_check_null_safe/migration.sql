-- Replaces AccountRecovery_mediated_context_check from 20261107100000_rec1_mediated_account_recovery
-- ("verificationMethod" IS NULL OR "hospitalId" IS NOT NULL). That check was NULL-safe but still allowed a row with a
-- NULL verificationMethod. Once claimed, such a row quarantines its user through the unreconciled-recovery filter while
-- findReset and the ADMIN quarantine listing (both require verificationMethod and hospitalId) cannot see it: the same
-- silent lockout closed for WorkforceActivation in 20261208100000_workforce_activation_context_check_null_safe.
-- Every AccountRecovery row must now be a mediated patient reset with a UI verification method and a Hospital.
-- BREAK_GLASS_CLI is excluded because that path exists only in WorkforceActivation. The system has no production data.
-- Deliberately not NOT VALID: ADD CONSTRAINT validates existing rows, so an environment holding such a row fails loudly.
ALTER TABLE "AccountRecovery" DROP CONSTRAINT "AccountRecovery_mediated_context_check";
ALTER TABLE "AccountRecovery" ADD CONSTRAINT "AccountRecovery_mediated_context_check" CHECK (
    COALESCE((
        "verificationMethod" IS NOT NULL
        AND "verificationMethod" IN ('IN_PERSON_ID_CARD', 'VIDEO_CALL_FACE_AND_ID_CARD', 'CALLBACK_PHONE_ON_HOSPITAL_RECORD', 'NOT_RECORDED')
        AND "hospitalId" IS NOT NULL
    ), FALSE)
);
