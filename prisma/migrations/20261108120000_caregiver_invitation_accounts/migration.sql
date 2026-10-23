ALTER TYPE "Role" ADD VALUE 'CAREGIVER';

ALTER TABLE "Person"
    ADD COLUMN "nameIsSelfAsserted" BOOLEAN NOT NULL DEFAULT FALSE;

-- Keep both existing composite foreign keys. PostgreSQL's default MATCH SIMPLE
-- skips a nullable recipient pair; the CHECK below forbids a partially-null pair.
-- The source-pair unique index and CaregiverRelationship source FK remain intact:
-- an accepted relationship can reference only an invitation already bound to the
-- exact persisted User + Person pair.
ALTER TABLE "CaregiverInvitation"
    ALTER COLUMN "caregiverUserId" DROP NOT NULL,
    ALTER COLUMN "caregiverPersonId" DROP NOT NULL,
    ADD COLUMN "recipientIdentityKeyHash" VARCHAR(64);

ALTER TABLE "CaregiverInvitation"
    ADD CONSTRAINT "CaregiverInvitation_recipient_state_check"
    CHECK (
        (
            "caregiverUserId" IS NOT NULL
            AND "caregiverPersonId" IS NOT NULL
            AND "recipientIdentityKeyHash" IS NULL
        )
        OR (
            "caregiverUserId" IS NULL
            AND "caregiverPersonId" IS NULL
            AND "recipientIdentityKeyHash" IS NOT NULL
            AND "status" = 'PENDING'
        )
        OR (
            "caregiverUserId" IS NULL
            AND "caregiverPersonId" IS NULL
            AND "recipientIdentityKeyHash" IS NULL
            AND "status" IN ('REVOKED', 'EXPIRED')
        )
    );

CREATE INDEX "CaregiverInvitation_patientProfileId_recipientIdentityKeyHash_status_idx"
    ON "CaregiverInvitation"("patientProfileId", "recipientIdentityKeyHash", "status");
