-- Owner decision 2026-11-17: a Baseline is editable until a Program links it as its initial
-- Baseline, then immutable. updatedAt is the optimistic-concurrency version of an edit.
-- Forward-only; the test phase has no data to preserve, so existing rows take now().

-- AlterTable
ALTER TABLE "PatientBaseline" ADD COLUMN     "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
