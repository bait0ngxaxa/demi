CREATE TYPE "CaregiverInvitationStatus" AS ENUM (
    'PENDING',
    'ACCEPTED',
    'REJECTED',
    'REVOKED',
    'EXPIRED'
);

CREATE TYPE "CaregiverRelationshipStatus" AS ENUM (
    'ACTIVE',
    'REVOKED',
    'WITHDRAWN'
);

-- This composite key lets an invitation's caregiver User and Person binding be
-- enforced by PostgreSQL rather than relying only on application consistency.
CREATE UNIQUE INDEX "User_id_personId_key" ON "User"("id", "personId");

CREATE TABLE "CaregiverInvitation" (
    "id" UUID NOT NULL,
    "patientProfileId" UUID NOT NULL,
    "caregiverUserId" UUID NOT NULL,
    "caregiverPersonId" UUID NOT NULL,
    "issuedByUserId" UUID NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "status" "CaregiverInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "acceptanceContractVersion" VARCHAR(64),
    "issuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3),
    "rejectedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "expiredAt" TIMESTAMPTZ(3),
    "revokedByUserId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CaregiverInvitation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CaregiverInvitation_expiry_ttl_check"
        CHECK ("expiresAt" = "issuedAt" + INTERVAL '24 hours'),
    CONSTRAINT "CaregiverInvitation_lifecycle_evidence_check"
        CHECK (
            ("status" = 'PENDING' AND
                "acceptedAt" IS NULL AND "acceptanceContractVersion" IS NULL AND
                "rejectedAt" IS NULL AND "revokedAt" IS NULL AND
                "revokedByUserId" IS NULL AND "expiredAt" IS NULL) OR
            ("status" = 'ACCEPTED' AND
                "acceptedAt" IS NOT NULL AND
                "acceptanceContractVersion" = 'family-delegation-v1' AND
                "rejectedAt" IS NULL AND "revokedAt" IS NULL AND
                "revokedByUserId" IS NULL AND "expiredAt" IS NULL) OR
            ("status" = 'REJECTED' AND
                "acceptedAt" IS NULL AND "acceptanceContractVersion" IS NULL AND
                "rejectedAt" IS NOT NULL AND "revokedAt" IS NULL AND
                "revokedByUserId" IS NULL AND "expiredAt" IS NULL) OR
            ("status" = 'REVOKED' AND
                "acceptedAt" IS NULL AND "acceptanceContractVersion" IS NULL AND
                "rejectedAt" IS NULL AND "revokedAt" IS NOT NULL AND
                "revokedByUserId" IS NOT NULL AND "expiredAt" IS NULL) OR
            ("status" = 'EXPIRED' AND
                "acceptedAt" IS NULL AND "acceptanceContractVersion" IS NULL AND
                "rejectedAt" IS NULL AND "revokedAt" IS NULL AND
                "revokedByUserId" IS NULL AND "expiredAt" IS NOT NULL)
        ),
    CONSTRAINT "CaregiverInvitation_patientProfileId_fkey"
        FOREIGN KEY ("patientProfileId") REFERENCES "PatientProfile"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CaregiverInvitation_caregiverUserId_caregiverPersonId_fkey"
        FOREIGN KEY ("caregiverUserId", "caregiverPersonId") REFERENCES "User"("id", "personId")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "CaregiverInvitation_issuedByUserId_fkey"
        FOREIGN KEY ("issuedByUserId") REFERENCES "User"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CaregiverInvitation_revokedByUserId_fkey"
        FOREIGN KEY ("revokedByUserId") REFERENCES "User"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CaregiverInvitation_tokenHash_key"
    ON "CaregiverInvitation"("tokenHash");
CREATE INDEX "CaregiverInvitation_patientProfileId_createdAt_idx"
    ON "CaregiverInvitation"("patientProfileId", "createdAt");
CREATE INDEX "CaregiverInvitation_caregiverUserId_createdAt_idx"
    ON "CaregiverInvitation"("caregiverUserId", "createdAt");
CREATE INDEX "CaregiverInvitation_status_expiresAt_idx"
    ON "CaregiverInvitation"("status", "expiresAt");

-- Prisma does not represent this partial unique index. It enforces one PENDING
-- invitation per Patient/caregiver pair; issuance reconciles expired PENDING
-- rows before creating a replacement inside the same serializable transaction.
CREATE UNIQUE INDEX "CaregiverInvitation_one_pending_per_pair_idx"
    ON "CaregiverInvitation"("patientProfileId", "caregiverUserId")
    WHERE "status" = 'PENDING';

CREATE TABLE "CaregiverRelationship" (
    "id" UUID NOT NULL,
    "patientProfileId" UUID NOT NULL,
    "caregiverUserId" UUID NOT NULL,
    "sourceInvitationId" UUID NOT NULL,
    "status" "CaregiverRelationshipStatus" NOT NULL DEFAULT 'ACTIVE',
    "activatedAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "revokedByUserId" UUID,
    "withdrawnAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CaregiverRelationship_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CaregiverRelationship_active_evidence_check"
        CHECK ("status" <> 'ACTIVE' OR (
            "revokedAt" IS NULL AND "revokedByUserId" IS NULL AND "withdrawnAt" IS NULL
        )),
    CONSTRAINT "CaregiverRelationship_revoked_evidence_check"
        CHECK ("status" <> 'REVOKED' OR (
            "revokedAt" IS NOT NULL AND "revokedByUserId" IS NOT NULL AND "withdrawnAt" IS NULL
        )),
    CONSTRAINT "CaregiverRelationship_withdrawn_evidence_check"
        CHECK ("status" <> 'WITHDRAWN' OR (
            "withdrawnAt" IS NOT NULL AND "revokedAt" IS NULL AND "revokedByUserId" IS NULL
        )),
    CONSTRAINT "CaregiverRelationship_patientProfileId_fkey"
        FOREIGN KEY ("patientProfileId") REFERENCES "PatientProfile"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CaregiverRelationship_caregiverUserId_fkey"
        FOREIGN KEY ("caregiverUserId") REFERENCES "User"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CaregiverRelationship_sourceInvitationId_fkey"
        FOREIGN KEY ("sourceInvitationId") REFERENCES "CaregiverInvitation"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CaregiverRelationship_revokedByUserId_fkey"
        FOREIGN KEY ("revokedByUserId") REFERENCES "User"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CaregiverRelationship_sourceInvitationId_key"
    ON "CaregiverRelationship"("sourceInvitationId");
CREATE INDEX "CaregiverRelationship_patientProfileId_createdAt_idx"
    ON "CaregiverRelationship"("patientProfileId", "createdAt");
CREATE INDEX "CaregiverRelationship_caregiverUserId_createdAt_idx"
    ON "CaregiverRelationship"("caregiverUserId", "createdAt");

-- Prisma does not represent this partial unique index. A terminal relationship
-- remains historical evidence; only ACTIVE rows participate in pair uniqueness.
CREATE UNIQUE INDEX "CaregiverRelationship_one_active_per_pair_idx"
    ON "CaregiverRelationship"("patientProfileId", "caregiverUserId")
    WHERE "status" = 'ACTIVE';
