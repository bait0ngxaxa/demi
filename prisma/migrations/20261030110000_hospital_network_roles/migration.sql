-- ADR-0015: the network role (PARENT/CHILD) is chosen by Platform ADMIN when registering a
-- Hospital and can be edited later. Actor and time are recorded; no reference text is required.
ALTER TABLE "HospitalServiceAreaEligibility"
  DROP COLUMN "sourceReference",
  ADD COLUMN "classifiedByUserId" UUID REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- One-time bootstrap from the canonical Master placement already stored in the database:
-- no canonical parent => PARENT, canonical parent => CHILD. NULL classifiedByUserId marks
-- this system origin. The table had no writer before, so nothing is overwritten.
INSERT INTO "HospitalServiceAreaEligibility" ("hospitalId", "kind", "verifiedAt", "classifiedByUserId")
SELECT h."id",
       (CASE WHEN h."parentHospitalId" IS NULL THEN 'PARENT' ELSE 'CHILD' END)::"HospitalServiceAreaFacilityKind",
       CURRENT_TIMESTAMP,
       NULL
FROM "Hospital" h
ON CONFLICT ("hospitalId") DO NOTHING;
