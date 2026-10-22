-- REC-1: verified OWNER/ADMIN-mediated password reset, reusing the existing reset records.
CREATE TYPE "CredentialRecoveryVerificationMethod" AS ENUM (
    'IN_PERSON_ID_CARD',
    'VIDEO_CALL_FACE_AND_ID_CARD',
    'CALLBACK_PHONE_ON_HOSPITAL_RECORD'
);

ALTER TYPE "AccountRecoveryDeliveryChannel" ADD VALUE 'ONLINE';
ALTER TYPE "UserTakeoverProviderState" ADD VALUE 'RESOLVED';

ALTER TABLE "User"
    ADD COLUMN "providerLoginAlias" VARCHAR(255);
CREATE UNIQUE INDEX "User_providerLoginAlias_key" ON "User"("providerLoginAlias");

ALTER TABLE "WorkforceActivation"
    ADD COLUMN "verificationMethod" "CredentialRecoveryVerificationMethod",
    ADD COLUMN "previousAuthSubject" VARCHAR(255),
    ADD COLUMN "replacementAuthSubject" VARCHAR(255);

ALTER TABLE "AccountRecovery"
    ADD COLUMN "hospitalId" UUID REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE RESTRICT,
    ADD COLUMN "verificationMethod" "CredentialRecoveryVerificationMethod",
    ADD COLUMN "failedVerificationCount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "operationState" "WorkforceActivationOperationState" NOT NULL DEFAULT 'NOT_STARTED',
    ADD COLUMN "previousAuthSubject" VARCHAR(255),
    ADD COLUMN "replacementAuthSubject" VARCHAR(255);
ALTER TABLE "AccountRecovery" ADD CONSTRAINT "AccountRecovery_mediated_context_check"
    CHECK ("verificationMethod" IS NULL OR "hospitalId" IS NOT NULL);

ALTER TABLE "UserTakeoverLock"
    ADD COLUMN "suspendedMembershipIds" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
    ADD COLUMN "suspendedOsmRelationshipIds" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];

-- RESET can bind either a concrete relationship (including a patient relationship) or a
-- platform ADMIN target scoped to an active Hospital without inventing a relationship ID.
ALTER TABLE "WorkforceActivation" DROP CONSTRAINT "WorkforceActivation_context_check";
ALTER TABLE "WorkforceActivation" ADD CONSTRAINT "WorkforceActivation_context_check" CHECK (
    ("hospitalId" IS NULL AND "relationshipId" IS NULL AND "relationshipKind" IS NULL
        AND "purpose" <> 'CHILD_OWNER_ONBOARDING') OR
    ("hospitalId" IS NOT NULL AND "relationshipKind" IS NOT NULL AND (
        ("relationshipId" IS NOT NULL AND (
            ("relationshipKind" IN ('HOSPITAL_MEMBER', 'OSM') AND "purpose" <> 'CHILD_OWNER_ONBOARDING') OR
            ("relationshipKind" = 'CHILD_OWNER' AND "purpose" = 'CHILD_OWNER_ONBOARDING') OR
            ("relationshipKind" IN ('staff', 'osm', 'patient') AND "purpose" = 'RESET')
        )) OR
        ("relationshipId" IS NULL AND "relationshipKind" = 'platform_admin' AND "purpose" = 'RESET')
    ))
);
