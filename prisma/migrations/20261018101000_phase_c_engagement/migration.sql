CREATE TYPE "SupportReportCategory" AS ENUM ('BUG', 'ACCESS', 'CONTENT', 'OTHER');
CREATE TYPE "SupportReportStatus" AS ENUM ('NEW', 'ACKNOWLEDGED', 'RESOLVED');
CREATE TYPE "MedicationLineReminderState" AS ENUM (
  'PENDING', 'CLAIMED', 'RETRY_SCHEDULED', 'PROVIDER_ACCEPTED', 'SUPPRESSED', 'PERMANENT_FAILURE', 'OUTCOME_UNKNOWN'
);
CREATE TYPE "MedicationLineReminderOutcome" AS ENUM (
  'STALE_SOURCE', 'AUTHORITY_CHANGED', 'OPT_IN_REVOKED', 'LINE_INELIGIBLE', 'TRANSIENT_HTTP_FAILURE',
  'AMBIGUOUS_TRANSPORT_FAILURE', 'PERMANENT_HTTP_FAILURE', 'PROCESS_OUTCOME_UNKNOWN', 'RETRY_WINDOW_EXPIRED'
);

CREATE TABLE "HospitalContentImage" (
  "id" UUID NOT NULL,
  "contentId" UUID NOT NULL,
  "uploadNonce" UUID NOT NULL,
  "storageObjectKey" VARCHAR(512) NOT NULL,
  "mediaType" VARCHAR(32) NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HospitalContentImage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HospitalContentImage_media_type_check" CHECK ("mediaType" IN ('image/jpeg', 'image/png', 'image/webp')),
  CONSTRAINT "HospitalContentImage_byte_size_check" CHECK ("byteSize" BETWEEN 1 AND 8388608),
  CONSTRAINT "HospitalContentImage_sort_order_check" CHECK ("sortOrder" BETWEEN 0 AND 4),
  CONSTRAINT "HospitalContentImage_content_fkey" FOREIGN KEY ("contentId") REFERENCES "HospitalContent"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "HospitalContentImage_storage_object_key_key" ON "HospitalContentImage"("storageObjectKey");
CREATE UNIQUE INDEX "HospitalContentImage_content_nonce_key" ON "HospitalContentImage"("contentId", "uploadNonce");
CREATE UNIQUE INDEX "HospitalContentImage_content_order_key" ON "HospitalContentImage"("contentId", "sortOrder");
CREATE INDEX "HospitalContentImage_content_order_idx" ON "HospitalContentImage"("contentId", "sortOrder", "id");

CREATE TABLE "UserContactSetting" (
  "userId" UUID NOT NULL,
  "email" VARCHAR(320),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "UserContactSetting_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "UserContactSetting_version_check" CHECK ("version" > 0),
  CONSTRAINT "UserContactSetting_email_length_check" CHECK ("email" IS NULL OR char_length("email") BETWEEN 3 AND 320),
  CONSTRAINT "UserContactSetting_user_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE "SupportReport" (
  "id" UUID NOT NULL,
  "hospitalId" UUID NOT NULL,
  "reporterUserId" UUID NOT NULL,
  "statusUpdaterUserId" UUID,
  "category" "SupportReportCategory" NOT NULL,
  "message" VARCHAR(1000) NOT NULL,
  "status" "SupportReportStatus" NOT NULL DEFAULT 'NEW',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "resolvedAt" TIMESTAMPTZ(3),
  CONSTRAINT "SupportReport_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupportReport_message_check" CHECK (char_length(btrim("message")) BETWEEN 1 AND 1000),
  CONSTRAINT "SupportReport_resolution_check" CHECK (("status" = 'RESOLVED') = ("resolvedAt" IS NOT NULL)),
  CONSTRAINT "SupportReport_status_updater_check" CHECK ("status" = 'NEW' OR "statusUpdaterUserId" IS NOT NULL),
  CONSTRAINT "SupportReport_hospital_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "SupportReport_reporter_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "SupportReport_status_updater_fkey" FOREIGN KEY ("statusUpdaterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX "SupportReport_inbox_order_idx" ON "SupportReport"("hospitalId", "status", "createdAt" DESC, "id" DESC);
CREATE INDEX "SupportReport_reporter_order_idx" ON "SupportReport"("reporterUserId", "createdAt" DESC);

CREATE FUNCTION "enforce_support_report_status_transition"() RETURNS TRIGGER AS $$
BEGIN
  IF OLD."status" = 'RESOLVED'
    OR (OLD."status" = 'NEW' AND NEW."status" NOT IN ('NEW', 'ACKNOWLEDGED'))
    OR (OLD."status" = 'ACKNOWLEDGED' AND NEW."status" NOT IN ('ACKNOWLEDGED', 'RESOLVED')) THEN
    RAISE EXCEPTION 'Invalid support report status transition' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "SupportReport_status_transition_trigger"
BEFORE UPDATE OF "status" ON "SupportReport"
FOR EACH ROW EXECUTE FUNCTION "enforce_support_report_status_transition"();

CREATE TABLE "LineMedicationReminderPreference" (
  "userId" UUID NOT NULL,
  "bindingId" UUID NOT NULL,
  "bindingLifecycleVersion" INTEGER NOT NULL,
  "preferenceVersion" INTEGER NOT NULL DEFAULT 1,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "changedAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "LineMedicationReminderPreference_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "LineMedicationReminderPreference_bindingId_key" UNIQUE ("bindingId"),
  CONSTRAINT "LineMedicationReminderPreference_versions_check" CHECK ("bindingLifecycleVersion" > 0 AND "preferenceVersion" > 0),
  CONSTRAINT "LineMedicationReminderPreference_user_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "LineMedicationReminderPreference_binding_fkey" FOREIGN KEY ("bindingId") REFERENCES "LineAccountBinding"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE "MedicationLineReminderNotification" (
  "id" UUID NOT NULL,
  "scheduleId" UUID NOT NULL,
  "personalMedicationId" UUID NOT NULL,
  "localDate" DATE NOT NULL,
  "localTime" TIME(6) NOT NULL,
  "dueAt" TIMESTAMPTZ(3) NOT NULL,
  "sourceUpdatedAt" TIMESTAMPTZ(3) NOT NULL,
  "recipientUserId" UUID,
  "bindingId" UUID,
  "bindingLifecycleVersion" INTEGER,
  "preferenceVersion" INTEGER,
  "state" "MedicationLineReminderState" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "retryKey" UUID NOT NULL DEFAULT gen_random_uuid(),
  "leaseToken" UUID,
  "leaseExpiresAt" TIMESTAMPTZ(3),
  "firstAttemptAt" TIMESTAMPTZ(3),
  "lastAttemptAt" TIMESTAMPTZ(3),
  "safeOutcome" "MedicationLineReminderOutcome",
  "terminalAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "MedicationLineReminderNotification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MedicationLineReminderNotification_retryKey_key" UNIQUE ("retryKey"),
  CONSTRAINT "MedicationLineReminderNotification_leaseToken_key" UNIQUE ("leaseToken"),
  CONSTRAINT "MedicationLineReminderNotification_attempt_count_check" CHECK ("attemptCount" >= 0),
  CONSTRAINT "MedicationLineReminderNotification_source_check" CHECK ("localTime" >= TIME '00:00' AND "localTime" < TIME '24:00'),
  CONSTRAINT "MedicationLineReminderNotification_authority_check" CHECK (
    ("recipientUserId" IS NULL AND "bindingId" IS NULL AND "bindingLifecycleVersion" IS NULL AND "preferenceVersion" IS NULL)
    OR
    ("recipientUserId" IS NOT NULL AND "bindingId" IS NOT NULL AND "bindingLifecycleVersion" > 0 AND "preferenceVersion" > 0)
  ),
  CONSTRAINT "MedicationLineReminderNotification_claim_check" CHECK (
    ("state" = 'CLAIMED' AND "leaseToken" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL)
    OR ("state" <> 'CLAIMED' AND "leaseToken" IS NULL AND "leaseExpiresAt" IS NULL)
  ),
  CONSTRAINT "MedicationLineReminderNotification_terminal_check" CHECK (
    (("state" IN ('PROVIDER_ACCEPTED', 'SUPPRESSED', 'PERMANENT_FAILURE', 'OUTCOME_UNKNOWN')) = ("terminalAt" IS NOT NULL))
  ),
  CONSTRAINT "MedicationLineReminderNotification_recipient_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "MedicationLineReminderNotification_binding_fkey" FOREIGN KEY ("bindingId") REFERENCES "LineAccountBinding"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "MedicationLineReminder_schedule_day_time_key"
  ON "MedicationLineReminderNotification"("scheduleId", "localDate", "localTime");
CREATE INDEX "MedicationLineReminder_state_due_idx"
  ON "MedicationLineReminderNotification"("state", "dueAt");
CREATE INDEX "MedicationLineReminder_state_lease_idx"
  ON "MedicationLineReminderNotification"("state", "leaseExpiresAt");
CREATE INDEX "MedicationLineReminder_state_terminal_idx"
  ON "MedicationLineReminderNotification"("state", "terminalAt");

CREATE TABLE "MedicationLineReminderWorkerState" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "lastInvocationAt" TIMESTAMPTZ(3) NOT NULL DEFAULT '1970-01-01T00:00:00.000Z',
  CONSTRAINT "MedicationLineReminderWorkerState_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MedicationLineReminderWorkerState_singleton_check" CHECK ("id" = 1)
);
INSERT INTO "MedicationLineReminderWorkerState" ("id") VALUES (1);
