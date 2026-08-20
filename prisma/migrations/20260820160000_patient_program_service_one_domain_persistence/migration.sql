-- Phase 15B.1 adds explicit, one-time Service 1 activity records owned by
-- PatientProgram. Existing Programs intentionally receive no backfilled rows.

CREATE TABLE "PatientProgramServiceOneRoutine" (
    "id" UUID NOT NULL,
    "patientProgramId" UUID NOT NULL,
    "recordedByUserId" UUID NOT NULL,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientProgramServiceOneRoutine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PatientProgramServiceOneFloatingChart" (
    "id" UUID NOT NULL,
    "patientProgramId" UUID NOT NULL,
    "recordedByUserId" UUID NOT NULL,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summary" VARCHAR(2000),

    CONSTRAINT "PatientProgramServiceOneFloatingChart_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PatientProgramServiceOneDreamCard" (
    "id" UUID NOT NULL,
    "patientProgramId" UUID NOT NULL,
    "recordedByUserId" UUID NOT NULL,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" VARCHAR(2000),

    CONSTRAINT "PatientProgramServiceOneDreamCard_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PatientProgramServiceOneConfidence" (
    "id" UUID NOT NULL,
    "patientProgramId" UUID NOT NULL,
    "recordedByUserId" UUID NOT NULL,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "score" INTEGER NOT NULL,
    "improvementPlan" VARCHAR(2000),

    CONSTRAINT "PatientProgramServiceOneConfidence_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PatientProgramServiceOneConfidence_score_check"
        CHECK ("score" BETWEEN 0 AND 10)
);

CREATE UNIQUE INDEX "PatientProgramServiceOneRoutine_patientProgramId_key"
    ON "PatientProgramServiceOneRoutine"("patientProgramId");
CREATE INDEX "PatientProgramServiceOneRoutine_recordedByUserId_recordedAt_idx"
    ON "PatientProgramServiceOneRoutine"("recordedByUserId", "recordedAt");

CREATE UNIQUE INDEX "PatientProgramServiceOneFloatingChart_patientProgramId_key"
    ON "PatientProgramServiceOneFloatingChart"("patientProgramId");
CREATE INDEX "PatientProgramServiceOneFloatingChart_recordedByUserId_recordedAt_idx"
    ON "PatientProgramServiceOneFloatingChart"("recordedByUserId", "recordedAt");

CREATE UNIQUE INDEX "PatientProgramServiceOneDreamCard_patientProgramId_key"
    ON "PatientProgramServiceOneDreamCard"("patientProgramId");
CREATE INDEX "PatientProgramServiceOneDreamCard_recordedByUserId_recordedAt_idx"
    ON "PatientProgramServiceOneDreamCard"("recordedByUserId", "recordedAt");

CREATE UNIQUE INDEX "PatientProgramServiceOneConfidence_patientProgramId_key"
    ON "PatientProgramServiceOneConfidence"("patientProgramId");
CREATE INDEX "PatientProgramServiceOneConfidence_recordedByUserId_recordedAt_idx"
    ON "PatientProgramServiceOneConfidence"("recordedByUserId", "recordedAt");

ALTER TABLE "PatientProgramServiceOneRoutine"
    ADD CONSTRAINT "PatientProgramServiceOneRoutine_patientProgramId_fkey"
    FOREIGN KEY ("patientProgramId")
    REFERENCES "PatientProgram"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "PatientProgramServiceOneRoutine_recordedByUserId_fkey"
    FOREIGN KEY ("recordedByUserId")
    REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PatientProgramServiceOneFloatingChart"
    ADD CONSTRAINT "PatientProgramServiceOneFloatingChart_patientProgramId_fkey"
    FOREIGN KEY ("patientProgramId")
    REFERENCES "PatientProgram"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "PatientProgramServiceOneFloatingChart_recordedByUserId_fkey"
    FOREIGN KEY ("recordedByUserId")
    REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PatientProgramServiceOneDreamCard"
    ADD CONSTRAINT "PatientProgramServiceOneDreamCard_patientProgramId_fkey"
    FOREIGN KEY ("patientProgramId")
    REFERENCES "PatientProgram"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "PatientProgramServiceOneDreamCard_recordedByUserId_fkey"
    FOREIGN KEY ("recordedByUserId")
    REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PatientProgramServiceOneConfidence"
    ADD CONSTRAINT "PatientProgramServiceOneConfidence_patientProgramId_fkey"
    FOREIGN KEY ("patientProgramId")
    REFERENCES "PatientProgram"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "PatientProgramServiceOneConfidence_recordedByUserId_fkey"
    FOREIGN KEY ("recordedByUserId")
    REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
