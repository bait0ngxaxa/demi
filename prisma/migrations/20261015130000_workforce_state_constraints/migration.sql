-- Explicit IS NOT NULL terms prevent SQL's three-valued CHECK semantics accepting partial context.
ALTER TABLE "WorkforceActivation" DROP CONSTRAINT "WorkforceActivation_context_check";
ALTER TABLE "WorkforceActivation" ADD CONSTRAINT "WorkforceActivation_context_check" CHECK (
  ("hospitalId" IS NULL AND "relationshipId" IS NULL AND "relationshipKind" IS NULL) OR
  ("hospitalId" IS NOT NULL AND "relationshipId" IS NOT NULL AND "relationshipKind" IS NOT NULL AND "relationshipKind" IN ('HOSPITAL_MEMBER', 'OSM'))
);
ALTER TABLE "WorkforceActivation" ADD CONSTRAINT "WorkforceActivation_operation_state_check" CHECK (
  ("operationState" = 'NOT_STARTED' AND "claimedAt" IS NULL AND "usedAt" IS NULL AND "reconciliationRequiredAt" IS NULL) OR
  ("operationState" IN ('CLAIMED', 'PROVIDER_STARTED', 'PROVIDER_CONFIRMED') AND "claimedAt" IS NOT NULL AND "usedAt" IS NULL AND "reconciliationRequiredAt" IS NULL) OR
  ("operationState" = 'FINALIZED' AND "usedAt" IS NOT NULL) OR
  ("operationState" = 'RECONCILIATION_REQUIRED' AND "claimedAt" IS NOT NULL AND "usedAt" IS NULL AND "reconciliationRequiredAt" IS NOT NULL)
);
