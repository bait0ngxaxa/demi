-- Owner decision 2026-11-16: mediated resets issued from the UI no longer record a verification method and store
-- NOT_RECORDED instead. Rebuilt verbatim from 20261201110000_admin_parent_owner_invitation; only the three RESET
-- verificationMethod IN (...) lists changed, each gaining 'NOT_RECORDED'. The enum value is added by the preceding
-- migration because PostgreSQL cannot use a value added by ADD VALUE in the same transaction.
ALTER TABLE "WorkforceActivation" DROP CONSTRAINT "WorkforceActivation_context_check";
ALTER TABLE "WorkforceActivation" ADD CONSTRAINT "WorkforceActivation_context_check" CHECK (
    (
        "hospitalId" IS NULL AND "relationshipId" IS NULL AND "relationshipKind" IS NULL
        AND "purpose" NOT IN ('CHILD_OWNER_ONBOARDING', 'PARENT_OWNER_ONBOARDING') AND "verificationMethod" IS NULL
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
);
