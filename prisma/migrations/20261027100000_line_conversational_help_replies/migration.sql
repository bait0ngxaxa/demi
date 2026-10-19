ALTER TYPE "LineWebhookEventType" ADD VALUE 'HELP';

CREATE TABLE "LineConversationReplyThrottle" (
    "keyHash" VARCHAR(64) NOT NULL,
    "lastRepliedAt" TIMESTAMPTZ(3) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LineConversationReplyThrottle_pkey" PRIMARY KEY ("keyHash")
);

CREATE INDEX "LineConversationReplyThrottle_expiresAt_idx"
ON "LineConversationReplyThrottle"("expiresAt");

ALTER TABLE "LineConversationReplyThrottle" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "LineConversationReplyThrottle" FROM PUBLIC;
