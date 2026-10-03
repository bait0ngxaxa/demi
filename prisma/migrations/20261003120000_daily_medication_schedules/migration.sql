CREATE TABLE "MedicationSchedule" (
    "id" UUID NOT NULL,
    "personalMedicationId" UUID NOT NULL,
    "localTime" TIME(6) WITHOUT TIME ZONE NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MedicationSchedule_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MedicationSchedule_localTime_minute_check" CHECK (
        "localTime" >= TIME '00:00:00' AND "localTime" < TIME '24:00:00'
        AND EXTRACT(SECOND FROM "localTime") = 0
    ),
    CONSTRAINT "MedicationSchedule_personalMedicationId_fkey" FOREIGN KEY ("personalMedicationId")
        REFERENCES "PersonalMedication"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "MedicationSchedule_medication_time_key"
    ON "MedicationSchedule" ("personalMedicationId", "localTime");

CREATE FUNCTION "medication_schedule_guard_write"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    parent_id UUID;
    parent_status "PersonalMedicationStatus";
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'MedicationSchedule write rejected' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'INSERT' THEN
        parent_id := NEW."personalMedicationId";
    ELSE
        parent_id := OLD."personalMedicationId";
    END IF;
    SELECT "status" INTO parent_status FROM "PersonalMedication"
        WHERE "id" = parent_id FOR UPDATE;
    IF NOT FOUND OR parent_status IS DISTINCT FROM 'ACTIVE'::"PersonalMedicationStatus" THEN
        RAISE EXCEPTION 'MedicationSchedule write rejected' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'INSERT' THEN
        RETURN NEW;
    END IF;
    RETURN OLD;
END;
$$;

CREATE TRIGGER "MedicationSchedule_guard_write_trigger"
BEFORE INSERT OR UPDATE OR DELETE ON "MedicationSchedule"
FOR EACH ROW EXECUTE FUNCTION "medication_schedule_guard_write"();
