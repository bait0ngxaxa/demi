-- Keep the reason non-empty for whitespace beyond the space character as well.
ALTER TABLE "PatientHospitalRelationship"
    DROP CONSTRAINT "PatientHospitalRelationship_end_check",
    ADD CONSTRAINT "PatientHospitalRelationship_end_check"
        CHECK (("endedAt" IS NULL AND "endedByUserId" IS NULL AND "endReason" IS NULL)
            OR ("endedAt" IS NOT NULL
                AND "endedByUserId" IS NOT NULL
                AND "endReason" IS NOT NULL
                AND "endReason" ~ '[^[:space:]]'));
