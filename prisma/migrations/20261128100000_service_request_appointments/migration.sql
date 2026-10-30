-- ADR-0023 (SR-A): a service request becomes an appointment request, and an appointment keeps its service.

-- SR-D6: the patient's preferred visit slot; staff set the exact time on confirmation.
CREATE TYPE "PatientServiceRequestSlot" AS ENUM ('MORNING', 'AFTERNOON', 'ANY');

-- Preference columns stay nullable for requests made before SR-B.
ALTER TABLE "PatientServiceRequest"
    ADD COLUMN "preferredDate" DATE,
    ADD COLUMN "preferredSlot" "PatientServiceRequestSlot",
    ADD COLUMN "note" VARCHAR(500),
    ADD COLUMN "rejectionReason" VARCHAR(500);

-- SR-D6: a preferred date and slot are stated together.
ALTER TABLE "PatientServiceRequest"
    ADD CONSTRAINT "PatientServiceRequest_preference_check"
    CHECK (("preferredDate" IS NULL) = ("preferredSlot" IS NULL));

ALTER TABLE "PatientServiceRequest"
    ADD CONSTRAINT "PatientServiceRequest_note_check"
    CHECK ("note" IS NULL OR ("note" = btrim("note") AND "note" <> ''));

-- SR-D1: only a rejected request carries a reason. The service requires it for every new rejection;
-- requests rejected before this migration have none.
ALTER TABLE "PatientServiceRequest"
    ADD CONSTRAINT "PatientServiceRequest_rejection_reason_check"
    CHECK (
        "rejectionReason" IS NULL
        OR ("status" = 'REJECTED' AND "rejectionReason" = btrim("rejectionReason") AND "rejectionReason" <> '')
    );

-- SR-D4: the requested service is stored on the appointment; hospital-booked appointments may set it.
ALTER TABLE "PatientAppointment"
    ADD COLUMN "serviceCode" "PatientServiceCode";

-- SR-D5: every Hospital offers all three services unless staff switch one off.
ALTER TABLE "HospitalServiceOffering"
    ALTER COLUMN "enabled" SET DEFAULT true;

-- BEGIN SR-A data step
-- An appointment booked from a request keeps the request's service.
UPDATE "PatientAppointment" AS "appointment"
SET "serviceCode" = "offering"."code"
FROM "PatientServiceRequest" AS "request"
JOIN "HospitalServiceOffering" AS "offering" ON "offering"."id" = "request"."offeringId"
WHERE "request"."id" = "appointment"."sourceServiceRequestId"
  AND "appointment"."serviceCode" IS NULL;

-- Missing offerings are recorded as set by the Hospital's earliest ACTIVE OWNER, otherwise by the user who
-- registered the Hospital (new Hospitals use their creator, too). A Hospital with neither cannot be attributed.
DO $$
DECLARE
    "unattributed" INTEGER;
BEGIN
    SELECT count(*) INTO "unattributed"
    FROM "Hospital" AS "hospital"
    WHERE EXISTS (
        SELECT 1 FROM unnest(enum_range(NULL::"PatientServiceCode")) AS "service"("code")
        WHERE NOT EXISTS (
            SELECT 1 FROM "HospitalServiceOffering" AS "offering"
            WHERE "offering"."hospitalId" = "hospital"."id" AND "offering"."code" = "service"."code"
        )
    )
    AND NOT EXISTS (
        SELECT 1 FROM "HospitalMembership" AS "membership"
        WHERE "membership"."hospitalId" = "hospital"."id"
          AND "membership"."membershipType" = 'OWNER'
          AND "membership"."status" = 'ACTIVE'
    )
    AND NOT EXISTS (SELECT 1 FROM "User" AS "registrar" WHERE "registrar"."id" = "hospital"."registeredByUserId");
    IF "unattributed" > 0 THEN
        RAISE EXCEPTION 'SR-A: % Hospital(s) need service offerings but have no ACTIVE OWNER or registering user', "unattributed"
            USING ERRCODE = '23514';
    END IF;
END $$;

INSERT INTO "HospitalServiceOffering" ("id", "hospitalId", "code", "enabled", "createdByUserId", "updatedByUserId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), "hospital"."id", "service"."code", true, "actor"."userId", "actor"."userId", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Hospital" AS "hospital"
CROSS JOIN unnest(enum_range(NULL::"PatientServiceCode")) AS "service"("code")
CROSS JOIN LATERAL (
    SELECT "candidate"."userId"
    FROM (
        SELECT "membership"."userId", 0 AS "rank", "membership"."createdAt"
        FROM "HospitalMembership" AS "membership"
        WHERE "membership"."hospitalId" = "hospital"."id"
          AND "membership"."membershipType" = 'OWNER'
          AND "membership"."status" = 'ACTIVE'
        UNION ALL
        SELECT "registrar"."id", 1, NULL
        FROM "User" AS "registrar"
        WHERE "registrar"."id" = "hospital"."registeredByUserId"
    ) AS "candidate"
    ORDER BY "candidate"."rank", "candidate"."createdAt", "candidate"."userId"
    LIMIT 1
) AS "actor"
WHERE NOT EXISTS (
    SELECT 1 FROM "HospitalServiceOffering" AS "offering"
    WHERE "offering"."hospitalId" = "hospital"."id" AND "offering"."code" = "service"."code"
);
-- END SR-A data step

-- SR-D4: an appointment booked from a request always names its service.
ALTER TABLE "PatientAppointment"
    ADD CONSTRAINT "PatientAppointment_source_request_service_check"
    CHECK ("sourceServiceRequestId" IS NULL OR "serviceCode" IS NOT NULL);
