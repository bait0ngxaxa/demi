-- Issuer-visible bearer credentials do not establish independent global account ownership.
-- Keep hashes and claim history; revocation does not undo ambiguous provider effects.
UPDATE "AccountRecovery"
SET "revokedAt" = COALESCE("revokedAt", CURRENT_TIMESTAMP),
    "reconciliationRequiredAt" = CASE WHEN "claimedAt" IS NOT NULL
      THEN COALESCE("reconciliationRequiredAt", CURRENT_TIMESTAMP)
      ELSE "reconciliationRequiredAt" END,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "completedAt" IS NULL;
