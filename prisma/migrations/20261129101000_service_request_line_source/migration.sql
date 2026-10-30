-- ADR-0023 (SR-B): the OSM_SERVICE_REQUESTED intent names its service request; it has no appointment yet.
ALTER TABLE "AppointmentLineNotification"
  ADD COLUMN "patientServiceRequestId" UUID;

ALTER TABLE "AppointmentLineNotification"
  ADD CONSTRAINT "AppointmentLineNotification_patientServiceRequestId_patientHospitalRelationshipId_fkey"
    FOREIGN KEY ("patientServiceRequestId", "patientHospitalRelationshipId")
    REFERENCES "PatientServiceRequest"("id", "patientHospitalRelationshipId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  DROP CONSTRAINT "AppointmentLineNotification_source_event_check",
  ADD CONSTRAINT "AppointmentLineNotification_source_event_check"
    CHECK (
      ("eventKind" IN ('CREATED', 'RESCHEDULED', 'CANCELLED')
        AND "appointmentId" IS NOT NULL AND "patientOsmAssignmentId" IS NULL AND "rescheduleRequestId" IS NULL
        AND "patientServiceRequestId" IS NULL)
      OR ("eventKind" = 'OSM_PATIENT_ASSIGNED'
        AND "appointmentId" IS NULL AND "patientOsmAssignmentId" IS NOT NULL AND "rescheduleRequestId" IS NULL
        AND "patientServiceRequestId" IS NULL)
      OR ("eventKind" = 'OSM_APPOINTMENT_ASSIGNED'
        AND "appointmentId" IS NOT NULL AND "patientOsmAssignmentId" IS NULL AND "rescheduleRequestId" IS NULL
        AND "patientServiceRequestId" IS NULL)
      OR ("eventKind" = 'OSM_RESCHEDULE_REQUESTED'
        AND "appointmentId" IS NOT NULL AND "patientOsmAssignmentId" IS NULL AND "rescheduleRequestId" IS NOT NULL
        AND "patientServiceRequestId" IS NULL)
      OR ("eventKind" = 'OSM_SERVICE_REQUESTED'
        AND "appointmentId" IS NULL AND "patientOsmAssignmentId" IS NULL AND "rescheduleRequestId" IS NULL
        AND "patientServiceRequestId" IS NOT NULL)
    );

CREATE INDEX "AppointmentLineNotification_patientServiceRequestId_idx"
  ON "AppointmentLineNotification"("patientServiceRequestId");
