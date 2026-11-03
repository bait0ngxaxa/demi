-- AP-1 (ADR-0027): an appointment's อสม. may be any ACTIVE อสม. of its Hospital at any location, and an
-- appointment has one assignee: a staff member or an อสม., never both.

-- AP-4: refuse to continue while any row names both assignees.
DO $$
DECLARE
    "violations" INTEGER;
BEGIN
    SELECT count(*) INTO "violations"
    FROM "PatientAppointment"
    WHERE "responsibleUserId" IS NOT NULL AND "assignedOsmUserId" IS NOT NULL;
    IF "violations" > 0 THEN
        RAISE EXCEPTION 'AP-1: % appointment(s) name both a staff and an OSM assignee', "violations"
            USING ERRCODE = '23514';
    END IF;
END $$;

-- AP-3: an อสม.-assigned appointment may use any location type.
ALTER TABLE "PatientAppointment"
    DROP CONSTRAINT "PatientAppointment_assigned_osm_home_visit_check";

ALTER TABLE "PatientAppointment"
    ADD CONSTRAINT "PatientAppointment_single_assignee_check"
    CHECK (NOT ("responsibleUserId" IS NOT NULL AND "assignedOsmUserId" IS NOT NULL));
