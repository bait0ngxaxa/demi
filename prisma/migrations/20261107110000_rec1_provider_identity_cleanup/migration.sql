-- REC-1 hardening: retryable deletion of provider identities that no User maps to any more.
CREATE TYPE "ProviderIdentityCleanupReason" AS ENUM ('PREVIOUS_IDENTITY', 'ORPHAN_REPLACEMENT');

CREATE TABLE "ProviderIdentityCleanup" (
    "id" UUID NOT NULL,
    "authSubject" VARCHAR(255) NOT NULL,
    "userId" UUID NOT NULL,
    "reason" "ProviderIdentityCleanupReason" NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProviderIdentityCleanup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProviderIdentityCleanup_authSubject_key" ON "ProviderIdentityCleanup"("authSubject");
CREATE INDEX "ProviderIdentityCleanup_completedAt_lastAttemptAt_idx" ON "ProviderIdentityCleanup"("completedAt", "lastAttemptAt");
