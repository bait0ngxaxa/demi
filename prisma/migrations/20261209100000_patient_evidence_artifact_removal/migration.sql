-- N4 (ADR-0034): soft removal of a Patient Evidence Artifact.
-- The row is never hard-deleted: it keeps attribution (uploader, remover, reason) while every read path hides it.
-- Forward-only; existing rows stay visible (all three columns NULL). The system has no production data.

ALTER TABLE "PatientEvidenceArtifact" ADD COLUMN "removedAt" TIMESTAMPTZ(3),
ADD COLUMN "removedByUserId" UUID,
ADD COLUMN "removalReason" VARCHAR(500);

-- Either not removed (all three NULL), or removed with a time and a remover. The reason is required by the service.
-- Wrapped in COALESCE((...), FALSE) as in 20261208100000_workforce_activation_context_check_null_safe, so an
-- expression that evaluates to NULL fails instead of passing.
ALTER TABLE "PatientEvidenceArtifact" ADD CONSTRAINT "PatientEvidenceArtifact_removal_check" CHECK (
    COALESCE((
        ("removedAt" IS NULL AND "removedByUserId" IS NULL AND "removalReason" IS NULL) OR
        ("removedAt" IS NOT NULL AND "removedByUserId" IS NOT NULL)
    ), FALSE)
);

CREATE INDEX "PatientEvidenceArtifact_removedByUserId_idx" ON "PatientEvidenceArtifact"("removedByUserId");

ALTER TABLE "PatientEvidenceArtifact" ADD CONSTRAINT "PatientEvidenceArtifact_removedByUserId_fkey" FOREIGN KEY ("removedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
