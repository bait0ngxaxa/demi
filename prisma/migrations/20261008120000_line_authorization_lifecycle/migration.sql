-- CreateEnum
CREATE TYPE "LineGrantApplicability" AS ENUM ('OBSERVED', 'UNKNOWN', 'PROVEN_ABSENT');

-- CreateEnum
CREATE TYPE "LineTerminationOutcome" AS ENUM ('OBSERVED', 'PENDING', 'REMOTE_UNCONFIRMED', 'REMOTE_CONFIRMED');

-- CreateEnum
CREATE TYPE "LineTerminationReason" AS ENUM ('ATTEMPT_RESERVED', 'TOKEN_UNAVAILABLE', 'KNOWN_NOT_DISPATCHED', 'POSSIBLY_DISPATCHED', 'PROVIDER_REJECTED', 'INVALID_RESPONSE', 'PROVIDER_204');

-- AlterEnum
ALTER TYPE "LineAccountAction" ADD VALUE 'RECOVERY';

-- AlterTable
ALTER TABLE "LineAccountActionIntent" ADD COLUMN     "reviewedSetDigest" VARCHAR(64),
ADD COLUMN     "targetBindingId" UUID,
ADD COLUMN     "targetBindingVersion" INTEGER;

-- CreateTable
CREATE TABLE "LineAuthorizationLifecycle" (
    "id" UUID NOT NULL,
    "bindingId" UUID NOT NULL,
    "bindingVersion" INTEGER NOT NULL,
    "tupleKey" VARCHAR(64) NOT NULL,
    "tupleDefinition" VARCHAR(512) NOT NULL,
    "applicability" "LineGrantApplicability" NOT NULL,
    "evidenceReference" VARCHAR(128) NOT NULL,
    "observedAt" TIMESTAMPTZ(3),
    "remoteOutcome" "LineTerminationOutcome" NOT NULL DEFAULT 'OBSERVED',
    "requestedAt" TIMESTAMPTZ(3),
    "confirmedAt" TIMESTAMPTZ(3),
    "reason" "LineTerminationReason",
    "attemptId" UUID,
    "reservedAt" TIMESTAMPTZ(3),
    "settledAt" TIMESTAMPTZ(3),
    "recoveryReleasedAt" TIMESTAMPTZ(3),
    "recoveryDecisionAuditId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LineAuthorizationLifecycle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LineAuthorizationLifecycle_attemptId_key" ON "LineAuthorizationLifecycle"("attemptId");

-- CreateIndex
CREATE INDEX "LineAuthorizationLifecycle_recoveryDecisionAuditId_idx" ON "LineAuthorizationLifecycle"("recoveryDecisionAuditId");

-- CreateIndex
CREATE UNIQUE INDEX "LineAuthorizationLifecycle_binding_generation_tuple_key" ON "LineAuthorizationLifecycle"("bindingId", "bindingVersion", "tupleKey");

-- CreateIndex
CREATE INDEX "LineAccountActionIntent_targetBindingId_idx" ON "LineAccountActionIntent"("targetBindingId");

-- AddForeignKey
ALTER TABLE "LineAccountActionIntent" ADD CONSTRAINT "LineAccountActionIntent_targetBindingId_fkey" FOREIGN KEY ("targetBindingId") REFERENCES "LineAccountBinding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineAuthorizationLifecycle" ADD CONSTRAINT "LineAuthorizationLifecycle_bindingId_fkey" FOREIGN KEY ("bindingId") REFERENCES "LineAccountBinding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineAuthorizationLifecycle" ADD CONSTRAINT "LineAuthorizationLifecycle_recoveryDecisionAuditId_fkey" FOREIGN KEY ("recoveryDecisionAuditId") REFERENCES "AuditEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prisma cannot express CHECK constraints or immutable evidence transitions.
-- Cast the newly added action to text: PostgreSQL forbids using a new enum value
-- in the same transaction that adds it.
ALTER TABLE "LineAccountActionIntent" ADD CONSTRAINT "LineAccountActionIntent_recovery_target_check" CHECK (
  ("action"::text = 'RECOVERY' AND "targetBindingId" IS NOT NULL AND "targetBindingVersion" IS NOT NULL AND "targetBindingVersion" > 0
    AND "reviewedSetDigest" IS NOT NULL AND "reviewedSetDigest" ~ '^[0-9a-f]{64}$')
  OR ("action"::text <> 'RECOVERY' AND "targetBindingId" IS NULL AND "targetBindingVersion" IS NULL AND "reviewedSetDigest" IS NULL)
);

ALTER TABLE "LineAuthorizationLifecycle"
  ADD CONSTRAINT "LineAuthorizationLifecycle_tuple_check" CHECK (
    "tupleKey" = encode(sha256(convert_to("tupleDefinition", 'UTF8')), 'hex')
    AND jsonb_typeof("tupleDefinition"::jsonb) = 'array'
    AND jsonb_array_length("tupleDefinition"::jsonb) = 5
    AND jsonb_typeof("tupleDefinition"::jsonb -> 0) = 'string'
    AND jsonb_typeof("tupleDefinition"::jsonb -> 1) = 'string'
    AND jsonb_typeof("tupleDefinition"::jsonb -> 2) = 'string'
    AND jsonb_typeof("tupleDefinition"::jsonb -> 3) = 'string'
    AND jsonb_typeof("tupleDefinition"::jsonb -> 4) = 'string'
    AND "tupleDefinition" = format('["%s","%s","%s","%s","%s"]',
      "tupleDefinition"::jsonb ->> 0, "tupleDefinition"::jsonb ->> 1, "tupleDefinition"::jsonb ->> 2,
      "tupleDefinition"::jsonb ->> 3, "tupleDefinition"::jsonb ->> 4)
    AND ("tupleDefinition"::jsonb ->> 0) ~ '^[A-Za-z0-9._:/-]{1,128}$'
    AND ("tupleDefinition"::jsonb ->> 2) ~ '^[0-9]{4,20}$'
    AND ("tupleDefinition"::jsonb ->> 4) ~ '^[A-Za-z0-9._:/-]{1,128}$'
    AND ((("tupleDefinition"::jsonb ->> 1) = 'ACCOUNT' AND ("tupleDefinition"::jsonb ->> 3) = 'ACCOUNT')
      OR (("tupleDefinition"::jsonb ->> 1) = 'MINI' AND ("tupleDefinition"::jsonb ->> 3) IN ('DEVELOPING', 'REVIEW', 'PUBLISHED')))
  ),
  ADD CONSTRAINT "LineAuthorizationLifecycle_identity_check" CHECK (
    "bindingVersion" > 0 AND "tupleKey" ~ '^[0-9a-f]{64}$'
    AND "evidenceReference" ~ '^[A-Za-z0-9._:/-]{1,128}$'
    AND ("applicability" <> 'OBSERVED' OR "observedAt" IS NOT NULL)
  ),
  ADD CONSTRAINT "LineAuthorizationLifecycle_request_check" CHECK (
    ("remoteOutcome" = 'OBSERVED' AND "requestedAt" IS NULL AND "reason" IS NULL)
    OR ("remoteOutcome" <> 'OBSERVED' AND "requestedAt" IS NOT NULL)
  ),
  ADD CONSTRAINT "LineAuthorizationLifecycle_attempt_check" CHECK (
    ("attemptId" IS NULL AND "reservedAt" IS NULL AND "settledAt" IS NULL AND "confirmedAt" IS NULL)
    OR ("attemptId" IS NOT NULL AND "reservedAt" IS NOT NULL AND "requestedAt" IS NOT NULL
      AND "reservedAt" >= "requestedAt" AND "applicability" <> 'PROVEN_ABSENT'
      AND ("settledAt" IS NULL OR "settledAt" >= "reservedAt"))
  ),
  ADD CONSTRAINT "LineAuthorizationLifecycle_confirmation_check" CHECK (
    ("remoteOutcome" = 'REMOTE_CONFIRMED' AND "confirmedAt" IS NOT NULL AND "settledAt" IS NOT NULL
      AND "confirmedAt" = "settledAt" AND "reason" IS NOT NULL AND "reason" = 'PROVIDER_204' AND "attemptId" IS NOT NULL)
    OR ("remoteOutcome" <> 'REMOTE_CONFIRMED' AND "confirmedAt" IS NULL
      AND ("reason" IS NULL OR "reason" <> 'PROVIDER_204'))
  ),
  ADD CONSTRAINT "LineAuthorizationLifecycle_result_check" CHECK (
    ("reason" IS NULL OR "reason" = 'TOKEN_UNAVAILABLE' OR "attemptId" IS NOT NULL)
    AND ("settledAt" IS NULL OR "reason" IN ('PROVIDER_204', 'PROVIDER_REJECTED', 'KNOWN_NOT_DISPATCHED'))
  ),
  ADD CONSTRAINT "LineAuthorizationLifecycle_release_check" CHECK (
    ("recoveryReleasedAt" IS NULL AND "recoveryDecisionAuditId" IS NULL)
    OR ("recoveryReleasedAt" IS NOT NULL AND "recoveryDecisionAuditId" IS NOT NULL AND "requestedAt" IS NOT NULL
      AND "recoveryReleasedAt" >= "requestedAt")
  );

CREATE FUNCTION "line_lifecycle_evidence_guard"() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE current_version integer; revoked_at timestamptz;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT "lifecycleVersion", "unlinkedAt" INTO current_version, revoked_at
      FROM public."LineAccountBinding" WHERE "id" = NEW."bindingId";
    IF NEW."bindingVersion" <> current_version
      OR (NEW."requestedAt" IS NULL AND revoked_at IS NOT NULL)
      OR (NEW."requestedAt" IS NOT NULL AND revoked_at IS NULL) THEN
      RAISE EXCEPTION 'Lifecycle generation is not current' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF OLD."attemptId" IS NULL AND NEW."attemptId" IS NOT NULL THEN
      SELECT "lifecycleVersion", "unlinkedAt" INTO current_version, revoked_at
        FROM public."LineAccountBinding" WHERE "id" = NEW."bindingId";
      IF OLD."recoveryReleasedAt" IS NOT NULL OR NEW."bindingVersion" <> current_version OR revoked_at IS NULL THEN
        RAISE EXCEPTION 'Historical or released termination cannot be dispatched' USING ERRCODE = '23514';
      END IF;
    END IF;
    IF (NEW."bindingId", NEW."bindingVersion", NEW."tupleKey", NEW."tupleDefinition", NEW."requestedAt")
        IS DISTINCT FROM (OLD."bindingId", OLD."bindingVersion", OLD."tupleKey", OLD."tupleDefinition", OLD."requestedAt")
      OR (OLD."attemptId" IS NOT NULL AND (NEW."attemptId", NEW."reservedAt") IS DISTINCT FROM (OLD."attemptId", OLD."reservedAt"))
      OR (OLD."settledAt" IS NOT NULL AND (NEW."settledAt", NEW."reason", NEW."remoteOutcome", NEW."confirmedAt")
        IS DISTINCT FROM (OLD."settledAt", OLD."reason", OLD."remoteOutcome", OLD."confirmedAt"))
      OR (OLD."recoveryReleasedAt" IS NOT NULL AND (NEW."recoveryReleasedAt", NEW."recoveryDecisionAuditId")
        IS DISTINCT FROM (OLD."recoveryReleasedAt", OLD."recoveryDecisionAuditId"))
      OR (OLD."requestedAt" IS NOT NULL AND (NEW."applicability", NEW."evidenceReference", NEW."observedAt")
        IS DISTINCT FROM (OLD."applicability", OLD."evidenceReference", OLD."observedAt")) THEN
      RAISE EXCEPTION 'Lifecycle evidence is immutable' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "LineAuthorizationLifecycle_evidence_guard" BEFORE INSERT OR UPDATE
  ON "LineAuthorizationLifecycle" FOR EACH ROW EXECUTE FUNCTION "line_lifecycle_evidence_guard"();

-- Server-owned Prisma writes only; no Data API policies/grants.
ALTER TABLE "LineAuthorizationLifecycle" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON FUNCTION "line_lifecycle_evidence_guard"() FROM PUBLIC;
