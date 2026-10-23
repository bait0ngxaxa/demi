-- AF-5: one-step caregiver add with a relationship label and per-resource sharing.

CREATE TYPE "CaregiverRelationshipLabel" AS ENUM ('SPOUSE', 'CHILD', 'PARENT', 'SIBLING', 'GRANDCHILD', 'RELATIVE', 'OTHER');
CREATE TYPE "CaregiverResource" AS ENUM ('PROFILE_SUMMARY', 'HEALTH_PLAN', 'MEDICATION');
CREATE TYPE "CaregiverResourceGrantStatus" AS ENUM ('PENDING', 'ACTIVE', 'REVOKED');

-- The free-text label exists exactly when the label is OTHER, trimmed to 1..50 characters.
ALTER TABLE "CaregiverInvitation"
    ADD COLUMN "requestedRelationshipLabel" "CaregiverRelationshipLabel",
    ADD COLUMN "requestedRelationshipLabelOther" VARCHAR(50),
    ADD COLUMN "requestedScopes" JSONB,
    ADD CONSTRAINT "CaregiverInvitation_requested_label_check" CHECK (
        ("requestedRelationshipLabel" IS DISTINCT FROM 'OTHER' AND "requestedRelationshipLabelOther" IS NULL)
        OR ("requestedRelationshipLabel" = 'OTHER' AND char_length(btrim("requestedRelationshipLabelOther")) BETWEEN 1 AND 50)
    ),
    ADD CONSTRAINT "CaregiverInvitation_requested_scopes_check" CHECK (
        "requestedScopes" IS NULL OR jsonb_typeof("requestedScopes") = 'object'
    );

ALTER TABLE "CaregiverRelationship"
    ADD COLUMN "relationshipLabel" "CaregiverRelationshipLabel",
    ADD COLUMN "relationshipLabelOther" VARCHAR(50),
    ADD COLUMN "relationshipLabelVersion" INTEGER NOT NULL DEFAULT 1,
    ADD CONSTRAINT "CaregiverRelationship_label_check" CHECK (
        ("relationshipLabel" IS DISTINCT FROM 'OTHER' AND "relationshipLabelOther" IS NULL)
        OR ("relationshipLabel" = 'OTHER' AND char_length(btrim("relationshipLabelOther")) BETWEEN 1 AND 50)
    ),
    ADD CONSTRAINT "CaregiverRelationship_label_version_check" CHECK ("relationshipLabelVersion" > 0);

-- Appointment grants: the caregiver may now end a grant too (withdrawing the relationship, or accepting the
-- v2 contract that supersedes a v1 grant). At most one ACTIVE grant per relationship and Hospital, whatever
-- the contract version, so a v1 -> v2 hand-over is atomic.
ALTER TABLE "CaregiverAppointmentGrant" DROP CONSTRAINT "CaregiverAppointmentGrant_lifecycle_check";
ALTER TABLE "CaregiverAppointmentGrant" ADD CONSTRAINT "CaregiverAppointmentGrant_lifecycle_check" CHECK (
  ("acceptedAt" IS NULL AND "acceptedByUserId" IS NULL OR
   "acceptedAt" IS NOT NULL AND "acceptedByUserId" IS NOT NULL AND "acceptedByUserId" = "caregiverUserId")
  AND (
    "status" = 'PENDING' AND "acceptedAt" IS NULL AND "revokedAt" IS NULL AND "revokedByUserId" IS NULL
    OR "status" = 'ACTIVE' AND "acceptedAt" IS NOT NULL AND "revokedAt" IS NULL AND "revokedByUserId" IS NULL
    OR "status" = 'REVOKED' AND "revokedAt" IS NOT NULL AND "revokedByUserId" IS NOT NULL
       AND "revokedByUserId" IN ("proposedByUserId", "caregiverUserId")
  )
);

CREATE UNIQUE INDEX "CaregiverAppointmentGrant_active_scope_key"
ON "CaregiverAppointmentGrant" ("caregiverRelationshipId", "patientHospitalRelationshipId")
WHERE "status" = 'ACTIVE';

CREATE TABLE "CaregiverResourceGrant" (
    "id" UUID NOT NULL,
    "caregiverRelationshipId" UUID NOT NULL,
    "patientProfileId" UUID NOT NULL,
    "patientPersonId" UUID NOT NULL,
    "caregiverUserId" UUID NOT NULL,
    "caregiverPersonId" UUID NOT NULL,
    "resource" "CaregiverResource" NOT NULL,
    "contractVersion" VARCHAR(64) NOT NULL,
    "status" "CaregiverResourceGrantStatus" NOT NULL DEFAULT 'PENDING',
    "proposedByUserId" UUID NOT NULL,
    "proposedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedByUserId" UUID,
    "acceptedAt" TIMESTAMPTZ(3),
    "revokedByUserId" UUID,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CaregiverResourceGrant_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CaregiverResourceGrant_lifecycle_check" CHECK (
      ("acceptedAt" IS NULL AND "acceptedByUserId" IS NULL OR
       "acceptedAt" IS NOT NULL AND "acceptedByUserId" IS NOT NULL AND "acceptedByUserId" = "caregiverUserId")
      AND (
        "status" = 'PENDING' AND "acceptedAt" IS NULL AND "revokedAt" IS NULL AND "revokedByUserId" IS NULL
        OR "status" = 'ACTIVE' AND "acceptedAt" IS NOT NULL AND "revokedAt" IS NULL AND "revokedByUserId" IS NULL
        OR "status" = 'REVOKED' AND "revokedAt" IS NOT NULL AND "revokedByUserId" IS NOT NULL
           AND "revokedByUserId" IN ("proposedByUserId", "caregiverUserId")
      )
    )
);

