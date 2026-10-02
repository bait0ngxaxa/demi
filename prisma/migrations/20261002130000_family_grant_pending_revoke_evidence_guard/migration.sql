-- A pending grant revoked by its Patient must not acquire evidence of caregiver acceptance.
-- Keep accepted evidence only when the grant actually passed through ACTIVE.
CREATE OR REPLACE FUNCTION "guard_caregiver_appointment_grant_update"() RETURNS trigger AS $$
BEGIN
  IF ROW(NEW."caregiverRelationshipId", NEW."patientProfileId", NEW."patientPersonId", NEW."caregiverUserId", NEW."caregiverPersonId", NEW."patientHospitalRelationshipId", NEW."contractVersion", NEW."proposedByUserId", NEW."proposedAt", NEW."id", NEW."createdAt")
    IS DISTINCT FROM ROW(OLD."caregiverRelationshipId", OLD."patientProfileId", OLD."patientPersonId", OLD."caregiverUserId", OLD."caregiverPersonId", OLD."patientHospitalRelationshipId", OLD."contractVersion", OLD."proposedByUserId", OLD."proposedAt", OLD."id", OLD."createdAt")
    OR OLD."status" = 'REVOKED'
    OR OLD."status" = 'ACTIVE' AND (NEW."status" NOT IN ('ACTIVE', 'REVOKED') OR NEW."acceptedAt" IS DISTINCT FROM OLD."acceptedAt" OR NEW."acceptedByUserId" IS DISTINCT FROM OLD."acceptedByUserId")
    OR OLD."status" = 'PENDING' AND NEW."status" = 'REVOKED' AND (NEW."acceptedAt" IS NOT NULL OR NEW."acceptedByUserId" IS NOT NULL)
  THEN RAISE EXCEPTION 'Invalid appointment grant transition' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
