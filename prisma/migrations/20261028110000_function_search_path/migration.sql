-- Supabase advisor function_search_path_mutable: pin search_path on every public function.
-- Only the function configuration changes; bodies and trigger bindings are untouched.
ALTER FUNCTION public.guard_caregiver_appointment_grant_update() SET search_path = pg_catalog, public;
ALTER FUNCTION public.personal_medication_guard_update() SET search_path = pg_catalog, public;
ALTER FUNCTION public.medication_schedule_guard_write() SET search_path = pg_catalog, public;
ALTER FUNCTION public.prevent_workforce_ended_restore() SET search_path = pg_catalog, public;
ALTER FUNCTION public.enforce_support_report_status_transition() SET search_path = pg_catalog, public;
ALTER FUNCTION public.guard_patient_hospital_relationship_end() SET search_path = pg_catalog, public;
