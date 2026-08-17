-- Preserve the immutable identity of the original Appointment create request.
-- Existing Phase 9B.0 rows remain nullable because their original request may
-- no longer be reconstructable after a reschedule or status transition.
ALTER TABLE "PatientAppointment"
ADD COLUMN "creationRequestHash" VARCHAR(64);
