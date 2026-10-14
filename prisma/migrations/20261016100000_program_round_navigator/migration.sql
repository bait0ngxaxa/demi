-- CreateEnum
CREATE TYPE "PatientProgramRoundToolCode" AS ENUM ('PAM', 'PROMS', 'KNOW_SELF', 'FLOATING_CHART', 'CONFIDENCE_RULER', 'LIFE_TABLE', 'ROUTINE', 'DREAM_CARD', 'HEALTH_PLAN_REVIEW', 'HEALTHY_PLAN', 'HEALTH_PATH');

-- CreateEnum
CREATE TYPE "PatientProgramRoundActivitySource" AS ENUM ('PLANNED', 'EXTRA');

-- CreateEnum
CREATE TYPE "PatientProgramRoundActivityMode" AS ENUM ('RECORDED', 'REVIEWED');

-- CreateEnum
CREATE TYPE "PatientProgramRoundLinkedRecordType" AS ENUM ('SCREENING_ASSESSMENT', 'SERVICE_ONE_ROUTINE', 'SERVICE_ONE_FLOATING_CHART', 'SERVICE_ONE_DREAM_CARD', 'SERVICE_ONE_CONFIDENCE', 'GOAL_PLAN');

-- AlterTable
ALTER TABLE "ScreeningAssessment" ADD COLUMN     "patientProgramId" UUID;

