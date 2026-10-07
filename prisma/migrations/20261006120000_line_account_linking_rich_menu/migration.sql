CREATE TYPE "LineWorkspaceRole" AS ENUM ('PATIENT', 'OSM', 'HOSPITAL');
CREATE TYPE "LineReachability" AS ENUM ('UNKNOWN', 'FRIEND', 'NOT_FRIEND');
CREATE TYPE "LineMenuSyncState" AS ENUM ('UNKNOWN', 'APPLIED', 'MISMATCH', 'UNAVAILABLE');
CREATE TYPE "LineProviderCleanupState" AS ENUM ('PENDING', 'CONFIRMED_CLEAN', 'MISMATCH', 'UNAVAILABLE', 'UNKNOWN');
CREATE TYPE "LineAccountAction" AS ENUM ('LINK', 'UNLINK');
CREATE TYPE "LineAccountActionOutcome" AS ENUM ('SUCCEEDED', 'CONFLICT', 'INELIGIBLE', 'UNAUTHORIZED');
CREATE TYPE "LineWebhookEventType" AS ENUM ('FOLLOW', 'UNFOLLOW', 'RICHMENUSWITCH');
CREATE TYPE "LineWebhookEventOutcome" AS ENUM ('APPLIED', 'STALE', 'IGNORED');

CREATE TABLE "LineAccountBinding" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "lineUserId" VARCHAR(64),
    "lineSubjectFingerprint" VARCHAR(64) NOT NULL,
    "lineSubjectFingerprintKeyId" VARCHAR(64) NOT NULL,
    "linkedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLinkedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unlinkedAt" TIMESTAMPTZ(3),
    "lifecycleVersion" INTEGER NOT NULL DEFAULT 1,
    "presentationRole" "LineWorkspaceRole",
    "presentationRoleSelectedAt" TIMESTAMPTZ(3),
    "reachability" "LineReachability" NOT NULL DEFAULT 'UNKNOWN',
    "reachabilityObservedAt" TIMESTAMPTZ(3),
    "menuExpectedKey" VARCHAR(100),
    "menuSyncState" "LineMenuSyncState" NOT NULL DEFAULT 'UNKNOWN',
    "menuSyncedAt" TIMESTAMPTZ(3),
    "providerCleanupState" "LineProviderCleanupState",
    "providerCleanupAttemptCount" INTEGER NOT NULL DEFAULT 0,
    "providerCleanupLastAttemptAt" TIMESTAMPTZ(3),
    "reconcileLeaseToken" UUID,
    "reconcileLeaseExpiresAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LineAccountBinding_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LineAccountBinding_lifecycleVersion_check" CHECK ("lifecycleVersion" > 0),
    CONSTRAINT "LineAccountBinding_cleanupAttempts_check" CHECK ("providerCleanupAttemptCount" >= 0),
    CONSTRAINT "LineAccountBinding_lease_pair_check" CHECK (
      ("reconcileLeaseToken" IS NULL AND "reconcileLeaseExpiresAt" IS NULL)
      OR ("reconcileLeaseToken" IS NOT NULL AND "reconcileLeaseExpiresAt" IS NOT NULL)
    ),
    CONSTRAINT "LineAccountBinding_raw_locator_lifecycle_check" CHECK (
      ("unlinkedAt" IS NULL AND "lineUserId" IS NOT NULL AND "providerCleanupState" IS NULL)
      OR (
        "unlinkedAt" IS NOT NULL
        AND "providerCleanupState" = 'CONFIRMED_CLEAN'
        AND "lineUserId" IS NULL
      )
      OR (
        "unlinkedAt" IS NOT NULL
        AND "providerCleanupState" IN ('PENDING', 'MISMATCH', 'UNAVAILABLE', 'UNKNOWN')
        AND "lineUserId" IS NOT NULL
      )
    ),
    CONSTRAINT "LineAccountBinding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "LineAccountActionIntent" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "action" "LineAccountAction" NOT NULL,
    "challengeHash" VARCHAR(64) NOT NULL,
    "sessionHash" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "outcome" "LineAccountActionOutcome",

    CONSTRAINT "LineAccountActionIntent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LineAccountActionIntent_challengeHash_check" CHECK ("challengeHash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "LineAccountActionIntent_sessionHash_check" CHECK ("sessionHash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "LineAccountActionIntent_consumed_outcome_check" CHECK (
      ("consumedAt" IS NULL AND "outcome" IS NULL)
      OR ("consumedAt" IS NOT NULL AND "outcome" IS NOT NULL)
    ),
    CONSTRAINT "LineAccountActionIntent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "LineWebhookEventReceipt" (
    "webhookEventId" VARCHAR(26) NOT NULL,
    "eventType" "LineWebhookEventType" NOT NULL,
    "eventOccurredAt" TIMESTAMPTZ(3) NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outcome" "LineWebhookEventOutcome" NOT NULL,

    CONSTRAINT "LineWebhookEventReceipt_pkey" PRIMARY KEY ("webhookEventId"),
    CONSTRAINT "LineWebhookEventReceipt_eventId_check" CHECK ("webhookEventId" ~ '^[0-9A-HJKMNP-TV-Z]{26}$')
);

CREATE INDEX "LineAccountBinding_userId_idx" ON "LineAccountBinding"("userId");
CREATE INDEX "LineAccountBinding_lineSubjectFingerprint_idx" ON "LineAccountBinding"("lineSubjectFingerprint");
CREATE INDEX "LineAccountBinding_lineSubjectFingerprintKeyId_idx" ON "LineAccountBinding"("lineSubjectFingerprintKeyId");
CREATE INDEX "LineAccountBinding_providerCleanupState_unlinkedAt_idx" ON "LineAccountBinding"("providerCleanupState", "unlinkedAt");
CREATE UNIQUE INDEX "LineAccountBinding_reconcileLeaseToken_key" ON "LineAccountBinding"("reconcileLeaseToken");
CREATE UNIQUE INDEX "LineAccountBinding_active_subject_fingerprint_key" ON "LineAccountBinding"("lineSubjectFingerprint") WHERE "unlinkedAt" IS NULL;
CREATE UNIQUE INDEX "LineAccountBinding_active_user_key" ON "LineAccountBinding"("userId") WHERE "unlinkedAt" IS NULL;

CREATE INDEX "LineAccountActionIntent_userId_createdAt_idx" ON "LineAccountActionIntent"("userId", "createdAt");
CREATE INDEX "LineAccountActionIntent_expiresAt_idx" ON "LineAccountActionIntent"("expiresAt");
CREATE INDEX "LineWebhookEventReceipt_acceptedAt_idx" ON "LineWebhookEventReceipt"("acceptedAt");
