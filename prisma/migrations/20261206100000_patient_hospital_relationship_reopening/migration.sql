-- ADR-0032: a platform ADMIN may reopen an ended Patient care relationship. The single relationship row per
-- (patientProfileId, hospitalId) is kept; its end fields are cleared together, and the cleared end plus the
-- reopen are kept in an append-only history table. Pre-production: no existing rows to migrate.

-- CreateTable
CREATE TABLE "PatientHospitalRelationshipReopening" (
    "id" UUID NOT NULL,
    "patientHospitalRelationshipId" UUID NOT NULL,
    "hospitalId" UUID NOT NULL,
    "previousEndedAt" TIMESTAMP(3) NOT NULL,
    "previousEndedByUserId" UUID NOT NULL,
    "previousEndReason" VARCHAR(500) NOT NULL,
    "reopenedAt" TIMESTAMPTZ(3) NOT NULL,
    "reopenedByUserId" UUID NOT NULL,
    "reopenReason" VARCHAR(500) NOT NULL,

    CONSTRAINT "PatientHospitalRelationshipReopening_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PatientHospitalRelationshipReopening_hospitalId_reopenedAt_idx" ON "PatientHospitalRelationshipReopening"("hospitalId", "reopenedAt");

-- CreateIndex
CREATE INDEX "PatientHospitalRelationshipReopening_previousEndedByUserId_idx" ON "PatientHospitalRelationshipReopening"("previousEndedByUserId");

-- CreateIndex
CREATE INDEX "PatientHospitalRelationshipReopening_reopenedByUserId_idx" ON "PatientHospitalRelationshipReopening"("reopenedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientHospitalRelationshipReopening_patientHospitalRelatio_key" ON "PatientHospitalRelationshipReopening"("patientHospitalRelationshipId", "previousEndedAt");

-- AddForeignKey
ALTER TABLE "PatientHospitalRelationshipReopening" ADD CONSTRAINT "PatientHospitalRelationshipReopening_patientHospitalRelati_fkey" FOREIGN KEY ("patientHospitalRelationshipId", "hospitalId") REFERENCES "PatientHospitalRelationship"("id", "hospitalId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientHospitalRelationshipReopening" ADD CONSTRAINT "PatientHospitalRelationshipReopening_previousEndedByUserId_fkey" FOREIGN KEY ("previousEndedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientHospitalRelationshipReopening" ADD CONSTRAINT "PatientHospitalRelationshipReopening_reopenedByUserId_fkey" FOREIGN KEY ("reopenedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Reasons are non-blank, like the end reason on the relationship.
ALTER TABLE "PatientHospitalRelationshipReopening"
    ADD CONSTRAINT "PatientHospitalRelationshipReopening_reason_check"
        CHECK ("previousEndReason" ~ '[^[:space:]]' AND "reopenReason" ~ '[^[:space:]]');

-- The history is append-only evidence. Only the disposable demo/test reset may remove it.
CREATE FUNCTION "guard_patient_hospital_relationship_reopening_append_only"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('demi.service_area_purge', true) = 'demo-reset' THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public;

CREATE TRIGGER "patient_hospital_relationship_reopening_append_only"
BEFORE UPDATE OR DELETE ON "PatientHospitalRelationshipReopening"
FOR EACH ROW EXECUTE FUNCTION "guard_patient_hospital_relationship_reopening_append_only"();

-- An ended relationship stays immutable, except for one transition: all three end fields cleared together, with
-- the Patient and Hospital unchanged, after the history row preserving exactly this end was written. A direct
-- database update without that history row is still refused.
CREATE OR REPLACE FUNCTION "guard_patient_hospital_relationship_end"() RETURNS trigger AS $$
BEGIN
  IF OLD."endedAt" IS NOT NULL AND (
    ROW(NEW."endedAt", NEW."endedByUserId", NEW."endReason")
      IS DISTINCT FROM ROW(OLD."endedAt", OLD."endedByUserId", OLD."endReason")
    OR ROW(NEW."patientProfileId", NEW."hospitalId")
      IS DISTINCT FROM ROW(OLD."patientProfileId", OLD."hospitalId")
  )
  THEN
    IF NEW."endedAt" IS NULL AND NEW."endedByUserId" IS NULL AND NEW."endReason" IS NULL
      AND ROW(NEW."patientProfileId", NEW."hospitalId") IS NOT DISTINCT FROM ROW(OLD."patientProfileId", OLD."hospitalId")
      AND EXISTS (
        SELECT 1
        FROM "PatientHospitalRelationshipReopening" AS "reopening"
        WHERE "reopening"."patientHospitalRelationshipId" = OLD."id"
          AND "reopening"."hospitalId" = OLD."hospitalId"
          AND "reopening"."previousEndedAt" = OLD."endedAt"
          AND "reopening"."previousEndedByUserId" = OLD."endedByUserId"
          AND "reopening"."previousEndReason" = OLD."endReason"
      )
    THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Ended patient hospital relationship cannot be reopened or changed' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public;

ALTER TABLE "PatientHospitalRelationshipReopening" ENABLE ROW LEVEL SECURITY;
