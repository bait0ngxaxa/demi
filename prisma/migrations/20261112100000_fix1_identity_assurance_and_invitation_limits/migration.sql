CREATE TYPE "IdentityAssurance" AS ENUM (
  'HOSPITAL_PROOFED',
  'SELF_REGISTERED',
  'CAREGIVER_INVITATION'
);

ALTER TABLE "User"
ADD COLUMN "identityAssurance" "IdentityAssurance" NOT NULL DEFAULT 'HOSPITAL_PROOFED';

-- There are no legacy User rows to classify at this migration point. Keep the conservative default for
-- ordinary provisioned Users; credential-establishment flows assign their explicit assurance going forward.
