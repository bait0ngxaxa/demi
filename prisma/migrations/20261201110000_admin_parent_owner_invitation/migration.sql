-- ADR-0024 (PO-1). Additive only: existing rows keep NULL in the new column; no backfill.
-- A platform ADMIN invitation of a Parent OWNER records the inviter without a service area; a Child OWNER invitation
-- (ADR-0018) keeps both. The submission nonce makes the ADMIN invitation idempotent and exists only on invitations.
ALTER TABLE "HospitalMembership"
  ADD COLUMN "invitationNonce" UUID,
  DROP CONSTRAINT "HospitalMembership_child_owner_invitation_check",
  ADD CONSTRAINT "HospitalMembership_owner_invitation_check" CHECK (
    ("invitedByUserId" IS NULL AND "invitedViaServiceAreaId" IS NULL AND "invitationDeclinedAt" IS NULL
      AND "invitationNonce" IS NULL) OR
    ("invitedByUserId" IS NOT NULL AND "membershipType" = 'OWNER'
      AND ("invitationDeclinedAt" IS NULL OR "status" = 'ENDED'))
  );
CREATE UNIQUE INDEX "HospitalMembership_invitationNonce_key" ON "HospitalMembership" ("invitationNonce");

-- At most one open OWNER invitation per Hospital, for every invitation path (Child and Parent).
CREATE UNIQUE INDEX "HospitalMembership_open_owner_invitation_key" ON "HospitalMembership" ("hospitalId")
  WHERE "membershipType" = 'OWNER' AND "status" IN ('PROVISIONED', 'INVITED');

-- Rebuilt from 20261121100000_rec3_platform_admin_global_reset_context: every branch is kept verbatim except that the
-- owner-onboarding purposes are excluded from the generic branches and PARENT_OWNER is bound to its own purpose.
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
                    ("relationshipKind" IN ('HOSPITAL_MEMBER', 'OSM') AND "purpose" NOT IN ('CHILD_OWNER_ONBOARDING', 'PARENT_OWNER_ONBOARDING') AND "verificationMethod" IS NULL) OR
                    ("relationshipKind" = 'CHILD_OWNER' AND "purpose" = 'CHILD_OWNER_ONBOARDING' AND "verificationMethod" IS NULL) OR
                    ("relationshipKind" = 'PARENT_OWNER' AND "purpose" = 'PARENT_OWNER_ONBOARDING' AND "verificationMethod" IS NULL) OR
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
