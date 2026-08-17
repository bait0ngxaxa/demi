-- Phase 10B.0 adds a bounded, nullable Patient Profile read subset.
ALTER TABLE "PatientProfile"
    ADD COLUMN "dateOfBirth" DATE,
    ADD COLUMN "gender" VARCHAR(64),
    ADD COLUMN "phoneNumber" VARCHAR(32),
    ADD COLUMN "addressText" VARCHAR(500),
    ADD COLUMN "emergencyContactName" VARCHAR(200),
    ADD COLUMN "emergencyContactPhone" VARCHAR(32),
    ADD COLUMN "occupation" VARCHAR(200),
    ADD COLUMN "educationLevel" VARCHAR(200);
