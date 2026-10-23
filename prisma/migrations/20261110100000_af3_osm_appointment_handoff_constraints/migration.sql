-- AF-3: appointment assignee/request links, versioned acceptance, and generalized LINE sources.

ALTER TABLE "PatientOsmAssignment"
  ADD CONSTRAINT "PatientOsmAssignment_id_patientHospitalRelationshipId_key"
  UNIQUE ("id", "patientHospitalRelationshipId");

ALTER TABLE "PatientServiceRequest"
  ADD CONSTRAINT "PatientServiceRequest_id_patientHospitalRelationshipId_key"
  UNIQUE ("id", "patientHospitalRelationshipId");

ALTER TABLE "PatientAppointment"
  ADD COLUMN "assignedOsmUserId" UUID,
  ADD COLUMN "sourceServiceRequestId" UUID;

ALTER TABLE "PatientAppointment"
  ADD CONSTRAINT "PatientAppointment_assignedOsmUserId_fkey"
    FOREIGN KEY ("assignedOsmUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PatientAppointment_sourceServiceRequestId_patientHospitalRelationshipId_fkey"
    FOREIGN KEY ("sourceServiceRequestId", "patientHospitalRelationshipId")
    REFERENCES "PatientServiceRequest"("id", "patientHospitalRelationshipId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PatientAppointment_assigned_osm_home_visit_check"
    CHECK ("assignedOsmUserId" IS NULL OR COALESCE("locationType" = 'HOME_VISIT'::"AppointmentLocationType", FALSE));

CREATE UNIQUE INDEX "PatientAppointment_sourceServiceRequestId_key"
  ON "PatientAppointment"("sourceServiceRequestId");
CREATE INDEX "PatientAppointment_assignedOsmUserId_status_scheduledAt_idx"
  ON "PatientAppointment"("assignedOsmUserId", "status", "scheduledAt");

CREATE TABLE "PatientAppointmentAssigneeAcceptance" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "appointmentId" UUID NOT NULL,
  "sourceAppointmentUpdatedAt" TIMESTAMPTZ(3) NOT NULL,
  "acceptedByUserId" UUID NOT NULL,
  "submissionNonce" UUID NOT NULL,
  "acceptedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PatientAppointmentAssigneeAcceptance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PatientAppointmentAssigneeAcceptance_appointmentId_fkey"
    FOREIGN KEY ("appointmentId") REFERENCES "PatientAppointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PatientAppointmentAssigneeAcceptance_acceptedByUserId_fkey"
    FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PatientAppointmentAssigneeAcceptance_submissionNonce_key"
  ON "PatientAppointmentAssigneeAcceptance"("submissionNonce");
CREATE UNIQUE INDEX "PatientAppointmentAssigneeAcceptance_appointmentId_sourceAppointmentUpdatedAt_key"
  ON "PatientAppointmentAssigneeAcceptance"("appointmentId", "sourceAppointmentUpdatedAt");
CREATE INDEX "PatientAppointmentAssigneeAcceptance_acceptedByUserId_acceptedAt_idx"
  ON "PatientAppointmentAssigneeAcceptance"("acceptedByUserId", "acceptedAt");

ALTER TABLE "AppointmentLineNotification"
  ADD COLUMN "patientOsmAssignmentId" UUID,
  ADD COLUMN "rescheduleRequestId" UUID,
  ADD COLUMN "eventKey" VARCHAR(255);

UPDATE "AppointmentLineNotification"
SET "eventKey" = "eventKind"::TEXT || ':' || "appointmentId"::TEXT || ':' ||
  EXTRACT(EPOCH FROM "sourceUpdatedAt")::TEXT;

ALTER TABLE "AppointmentLineNotification"
  ALTER COLUMN "appointmentId" DROP NOT NULL,
  ALTER COLUMN "eventKey" SET NOT NULL,
  DROP CONSTRAINT "AppointmentLineNotification_appointmentId_patientHospitalR_fkey",
  ADD CONSTRAINT "AppointmentLineNotification_appointmentId_patientHospitalR_fkey"
    FOREIGN KEY ("appointmentId", "patientHospitalRelationshipId")
    REFERENCES "PatientAppointment"("id", "patientHospitalRelationshipId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "AppointmentLineNotification_patientHospitalRelationshipId_fkey"
    FOREIGN KEY ("patientHospitalRelationshipId") REFERENCES "PatientHospitalRelationship"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AppointmentLineNotification_patientOsmAssignmentId_patientHospitalRelationshipId_fkey"
    FOREIGN KEY ("patientOsmAssignmentId", "patientHospitalRelationshipId")
    REFERENCES "PatientOsmAssignment"("id", "patientHospitalRelationshipId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "AppointmentLineNotification_rescheduleRequestId_fkey"
    FOREIGN KEY ("rescheduleRequestId") REFERENCES "PatientAppointmentRescheduleRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AppointmentLineNotification_source_event_check"
    CHECK (
      ("eventKind" IN ('CREATED', 'RESCHEDULED', 'CANCELLED')
        AND "appointmentId" IS NOT NULL AND "patientOsmAssignmentId" IS NULL AND "rescheduleRequestId" IS NULL)
      OR ("eventKind" = 'OSM_PATIENT_ASSIGNED'
        AND "appointmentId" IS NULL AND "patientOsmAssignmentId" IS NOT NULL AND "rescheduleRequestId" IS NULL)
      OR ("eventKind" = 'OSM_APPOINTMENT_ASSIGNED'
        AND "appointmentId" IS NOT NULL AND "patientOsmAssignmentId" IS NULL AND "rescheduleRequestId" IS NULL)
      OR ("eventKind" = 'OSM_RESCHEDULE_REQUESTED'
        AND "appointmentId" IS NOT NULL AND "patientOsmAssignmentId" IS NULL AND "rescheduleRequestId" IS NOT NULL)
    );

DROP INDEX "AppointmentLineNotification_appointmentId_sourceUpdatedAt_r_key";
DROP INDEX "AppointmentLineNotification_patient_event_key";
CREATE UNIQUE INDEX "AppointmentLineNotification_eventKey_recipientUserId_key"
  ON "AppointmentLineNotification"("eventKey", "recipientUserId");
CREATE UNIQUE INDEX "AppointmentLineNotification_patient_event_key"
  ON "AppointmentLineNotification"("eventKey")
  WHERE "recipientKind" = 'PATIENT';

CREATE INDEX "AppointmentLineNotification_patientOsmAssignmentId_idx"
  ON "AppointmentLineNotification"("patientOsmAssignmentId");
CREATE INDEX "AppointmentLineNotification_rescheduleRequestId_idx"
  ON "AppointmentLineNotification"("rescheduleRequestId");

ALTER TABLE "AppointmentLineNotification" ENABLE ROW LEVEL SECURITY;
