-- Patient domain identity is separate from workforce membership and account lifecycle.
CREATE TABLE "PatientProfile" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PatientHospitalRelationship" (
    "id" UUID NOT NULL,
    "patientProfileId" UUID NOT NULL,
    "hospitalId" UUID NOT NULL,
    "hospitalNumber" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientHospitalRelationship_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PatientProfile_personId_key" ON "PatientProfile"("personId");
CREATE UNIQUE INDEX "PatientHospitalRelationship_patientProfileId_hospitalId_key"
    ON "PatientHospitalRelationship"("patientProfileId", "hospitalId");
CREATE INDEX "PatientHospitalRelationship_hospitalId_idx"
    ON "PatientHospitalRelationship"("hospitalId");
CREATE INDEX "PatientHospitalRelationship_hospitalId_hospitalNumber_idx"
    ON "PatientHospitalRelationship"("hospitalId", "hospitalNumber");

ALTER TABLE "PatientProfile"
ADD CONSTRAINT "PatientProfile_personId_fkey"
FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PatientHospitalRelationship"
ADD CONSTRAINT "PatientHospitalRelationship_patientProfileId_fkey"
FOREIGN KEY ("patientProfileId") REFERENCES "PatientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "PatientHospitalRelationship_hospitalId_fkey"
FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;
