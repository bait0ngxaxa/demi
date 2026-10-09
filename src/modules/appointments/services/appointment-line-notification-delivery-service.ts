import "server-only";

import { randomUUID } from "node:crypto";

import {
  AppointmentLineNotificationOutcome,
  AppointmentLineNotificationState,
  HospitalStatus,
  Prisma,
  Role,
  UserStatus,
  type AppointmentLineNotification,
  type PrismaClient,
} from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import { LineMessagingClient, type LinePushResult } from "@/modules/line/adapters/line-messaging-client";

import {
  APPOINTMENT_LINE_NOTIFICATION_BATCH_SIZE,
  APPOINTMENT_LINE_NOTIFICATION_LEASE_MS,
  APPOINTMENT_LINE_NOTIFICATION_MAX_ATTEMPTS,
  APPOINTMENT_LINE_NOTIFICATION_TERMINAL_RETENTION_MS,
  APPOINTMENT_LINE_NOTIFICATION_TEXT,
  appointmentLineNotificationRetryDelayMs,
  expectedAppointmentStatusForNotification,
  getAppointmentLineNotificationRollout,
  isFreshLineFriendObservation,
  isInsideLineRetryKeyWindow,
  type AppointmentLineNotificationRollout,
} from "../domain/appointment-line-notifications";

type DeliveryDatabase = PrismaClient;
type Claim = AppointmentLineNotification;
type SafeSuppressionOutcome =
  | "STALE_SOURCE"
  | "AUTHORITY_CHANGED"
  | "OPT_IN_REVOKED"
  | "LINE_INELIGIBLE"
  | "ROLLOUT_CLOSED";

type CurrentEligibility =
  | { eligible: true; lineUserId: string }
  | { eligible: false; outcome: SafeSuppressionOutcome };

export type AppointmentLineNotificationDrainResult = {
  claimed: number;
  providerAccepted: number;
  retryScheduled: number;
  suppressed: number;
  permanentFailure: number;
  unknownOutcome: number;
};

export type AppointmentLineNotificationDeliveryDependencies = {
  database?: DeliveryDatabase;
  now?: () => Date;
  rollout?: () => AppointmentLineNotificationRollout;
  push?: (lineUserId: string, text: string, retryKey: string) => Promise<LinePushResult>;
  random?: () => number;
  batchSize?: number;
  logSummary?: (result: AppointmentLineNotificationDrainResult) => void;
};

function databaseOf(dependencies: AppointmentLineNotificationDeliveryDependencies): DeliveryDatabase {
  return dependencies.database ?? getPrisma();
}

function nowOf(dependencies: AppointmentLineNotificationDeliveryDependencies): Date {
  const now = new Date((dependencies.now?.() ?? new Date()).getTime());
  if (Number.isNaN(now.getTime())) throw new Error("Notification time could not be resolved");
  return now;
}

function rolloutOf(dependencies: AppointmentLineNotificationDeliveryDependencies): AppointmentLineNotificationRollout {
  return (dependencies.rollout ?? getAppointmentLineNotificationRollout)();
}

function sameRollout(
  current: AppointmentLineNotificationRollout,
  claimedGeneration: string,
): boolean {
  return current.enabled && current.generation === claimedGeneration;
}

function pushWithLine(
  lineUserId: string,
  text: string,
  retryKey: string,
): Promise<LinePushResult> {
  return new LineMessagingClient().pushText(lineUserId, text, retryKey);
}

async function closeExhaustedLeases(database: DeliveryDatabase, now: Date): Promise<number> {
  const result = await database.appointmentLineNotification.updateMany({
    where: {
      state: AppointmentLineNotificationState.CLAIMED,
      attemptCount: { gte: APPOINTMENT_LINE_NOTIFICATION_MAX_ATTEMPTS },
      leaseExpiresAt: { lte: now },
    },
    data: {
      state: AppointmentLineNotificationState.OUTCOME_UNKNOWN,
      leaseToken: null,
      leaseExpiresAt: null,
      safeOutcome: AppointmentLineNotificationOutcome.PROCESS_OUTCOME_UNKNOWN,
      terminalAt: now,
      updatedAt: now,
    },
  });
  return result.count;
}

