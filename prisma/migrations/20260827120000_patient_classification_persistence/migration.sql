-- Patient classification is patient-global; history is retained independently.
CREATE TYPE "PatientClassificationType" AS ENUM ('RISK', 'DIABETES');

CREATE TYPE "PatientClassificationSource" AS ENUM ('ROSTER_IMPORT', 'MANUAL');

CREATE TABLE "PatientClassification" (
    "id" UUID NOT NULL,
    "patientProfileId" UUID NOT NULL,
    "classification" "PatientClassificationType" NOT NULL,
    "updatedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PatientClassification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PatientClassificationHistory" (
    "id" UUID NOT NULL,
    "patientProfileId" UUID NOT NULL,
    "fromClassification" "PatientClassificationType",
    "toClassification" "PatientClassificationType" NOT NULL,
    "changedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedByUserId" UUID NOT NULL,
    "source" "PatientClassificationSource" NOT NULL,

    CONSTRAINT "PatientClassificationHistory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PatientClassification_patientProfileId_key"
    ON "PatientClassification"("patientProfileId");
CREATE INDEX "PatientClassification_classification_idx"
    ON "PatientClassification"("classification");
CREATE INDEX "PatientClassification_updatedByUserId_updatedAt_idx"
    ON "PatientClassification"("updatedByUserId", "updatedAt");
CREATE INDEX "PatientClassificationHistory_patientProfileId_changedAt_idx"
    ON "PatientClassificationHistory"("patientProfileId", "changedAt");
CREATE INDEX "PatientClassificationHistory_changedByUserId_changedAt_idx"
    ON "PatientClassificationHistory"("changedByUserId", "changedAt");

ALTER TABLE "PatientClassification"
ADD CONSTRAINT "PatientClassification_patientProfileId_fkey"
FOREIGN KEY ("patientProfileId") REFERENCES "PatientProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "PatientClassification_updatedByUserId_fkey"
FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PatientClassificationHistory"
ADD CONSTRAINT "PatientClassificationHistory_patientProfileId_fkey"
FOREIGN KEY ("patientProfileId") REFERENCES "PatientProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "PatientClassificationHistory_changedByUserId_fkey"
FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
