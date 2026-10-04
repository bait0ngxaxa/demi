CREATE TABLE "PersonalWeightGoal" (
    "id" UUID NOT NULL,
    "patientProfileId" UUID NOT NULL,
    "targetWeightKg" NUMERIC(10,3) NOT NULL,
    "targetDate" DATE,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "PersonalWeightGoal_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PersonalWeightGoal_patientProfileId_key" UNIQUE ("patientProfileId"),
    CONSTRAINT "PersonalWeightGoal_patientProfileId_fkey" FOREIGN KEY ("patientProfileId")
        REFERENCES "PatientProfile"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PersonalWeightGoal_weight_range_check" CHECK (
        "targetWeightKg" > 0 AND "targetWeightKg" <= 1000000
    ),
    CONSTRAINT "PersonalWeightGoal_date_range_check" CHECK (
        "targetDate" IS NULL OR
        ("targetDate" >= DATE '0001-01-01' AND "targetDate" <= DATE '9999-12-31')
    )
);

CREATE TABLE "PersonalWeightGoalCreateReceipt" (
    "patientProfileId" UUID NOT NULL,
    "submissionNonce" UUID NOT NULL,
    "intendedWeightGoalId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PersonalWeightGoalCreateReceipt_pkey" PRIMARY KEY ("patientProfileId", "submissionNonce"),
    CONSTRAINT "PersonalWeightGoalCreateReceipt_patientProfileId_fkey" FOREIGN KEY ("patientProfileId")
        REFERENCES "PatientProfile"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- This scalar locator survives target removal; it intentionally has no Goal FK and stores no target payload.
CREATE UNIQUE INDEX "PersonalWeightGoalCreateReceipt_intendedWeightGoalId_key"
    ON "PersonalWeightGoalCreateReceipt" ("intendedWeightGoalId");
