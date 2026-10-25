ALTER TYPE "CredentialRecoveryVerificationMethod" ADD VALUE IF NOT EXISTS 'BREAK_GLASS_CLI';

CREATE TABLE "AuthenticationAttemptThrottleBucket" (
    "keyHash" VARCHAR(64) NOT NULL,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "windowStartedAt" TIMESTAMPTZ(3) NOT NULL,
    "blockedUntil" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AuthenticationAttemptThrottleBucket_pkey" PRIMARY KEY ("keyHash"),
    CONSTRAINT "AuthenticationAttemptThrottleBucket_failureCount_check" CHECK ("failureCount" >= 0)
);

CREATE INDEX "AuthenticationAttemptThrottleBucket_expiresAt_idx"
ON "AuthenticationAttemptThrottleBucket"("expiresAt");

ALTER TABLE "AuthenticationAttemptThrottleBucket" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "AuthenticationAttemptThrottleBucket" FROM PUBLIC;
