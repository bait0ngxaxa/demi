-- Legacy RESET credentials have no independent account-owner proof or durable provider outcome.
-- Claimed RESETs retain their claim and must be reconciled manually; never make them retryable.
UPDATE "WorkforceActivation" SET "revokedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
WHERE "purpose" = 'RESET' AND "usedAt" IS NULL AND "revokedAt" IS NULL;

CREATE TABLE "WorkforceBulkSubmission" (
  "actorUserId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "submissionId" VARCHAR(64) NOT NULL,
  "hospitalId" UUID NOT NULL REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "kind" VARCHAR(32) NOT NULL CHECK ("kind" IN ('HOSPITAL_MEMBER', 'OSM')),
  "requestFingerprint" VARCHAR(64) NOT NULL,
  "rowCount" INTEGER NOT NULL CHECK ("rowCount" BETWEEN 1 AND 50),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  PRIMARY KEY ("actorUserId", "submissionId"),
  CHECK ("expiresAt" > "createdAt")
);
CREATE INDEX "WorkforceBulkSubmission_expiresAt_idx" ON "WorkforceBulkSubmission"("expiresAt");

CREATE TABLE "WorkforceBulkRowReceipt" (
  "actorUserId" UUID NOT NULL,
  "submissionId" VARCHAR(64) NOT NULL,
  "rowNumber" INTEGER NOT NULL CHECK ("rowNumber" BETWEEN 1 AND 50),
  "attempts" INTEGER NOT NULL DEFAULT 1 CHECK ("attempts" BETWEEN 1 AND 3),
  "result" JSONB NOT NULL,
  PRIMARY KEY ("actorUserId", "submissionId", "rowNumber"),
  FOREIGN KEY ("actorUserId", "submissionId") REFERENCES "WorkforceBulkSubmission"("actorUserId", "submissionId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "HospitalMembership_hospitalId_createdAt_id_idx" ON "HospitalMembership"("hospitalId", "createdAt", "id");
CREATE INDEX "OsmHospitalRelationship_hospitalId_createdAt_id_idx" ON "OsmHospitalRelationship"("hospitalId", "createdAt", "id");
