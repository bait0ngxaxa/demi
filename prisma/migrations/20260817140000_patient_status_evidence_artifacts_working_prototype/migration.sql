-- Phase 10D.0 introduces relationship-owned image evidence metadata.
CREATE TABLE "PatientEvidenceArtifact" (
    "id" UUID NOT NULL,
    "patientHospitalRelationshipId" UUID NOT NULL,
    "storageObjectKey" VARCHAR(512) NOT NULL,
    "mediaType" VARCHAR(100) NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "contentSha256" VARCHAR(64) NOT NULL,
    "caption" VARCHAR(500),
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientEvidenceArtifact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PatientEvidenceArtifact_storageObjectKey_key"
    ON "PatientEvidenceArtifact"("storageObjectKey");

CREATE INDEX "PatientEvidenceArtifact_patientHospitalRelationshipId_createdAt_idx"
    ON "PatientEvidenceArtifact"("patientHospitalRelationshipId", "createdAt");

ALTER TABLE "PatientEvidenceArtifact"
    ADD CONSTRAINT "PatientEvidenceArtifact_patientHospitalRelationshipId_fkey"
    FOREIGN KEY ("patientHospitalRelationshipId") REFERENCES "PatientHospitalRelationship"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PatientEvidenceArtifact"
    ADD CONSTRAINT "PatientEvidenceArtifact_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
