-- Phase O1 (ADR-0018). Additive only: existing rows keep NULL in every new column; no backfill.

-- Provenance of a Child registered by a Parent OWNER (O-D2). registeredByUserId is that OWNER.
ALTER TABLE "Hospital"
  ADD COLUMN "registeredForParentHospitalId" UUID REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "Hospital_registered_for_parent_check" CHECK (
    "registeredForParentHospitalId" IS NULL OR
    ("registeredByUserId" IS NOT NULL AND "registeredForParentHospitalId" <> "id")
  );
CREATE INDEX "Hospital_registeredForParentHospitalId_idx" ON "Hospital" ("registeredForParentHospitalId");

-- Child OWNER invitation binding (O-D4/O-D6): the inviting Parent OWNER and the active area at issuance.
-- Completion and acceptance re-check both; a decline is recorded on the ENDED membership.
ALTER TABLE "HospitalMembership"
  ADD COLUMN "invitedByUserId" UUID REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD COLUMN "invitedViaServiceAreaId" UUID REFERENCES "HospitalServiceArea"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD COLUMN "invitationDeclinedAt" TIMESTAMPTZ(3),
  ADD CONSTRAINT "HospitalMembership_child_owner_invitation_check" CHECK (
    ("invitedByUserId" IS NULL AND "invitedViaServiceAreaId" IS NULL AND "invitationDeclinedAt" IS NULL) OR
    ("invitedByUserId" IS NOT NULL AND "invitedViaServiceAreaId" IS NOT NULL AND "membershipType" = 'OWNER'
      AND ("invitationDeclinedAt" IS NULL OR "status" = 'ENDED'))
  );
CREATE INDEX "HospitalMembership_invitedViaServiceAreaId_idx" ON "HospitalMembership" ("invitedViaServiceAreaId");

-- The Child OWNER activation context names its OWNER membership (purpose CHILD_OWNER_ONBOARDING only).
ALTER TABLE "WorkforceActivation" DROP CONSTRAINT "WorkforceActivation_context_check";
ALTER TABLE "WorkforceActivation" ADD CONSTRAINT "WorkforceActivation_context_check" CHECK (
  ("hospitalId" IS NULL AND "relationshipId" IS NULL AND "relationshipKind" IS NULL
    AND "purpose" <> 'CHILD_OWNER_ONBOARDING') OR
  ("hospitalId" IS NOT NULL AND "relationshipId" IS NOT NULL AND "relationshipKind" IS NOT NULL AND (
    ("relationshipKind" IN ('HOSPITAL_MEMBER', 'OSM') AND "purpose" <> 'CHILD_OWNER_ONBOARDING') OR
    ("relationshipKind" = 'CHILD_OWNER' AND "purpose" = 'CHILD_OWNER_ONBOARDING')
  ))
);
