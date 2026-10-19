ALTER TYPE "MedicationLineReminderOutcome" ADD VALUE 'REMINDERS_DISABLED';

CREATE TABLE "NotificationSchedulerState" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "lastTickCompletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "NotificationSchedulerState_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "NotificationSchedulerState_singleton_check" CHECK ("id" = 1)
);

INSERT INTO "NotificationSchedulerState" ("id") VALUES (1);

ALTER TABLE "NotificationSchedulerState" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "NotificationSchedulerState" FROM PUBLIC;