-- AlterTable
ALTER TABLE "PatientFinalAssessment" ADD COLUMN     "hba1c" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "PatientProgramRoundActivity" (
    "id" UUID NOT NULL,
    "patientProgramId" UUID NOT NULL,
    "patientHospitalRelationshipId" UUID NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "toolCode" "PatientProgramRoundToolCode" NOT NULL,
    "source" "PatientProgramRoundActivitySource" NOT NULL,
    "mode" "PatientProgramRoundActivityMode" NOT NULL,
    "linkedRecordType" "PatientProgramRoundLinkedRecordType",
    "linkedRecordId" UUID,
    "performedAt" TIMESTAMPTZ(3) NOT NULL,
    "recordedByUserId" UUID NOT NULL,
    "submissionNonce" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientProgramRoundActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientProgramRoundVitals" (
    "id" UUID NOT NULL,
    "patientProgramId" UUID NOT NULL,
    "patientHospitalRelationshipId" UUID NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "serviceDate" DATE NOT NULL,
    "weight" DOUBLE PRECISION,
    "heightCm" DOUBLE PRECISION,
    "waistCircumference" DOUBLE PRECISION,
    "systolicBloodPressure" DOUBLE PRECISION,
    "diastolicBloodPressure" DOUBLE PRECISION,
    "bloodSugar" DOUBLE PRECISION,
    "recordedByUserId" UUID NOT NULL,
    "submissionNonce" UUID NOT NULL,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientProgramRoundVitals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PatientProgramRoundActivity_submissionNonce_key" ON "PatientProgramRoundActivity"("submissionNonce");

-- CreateIndex
CREATE INDEX "PatientProgramRoundActivity_patientProgramId_roundNumber_idx" ON "PatientProgramRoundActivity"("patientProgramId", "roundNumber");

-- CreateIndex
CREATE INDEX "PatientProgramRoundActivity_recordedByUserId_performedAt_idx" ON "PatientProgramRoundActivity"("recordedByUserId", "performedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PatientProgramRoundActivity_patientProgramId_roundNumber_to_key" ON "PatientProgramRoundActivity"("patientProgramId", "roundNumber", "toolCode");

-- CreateIndex
CREATE UNIQUE INDEX "PatientProgramRoundVitals_submissionNonce_key" ON "PatientProgramRoundVitals"("submissionNonce");

-- CreateIndex
CREATE INDEX "PatientProgramRoundVitals_recordedByUserId_recordedAt_idx" ON "PatientProgramRoundVitals"("recordedByUserId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PatientProgramRoundVitals_patientProgramId_roundNumber_key" ON "PatientProgramRoundVitals"("patientProgramId", "roundNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ScreeningAssessment_patientProgramId_key" ON "ScreeningAssessment"("patientProgramId");

-- CreateIndex
CREATE UNIQUE INDEX "ScreeningAssessment_patientProgramId_patientHospitalRelatio_key" ON "ScreeningAssessment"("patientProgramId", "patientHospitalRelationshipId");

-- AddForeignKey
ALTER TABLE "ScreeningAssessment" ADD CONSTRAINT "ScreeningAssessment_patientProgramId_patientHospitalRelati_fkey" FOREIGN KEY ("patientProgramId", "patientHospitalRelationshipId") REFERENCES "PatientProgram"("id", "patientHospitalRelationshipId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientProgramRoundActivity" ADD CONSTRAINT "PatientProgramRoundActivity_patientProgramId_patientHospit_fkey" FOREIGN KEY ("patientProgramId", "patientHospitalRelationshipId") REFERENCES "PatientProgram"("id", "patientHospitalRelationshipId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientProgramRoundActivity" ADD CONSTRAINT "PatientProgramRoundActivity_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientProgramRoundVitals" ADD CONSTRAINT "PatientProgramRoundVitals_patientProgramId_patientHospital_fkey" FOREIGN KEY ("patientProgramId", "patientHospitalRelationshipId") REFERENCES "PatientProgram"("id", "patientHospitalRelationshipId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientProgramRoundVitals" ADD CONSTRAINT "PatientProgramRoundVitals_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Phase A (WB-DF-01..05): value and shape guards that Prisma cannot express.
-- Rounds 1-6 only; rounds 3-6 vitals stay on PatientFollowup, so the vitals table accepts rounds 1-2.
ALTER TABLE "PatientProgramRoundActivity"
    ADD CONSTRAINT "PatientProgramRoundActivity_round_range_check"
    CHECK ("roundNumber" BETWEEN 1 AND 6);

-- A linked record pointer is all-or-nothing. Tools without a domain record yet (WB-PD-01) may be
-- ledgered later with no pointer, so RECORDED/REVIEWED link requirements are enforced by the service.
ALTER TABLE "PatientProgramRoundActivity"
    ADD CONSTRAINT "PatientProgramRoundActivity_linked_record_check"
    CHECK (("linkedRecordType" IS NULL) = ("linkedRecordId" IS NULL));

ALTER TABLE "PatientProgramRoundVitals"
    ADD CONSTRAINT "PatientProgramRoundVitals_round_range_check"
    CHECK ("roundNumber" IN (1, 2));

ALTER TABLE "PatientProgramRoundVitals"
    ADD CONSTRAINT "PatientProgramRoundVitals_measurement_range_check"
    CHECK (
        ("weight" IS NULL OR ("weight" > 0 AND "weight" <= 1000000))
        AND ("heightCm" IS NULL OR ("heightCm" > 0 AND "heightCm" <= 1000000))
        AND ("waistCircumference" IS NULL OR ("waistCircumference" > 0 AND "waistCircumference" <= 1000000))
        AND ("systolicBloodPressure" IS NULL OR ("systolicBloodPressure" > 0 AND "systolicBloodPressure" <= 1000000))
        AND ("diastolicBloodPressure" IS NULL OR ("diastolicBloodPressure" > 0 AND "diastolicBloodPressure" <= 1000000))
        AND ("bloodSugar" IS NULL OR ("bloodSugar" >= 0 AND "bloodSugar" <= 1000000))
    );

ALTER TABLE "PatientProgramRoundVitals"
    ADD CONSTRAINT "PatientProgramRoundVitals_has_measurement_check"
    CHECK (
        "weight" IS NOT NULL OR "heightCm" IS NOT NULL OR "waistCircumference" IS NOT NULL
        OR "systolicBloodPressure" IS NOT NULL OR "diastolicBloodPressure" IS NOT NULL
        OR "bloodSugar" IS NOT NULL
    );

ALTER TABLE "PatientFinalAssessment"
    ADD CONSTRAINT "PatientFinalAssessment_hba1c_range_check"
    CHECK ("hba1c" IS NULL OR ("hba1c" > 0 AND "hba1c" <= 1000000));
