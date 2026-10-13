ALTER TABLE "WorkforceActivation"
  ADD COLUMN "hospitalId" UUID REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD COLUMN "relationshipId" UUID,
  ADD COLUMN "relationshipKind" VARCHAR(32),
  ADD COLUMN "reconciliationRequiredAt" TIMESTAMP(3),
  ADD CONSTRAINT "WorkforceActivation_context_check" CHECK (
    ("hospitalId" IS NULL AND "relationshipId" IS NULL AND "relationshipKind" IS NULL) OR
    ("hospitalId" IS NOT NULL AND "relationshipId" IS NOT NULL AND "relationshipKind" IN ('HOSPITAL_MEMBER', 'OSM'))
  );

-- Never invent trusted context for old tokens or clear a claim whose provider effects are unknown.
UPDATE "WorkforceActivation"
SET "revokedAt" = COALESCE("revokedAt", CURRENT_TIMESTAMP),
    "reconciliationRequiredAt" = CASE WHEN "claimedAt" IS NOT NULL THEN CURRENT_TIMESTAMP ELSE NULL END,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "usedAt" IS NULL;
