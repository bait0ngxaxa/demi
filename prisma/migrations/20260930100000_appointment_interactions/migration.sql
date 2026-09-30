CREATE TYPE "AppointmentInteractionSource" AS ENUM ('PATIENT_SELF', 'OSM_PROXY');
CREATE TYPE "AppointmentCancellationRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUPERSEDED');

ALTER TABLE "PatientAppointment"
ADD COLUMN "osmAssignmentIdAtCreation" UUID;

ALTER TABLE "PatientAppointment"
ADD CONSTRAINT "PatientAppointment_osmAssignmentIdAtCreation_fkey"
FOREIGN KEY ("osmAssignmentIdAtCreation") REFERENCES "PatientOsmAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PatientAppointmentAcknowledgement" (
    "id" UUID NOT NULL,
    "appointmentId" UUID NOT NULL,
    "sourceAppointmentUpdatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
    "recordedByUserId" UUID NOT NULL,
    "source" "AppointmentInteractionSource" NOT NULL,
    "acknowledgedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientAppointmentAcknowledgement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PatientAppointmentAcknowledgement_appointmentId_sourceAppointmentUpdatedAt_key"
    ON "PatientAppointmentAcknowledgement"("appointmentId", "sourceAppointmentUpdatedAt");
CREATE INDEX "PatientAppointmentAcknowledgement_recordedByUserId_acknowledgedAt_idx"
    ON "PatientAppointmentAcknowledgement"("recordedByUserId", "acknowledgedAt");

ALTER TABLE "PatientAppointmentAcknowledgement"
ADD CONSTRAINT "PatientAppointmentAcknowledgement_appointmentId_fkey"
FOREIGN KEY ("appointmentId") REFERENCES "PatientAppointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "PatientAppointmentAcknowledgement_recordedByUserId_fkey"
FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PatientAppointmentCancellationRequest" (
    "id" UUID NOT NULL,
    "appointmentId" UUID NOT NULL,
    "sourceAppointmentUpdatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
    "submittedByUserId" UUID NOT NULL,
    "source" "AppointmentInteractionSource" NOT NULL,
    "submissionNonce" UUID NOT NULL,
    "status" "AppointmentCancellationRequestStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedByUserId" UUID,
    "resolvedAt" TIMESTAMP(3) WITH TIME ZONE,

    CONSTRAINT "PatientAppointmentCancellationRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PatientAppointmentCancellationRequest_resolution_check" CHECK (
        ("status" = 'PENDING' AND "resolvedByUserId" IS NULL AND "resolvedAt" IS NULL)
        OR
        ("status" <> 'PENDING' AND "resolvedByUserId" IS NOT NULL AND "resolvedAt" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "PatientAppointmentCancellationRequest_submissionNonce_key"
    ON "PatientAppointmentCancellationRequest"("submissionNonce");
CREATE UNIQUE INDEX "PatientAppointmentCancellationRequest_one_pending_per_appointment_key"
    ON "PatientAppointmentCancellationRequest"("appointmentId")
    WHERE "status" = 'PENDING';
CREATE INDEX "PatientAppointmentCancellationRequest_appointmentId_submittedAt_idx"
    ON "PatientAppointmentCancellationRequest"("appointmentId", "submittedAt");
CREATE INDEX "PatientAppointmentCancellationRequest_status_submittedAt_idx"
    ON "PatientAppointmentCancellationRequest"("status", "submittedAt");
CREATE INDEX "PatientAppointmentCancellationRequest_submittedByUserId_submittedAt_idx"
    ON "PatientAppointmentCancellationRequest"("submittedByUserId", "submittedAt");

ALTER TABLE "PatientAppointmentCancellationRequest"
ADD CONSTRAINT "PatientAppointmentCancellationRequest_appointmentId_fkey"
FOREIGN KEY ("appointmentId") REFERENCES "PatientAppointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "PatientAppointmentCancellationRequest_submittedByUserId_fkey"
FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "PatientAppointmentCancellationRequest_resolvedByUserId_fkey"
FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PatientAppointmentCoordinationEvent" (
    "id" UUID NOT NULL,
    "appointmentId" UUID NOT NULL,
    "recordedByUserId" UUID NOT NULL,
    "submissionNonce" UUID NOT NULL,
    "recordedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientAppointmentCoordinationEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PatientAppointmentCoordinationEvent_submissionNonce_key"
    ON "PatientAppointmentCoordinationEvent"("submissionNonce");
CREATE INDEX "PatientAppointmentCoordinationEvent_appointmentId_recordedAt_id_idx"
    ON "PatientAppointmentCoordinationEvent"("appointmentId", "recordedAt", "id");
CREATE INDEX "PatientAppointmentCoordinationEvent_recordedByUserId_recordedAt_idx"
    ON "PatientAppointmentCoordinationEvent"("recordedByUserId", "recordedAt");

ALTER TABLE "PatientAppointmentCoordinationEvent"
ADD CONSTRAINT "PatientAppointmentCoordinationEvent_appointmentId_fkey"
FOREIGN KEY ("appointmentId") REFERENCES "PatientAppointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "PatientAppointmentCoordinationEvent_recordedByUserId_fkey"
FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
