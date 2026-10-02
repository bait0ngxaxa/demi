CREATE TYPE "PersonalMedicationStatus" AS ENUM ('ACTIVE', 'STOPPED');

CREATE TABLE "PersonalMedication" (
    "id" UUID NOT NULL,
    "patientProfileId" UUID NOT NULL,
    "medicationName" VARCHAR(200) NOT NULL,
    "instructionText" VARCHAR(2000),
    "status" "PersonalMedicationStatus" NOT NULL DEFAULT 'ACTIVE',
    "stoppedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "PersonalMedication_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PersonalMedication_patientProfileId_fkey" FOREIGN KEY ("patientProfileId")
        REFERENCES "PatientProfile"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PersonalMedication_status_stoppedAt_check" CHECK (
        ("status" = 'ACTIVE' AND "stoppedAt" IS NULL) OR
        ("status" = 'STOPPED' AND "stoppedAt" IS NOT NULL)
    )
);

CREATE INDEX "PersonalMedication_active_order_idx" ON "PersonalMedication"
    ("patientProfileId", "status", "createdAt" DESC, "id" DESC);
CREATE INDEX "PersonalMedication_stopped_order_idx" ON "PersonalMedication"
    ("patientProfileId", "status", "stoppedAt" DESC, "id" DESC);

CREATE FUNCTION "personal_medication_guard_update"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF OLD."status" = 'STOPPED' THEN
        RAISE EXCEPTION 'PersonalMedication is terminal' USING ERRCODE = '23514';
    END IF;
    IF NEW."id" IS DISTINCT FROM OLD."id"
        OR NEW."patientProfileId" IS DISTINCT FROM OLD."patientProfileId"
        OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
        RAISE EXCEPTION 'PersonalMedication identity is immutable' USING ERRCODE = '23514';
    END IF;
    IF NEW."status" = 'STOPPED' AND (
        NEW."medicationName" IS DISTINCT FROM OLD."medicationName"
        OR NEW."instructionText" IS DISTINCT FROM OLD."instructionText"
    ) THEN
        RAISE EXCEPTION 'PersonalMedication stop must preserve text' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "PersonalMedication_guard_update_trigger"
BEFORE UPDATE ON "PersonalMedication"
FOR EACH ROW EXECUTE FUNCTION "personal_medication_guard_update"();
