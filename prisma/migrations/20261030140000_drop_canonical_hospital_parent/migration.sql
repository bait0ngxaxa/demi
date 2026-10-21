-- ADR-0017: Hospital Master is retired. The canonical parent link granted nothing since ADR-0016 and had no
-- remaining reader; network roles (HospitalServiceAreaEligibility) and HospitalServiceArea are the only structure.
-- Dropping the column also drops "Hospital_parentHospitalId_fkey".
ALTER TABLE "Hospital" DROP COLUMN "parentHospitalId";
