-- ADR-0024 (PO-3): the submission nonce exists only on a platform ADMIN Parent OWNER invitation, which has no area.
-- Rebuilt from 20261201110000_admin_parent_owner_invitation with that one extra condition; no data change.
ALTER TABLE "HospitalMembership"
  DROP CONSTRAINT "HospitalMembership_owner_invitation_check",
  ADD CONSTRAINT "HospitalMembership_owner_invitation_check" CHECK (
    (("invitedByUserId" IS NULL AND "invitedViaServiceAreaId" IS NULL AND "invitationDeclinedAt" IS NULL
      AND "invitationNonce" IS NULL) OR
    ("invitedByUserId" IS NOT NULL AND "membershipType" = 'OWNER'
      AND ("invitationDeclinedAt" IS NULL OR "status" = 'ENDED')))
    AND ("invitationNonce" IS NULL OR "invitedViaServiceAreaId" IS NULL)
  );
