-- Patient activation is a separate one-time credential from workforce activation.
CREATE TABLE "PatientActivation" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "hospitalId" UUID NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientActivation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PatientActivation_tokenHash_key"
    ON "PatientActivation"("tokenHash");

CREATE INDEX "PatientActivation_userId_createdAt_idx"
    ON "PatientActivation"("userId", "createdAt");

CREATE INDEX "PatientActivation_hospitalId_idx"
    ON "PatientActivation"("hospitalId");

CREATE INDEX "PatientActivation_expiresAt_idx"
    ON "PatientActivation"("expiresAt");

-- A Patient User can have only one non-revoked, non-consumed activation at a time.
CREATE UNIQUE INDEX "PatientActivation_one_usable_per_user_key"
    ON "PatientActivation"("userId")
    WHERE "usedAt" IS NULL AND "revokedAt" IS NULL;

ALTER TABLE "PatientActivation"
ADD CONSTRAINT "PatientActivation_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "PatientActivation_hospitalId_fkey"
FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "PatientActivation_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
