-- Customer decision D7 (WB-DF-17): staff-entered CVD risk score in percent, optional, at Baseline
-- (Before) and Final Assessment (After). Existing rows stay NULL (not recorded).

-- AlterTable
ALTER TABLE "PatientBaseline" ADD COLUMN     "cvdRiskScore" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "PatientFinalAssessment" ADD COLUMN     "cvdRiskScore" DOUBLE PRECISION;

ALTER TABLE "PatientBaseline"
    ADD CONSTRAINT "PatientBaseline_cvdRiskScore_check"
        CHECK ("cvdRiskScore" IS NULL OR "cvdRiskScore" BETWEEN 0 AND 100);

ALTER TABLE "PatientFinalAssessment"
    ADD CONSTRAINT "PatientFinalAssessment_cvdRiskScore_check"
        CHECK ("cvdRiskScore" IS NULL OR "cvdRiskScore" BETWEEN 0 AND 100);
