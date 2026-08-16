-- Hospital-specific OSM assignment history. The active state is represented by
-- endedAt IS NULL; the partial unique index enforces one active OSM per
-- PatientHospitalRelationship at the database boundary.
CREATE TABLE "PatientOsmAssignment" (
    "id" UUID NOT NULL,
    "patientHospitalRelationshipId" UUID NOT NULL,
    "osmUserId" UUID NOT NULL,
    "assignedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "endedByUserId" UUID,

    CONSTRAINT "PatientOsmAssignment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PatientOsmAssignment_patientHospitalRelationshipId_createdAt_idx"
    ON "PatientOsmAssignment"("patientHospitalRelationshipId", "createdAt");
CREATE INDEX "PatientOsmAssignment_osmUserId_endedAt_idx"
    ON "PatientOsmAssignment"("osmUserId", "endedAt");
CREATE UNIQUE INDEX "PatientOsmAssignment_one_active_per_patient_hospital_relationship_key"
    ON "PatientOsmAssignment"("patientHospitalRelationshipId")
    WHERE "endedAt" IS NULL;

ALTER TABLE "PatientOsmAssignment"
ADD CONSTRAINT "PatientOsmAssignment_patientHospitalRelationshipId_fkey"
FOREIGN KEY ("patientHospitalRelationshipId") REFERENCES "PatientHospitalRelationship"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "PatientOsmAssignment_osmUserId_fkey"
FOREIGN KEY ("osmUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "PatientOsmAssignment_assignedByUserId_fkey"
FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "PatientOsmAssignment_endedByUserId_fkey"
FOREIGN KEY ("endedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
