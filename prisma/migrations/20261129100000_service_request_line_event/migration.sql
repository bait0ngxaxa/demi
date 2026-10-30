-- ADR-0023 (SR-B): an อสม. hears about a new service request. A new enum value cannot be used in the
-- transaction that adds it, so the source column and CHECK follow in the next migration.
ALTER TYPE "AppointmentLineNotificationEventKind" ADD VALUE 'OSM_SERVICE_REQUESTED';
