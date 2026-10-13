ALTER TABLE "PatientHospitalProfile"
ALTER COLUMN "addressText" TYPE VARCHAR(2000),
ADD COLUMN "houseNumber" VARCHAR(200),
ADD COLUMN "villageNumber" VARCHAR(200),
ADD COLUMN "villageName" VARCHAR(200),
ADD COLUMN "soi" VARCHAR(200),
ADD COLUMN "road" VARCHAR(200),
ADD COLUMN "province" VARCHAR(200),
ADD COLUMN "district" VARCHAR(200),
ADD COLUMN "subdistrict" VARCHAR(200),
ADD COLUMN "postalCode" VARCHAR(5),
ADD COLUMN "emergencyContactRelationship" VARCHAR(200);

-- A profile uses either structured components or an explicit free-text address.
ALTER TABLE "PatientHospitalProfile" ADD CONSTRAINT "PatientHospitalProfile_address_representation_check"
CHECK ("addressText" IS NULL OR (
  "houseNumber" IS NULL AND "villageNumber" IS NULL AND "villageName" IS NULL
  AND "soi" IS NULL AND "road" IS NULL AND "province" IS NULL
  AND "district" IS NULL AND "subdistrict" IS NULL AND "postalCode" IS NULL
));
