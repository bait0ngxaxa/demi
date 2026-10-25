ALTER TABLE "WorkforceActivation" DROP CONSTRAINT "WorkforceActivation_context_check";
ALTER TABLE "WorkforceActivation" ADD CONSTRAINT "WorkforceActivation_context_check" CHECK (
    ("hospitalId" IS NULL AND "relationshipId" IS NULL AND "relationshipKind" IS NULL
        AND "purpose" <> 'CHILD_OWNER_ONBOARDING') OR
    ("hospitalId" IS NULL AND "relationshipId" IS NULL AND "relationshipKind" = 'platform_admin'
        AND "purpose" = 'RESET' AND "verificationMethod" = 'BREAK_GLASS_CLI') OR
    ("hospitalId" IS NOT NULL AND "relationshipKind" IS NOT NULL AND (
        ("relationshipId" IS NOT NULL AND (
            ("relationshipKind" IN ('HOSPITAL_MEMBER', 'OSM') AND "purpose" <> 'CHILD_OWNER_ONBOARDING') OR
            ("relationshipKind" = 'CHILD_OWNER' AND "purpose" = 'CHILD_OWNER_ONBOARDING') OR
            ("relationshipKind" IN ('staff', 'osm', 'patient') AND "purpose" = 'RESET')
        )) OR
        ("relationshipId" IS NULL AND "relationshipKind" IN ('platform_admin', 'caregiver') AND "purpose" = 'RESET')
    )) AND
    ("verificationMethod" IS DISTINCT FROM 'BREAK_GLASS_CLI' OR (
        "hospitalId" IS NULL AND "relationshipId" IS NULL AND "relationshipKind" = 'platform_admin' AND "purpose" = 'RESET'
    ))
);
