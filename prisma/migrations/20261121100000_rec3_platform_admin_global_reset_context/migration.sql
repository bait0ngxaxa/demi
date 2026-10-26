ALTER TABLE "WorkforceActivation" DROP CONSTRAINT "WorkforceActivation_context_check";

-- Preserve legacy null-scope activation and RESET rows that have no REC-1 verification method.
-- REC-1 does not resolve those rows as mediated reset capabilities; new scoped resets require
-- an explicit target kind and verification method below.
ALTER TABLE "WorkforceActivation" ADD CONSTRAINT "WorkforceActivation_context_check" CHECK (
    (
        "hospitalId" IS NULL AND "relationshipId" IS NULL AND "relationshipKind" IS NULL
        AND "purpose" <> 'CHILD_OWNER_ONBOARDING' AND "verificationMethod" IS NULL
    ) OR
    (
        "hospitalId" IS NULL AND "relationshipId" IS NULL AND "relationshipKind" = 'platform_admin'
        AND "purpose" = 'RESET'
        AND "verificationMethod" IS NOT NULL
        AND "verificationMethod" IN ('IN_PERSON_ID_CARD', 'VIDEO_CALL_FACE_AND_ID_CARD', 'CALLBACK_PHONE_ON_HOSPITAL_RECORD')
    ) OR
    (
        "hospitalId" IS NULL AND "relationshipId" IS NULL AND "relationshipKind" = 'platform_admin'
        AND "purpose" = 'RESET' AND "verificationMethod" = 'BREAK_GLASS_CLI'
    ) OR
    (
        "hospitalId" IS NOT NULL AND "relationshipKind" IS NOT NULL AND (
            (
                "relationshipId" IS NOT NULL AND (
                    ("relationshipKind" IN ('HOSPITAL_MEMBER', 'OSM') AND "purpose" <> 'CHILD_OWNER_ONBOARDING' AND "verificationMethod" IS NULL) OR
                    ("relationshipKind" = 'CHILD_OWNER' AND "purpose" = 'CHILD_OWNER_ONBOARDING' AND "verificationMethod" IS NULL) OR
                    ("relationshipKind" IN ('staff', 'osm', 'patient') AND "purpose" = 'RESET'
                        AND "verificationMethod" IS NOT NULL
                        AND "verificationMethod" IN ('IN_PERSON_ID_CARD', 'VIDEO_CALL_FACE_AND_ID_CARD', 'CALLBACK_PHONE_ON_HOSPITAL_RECORD'))
                )
            ) OR
            (
                "relationshipId" IS NULL AND "relationshipKind" IN ('platform_admin', 'caregiver') AND "purpose" = 'RESET'
                AND "verificationMethod" IS NOT NULL
                AND "verificationMethod" IN ('IN_PERSON_ID_CARD', 'VIDEO_CALL_FACE_AND_ID_CARD', 'CALLBACK_PHONE_ON_HOSPITAL_RECORD')
            )
        )
    )
);
