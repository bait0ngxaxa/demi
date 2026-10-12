-- Workbook DoD (BF-GAP-WB-00) BR-01: date the Final Assessment was actually performed.
-- Nullable so assessments recorded before this change remain valid history;
-- the application requires it for every new Final Assessment.
ALTER TABLE "PatientFinalAssessment" ADD COLUMN "serviceDate" DATE;
