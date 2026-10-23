-- Rename the existing enum label in place so persisted appointments retain their value.
ALTER TYPE "AppointmentType" RENAME VALUE 'CONSULTATION' TO 'EDUCATION';

-- PostgreSQL makes an added enum value available after the migration transaction commits.
ALTER TYPE "AppointmentType" ADD VALUE 'ASSESSMENT' BEFORE 'EDUCATION';
