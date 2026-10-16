-- Phase F (ก-18): an OWNER ends a Patient's care relationship with one Hospital.
-- Forward-only; existing rows stay active (all three columns NULL). History rows are never deleted.

ALTER TABLE "PatientHospitalRelationship" ADD COLUMN     "endedAt" TIMESTAMP(3),
ADD COLUMN     "endedByUserId" UUID,
ADD COLUMN     "endReason" VARCHAR(500);

-- Ended fields are set together, with a non-blank reason.
ALTER TABLE "PatientHospitalRelationship"
    ADD CONSTRAINT "PatientHospitalRelationship_end_check"
        CHECK (("endedAt" IS NULL AND "endedByUserId" IS NULL AND "endReason" IS NULL)
            OR ("endedAt" IS NOT NULL AND "endedByUserId" IS NOT NULL AND length(btrim("endReason")) > 0));

CREATE INDEX "PatientHospitalRelationship_endedByUserId_idx" ON "PatientHospitalRelationship"("endedByUserId");

ALTER TABLE "PatientHospitalRelationship" ADD CONSTRAINT "PatientHospitalRelationship_endedByUserId_fkey" FOREIGN KEY ("endedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Ending is terminal: once ended, the end fields cannot change (no reopen), even through direct database updates.
CREATE FUNCTION "guard_patient_hospital_relationship_end"() RETURNS trigger AS $$
BEGIN
  IF OLD."endedAt" IS NOT NULL AND ROW(NEW."endedAt", NEW."endedByUserId", NEW."endReason")
    IS DISTINCT FROM ROW(OLD."endedAt", OLD."endedByUserId", OLD."endReason")
  THEN RAISE EXCEPTION 'Ended patient hospital relationship cannot be reopened or changed' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "patient_hospital_relationship_end_guard"
BEFORE UPDATE ON "PatientHospitalRelationship"
FOR EACH ROW EXECUTE FUNCTION "guard_patient_hospital_relationship_end"();
