-- Tighten the relationship phone CHECK while keeping the old constraint active
-- until PostgreSQL validates every existing value against the new format.
ALTER TABLE "HospitalMembership"
  ADD CONSTRAINT "HospitalMembership_contactPhone_check_tightened"
  CHECK ("contactPhone" IS NULL OR "contactPhone" ~ '^(0[689][0-9]{8}|0[2-57][0-9]{7})$')
  NOT VALID;
ALTER TABLE "HospitalMembership"
  VALIDATE CONSTRAINT "HospitalMembership_contactPhone_check_tightened";
ALTER TABLE "HospitalMembership"
  DROP CONSTRAINT "HospitalMembership_contactPhone_check";

ALTER TABLE "OsmHospitalRelationship"
  ADD CONSTRAINT "OsmHospitalRelationship_contactPhone_check_tightened"
  CHECK ("contactPhone" IS NULL OR "contactPhone" ~ '^(0[689][0-9]{8}|0[2-57][0-9]{7})$')
  NOT VALID;
ALTER TABLE "OsmHospitalRelationship"
  VALIDATE CONSTRAINT "OsmHospitalRelationship_contactPhone_check_tightened";
ALTER TABLE "OsmHospitalRelationship"
  DROP CONSTRAINT "OsmHospitalRelationship_contactPhone_check";
