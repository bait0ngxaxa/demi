CREATE TYPE "PersonalMealCategory" AS ENUM ('BREAKFAST', 'LUNCH', 'DINNER', 'SNACK');

CREATE TABLE "PersonalMealEntry" (
    "id" UUID NOT NULL,
    "patientProfileId" UUID NOT NULL,
    "category" "PersonalMealCategory" NOT NULL,
    "occurredOn" DATE NOT NULL,
    "description" VARCHAR(1000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "PersonalMealEntry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PersonalMealEntry_patientProfileId_fkey" FOREIGN KEY ("patientProfileId")
        REFERENCES "PatientProfile"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PersonalMealEntry_date_range_check" CHECK (
        "occurredOn" >= DATE '0001-01-01' AND "occurredOn" <= DATE '9999-12-31'
    ),
    CONSTRAINT "PersonalMealEntry_description_check" CHECK (
        "description" IS NULL OR char_length(btrim("description")) > 0
    )
);

CREATE INDEX "PersonalMealEntry_history_order_idx" ON "PersonalMealEntry"
    ("patientProfileId", "occurredOn" DESC, "createdAt" DESC, "id" DESC);

CREATE TABLE "PersonalMealCreateReceipt" (
    "patientProfileId" UUID NOT NULL,
    "submissionNonce" UUID NOT NULL,
    "mealEntryId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PersonalMealCreateReceipt_pkey" PRIMARY KEY ("patientProfileId", "submissionNonce"),
    CONSTRAINT "PersonalMealCreateReceipt_patientProfileId_fkey" FOREIGN KEY ("patientProfileId")
        REFERENCES "PatientProfile"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- No FK to Meal: deleting active payload must not remove consumed-operation memory.
CREATE UNIQUE INDEX "PersonalMealCreateReceipt_mealEntryId_key" ON "PersonalMealCreateReceipt" ("mealEntryId");
