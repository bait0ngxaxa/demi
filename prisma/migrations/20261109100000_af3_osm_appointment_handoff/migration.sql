-- AF-3: add enum labels first so PostgreSQL can commit them before constraints use them.
ALTER TYPE "AppointmentLineNotificationEventKind" ADD VALUE 'OSM_PATIENT_ASSIGNED';
ALTER TYPE "AppointmentLineNotificationEventKind" ADD VALUE 'OSM_APPOINTMENT_ASSIGNED';
ALTER TYPE "AppointmentLineNotificationEventKind" ADD VALUE 'OSM_RESCHEDULE_REQUESTED';
ALTER TYPE "AppointmentLineNotificationRecipientKind" ADD VALUE 'STAFF_CREATOR';