CREATE INDEX "CaregiverResourceGrant_patientProfileId_createdAt_idx" ON "CaregiverResourceGrant"("patientProfileId", "createdAt");
CREATE INDEX "CaregiverResourceGrant_caregiverUserId_createdAt_idx" ON "CaregiverResourceGrant"("caregiverUserId", "createdAt");
CREATE INDEX "CaregiverResourceGrant_caregiverRelationshipId_idx" ON "CaregiverResourceGrant"("caregiverRelationshipId");
CREATE INDEX "CaregiverResourceGrant_proposedByUserId_idx" ON "CaregiverResourceGrant"("proposedByUserId");
CREATE INDEX "CaregiverResourceGrant_acceptedByUserId_idx" ON "CaregiverResourceGrant"("acceptedByUserId");
CREATE INDEX "CaregiverResourceGrant_revokedByUserId_idx" ON "CaregiverResourceGrant"("revokedByUserId");

-- One actionable grant per relationship and resource; revoked history never blocks a new share.
CREATE UNIQUE INDEX "CaregiverResourceGrant_actionable_scope_key"
ON "CaregiverResourceGrant" ("caregiverRelationshipId", "resource")
WHERE "status" IN ('PENDING', 'ACTIVE');

ALTER TABLE "CaregiverResourceGrant" ADD CONSTRAINT "CaregiverResourceGrant_caregiverRelationshipId_patientProf_fkey" FOREIGN KEY ("caregiverRelationshipId", "patientProfileId", "caregiverUserId") REFERENCES "CaregiverRelationship"("id", "patientProfileId", "caregiverUserId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "CaregiverResourceGrant" ADD CONSTRAINT "CaregiverResourceGrant_patientProfileId_patientPersonId_fkey" FOREIGN KEY ("patientProfileId", "patientPersonId") REFERENCES "PatientProfile"("id", "personId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "CaregiverResourceGrant" ADD CONSTRAINT "CaregiverResourceGrant_caregiverUserId_caregiverPersonId_fkey" FOREIGN KEY ("caregiverUserId", "caregiverPersonId") REFERENCES "User"("id", "personId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "CaregiverResourceGrant" ADD CONSTRAINT "CaregiverResourceGrant_proposedByUserId_patientPersonId_fkey" FOREIGN KEY ("proposedByUserId", "patientPersonId") REFERENCES "User"("id", "personId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "CaregiverResourceGrant" ADD CONSTRAINT "CaregiverResourceGrant_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CaregiverResourceGrant" ADD CONSTRAINT "CaregiverResourceGrant_revokedByUserId_fkey" FOREIGN KEY ("revokedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Same accepted-semantics guard as the appointment grant.
CREATE FUNCTION "guard_caregiver_resource_grant_update"() RETURNS trigger AS $$
BEGIN
  IF ROW(NEW."caregiverRelationshipId", NEW."patientProfileId", NEW."patientPersonId", NEW."caregiverUserId", NEW."caregiverPersonId", NEW."resource", NEW."contractVersion", NEW."proposedByUserId", NEW."proposedAt", NEW."id", NEW."createdAt")
    IS DISTINCT FROM ROW(OLD."caregiverRelationshipId", OLD."patientProfileId", OLD."patientPersonId", OLD."caregiverUserId", OLD."caregiverPersonId", OLD."resource", OLD."contractVersion", OLD."proposedByUserId", OLD."proposedAt", OLD."id", OLD."createdAt")
    OR OLD."status" = 'REVOKED'
    OR OLD."status" = 'ACTIVE' AND (NEW."status" NOT IN ('ACTIVE', 'REVOKED') OR NEW."acceptedAt" IS DISTINCT FROM OLD."acceptedAt" OR NEW."acceptedByUserId" IS DISTINCT FROM OLD."acceptedByUserId")
  THEN RAISE EXCEPTION 'Invalid resource grant transition' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public;
CREATE TRIGGER "CaregiverResourceGrant_immutable_lifecycle"
BEFORE UPDATE ON "CaregiverResourceGrant"
FOR EACH ROW EXECUTE FUNCTION "guard_caregiver_resource_grant_update"();
