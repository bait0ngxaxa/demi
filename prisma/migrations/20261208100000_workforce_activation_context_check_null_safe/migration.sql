-- Rebuilt from 20261207101000_reset_verification_not_recorded_context with exactly two changes:
--   1. The whole expression is wrapped in COALESCE((...), FALSE). PostgreSQL accepts a CHECK that evaluates to NULL,
--      so a RESET row with a null hospitalId/relationshipId/relationshipKind and any non-null verificationMethod made
--      `"relationshipKind" = 'platform_admin'` NULL and passed. NULL now fails, for every branch.
--   2. The all-null-context branch excludes 'RESET', so every RESET row must have a recognized context. The former
--      "legacy null-context RESET rows" allowance is dropped because the system has no production data and none exist.
-- Reason: such a row, once claimed, quarantines the user through the unreconciled-reset filter while findReset and the
-- ADMIN quarantine listing cannot see it, i.e. a silent lockout no ADMIN can reconcile.
-- Deliberately not NOT VALID: ADD CONSTRAINT validates existing rows, so an environment holding such a row fails loudly.
ALTER TABLE "WorkforceActivation" DROP CONSTRAINT "WorkforceActivation_context_check";
ALTER TABLE "WorkforceActivation" ADD CONSTRAINT "WorkforceActivation_context_check" CHECK (
    COALESCE((
        (
            "hospitalId" IS NULL AND "relationshipId" IS NULL AND "relationshipKind" IS NULL
            AND "purpose" NOT IN ('RESET', 'CHILD_OWNER_ONBOARDING', 'PARENT_OWNER_ONBOARDING') AND "verificationMethod" IS NULL
        ) OR
        (
            "hospitalId" IS NULL AND "relationshipId" IS NULL AND "relationshipKind" = 'platform_admin'
            AND "purpose" = 'RESET'
            AND "verificationMethod" IS NOT NULL
            AND "verificationMethod" IN ('IN_PERSON_ID_CARD', 'VIDEO_CALL_FACE_AND_ID_CARD', 'CALLBACK_PHONE_ON_HOSPITAL_RECORD', 'NOT_RECORDED')
        ) OR
        (
            "hospitalId" IS NULL AND "relationshipId" IS NULL AND "relationshipKind" = 'platform_admin'
            AND "purpose" = 'RESET' AND "verificationMethod" = 'BREAK_GLASS_CLI'
        ) OR
        (
            "hospitalId" IS NOT NULL AND "relationshipKind" IS NOT NULL AND (
                (
                    "relationshipId" IS NOT NULL AND (
                        ("relationshipKind" IN ('HOSPITAL_MEMBER', 'OSM') AND "purpose" NOT IN ('CHILD_OWNER_ONBOARDING', 'PARENT_OWNER_ONBOARDING') AND "verificationMethod" IS NULL) OR
                        ("relationshipKind" = 'CHILD_OWNER' AND "purpose" = 'CHILD_OWNER_ONBOARDING' AND "verificationMethod" IS NULL) OR
                        ("relationshipKind" = 'PARENT_OWNER' AND "purpose" = 'PARENT_OWNER_ONBOARDING' AND "verificationMethod" IS NULL) OR
                        ("relationshipKind" IN ('staff', 'osm', 'patient') AND "purpose" = 'RESET'
                            AND "verificationMethod" IS NOT NULL
                            AND "verificationMethod" IN ('IN_PERSON_ID_CARD', 'VIDEO_CALL_FACE_AND_ID_CARD', 'CALLBACK_PHONE_ON_HOSPITAL_RECORD', 'NOT_RECORDED'))
                    )
                ) OR
                (
                    "relationshipId" IS NULL AND "relationshipKind" IN ('platform_admin', 'caregiver') AND "purpose" = 'RESET'
                    AND "verificationMethod" IS NOT NULL
                    AND "verificationMethod" IN ('IN_PERSON_ID_CARD', 'VIDEO_CALL_FACE_AND_ID_CARD', 'CALLBACK_PHONE_ON_HOSPITAL_RECORD', 'NOT_RECORDED')
                )
            )
        )
    ), FALSE)
);
