-- Existing rows keep their rollout metadata for historical inspection.
-- New notification intents no longer require a rollout generation.
ALTER TABLE "AppointmentLineNotification"
ALTER COLUMN "rolloutGeneration" DROP NOT NULL;
