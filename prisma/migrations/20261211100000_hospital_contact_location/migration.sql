-- Hospital Contact gains one optional map point, set by the Hospital OWNER.
-- Existing rows intentionally stay NULL; there is no backfill or geocoding.
ALTER TABLE "HospitalContact"
ADD COLUMN "latitude" DECIMAL(9,6),
ADD COLUMN "longitude" DECIMAL(9,6);

-- A point is set or cleared as a whole.
ALTER TABLE "HospitalContact"
ADD CONSTRAINT "HospitalContact_location_pair"
CHECK (("latitude" IS NULL) = ("longitude" IS NULL));

-- Thailand's bounding box (also enforced by the application parser); it rejects swapped lat/lng.
ALTER TABLE "HospitalContact"
ADD CONSTRAINT "HospitalContact_location_bounds"
CHECK (
  "latitude" IS NULL
  OR ("latitude" BETWEEN 5.5 AND 20.5 AND "longitude" BETWEEN 97.3 AND 105.7)
);
