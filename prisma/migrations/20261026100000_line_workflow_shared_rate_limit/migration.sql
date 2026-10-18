CREATE TABLE "LineWorkflowRateLimitBucket" (
    "category" VARCHAR(32) NOT NULL,
    "keyHash" VARCHAR(64) NOT NULL,
    "windowStart" TIMESTAMPTZ(3) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "hitCount" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "LineWorkflowRateLimitBucket_pkey" PRIMARY KEY ("category", "keyHash", "windowStart")
);

CREATE INDEX "LineWorkflowRateLimitBucket_expiresAt_idx"
ON "LineWorkflowRateLimitBucket"("expiresAt");

ALTER TABLE "LineWorkflowRateLimitBucket" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "LineWorkflowRateLimitBucket" FROM PUBLIC;
