-- Phase F review remediation: all ended-state fields are required together, and ended identity stays immutable.
ALTER TABLE "PatientHospitalRelationship"
    DROP CONSTRAINT "PatientHospitalRelationship_end_check",
    ADD CONSTRAINT "PatientHospitalRelationship_end_check"
        CHECK (("endedAt" IS NULL AND "endedByUserId" IS NULL AND "endReason" IS NULL)
            OR ("endedAt" IS NOT NULL
                AND "endedByUserId" IS NOT NULL
                AND "endReason" IS NOT NULL
                AND length(btrim("endReason")) > 0));

CREATE OR REPLACE FUNCTION "guard_patient_hospital_relationship_end"() RETURNS trigger AS $$
BEGIN
  IF OLD."endedAt" IS NOT NULL AND (
    ROW(NEW."endedAt", NEW."endedByUserId", NEW."endReason")
      IS DISTINCT FROM ROW(OLD."endedAt", OLD."endedByUserId", OLD."endReason")
    OR ROW(NEW."patientProfileId", NEW."hospitalId")
      IS DISTINCT FROM ROW(OLD."patientProfileId", OLD."hospitalId")
  )
  THEN RAISE EXCEPTION 'Ended patient hospital relationship cannot be reopened or changed' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
