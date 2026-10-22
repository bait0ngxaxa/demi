-- Preserve the existing one-usable-initial-credential rule while allowing one
-- independent public self-registration capability to coexist with an invite.
DROP INDEX "WorkforceActivation_one_usable_per_user_key";

CREATE UNIQUE INDEX "WorkforceActivation_one_usable_per_user_key"
    ON "WorkforceActivation"("userId")
    WHERE "usedAt" IS NULL
      AND "revokedAt" IS NULL
      AND "purpose" <> 'SELF_REGISTRATION';

CREATE UNIQUE INDEX "WorkforceActivation_one_self_registration_per_user_key"
    ON "WorkforceActivation"("userId")
    WHERE "usedAt" IS NULL
      AND "revokedAt" IS NULL
      AND "purpose" = 'SELF_REGISTRATION';
