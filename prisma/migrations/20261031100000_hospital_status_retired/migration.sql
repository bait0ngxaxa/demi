-- Phase N1: an unclaimed (PENDING_VERIFICATION) Hospital can be withdrawn from the onboarding list.
-- Own migration: PostgreSQL cannot use a new enum value in the transaction that adds it, and the next
-- migration's CHECK refers to it.
ALTER TYPE "HospitalStatus" ADD VALUE 'RETIRED';