async function claimDueNotification(database: DeliveryDatabase, now: Date): Promise<Claim | null> {
  const leaseToken = randomUUID();
  const leaseExpiresAt = new Date(now.getTime() + APPOINTMENT_LINE_NOTIFICATION_LEASE_MS);
  const claimed = await database.$transaction(async (transaction) => transaction.$queryRaw<Claim[]>`
    WITH candidate AS (
      SELECT "id"
      FROM "AppointmentLineNotification"
      WHERE "attemptCount" < ${APPOINTMENT_LINE_NOTIFICATION_MAX_ATTEMPTS}
        AND (
          ("state" IN ('PENDING'::"AppointmentLineNotificationState", 'RETRY_SCHEDULED'::"AppointmentLineNotificationState")
            AND "dueAt" <= ${now})
          OR ("state" = 'CLAIMED'::"AppointmentLineNotificationState" AND "leaseExpiresAt" <= ${now})
        )
      ORDER BY "dueAt" ASC, "createdAt" ASC, "id" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE "AppointmentLineNotification" AS notification
    SET "state" = 'CLAIMED'::"AppointmentLineNotificationState",
        "leaseToken" = ${leaseToken}::uuid,
        "leaseExpiresAt" = ${leaseExpiresAt},
        "terminalAt" = NULL,
        "updatedAt" = ${now}
    FROM candidate
    WHERE notification."id" = candidate."id"
    RETURNING notification.*
  `, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  return claimed[0] ?? null;
}

async function currentEligibility(
  database: DeliveryDatabase,
  notification: Claim,
  now: Date,
): Promise<CurrentEligibility> {
  if (
    !notification.recipientUserId || !notification.bindingId ||
    notification.bindingLifecycleVersion === null || notification.preferenceVersion === null
  ) {
    return { eligible: false, outcome: AppointmentLineNotificationOutcome.AUTHORITY_CHANGED };
  }

  return database.$transaction(async (transaction) => {
    const appointment = await transaction.patientAppointment.findUnique({
      where: { id: notification.appointmentId },
      select: {
        id: true,
        patientHospitalRelationshipId: true,
        updatedAt: true,
        status: true,
        patientHospitalRelationship: {
          select: {
            id: true,
            hospital: { select: { status: true } },
            patientProfile: {
              select: {
                person: {
                  select: {
                    user: {
                      select: {
                        id: true,
                        status: true,
                        roles: { select: { role: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (
      !appointment ||
      appointment.patientHospitalRelationshipId !== notification.patientHospitalRelationshipId ||
      appointment.patientHospitalRelationship.id !== notification.patientHospitalRelationshipId ||
      appointment.updatedAt.getTime() !== notification.sourceUpdatedAt.getTime() ||
      appointment.status !== expectedAppointmentStatusForNotification(notification.eventKind)
    ) {
      return { eligible: false, outcome: AppointmentLineNotificationOutcome.STALE_SOURCE };
    }

    const relationship = appointment.patientHospitalRelationship;
    const patientUser = relationship.patientProfile.person.user;
    if (
      relationship.hospital.status !== HospitalStatus.ACTIVE ||
      !patientUser || patientUser.id !== notification.recipientUserId ||
      patientUser.status !== UserStatus.ACTIVE ||
      !patientUser.roles.some(({ role }) => role === Role.PATIENT)
    ) {
      return { eligible: false, outcome: AppointmentLineNotificationOutcome.AUTHORITY_CHANGED };
    }

    const [bindings, preference] = await Promise.all([
      transaction.lineAccountBinding.findMany({
        where: { userId: notification.recipientUserId, unlinkedAt: null },
        orderBy: { id: "asc" },
        take: 2,
        select: {
          id: true,
          lifecycleVersion: true,
          lineUserId: true,
          reachability: true,
          reachabilityObservedAt: true,
        },
      }),
      transaction.lineAppointmentNotificationPreference.findUnique({
        where: { userId: notification.recipientUserId },
        select: {
          enabled: true,
          bindingId: true,
          bindingLifecycleVersion: true,
          preferenceVersion: true,
        },
      }),
    ]);

    if (
      bindings.length !== 1 ||
      bindings[0]?.id !== notification.bindingId ||
      bindings[0]?.lifecycleVersion !== notification.bindingLifecycleVersion ||
      !bindings[0]?.lineUserId
    ) {
      return { eligible: false, outcome: AppointmentLineNotificationOutcome.LINE_INELIGIBLE };
    }

    if (
      !preference?.enabled ||
      preference.bindingId !== notification.bindingId ||
      preference.bindingLifecycleVersion !== notification.bindingLifecycleVersion ||
      preference.preferenceVersion !== notification.preferenceVersion
    ) {
      return { eligible: false, outcome: AppointmentLineNotificationOutcome.OPT_IN_REVOKED };
    }

    if (!isFreshLineFriendObservation({
      reachability: bindings[0].reachability,
      observedAt: bindings[0].reachabilityObservedAt,
      now,
    })) {
      return { eligible: false, outcome: AppointmentLineNotificationOutcome.LINE_INELIGIBLE };
    }

    return { eligible: true, lineUserId: bindings[0].lineUserId };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

async function settleClaim(
  database: DeliveryDatabase,
  notification: Claim,
  input: {
    state: AppointmentLineNotificationState;
    safeOutcome: AppointmentLineNotificationOutcome;
    now: Date;
    dueAt?: Date;
    terminal: boolean;
  },
): Promise<boolean> {
  const result = await database.appointmentLineNotification.updateMany({
    where: {
      id: notification.id,
      state: AppointmentLineNotificationState.CLAIMED,
      leaseToken: notification.leaseToken,
    },
    data: {
      state: input.state,
      dueAt: input.dueAt ?? notification.dueAt,
      leaseToken: null,
      leaseExpiresAt: null,
      safeOutcome: input.safeOutcome,
      terminalAt: input.terminal ? input.now : null,
      updatedAt: input.now,
    },
  });
  return result.count === 1;
}

async function reserveProviderAttempt(
  database: DeliveryDatabase,
  notification: Claim,
  now: Date,
): Promise<{ attemptCount: number; firstAttemptAt: Date } | null> {
  const firstAttemptAt = notification.firstAttemptAt ?? now;
  const result = await database.appointmentLineNotification.updateMany({
    where: {
      id: notification.id,
      state: AppointmentLineNotificationState.CLAIMED,
      leaseToken: notification.leaseToken,
      leaseExpiresAt: { gt: now },
      attemptCount: notification.attemptCount,
    },
    data: {
      attemptCount: { increment: 1 },
      firstAttemptAt,
      lastAttemptAt: now,
      leaseExpiresAt: new Date(now.getTime() + APPOINTMENT_LINE_NOTIFICATION_LEASE_MS),
      updatedAt: now,
    },
  });
  return result.count === 1
    ? { attemptCount: notification.attemptCount + 1, firstAttemptAt }
    : null;
}

async function finishProviderOutcome(
  database: DeliveryDatabase,
  notification: Claim,
  attempt: { attemptCount: number; firstAttemptAt: Date },
  outcome: LinePushResult,
  dependencies: AppointmentLineNotificationDeliveryDependencies,
): Promise<AppointmentLineNotificationState | null> {
  const now = nowOf(dependencies);

  if (outcome.kind === "ACCEPTED" || outcome.kind === "DUPLICATE_ACCEPTED") {
    const settled = await settleClaim(database, notification, {
      state: AppointmentLineNotificationState.PROVIDER_ACCEPTED,
      safeOutcome: outcome.kind === "ACCEPTED"
        ? AppointmentLineNotificationOutcome.ACCEPTED
        : AppointmentLineNotificationOutcome.DUPLICATE_ACCEPTED,
      now,
      terminal: true,
    });
    return settled ? AppointmentLineNotificationState.PROVIDER_ACCEPTED : null;
  }

  if (outcome.kind === "PERMANENT_FAILURE") {
    const settled = await settleClaim(database, notification, {
      state: AppointmentLineNotificationState.PERMANENT_FAILURE,
      safeOutcome: AppointmentLineNotificationOutcome.PERMANENT_HTTP_FAILURE,
      now,
      terminal: true,
    });
    return settled ? AppointmentLineNotificationState.PERMANENT_FAILURE : null;
  }

  const withinProviderWindow = isInsideLineRetryKeyWindow(attempt.firstAttemptAt, now);
  if (attempt.attemptCount < APPOINTMENT_LINE_NOTIFICATION_MAX_ATTEMPTS && withinProviderWindow) {
    const dueAt = new Date(now.getTime() + appointmentLineNotificationRetryDelayMs(attempt.attemptCount, dependencies.random));
    if (isInsideLineRetryKeyWindow(attempt.firstAttemptAt, dueAt)) {
      const safeOutcome = outcome.kind === "RETRYABLE_HTTP_FAILURE"
        ? AppointmentLineNotificationOutcome.TRANSIENT_HTTP_FAILURE
        : AppointmentLineNotificationOutcome.AMBIGUOUS_TRANSPORT_FAILURE;
      const settled = await settleClaim(database, notification, {
        state: AppointmentLineNotificationState.RETRY_SCHEDULED,
        safeOutcome,
        now,
        dueAt,
        terminal: false,
      });
      return settled ? AppointmentLineNotificationState.RETRY_SCHEDULED : null;
    }
  }

  const windowExpired = !withinProviderWindow;
  const settled = await settleClaim(database, notification, {
    state: AppointmentLineNotificationState.OUTCOME_UNKNOWN,
    safeOutcome: windowExpired
      ? AppointmentLineNotificationOutcome.RETRY_WINDOW_EXPIRED
      : AppointmentLineNotificationOutcome.PROCESS_OUTCOME_UNKNOWN,
    now,
    terminal: true,
  });
  return settled ? AppointmentLineNotificationState.OUTCOME_UNKNOWN : null;
}

function countState(
  result: AppointmentLineNotificationDrainResult,
  state: AppointmentLineNotificationState | null,
): void {
  if (state === AppointmentLineNotificationState.PROVIDER_ACCEPTED) result.providerAccepted += 1;
  else if (state === AppointmentLineNotificationState.RETRY_SCHEDULED) result.retryScheduled += 1;
  else if (state === AppointmentLineNotificationState.SUPPRESSED) result.suppressed += 1;
  else if (state === AppointmentLineNotificationState.PERMANENT_FAILURE) result.permanentFailure += 1;
  else if (state === AppointmentLineNotificationState.OUTCOME_UNKNOWN) result.unknownOutcome += 1;
}

export async function drainAppointmentLineNotificationOutbox(
  dependencies: AppointmentLineNotificationDeliveryDependencies = {},
): Promise<AppointmentLineNotificationDrainResult> {
  const database = databaseOf(dependencies);
  const batchSize = dependencies.batchSize ?? APPOINTMENT_LINE_NOTIFICATION_BATCH_SIZE;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > APPOINTMENT_LINE_NOTIFICATION_BATCH_SIZE) {
    throw new RangeError("Notification drain batch is outside its allowed bound");
  }

  const result: AppointmentLineNotificationDrainResult = {
    claimed: 0,
    providerAccepted: 0,
    retryScheduled: 0,
    suppressed: 0,
    permanentFailure: 0,
    unknownOutcome: await closeExhaustedLeases(database, nowOf(dependencies)),
  };

  for (let index = 0; index < batchSize; index += 1) {
    const notification = await claimDueNotification(database, nowOf(dependencies));
    if (!notification) break;
    result.claimed += 1;

    const firstRollout = rolloutOf(dependencies);
    if (!sameRollout(firstRollout, notification.rolloutGeneration)) {
      const settled = await settleClaim(database, notification, {
        state: AppointmentLineNotificationState.SUPPRESSED,
        safeOutcome: AppointmentLineNotificationOutcome.ROLLOUT_CLOSED,
        now: nowOf(dependencies),
        terminal: true,
      });
      if (settled) countState(result, AppointmentLineNotificationState.SUPPRESSED);
      continue;
    }

    const checkedAt = nowOf(dependencies);
    if (notification.firstAttemptAt && !isInsideLineRetryKeyWindow(notification.firstAttemptAt, checkedAt)) {
      const settled = await settleClaim(database, notification, {
        state: AppointmentLineNotificationState.OUTCOME_UNKNOWN,
        safeOutcome: AppointmentLineNotificationOutcome.RETRY_WINDOW_EXPIRED,
        now: checkedAt,
        terminal: true,
      });
      if (settled) countState(result, AppointmentLineNotificationState.OUTCOME_UNKNOWN);
      continue;
    }

    const eligibility = await currentEligibility(database, notification, checkedAt);
    if (!eligibility.eligible) {
      const settled = await settleClaim(database, notification, {
        state: AppointmentLineNotificationState.SUPPRESSED,
        safeOutcome: eligibility.outcome,
        now: nowOf(dependencies),
        terminal: true,
      });
      if (settled) countState(result, AppointmentLineNotificationState.SUPPRESSED);
      continue;
    }

    if (!sameRollout(rolloutOf(dependencies), notification.rolloutGeneration)) {
      const settled = await settleClaim(database, notification, {
        state: AppointmentLineNotificationState.SUPPRESSED,
        safeOutcome: AppointmentLineNotificationOutcome.ROLLOUT_CLOSED,
        now: nowOf(dependencies),
        terminal: true,
      });
      if (settled) countState(result, AppointmentLineNotificationState.SUPPRESSED);
      continue;
    }

    const attempt = await reserveProviderAttempt(database, notification, nowOf(dependencies));
    if (!attempt) continue;

    const finalEligibility = await currentEligibility(database, notification, nowOf(dependencies));
    if (!finalEligibility.eligible) {
      const settled = await settleClaim(database, notification, {
        state: AppointmentLineNotificationState.SUPPRESSED,
        safeOutcome: finalEligibility.outcome,
        now: nowOf(dependencies),
        terminal: true,
      });
      if (settled) countState(result, AppointmentLineNotificationState.SUPPRESSED);
      continue;
    }

    if (!sameRollout(rolloutOf(dependencies), notification.rolloutGeneration)) {
      const settled = await settleClaim(database, notification, {
        state: AppointmentLineNotificationState.SUPPRESSED,
        safeOutcome: AppointmentLineNotificationOutcome.ROLLOUT_CLOSED,
        now: nowOf(dependencies),
        terminal: true,
      });
      if (settled) countState(result, AppointmentLineNotificationState.SUPPRESSED);
      continue;
    }

    let providerOutcome: LinePushResult;
    try {
      providerOutcome = await (dependencies.push ?? pushWithLine)(
        finalEligibility.lineUserId,
        APPOINTMENT_LINE_NOTIFICATION_TEXT,
        notification.retryKey,
      );
    } catch {
      providerOutcome = { kind: "AMBIGUOUS_TRANSPORT_FAILURE" };
    }

    countState(result, await finishProviderOutcome(database, notification, attempt, providerOutcome, dependencies));
  }

  (dependencies.logSummary ?? ((summary) => console.info("appointment_line_notification_drain", summary)))(result);
  return result;
}

export async function purgeTerminalAppointmentLineNotifications(
  input: { now?: Date; batchSize?: number; database?: DeliveryDatabase } = {},
): Promise<number> {
  const batchSize = input.batchSize ?? 100;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) {
    throw new RangeError("Notification purge batch is outside its allowed bound");
  }
  const database = input.database ?? getPrisma();
  const now = new Date((input.now ?? new Date()).getTime());
  if (Number.isNaN(now.getTime())) throw new Error("Notification purge time could not be resolved");
  const cutoff = new Date(now.getTime() - APPOINTMENT_LINE_NOTIFICATION_TERMINAL_RETENTION_MS);

  return database.$executeRaw`
    WITH expired AS (
      SELECT "id"
      FROM "AppointmentLineNotification"
      WHERE "terminalAt" < ${cutoff}
        AND "state" IN (
          'PROVIDER_ACCEPTED'::"AppointmentLineNotificationState",
          'SUPPRESSED'::"AppointmentLineNotificationState",
          'PERMANENT_FAILURE'::"AppointmentLineNotificationState",
          'OUTCOME_UNKNOWN'::"AppointmentLineNotificationState"
        )
      ORDER BY "terminalAt" ASC, "id" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${batchSize}
    )
    DELETE FROM "AppointmentLineNotification" AS notification
    USING expired
    WHERE notification."id" = expired."id"
  `;
}
