-- Phase N1 (ADR-0017 amendment). Additive only: existing rows keep NULL in every new column; no backfill.

-- Retirement (N1-D1): the actor, time and reason exist exactly while the Hospital is RETIRED.
ALTER TABLE "Hospital"
  ADD COLUMN "retiredAt" TIMESTAMPTZ(3),
  ADD COLUMN "retiredByUserId" UUID REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD COLUMN "retiredReason" VARCHAR(500),
  ADD CONSTRAINT "Hospital_retirement_consistency" CHECK (
    ("status" = 'RETIRED' AND "retiredAt" IS NOT NULL AND "retiredByUserId" IS NOT NULL
      AND "retiredReason" IS NOT NULL AND length(btrim("retiredReason")) > 0) OR
    ("status" <> 'RETIRED' AND "retiredAt" IS NULL AND "retiredByUserId" IS NULL AND "retiredReason" IS NULL)
  );

-- Append-only retire/restore history: the Hospital columns are cleared on restore, the reasons stay here.
-- Deletion is refused except inside the synthetic demo reset (same setting as migration 20261030130000).
CREATE TYPE "HospitalRetirementEventKind" AS ENUM ('RETIRED', 'RESTORED');
CREATE TABLE "HospitalRetirementEvent" (
  "id" UUID PRIMARY KEY,
  "hospitalId" UUID NOT NULL REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "kind" "HospitalRetirementEventKind" NOT NULL,
  "reason" VARCHAR(500) NOT NULL CHECK (length(btrim("reason")) > 0),
  "actorUserId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "HospitalRetirementEvent_hospitalId_createdAt_idx" ON "HospitalRetirementEvent" ("hospitalId", "createdAt");

CREATE FUNCTION public.guard_hospital_retirement_event_history() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('demi.service_area_purge', true) = 'demo-reset' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Hospital retirement history is append-only' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER "HospitalRetirementEvent_append_only"
BEFORE UPDATE OR DELETE ON "HospitalRetirementEvent"
FOR EACH ROW EXECUTE FUNCTION public.guard_hospital_retirement_event_history();

-- Idempotent registration (N1-D5): one Hospital per client submission nonce.
ALTER TABLE "Hospital"
  ADD COLUMN "registrationNonce" UUID,
  ADD COLUMN "registeredByUserId" UUID REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE UNIQUE INDEX "Hospital_registrationNonce_key" ON "Hospital" ("registrationNonce");

-- Network role consistency: an area's Parent has role PARENT and its Child role CHILD. The role rows are
-- locked FOR SHARE so a concurrent role change or clear waits for (and then sees) the new area.
CREATE FUNCTION public.guard_hospital_service_area_roles() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  parent_kind "HospitalServiceAreaFacilityKind";
  child_kind "HospitalServiceAreaFacilityKind";
BEGIN
  SELECT "kind" INTO parent_kind FROM "HospitalServiceAreaEligibility"
    WHERE "hospitalId" = NEW."parentHospitalId" FOR SHARE;
  SELECT "kind" INTO child_kind FROM "HospitalServiceAreaEligibility"
    WHERE "hospitalId" = NEW."childHospitalId" FOR SHARE;
  IF parent_kind IS DISTINCT FROM 'PARENT' OR child_kind IS DISTINCT FROM 'CHILD' THEN
    RAISE EXCEPTION 'Service area requires a PARENT and a CHILD network role' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "HospitalServiceArea_network_roles"
BEFORE INSERT ON "HospitalServiceArea"
FOR EACH ROW EXECUTE FUNCTION public.guard_hospital_service_area_roles();

-- A role cannot change or be cleared while an active area references the Hospital in that role.
CREATE FUNCTION public.guard_hospital_network_role_in_use() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."hospitalId" = OLD."hospitalId" AND NEW."kind" = OLD."kind" THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM "HospitalServiceArea"
    WHERE "endedAt" IS NULL AND (
      (OLD."kind" = 'PARENT' AND "parentHospitalId" = OLD."hospitalId") OR
      (OLD."kind" = 'CHILD' AND "childHospitalId" = OLD."hospitalId")
    )
  ) THEN
    RAISE EXCEPTION 'Network role is referenced by an active service area' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "HospitalServiceAreaEligibility_in_use"
BEFORE UPDATE OR DELETE ON "HospitalServiceAreaEligibility"
FOR EACH ROW EXECUTE FUNCTION public.guard_hospital_network_role_in_use();
