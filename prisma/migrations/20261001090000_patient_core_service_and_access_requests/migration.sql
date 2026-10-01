CREATE TYPE "PatientServiceCode" AS ENUM ('SCREENING', 'FOLLOW_UP', 'EMPOWERMENT');
CREATE TYPE "PatientServiceRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'STARTED', 'WITHDRAWN');
CREATE TYPE "PatientAccessRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'ACTIVATION_ISSUED', 'COMPLETED');
CREATE TYPE "PatientAccessRequestResolution" AS ENUM ('ACTIVATION_COMPLETED', 'ALREADY_ACTIVE');

ALTER TABLE "PatientActivation"
    ADD COLUMN "patientAccessRequestId" UUID;

CREATE TABLE "HospitalServiceOffering" (
    "id" UUID NOT NULL,
    "hospitalId" UUID NOT NULL,
    "code" "PatientServiceCode" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" UUID NOT NULL,
    "updatedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HospitalServiceOffering_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PatientServiceRequest" (
    "id" UUID NOT NULL,
    "patientHospitalRelationshipId" UUID NOT NULL,
    "hospitalId" UUID NOT NULL,
    "offeringId" UUID NOT NULL,
    "requestedByUserId" UUID NOT NULL,
    "preferredOsmUserId" UUID,
    "status" "PatientServiceRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedByUserId" UUID,
    "reviewedAt" TIMESTAMP(3),
    "startedByUserId" UUID,
    "startedAt" TIMESTAMP(3),
    "withdrawnByUserId" UUID,
    "withdrawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PatientServiceRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PatientAccessRequest" (
    "id" UUID NOT NULL,
    "hospitalId" UUID NOT NULL,
    "identityKeyHash" VARCHAR(64) NOT NULL,
    "status" "PatientAccessRequestStatus" NOT NULL DEFAULT 'PENDING',
    "resolution" "PatientAccessRequestResolution",
    "reviewedByUserId" UUID,
    "reviewedAt" TIMESTAMP(3),
    "resolvedPersonId" UUID,
    "resolvedUserId" UUID,
    "resolvedRelationshipId" UUID,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PatientAccessRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HospitalServiceOffering_hospitalId_enabled_idx"
    ON "HospitalServiceOffering"("hospitalId", "enabled");
CREATE UNIQUE INDEX "HospitalServiceOffering_hospitalId_code_key"
    ON "HospitalServiceOffering"("hospitalId", "code");
CREATE UNIQUE INDEX "HospitalServiceOffering_id_hospitalId_key"
    ON "HospitalServiceOffering"("id", "hospitalId");

CREATE INDEX "PatientServiceRequest_patientHospitalRelationshipId_created_idx"
    ON "PatientServiceRequest"("patientHospitalRelationshipId", "createdAt");
CREATE INDEX "PatientServiceRequest_hospitalId_status_createdAt_idx"
    ON "PatientServiceRequest"("hospitalId", "status", "createdAt");
CREATE INDEX "PatientServiceRequest_offeringId_idx"
    ON "PatientServiceRequest"("offeringId");
CREATE INDEX "PatientServiceRequest_requestedByUserId_createdAt_idx"
    ON "PatientServiceRequest"("requestedByUserId", "createdAt");
-- Prisma cannot express the unresolved-request invariant as a partial unique index.
CREATE UNIQUE INDEX "PatientServiceRequest_one_unresolved_key"
    ON "PatientServiceRequest"("patientHospitalRelationshipId", "offeringId")
    WHERE "status" IN ('PENDING', 'APPROVED');

CREATE INDEX "PatientAccessRequest_hospitalId_status_createdAt_idx"
    ON "PatientAccessRequest"("hospitalId", "status", "createdAt");
CREATE INDEX "PatientAccessRequest_identityKeyHash_idx"
    ON "PatientAccessRequest"("identityKeyHash");
-- Keep one open request per canonical identity and Hospital through activation completion.
CREATE UNIQUE INDEX "PatientAccessRequest_one_unresolved_key"
    ON "PatientAccessRequest"("identityKeyHash", "hospitalId")
    WHERE "status" IN ('PENDING', 'APPROVED', 'ACTIVATION_ISSUED');

CREATE UNIQUE INDEX "PatientHospitalRelationship_id_hospitalId_key"
    ON "PatientHospitalRelationship"("id", "hospitalId");
CREATE UNIQUE INDEX "PatientActivation_patientAccessRequestId_key"
    ON "PatientActivation"("patientAccessRequestId");

ALTER TABLE "HospitalServiceOffering"
    ADD CONSTRAINT "HospitalServiceOffering_hospitalId_fkey"
        FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "HospitalServiceOffering_createdByUserId_fkey"
        FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "HospitalServiceOffering_updatedByUserId_fkey"
        FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PatientServiceRequest"
    ADD CONSTRAINT "PatientServiceRequest_patientHospitalRelationshipId_hospitalId_fkey"
        FOREIGN KEY ("patientHospitalRelationshipId", "hospitalId")
        REFERENCES "PatientHospitalRelationship"("id", "hospitalId") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "PatientServiceRequest_offeringId_hospitalId_fkey"
        FOREIGN KEY ("offeringId", "hospitalId")
        REFERENCES "HospitalServiceOffering"("id", "hospitalId") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "PatientServiceRequest_requestedByUserId_fkey"
        FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "PatientServiceRequest_preferredOsmUserId_fkey"
        FOREIGN KEY ("preferredOsmUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "PatientServiceRequest_reviewedByUserId_fkey"
        FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "PatientServiceRequest_startedByUserId_fkey"
        FOREIGN KEY ("startedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "PatientServiceRequest_withdrawnByUserId_fkey"
        FOREIGN KEY ("withdrawnByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PatientAccessRequest"
    ADD CONSTRAINT "PatientAccessRequest_hospitalId_fkey"
        FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "PatientAccessRequest_reviewedByUserId_fkey"
        FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "PatientAccessRequest_resolvedPersonId_fkey"
        FOREIGN KEY ("resolvedPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "PatientAccessRequest_resolvedUserId_fkey"
        FOREIGN KEY ("resolvedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "PatientAccessRequest_resolvedRelationshipId_fkey"
        FOREIGN KEY ("resolvedRelationshipId") REFERENCES "PatientHospitalRelationship"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PatientActivation"
    ADD CONSTRAINT "PatientActivation_patientAccessRequestId_fkey"
        FOREIGN KEY ("patientAccessRequestId") REFERENCES "PatientAccessRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
