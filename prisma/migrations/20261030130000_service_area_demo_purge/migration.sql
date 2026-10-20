-- Synthetic demo reset only: the demo reset deletes demo users, whose service-area history references them.
-- Deletion stays refused unless the same transaction sets demi.service_area_purge = 'demo-reset'
-- (SET LOCAL / set_config(..., true)); the guarded application code never sets it. Updates are unchanged.
CREATE OR REPLACE FUNCTION public.guard_hospital_service_area_history() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_setting('demi.service_area_purge', true) = 'demo-reset' THEN
      RETURN OLD;
    END IF;
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
