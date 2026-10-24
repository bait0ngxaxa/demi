-- Relationship-local contact phones; legacy records intentionally remain NULL.
ALTER TABLE "HospitalMembership" ADD COLUMN "contactPhone" VARCHAR(16),
  ADD CONSTRAINT "HospitalMembership_contactPhone_check"
  CHECK ("contactPhone" IS NULL OR "contactPhone" ~ '^(0[689][0-9]{8}|0[0-9]{8})$');
ALTER TABLE "OsmHospitalRelationship" ADD COLUMN "contactPhone" VARCHAR(16),
  ADD CONSTRAINT "OsmHospitalRelationship_contactPhone_check"
  CHECK ("contactPhone" IS NULL OR "contactPhone" ~ '^(0[689][0-9]{8}|0[0-9]{8})$');
