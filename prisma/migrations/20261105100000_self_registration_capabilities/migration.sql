-- SR-1: OWNER-controlled public self-registration for eligible pre-provisioned accounts.
-- Keep the new workforce enum value out of defaults/checks in this migration so PostgreSQL can
-- commit the enum change before application code writes the value.
ALTER TYPE "WorkforceActivationPurpose" ADD VALUE 'SELF_REGISTRATION';

CREATE TYPE "PatientActivationPurpose" AS ENUM ('ACTIVATION', 'SELF_REGISTRATION');

ALTER TABLE "Hospital"
    ADD COLUMN "selfRegistrationEnabled" BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE "HospitalMembership"
    ADD COLUMN "selfRegisteredAt" TIMESTAMPTZ(3);

ALTER TABLE "OsmHospitalRelationship"
    ADD COLUMN "selfRegisteredAt" TIMESTAMPTZ(3);

ALTER TABLE "PatientHospitalRelationship"
    ADD COLUMN "selfRegisteredAt" TIMESTAMPTZ(3);

ALTER TABLE "WorkforceActivation"
    ADD COLUMN "selfRegistrationRelationships" JSONB,
    ADD CONSTRAINT "WorkforceActivation_selfRegistrationRelationships_check"
        CHECK (
            "selfRegistrationRelationships" IS NULL
            OR (
                jsonb_typeof("selfRegistrationRelationships") = 'array'
                AND jsonb_array_length("selfRegistrationRelationships") > 0
            )
        );

ALTER TABLE "PatientActivation"
    ADD COLUMN "purpose" "PatientActivationPurpose" NOT NULL DEFAULT 'ACTIVATION',
    ADD COLUMN "selfRegistrationRelationships" JSONB,
    ADD CONSTRAINT "PatientActivation_selfRegistrationRelationships_check"
        CHECK (
            "selfRegistrationRelationships" IS NULL
            OR (
                jsonb_typeof("selfRegistrationRelationships") = 'array'
                AND jsonb_array_length("selfRegistrationRelationships") > 0
            )
        );

DROP INDEX "PatientActivation_one_usable_per_user_key";
CREATE UNIQUE INDEX "PatientActivation_one_usable_per_user_purpose_key"
    ON "PatientActivation"("userId", "purpose")
    WHERE "usedAt" IS NULL AND "revokedAt" IS NULL;

CREATE TABLE "PublicSelfRegistrationRateLimitBucket" (
    "category" VARCHAR(16) NOT NULL,
    "keyHash" VARCHAR(64) NOT NULL,
    "windowStart" TIMESTAMPTZ(3) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "hitCount" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "PublicSelfRegistrationRateLimitBucket_pkey"
        PRIMARY KEY ("category", "keyHash", "windowStart"),
    CONSTRAINT "PublicSelfRegistrationRateLimitBucket_hitCount_check"
        CHECK ("hitCount" > 0)
);

CREATE INDEX "PublicSelfRegistrationRateLimitBucket_expiresAt_idx"
    ON "PublicSelfRegistrationRateLimitBucket"("expiresAt");

ALTER TABLE "PublicSelfRegistrationRateLimitBucket" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "PublicSelfRegistrationRateLimitBucket" FROM PUBLIC;
