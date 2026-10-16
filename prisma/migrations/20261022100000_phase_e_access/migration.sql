-- Phase E customer decisions (E1, E3, E5, E6). Existing rows keep their current behaviour:
-- no export grant, Person version 1, notification rows are PATIENT recipients.

-- E1 (ก-15): OWNER-granted report export for a MEMBER.
ALTER TABLE "HospitalMembership" ADD COLUMN     "reportExportGrantedAt" TIMESTAMPTZ(3),
ADD COLUMN     "reportExportGrantedByUserId" UUID;

ALTER TABLE "HospitalMembership"
    ADD CONSTRAINT "HospitalMembership_report_export_grant_check"
        CHECK (("reportExportGrantedAt" IS NULL) = ("reportExportGrantedByUserId" IS NULL)
            AND ("reportExportGrantedAt" IS NULL OR "membershipType" = 'MEMBER'));

ALTER TABLE "HospitalMembership" ADD CONSTRAINT "HospitalMembership_reportExportGrantedByUserId_fkey" FOREIGN KEY ("reportExportGrantedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- E3 (ก-19): optimistic-concurrency version for Person name correction.
ALTER TABLE "Person" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "Person" ADD CONSTRAINT "Person_version_check" CHECK ("version" > 0);

-- E5 (ก-22): Patient-recorded measurements; same ranges as PatientFollowup (0..1,000,000), at least one value.
CREATE TABLE "PatientSelfMeasurement" (
    "id" UUID NOT NULL,
    "patientProfileId" UUID NOT NULL,
    "submissionNonce" UUID NOT NULL,
    "measuredAt" TIMESTAMPTZ(3) NOT NULL,
    "weight" DOUBLE PRECISION,
    "systolicBloodPressure" DOUBLE PRECISION,
    "diastolicBloodPressure" DOUBLE PRECISION,
    "bloodSugar" DOUBLE PRECISION,
    "note" VARCHAR(1000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(3),
    "deletedByUserId" UUID,

    CONSTRAINT "PatientSelfMeasurement_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PatientSelfMeasurement_value_present_check"
        CHECK (num_nonnulls("weight", "systolicBloodPressure", "diastolicBloodPressure", "bloodSugar") > 0),
    CONSTRAINT "PatientSelfMeasurement_value_range_check"
        CHECK (("weight" IS NULL OR "weight" BETWEEN 0 AND 1000000)
            AND ("systolicBloodPressure" IS NULL OR "systolicBloodPressure" BETWEEN 0 AND 1000000)
            AND ("diastolicBloodPressure" IS NULL OR "diastolicBloodPressure" BETWEEN 0 AND 1000000)
            AND ("bloodSugar" IS NULL OR "bloodSugar" BETWEEN 0 AND 1000000)),
    CONSTRAINT "PatientSelfMeasurement_deletion_check"
        CHECK (("deletedAt" IS NULL) = ("deletedByUserId" IS NULL))
);

CREATE INDEX "PatientSelfMeasurement_history_order_idx" ON "PatientSelfMeasurement"("patientProfileId", "measuredAt" DESC, "id" DESC);

CREATE UNIQUE INDEX "PatientSelfMeasurement_patientProfileId_submissionNonce_key" ON "PatientSelfMeasurement"("patientProfileId", "submissionNonce");

ALTER TABLE "PatientSelfMeasurement" ADD CONSTRAINT "PatientSelfMeasurement_patientProfileId_fkey" FOREIGN KEY ("patientProfileId") REFERENCES "PatientProfile"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "PatientSelfMeasurement" ADD CONSTRAINT "PatientSelfMeasurement_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- E6 (ก-24): appointment LINE notifications per (event, recipient).
CREATE TYPE "AppointmentLineNotificationRecipientKind" AS ENUM ('PATIENT', 'OSM', 'CAREGIVER');

ALTER TABLE "AppointmentLineNotification" ADD COLUMN     "recipientGrantId" UUID,
ADD COLUMN     "recipientKind" "AppointmentLineNotificationRecipientKind" NOT NULL DEFAULT 'PATIENT';

ALTER TABLE "AppointmentLineNotification" DROP CONSTRAINT "AppointmentLineNotification_appointmentId_sourceUpdatedAt_key";

-- One message per recipient User per event; a suppressed Patient row may have no User, so the
-- Patient slot is additionally unique per event.
CREATE UNIQUE INDEX "AppointmentLineNotification_appointmentId_sourceUpdatedAt_r_key" ON "AppointmentLineNotification"("appointmentId", "sourceUpdatedAt", "recipientUserId");

CREATE UNIQUE INDEX "AppointmentLineNotification_patient_event_key"
    ON "AppointmentLineNotification"("appointmentId", "sourceUpdatedAt")
    WHERE "recipientKind" = 'PATIENT';

ALTER TABLE "AppointmentLineNotification"
    ADD CONSTRAINT "AppointmentLineNotification_recipient_kind_check"
        CHECK (("recipientKind" = 'CAREGIVER') = ("recipientGrantId" IS NOT NULL)
            AND ("recipientKind" = 'PATIENT' OR "recipientUserId" IS NOT NULL));

CREATE INDEX "AppointmentLineNotification_recipientGrantId_idx" ON "AppointmentLineNotification"("recipientGrantId");

ALTER TABLE "AppointmentLineNotification" ADD CONSTRAINT "AppointmentLineNotification_recipientGrantId_fkey" FOREIGN KEY ("recipientGrantId") REFERENCES "CaregiverAppointmentGrant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
