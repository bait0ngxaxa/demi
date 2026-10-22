-- UM-1 (UM-D5): OWNER-reported suspected account takeover. The User row is set to SUSPENDED by the service in the
-- same transaction; this table records who locked it at which Hospital and the provider session revocation outcome.
CREATE TYPE "UserTakeoverProviderState" AS ENUM ('PENDING', 'CONFIRMED', 'RECONCILIATION_REQUIRED');

CREATE TABLE "UserTakeoverLock" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "hospitalId" UUID NOT NULL,
    "lockedByUserId" UUID NOT NULL,
    "lockedAt" TIMESTAMPTZ(3) NOT NULL,
    "providerState" "UserTakeoverProviderState" NOT NULL DEFAULT 'PENDING',
    "providerCheckedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "UserTakeoverLock_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "UserTakeoverLock_not_self_check" CHECK ("userId" <> "lockedByUserId"),
    CONSTRAINT "UserTakeoverLock_provider_checked_check"
        CHECK (("providerState" = 'PENDING') = ("providerCheckedAt" IS NULL))
);

CREATE UNIQUE INDEX "UserTakeoverLock_userId_key" ON "UserTakeoverLock"("userId");
CREATE INDEX "UserTakeoverLock_hospitalId_lockedAt_idx" ON "UserTakeoverLock"("hospitalId", "lockedAt");
CREATE INDEX "UserTakeoverLock_lockedByUserId_idx" ON "UserTakeoverLock"("lockedByUserId");

ALTER TABLE "UserTakeoverLock" ADD CONSTRAINT "UserTakeoverLock_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserTakeoverLock" ADD CONSTRAINT "UserTakeoverLock_lockedByUserId_fkey"
    FOREIGN KEY ("lockedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserTakeoverLock" ADD CONSTRAINT "UserTakeoverLock_hospitalId_fkey"
    FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "UserTakeoverLock" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "UserTakeoverLock" FROM PUBLIC;
