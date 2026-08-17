-- Phase 9B.0 Appointment working prototype.
-- Appointment history is owned by the exact PatientHospitalRelationship.
CREATE TYPE "AppointmentType" AS ENUM ('FOLLOW_UP', 'CONSULTATION');
CREATE TYPE "AppointmentLocationType" AS ENUM ('CLINIC', 'ONLINE', 'HOME_VISIT', 'OTHER');
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

CREATE TABLE "PatientAppointment" (
    "id" UUID NOT NULL,
    "patientHospitalRelationshipId" UUID NOT NULL,
    "responsibleUserId" UUID,
    "createdByUserId" UUID NOT NULL,
    "type" "AppointmentType" NOT NULL,
    "scheduledAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
    "durationMinutes" INTEGER,
    "locationType" "AppointmentLocationType",
    "locationDetail" VARCHAR(500),
    "note" VARCHAR(2000),
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "submissionNonce" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,

    CONSTRAINT "PatientAppointment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PatientAppointment_submissionNonce_key"
    ON "PatientAppointment"("submissionNonce");
CREATE INDEX "PatientAppointment_patientHospitalRelationshipId_scheduledAt_idx"
    ON "PatientAppointment"("patientHospitalRelationshipId", "scheduledAt");
CREATE INDEX "PatientAppointment_responsibleUserId_idx"
    ON "PatientAppointment"("responsibleUserId");
CREATE INDEX "PatientAppointment_status_idx"
    ON "PatientAppointment"("status");

ALTER TABLE "PatientAppointment"
ADD CONSTRAINT "PatientAppointment_patientHospitalRelationshipId_fkey"
FOREIGN KEY ("patientHospitalRelationshipId") REFERENCES "PatientHospitalRelationship"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "PatientAppointment_responsibleUserId_fkey"
FOREIGN KEY ("responsibleUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "PatientAppointment_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
