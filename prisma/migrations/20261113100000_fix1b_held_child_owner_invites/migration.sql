ALTER TABLE "UserTakeoverLock"
ADD COLUMN "heldOwnerMembershipIds" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];

COMMENT ON COLUMN "UserTakeoverLock"."heldOwnerMembershipIds" IS
'FIX-1b: child OWNER invitations quarantined for platform ADMIN mediated reset. These IDs are restored to INVITED only if the invitation is still valid at reset completion; an empty array means no held OWNER invitation was recorded.';
