CREATE TYPE "NotificationSchedulerTickStatus" AS ENUM ('COMPLETED', 'FAILED', 'DEFERRED');

ALTER TABLE "NotificationSchedulerState"
ADD COLUMN "lastTickStatus" "NotificationSchedulerTickStatus";

UPDATE "NotificationSchedulerState"
SET "lastTickStatus" = CASE
    WHEN "lastTickCompletedAt" IS NOT NULL THEN 'COMPLETED'::"NotificationSchedulerTickStatus"
    ELSE NULL
END;
