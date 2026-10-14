-- CreateEnum
CREATE TYPE "HealthHistoryAnswer" AS ENUM ('YES', 'NO', 'UNKNOWN');

-- DropIndex
DROP INDEX "HospitalMembership_userId_hospitalId_key";

-- DropIndex
DROP INDEX "OsmHospitalRelationship_userId_hospitalId_key";

-- CreateTable
CREATE TABLE "PatientHospitalHealthHistory" (
    "id" UUID NOT NULL,
    "patientHospitalRelationshipId" UUID NOT NULL,
    "diabetes" "HealthHistoryAnswer" NOT NULL DEFAULT 'UNKNOWN',
    "hypertension" "HealthHistoryAnswer" NOT NULL DEFAULT 'UNKNOWN',
    "otherConditions" VARCHAR(1000),
    "familyHypertension" "HealthHistoryAnswer" NOT NULL DEFAULT 'UNKNOWN',
    "familyDiabetes" "HealthHistoryAnswer" NOT NULL DEFAULT 'UNKNOWN',
    "familyHeartDisease" "HealthHistoryAnswer" NOT NULL DEFAULT 'UNKNOWN',
    "familyStroke" "HealthHistoryAnswer" NOT NULL DEFAULT 'UNKNOWN',
    "diagnosisYear" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientHospitalHealthHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientAppointmentRescheduleRequest" (
    "id" UUID NOT NULL,
    "appointmentId" UUID NOT NULL,
    "sourceAppointmentUpdatedAt" TIMESTAMPTZ(3) NOT NULL,
    "submittedByUserId" UUID NOT NULL,
    "source" "AppointmentInteractionSource" NOT NULL,
    "submissionNonce" UUID NOT NULL,
    "status" "AppointmentCancellationRequestStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedByUserId" UUID,
    "resolvedAt" TIMESTAMPTZ(3),
    "preferredDatetimes" TIMESTAMPTZ(3)[],
    "reason" VARCHAR(500) NOT NULL,
    "rejectionReason" VARCHAR(500),

    CONSTRAINT "PatientAppointmentRescheduleRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PatientHospitalHealthHistory_patientHospitalRelationshipId_key" ON "PatientHospitalHealthHistory"("patientHospitalRelationshipId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientAppointmentRescheduleRequest_submissionNonce_key" ON "PatientAppointmentRescheduleRequest"("submissionNonce");

-- CreateIndex
CREATE INDEX "PatientAppointmentRescheduleRequest_appointmentId_submitted_idx" ON "PatientAppointmentRescheduleRequest"("appointmentId", "submittedAt");

-- CreateIndex
CREATE INDEX "PatientAppointmentRescheduleRequest_status_submittedAt_idx" ON "PatientAppointmentRescheduleRequest"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "PatientAppointmentRescheduleRequest_submittedByUserId_submi_idx" ON "PatientAppointmentRescheduleRequest"("submittedByUserId", "submittedAt");

-- CreateIndex
CREATE INDEX "HospitalMembership_userId_hospitalId_idx" ON "HospitalMembership"("userId", "hospitalId");

-- CreateIndex
CREATE INDEX "OsmHospitalRelationship_userId_hospitalId_idx" ON "OsmHospitalRelationship"("userId", "hospitalId");

-- AddForeignKey
ALTER TABLE "PatientHospitalHealthHistory" ADD CONSTRAINT "PatientHospitalHealthHistory_patientHospitalRelationshipId_fkey" FOREIGN KEY ("patientHospitalRelationshipId") REFERENCES "PatientHospitalRelationship"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientAppointmentRescheduleRequest" ADD CONSTRAINT "PatientAppointmentRescheduleRequest_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "PatientAppointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientAppointmentRescheduleRequest" ADD CONSTRAINT "PatientAppointmentRescheduleRequest_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientAppointmentRescheduleRequest" ADD CONSTRAINT "PatientAppointmentRescheduleRequest_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- The terminal namespace retains history while allowing normal provisioning of a new row.
CREATE UNIQUE INDEX "HospitalMembership_live_user_hospital_key"
  ON "HospitalMembership" ("userId", "hospitalId") WHERE "status" <> 'ENDED';
CREATE UNIQUE INDEX "OsmHospitalRelationship_live_user_hospital_key"
  ON "OsmHospitalRelationship" ("userId", "hospitalId") WHERE "status" <> 'ENDED';
CREATE UNIQUE INDEX "PatientAppointmentRescheduleRequest_one_open_key"
  ON "PatientAppointmentRescheduleRequest" ("appointmentId") WHERE "status" = 'PENDING';
ALTER TABLE "PatientHospitalHealthHistory"
  ADD CONSTRAINT "PatientHospitalHealthHistory_version_check" CHECK ("version" >= 1),
  ADD CONSTRAINT "PatientHospitalHealthHistory_year_check" CHECK ("diagnosisYear" IS NULL OR "diagnosisYear" BETWEEN 2400 AND 9999);
ALTER TABLE "PatientAppointmentRescheduleRequest"
  ALTER COLUMN "preferredDatetimes" SET NOT NULL,
  ADD CONSTRAINT "PatientAppointmentRescheduleRequest_dates_check" CHECK (cardinality("preferredDatetimes") BETWEEN 1 AND 3 AND array_ndims("preferredDatetimes") = 1 AND array_position("preferredDatetimes", NULL) IS NULL),
  ADD CONSTRAINT "PatientAppointmentRescheduleRequest_reason_check" CHECK (length(btrim("reason")) BETWEEN 1 AND 500),
  ADD CONSTRAINT "PatientAppointmentRescheduleRequest_resolution_check" CHECK (
    ("status" = 'PENDING' AND "resolvedAt" IS NULL AND "resolvedByUserId" IS NULL AND "rejectionReason" IS NULL) OR
    ("status" <> 'PENDING' AND "resolvedAt" IS NOT NULL AND "resolvedByUserId" IS NOT NULL AND
      (("status" = 'REJECTED' AND "rejectionReason" IS NOT NULL AND length(btrim("rejectionReason")) BETWEEN 1 AND 500) OR ("status" <> 'REJECTED' AND "rejectionReason" IS NULL)))
  );

CREATE FUNCTION "prevent_workforce_ended_restore"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" = 'ENDED' AND NEW."status" <> 'ENDED' THEN
    RAISE EXCEPTION 'Ended workforce relationships cannot be restored' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "HospitalMembership_ended_terminal" BEFORE UPDATE ON "HospitalMembership"
  FOR EACH ROW EXECUTE FUNCTION "prevent_workforce_ended_restore"();
CREATE TRIGGER "OsmHospitalRelationship_ended_terminal" BEFORE UPDATE ON "OsmHospitalRelationship"
  FOR EACH ROW EXECUTE FUNCTION "prevent_workforce_ended_restore"();
