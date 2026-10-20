-- Additive only. No inference/backfill from canonical hierarchy.
CREATE TYPE "HospitalServiceAreaFacilityKind" AS ENUM ('PARENT', 'CHILD');
CREATE TABLE "HospitalServiceAreaEligibility" (
  "hospitalId" UUID PRIMARY KEY REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "kind" "HospitalServiceAreaFacilityKind" NOT NULL,
  "sourceReference" VARCHAR(255) NOT NULL CHECK (length(btrim("sourceReference")) > 0),
  "verifiedAt" TIMESTAMPTZ(3) NOT NULL
);
CREATE TABLE "HospitalServiceArea" (
  "id" UUID PRIMARY KEY,
  "parentHospitalId" UUID NOT NULL REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "childHospitalId" UUID NOT NULL REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "createdByUserId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMPTZ(3),
  "endedByUserId" UUID REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "endReason" VARCHAR(500),
  CONSTRAINT "HospitalServiceArea_distinct_facilities" CHECK ("parentHospitalId" <> "childHospitalId"),
  CONSTRAINT "HospitalServiceArea_lifecycle" CHECK (
    ("endedAt" IS NULL AND "endedByUserId" IS NULL AND "endReason" IS NULL) OR
    ("endedAt" IS NOT NULL AND "endedAt" >= "createdAt" AND "endedByUserId" IS NOT NULL
      AND "endReason" IS NOT NULL AND length(btrim("endReason")) > 0)
  )
);
CREATE UNIQUE INDEX "HospitalServiceArea_active_child_key" ON "HospitalServiceArea" ("childHospitalId") WHERE "endedAt" IS NULL;
CREATE INDEX "HospitalServiceArea_parentHospitalId_endedAt_id_idx" ON "HospitalServiceArea" ("parentHospitalId", "endedAt", "id");
CREATE INDEX "HospitalServiceArea_childHospitalId_parentHospitalId_idx" ON "HospitalServiceArea" ("childHospitalId", "parentHospitalId");

CREATE FUNCTION public.guard_hospital_service_area_history() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Service area history cannot be deleted' USING ERRCODE = '23514';
  END IF;
  IF OLD."endedAt" IS NOT NULL OR
     NEW."id" IS DISTINCT FROM OLD."id" OR
     NEW."parentHospitalId" IS DISTINCT FROM OLD."parentHospitalId" OR
     NEW."childHospitalId" IS DISTINCT FROM OLD."childHospitalId" OR
     NEW."createdAt" IS DISTINCT FROM OLD."createdAt" OR
     NEW."createdByUserId" IS DISTINCT FROM OLD."createdByUserId" THEN
    RAISE EXCEPTION 'Service area history is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "HospitalServiceArea_immutable_history"
BEFORE UPDATE OR DELETE ON "HospitalServiceArea"
FOR EACH ROW EXECUTE FUNCTION public.guard_hospital_service_area_history();
