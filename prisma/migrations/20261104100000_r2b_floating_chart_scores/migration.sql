-- Phase R2b (Product Owner, 2026-10-22): booklet floating-chart scores.
-- Existing summary-only rows remain valid legacy records with all scores NULL.
ALTER TABLE "PatientProgramServiceOneFloatingChart"
    ADD COLUMN "familyScore" SMALLINT,
    ADD COLUMN "eatingScore" SMALLINT,
    ADD COLUMN "workScore" SMALLINT,
    ADD COLUMN "healthScore" SMALLINT,
    ADD COLUMN "financeScore" SMALLINT,
    ADD COLUMN "travelScore" SMALLINT,
    ADD COLUMN "exerciseScore" SMALLINT,
    ADD COLUMN "wellbeingScore" SMALLINT;

ALTER TABLE "PatientProgramServiceOneFloatingChart"
    ADD CONSTRAINT "PatientProgramServiceOneFloatingChart_scores_check"
    CHECK (
        (
            "familyScore" IS NULL
            AND "eatingScore" IS NULL
            AND "workScore" IS NULL
            AND "healthScore" IS NULL
            AND "financeScore" IS NULL
            AND "travelScore" IS NULL
            AND "exerciseScore" IS NULL
            AND "wellbeingScore" IS NULL
        )
        OR (
            "familyScore" IS NOT NULL
            AND "eatingScore" IS NOT NULL
            AND "workScore" IS NOT NULL
            AND "healthScore" IS NOT NULL
            AND "financeScore" IS NOT NULL
            AND "travelScore" IS NOT NULL
            AND "exerciseScore" IS NOT NULL
            AND "wellbeingScore" IS NOT NULL
            AND
            "familyScore" BETWEEN -5 AND 5
            AND "eatingScore" BETWEEN -5 AND 5
            AND "workScore" BETWEEN -5 AND 5
            AND "healthScore" BETWEEN -5 AND 5
            AND "financeScore" BETWEEN -5 AND 5
            AND "travelScore" BETWEEN -5 AND 5
            AND "exerciseScore" BETWEEN -5 AND 5
            AND "wellbeingScore" BETWEEN -5 AND 5
        )
    );
