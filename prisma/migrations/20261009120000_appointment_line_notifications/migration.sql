CREATE TYPE "AppointmentLineNotificationEventKind" AS ENUM ('CREATED', 'RESCHEDULED', 'CANCELLED');
CREATE TYPE "AppointmentLineNotificationState" AS ENUM (
  'PENDING', 'CLAIMED', 'RETRY_SCHEDULED', 'PROVIDER_ACCEPTED', 'SUPPRESSED', 'PERMANENT_FAILURE', 'OUTCOME_UNKNOWN'
);
CREATE TYPE "AppointmentLineNotificationOutcome" AS ENUM (
  'ACCEPTED', 'DUPLICATE_ACCEPTED', 'TRANSIENT_HTTP_FAILURE', 'AMBIGUOUS_TRANSPORT_FAILURE',
  'PERMANENT_HTTP_FAILURE', 'RETRY_WINDOW_EXPIRED', 'STALE_SOURCE', 'AUTHORITY_CHANGED',
  'OPT_IN_REVOKED', 'LINE_INELIGIBLE', 'ROLLOUT_CLOSED', 'OPT_IN_REQUIRED_AT_SOURCE',
  'PATIENT_INELIGIBLE_AT_SOURCE', 'LINE_BINDING_INELIGIBLE_AT_SOURCE', 'PROCESS_OUTCOME_UNKNOWN'
);

CREATE UNIQUE INDEX "PatientAppointment_id_patientHospitalRelationshipId_key"
  ON "PatientAppointment"("id", "patientHospitalRelationshipId");

CREATE TABLE "LineAppointmentNotificationPreference" (
  "userId" UUID NOT NULL,
  "bindingId" UUID NOT NULL,
  "bindingLifecycleVersion" INTEGER NOT NULL,
  "preferenceVersion" INTEGER NOT NULL DEFAULT 1,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "changedAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "LineAppointmentNotificationPreference_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "LineAppointmentNotificationPreference_version_check"
    CHECK ("bindingLifecycleVersion" > 0 AND "preferenceVersion" > 0),
  CONSTRAINT "LineAppointmentNotificationPreference_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "LineAppointmentNotificationPreference_bindingId_fkey"
    FOREIGN KEY ("bindingId") REFERENCES "LineAccountBinding"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "LineAppointmentNotificationPreference_bindingId_key"
  ON "LineAppointmentNotificationPreference"("bindingId");

CREATE TABLE "AppointmentLineNotification" (
  "id" UUID NOT NULL,
  "appointmentId" UUID NOT NULL,
  "patientHospitalRelationshipId" UUID NOT NULL,
  "sourceUpdatedAt" TIMESTAMPTZ(3) NOT NULL,
  "eventKind" "AppointmentLineNotificationEventKind" NOT NULL,
  "recipientUserId" UUID,
  "bindingId" UUID,
  "bindingLifecycleVersion" INTEGER,
  "preferenceVersion" INTEGER,
  "rolloutGeneration" UUID NOT NULL,
  "state" "AppointmentLineNotificationState" NOT NULL DEFAULT 'PENDING',
  "dueAt" TIMESTAMPTZ(3) NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "retryKey" UUID NOT NULL,
  "leaseToken" UUID,
  "leaseExpiresAt" TIMESTAMPTZ(3),
  "firstAttemptAt" TIMESTAMPTZ(3),
  "lastAttemptAt" TIMESTAMPTZ(3),
  "safeOutcome" "AppointmentLineNotificationOutcome",
  "terminalAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "AppointmentLineNotification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AppointmentLineNotification_appointmentId_sourceUpdatedAt_key" UNIQUE ("appointmentId", "sourceUpdatedAt"),
  CONSTRAINT "AppointmentLineNotification_retryKey_key" UNIQUE ("retryKey"),
  CONSTRAINT "AppointmentLineNotification_leaseToken_key" UNIQUE ("leaseToken"),
  CONSTRAINT "AppointmentLineNotification_attempt_count_check"
    CHECK ("attemptCount" BETWEEN 0 AND 3),
  CONSTRAINT "AppointmentLineNotification_generation_scope_check"
    CHECK (
      ("bindingId" IS NULL AND "bindingLifecycleVersion" IS NULL AND "preferenceVersion" IS NULL)
      OR ("bindingId" IS NOT NULL AND "recipientUserId" IS NOT NULL
        AND "bindingLifecycleVersion" > 0 AND "preferenceVersion" > 0)
    ),
  CONSTRAINT "AppointmentLineNotification_deliverable_state_check"
    CHECK ("state" NOT IN ('PENDING', 'CLAIMED', 'RETRY_SCHEDULED') OR
      ("recipientUserId" IS NOT NULL AND "bindingId" IS NOT NULL
        AND "bindingLifecycleVersion" > 0 AND "preferenceVersion" > 0)),
  CONSTRAINT "AppointmentLineNotification_lease_check"
    CHECK (("state" = 'CLAIMED' AND "leaseToken" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL)
      OR ("state" <> 'CLAIMED' AND "leaseToken" IS NULL AND "leaseExpiresAt" IS NULL)),
  CONSTRAINT "AppointmentLineNotification_terminal_check"
    CHECK (("state" IN ('PROVIDER_ACCEPTED', 'SUPPRESSED', 'PERMANENT_FAILURE', 'OUTCOME_UNKNOWN') AND "terminalAt" IS NOT NULL)
      OR ("state" IN ('PENDING', 'CLAIMED', 'RETRY_SCHEDULED') AND "terminalAt" IS NULL)),
  CONSTRAINT "AppointmentLineNotification_first_attempt_check"
    CHECK (("attemptCount" = 0 AND "firstAttemptAt" IS NULL AND "lastAttemptAt" IS NULL)
      OR ("attemptCount" > 0 AND "firstAttemptAt" IS NOT NULL AND "lastAttemptAt" IS NOT NULL)),
  CONSTRAINT "AppointmentLineNotification_appointmentId_patientHospitalR_fkey"
    FOREIGN KEY ("appointmentId", "patientHospitalRelationshipId")
      REFERENCES "PatientAppointment"("id", "patientHospitalRelationshipId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "AppointmentLineNotification_recipientUserId_fkey"
    FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AppointmentLineNotification_bindingId_fkey"
    FOREIGN KEY ("bindingId") REFERENCES "LineAccountBinding"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "AppointmentLineNotification_state_dueAt_idx"
  ON "AppointmentLineNotification"("state", "dueAt");
CREATE INDEX "AppointmentLineNotification_state_leaseExpiresAt_idx"
  ON "AppointmentLineNotification"("state", "leaseExpiresAt");
CREATE INDEX "AppointmentLineNotification_state_terminalAt_idx"
  ON "AppointmentLineNotification"("state", "terminalAt");

CREATE TABLE "AppointmentLineNotificationWorkerState" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "lastInvocationAt" TIMESTAMPTZ(3) NOT NULL DEFAULT '1970-01-01T00:00:00.000Z',
  CONSTRAINT "AppointmentLineNotificationWorkerState_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AppointmentLineNotificationWorkerState_singleton_check" CHECK ("id" = 1)
);

INSERT INTO "AppointmentLineNotificationWorkerState" ("id") VALUES (1);

ALTER TABLE "LineAppointmentNotificationPreference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AppointmentLineNotification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AppointmentLineNotificationWorkerState" ENABLE ROW LEVEL SECURITY;
