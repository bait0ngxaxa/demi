-- Preserve the direct actor reference for historical audit events.
ALTER TABLE "AuditEvent" DROP CONSTRAINT "AuditEvent_actorUserId_fkey";

ALTER TABLE "AuditEvent"
ADD CONSTRAINT "AuditEvent_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
