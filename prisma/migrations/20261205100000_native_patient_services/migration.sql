-- ADR-0029: the three patient services are native to DEMI. A request stores its service code, and the
-- per-Hospital on/off catalog (HospitalServiceOffering, ADR-0023 SR-D5) is removed.
-- Statements are separated by a blank line (the migration test runs them one by one); DO blocks have none inside.

ALTER TABLE "PatientServiceRequest" ADD COLUMN "serviceCode" "PatientServiceCode";

-- Every request keeps the service of the offering it was made for.
UPDATE "PatientServiceRequest" AS "request"
SET "serviceCode" = "offering"."code"
FROM "HospitalServiceOffering" AS "offering"
WHERE "offering"."id" = "request"."offeringId";

DO $$
DECLARE
    "unresolved" INTEGER;
BEGIN
    SELECT count(*) INTO "unresolved" FROM "PatientServiceRequest" WHERE "serviceCode" IS NULL;
    IF "unresolved" > 0 THEN
        RAISE EXCEPTION 'ADR-0029: % PatientServiceRequest(s) have no service code after the backfill', "unresolved"
            USING ERRCODE = '23514';
    END IF;
END $$;

ALTER TABLE "PatientServiceRequest" ALTER COLUMN "serviceCode" SET NOT NULL;

-- One open request per relationship and service, now keyed by the service code.
DO $$
DECLARE
    "duplicated" INTEGER;
BEGIN
    SELECT count(*) INTO "duplicated"
    FROM (
        SELECT 1
        FROM "PatientServiceRequest"
        WHERE "status" IN ('PENDING', 'APPROVED')
        GROUP BY "patientHospitalRelationshipId", "serviceCode"
        HAVING count(*) > 1
    ) AS "open";
    IF "duplicated" > 0 THEN
        RAISE EXCEPTION 'ADR-0029: % relationship/service pair(s) have more than one open PatientServiceRequest', "duplicated"
            USING ERRCODE = '23514';
    END IF;
END $$;

-- Prisma cannot express the unresolved-request invariant as a partial unique index.
CREATE UNIQUE INDEX "PatientServiceRequest_one_unresolved_key_v2"
    ON "PatientServiceRequest"("patientHospitalRelationshipId", "serviceCode")
    WHERE "status" IN ('PENDING', 'APPROVED');

DROP INDEX "PatientServiceRequest_one_unresolved_key";

ALTER INDEX "PatientServiceRequest_one_unresolved_key_v2" RENAME TO "PatientServiceRequest_one_unresolved_key";

ALTER TABLE "PatientServiceRequest" DROP CONSTRAINT "PatientServiceRequest_offeringId_hospitalId_fkey";

DROP INDEX "PatientServiceRequest_offeringId_idx";

ALTER TABLE "PatientServiceRequest" DROP COLUMN "offeringId";

-- Historical HOSPITAL_SERVICE_OFFERING_CHANGED audit events stay; AuditEvent.resourceId has no foreign key.
DROP TABLE "HospitalServiceOffering";
