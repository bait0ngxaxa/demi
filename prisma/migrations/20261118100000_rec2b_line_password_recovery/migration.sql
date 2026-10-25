ALTER TABLE "User"
ADD COLUMN "passwordResetNoticePendingAt" TIMESTAMPTZ(3);

CREATE UNIQUE INDEX "LineAccountBinding_id_userId_key"
ON "LineAccountBinding"("id", "userId");

CREATE TABLE "LinePasswordRecoveryCapability" (
    "id" UUID NOT NULL,
    "targetUserId" UUID NOT NULL,
    "lineAccountBindingId" UUID NOT NULL,
    "lineSubjectFingerprint" VARCHAR(64) NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "deliveredAt" TIMESTAMPTZ(3),
    "operationState" "WorkforceActivationOperationState" NOT NULL DEFAULT 'NOT_STARTED',
    "previousAuthSubject" VARCHAR(255),
    "replacementAuthSubject" VARCHAR(255),
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "claimedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "reconciliationRequiredAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LinePasswordRecoveryCapability_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LinePasswordRecoveryCapability_targetUserId_fkey"
      FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT "LinePasswordRecoveryCapability_binding_user_fkey"
      FOREIGN KEY ("lineAccountBindingId", "targetUserId")
      REFERENCES "LineAccountBinding"("id", "userId") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "LinePasswordRecoveryCapability_tokenHash_key"
ON "LinePasswordRecoveryCapability"("tokenHash");

CREATE INDEX "LinePasswordRecoveryCapability_targetUserId_createdAt_idx"
ON "LinePasswordRecoveryCapability"("targetUserId", "createdAt");

CREATE INDEX "LinePasswordRecoveryCapability_expiresAt_idx"
ON "LinePasswordRecoveryCapability"("expiresAt");

CREATE INDEX "LinePasswordRecoveryCapability_lineAccountBindingId_createdAt_idx"
ON "LinePasswordRecoveryCapability"("lineAccountBindingId", "createdAt");

ALTER TABLE "LinePasswordRecoveryCapability" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "LinePasswordRecoveryCapability" FROM PUBLIC;

-- Supabase Data API roles are absent from the plain PostgreSQL integration database.
DO $$
DECLARE
    data_api_role NAME;
BEGIN
    FOR data_api_role IN
        SELECT rolname
        FROM pg_roles
        WHERE rolname IN ('anon', 'authenticated', 'service_role')
    LOOP
        EXECUTE format(
            'REVOKE ALL PRIVILEGES ON TABLE public."LinePasswordRecoveryCapability" FROM %I',
            data_api_role
        );
    END LOOP;
END
$$;
