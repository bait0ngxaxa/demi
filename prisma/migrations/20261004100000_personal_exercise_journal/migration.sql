CREATE TABLE "PersonalExerciseEntry" (
    "id" UUID NOT NULL,
    "patientProfileId" UUID NOT NULL,
    "activityName" VARCHAR(120) NOT NULL,
    "durationMinutes" INTEGER,
    "occurredOn" DATE NOT NULL,
    "note" VARCHAR(1000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "PersonalExerciseEntry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PersonalExerciseEntry_patientProfileId_fkey" FOREIGN KEY ("patientProfileId")
        REFERENCES "PatientProfile"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PersonalExerciseEntry_date_range_check" CHECK (
        "occurredOn" >= DATE '0001-01-01' AND "occurredOn" <= DATE '9999-12-31'
    ),
    CONSTRAINT "PersonalExerciseEntry_activity_check" CHECK (char_length(btrim("activityName")) > 0),
    CONSTRAINT "PersonalExerciseEntry_duration_check" CHECK ("durationMinutes" IS NULL OR "durationMinutes" BETWEEN 1 AND 1000000),
    CONSTRAINT "PersonalExerciseEntry_note_check" CHECK (
        "note" IS NULL OR char_length(btrim("note")) > 0
    )
);

CREATE INDEX "PersonalExerciseEntry_history_order_idx" ON "PersonalExerciseEntry"
    ("patientProfileId", "occurredOn" DESC, "createdAt" DESC, "id" DESC);

CREATE TABLE "PersonalExerciseCreateReceipt" (
    "patientProfileId" UUID NOT NULL,
    "submissionNonce" UUID NOT NULL,
    "exerciseEntryId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PersonalExerciseCreateReceipt_pkey" PRIMARY KEY ("patientProfileId", "submissionNonce"),
    CONSTRAINT "PersonalExerciseCreateReceipt_patientProfileId_fkey" FOREIGN KEY ("patientProfileId")
        REFERENCES "PatientProfile"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- No FK to Exercise: deleting active payload must not remove consumed-operation memory.
CREATE UNIQUE INDEX "PersonalExerciseCreateReceipt_exerciseEntryId_key" ON "PersonalExerciseCreateReceipt" ("exerciseEntryId");
