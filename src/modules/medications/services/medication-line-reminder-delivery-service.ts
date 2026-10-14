import "server-only";

import { randomUUID } from "node:crypto";
import { MedicationLineReminderOutcome, MedicationLineReminderState, PersonalMedicationStatus, Prisma, Role, UserStatus, type MedicationLineReminderNotification, type PrismaClient } from "@prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { LineMessagingClient, type LinePushResult } from "@/modules/line/adapters/line-messaging-client";
import { resolveEligibleLineRoles } from "@/modules/line/services/line-eligibility-service";
import { isFreshMedicationReminderFriend, isMedicationLineReminderOccurrenceExpired, MEDICATION_LINE_REMINDER_BATCH_SIZE, MEDICATION_LINE_REMINDER_LEASE_MS, MEDICATION_LINE_REMINDER_MAX_ATTEMPTS, MEDICATION_LINE_REMINDER_MATERIALIZE_LIMIT, MEDICATION_LINE_REMINDER_MAX_LATENESS_MS, MEDICATION_LINE_REMINDER_RETRY_WINDOW_MS, MEDICATION_LINE_REMINDER_TERMINAL_RETENTION_MS, MEDICATION_LINE_REMINDER_TEXT, medicationLineReminderRetryDelayMs } from "../domain/medication-line-reminders";
import { fromMedicationTimeCarrier } from "../domain/medication-local-time";
import { createReminderSourceKey, reminderBangkokToUtc } from "../domain/medication-reminder-occurrence";
import { revalidateOwnPersonalMedicationReminderOccurrence } from "./medication-reminder-occurrence-query-service";

type Database = PrismaClient;
type Claim = MedicationLineReminderNotification;
type SafeSuppression = "STALE_SOURCE" | "AUTHORITY_CHANGED" | "OPT_IN_REVOKED" | "LINE_INELIGIBLE";
type Eligibility = { eligible: true; lineUserId: string } | { eligible: false; outcome: SafeSuppression };

export type MedicationLineReminderDrainResult = { materialized: number; claimed: number; providerAccepted: number; retryScheduled: number; suppressed: number; permanentFailure: number; unknownOutcome: number };
export type MedicationLineReminderDependencies = { database?: Database; now?: () => Date; push?: (lineUserId: string, text: string, retryKey: string) => Promise<LinePushResult>; random?: () => number; batchSize?: number; logSummary?: (result: MedicationLineReminderDrainResult) => void };

function nowOf(input: MedicationLineReminderDependencies): Date {
  const now = new Date((input.now?.() ?? new Date()).getTime());
  if (!Number.isFinite(now.getTime())) throw new Error("Medication reminder worker clock is invalid");
  return now;
}

function occurrenceDueAt(notification: Pick<Claim, "localDate" | "localTime">): Date | null {
  try { return new Date(reminderBangkokToUtc(notification.localDate.toISOString().slice(0, 10), occurrenceLocalTime(notification))); } catch { return null; }
}

function occurrenceLocalTime(notification: Pick<Claim, "localTime">): string {
  return `${String(notification.localTime.getUTCHours()).padStart(2, "0")}:${String(notification.localTime.getUTCMinutes()).padStart(2, "0")}`;
}

// Only occurrences due within [now - MAX_LATENESS, now] are materialized; the window may span the Bangkok midnight.
async function materializeDueOccurrences(database: Database, now: Date): Promise<number> {
  const earliest = new Date(now.getTime() - MEDICATION_LINE_REMINDER_MAX_LATENESS_MS);
  return database.$executeRaw(Prisma.sql`
    INSERT INTO "MedicationLineReminderNotification" (
      "id", "scheduleId", "personalMedicationId", "localDate", "localTime", "dueAt", "sourceUpdatedAt",
      "recipientUserId", "bindingId", "bindingLifecycleVersion", "preferenceVersion", "state", "createdAt", "updatedAt"
    )
    SELECT gen_random_uuid(), s."id", m."id", occurrence."localDate", s."localTime", due."dueAt", m."updatedAt",
      u."id", b."id", b."lifecycleVersion", p."preferenceVersion", 'PENDING'::"MedicationLineReminderState", ${now}, ${now}
    FROM "MedicationSchedule" s
    JOIN "PersonalMedication" m ON m."id" = s."personalMedicationId" AND m."status" = 'ACTIVE'::"PersonalMedicationStatus"
    JOIN "PatientProfile" pp ON pp."id" = m."patientProfileId"
    JOIN "Person" person ON person."id" = pp."personId"
    JOIN "User" u ON u."personId" = person."id" AND u."status" = 'ACTIVE'::"UserStatus"
    JOIN "UserRole" role ON role."userId" = u."id" AND role."role" = 'PATIENT'::"Role"
    JOIN "LineMedicationReminderPreference" p ON p."userId" = u."id" AND p."enabled" = TRUE
    JOIN "LineAccountBinding" b ON b."id" = p."bindingId" AND b."userId" = u."id" AND b."unlinkedAt" IS NULL AND b."lineUserId" IS NOT NULL AND b."lifecycleVersion" = p."bindingLifecycleVersion"
    CROSS JOIN LATERAL (SELECT DISTINCT timezone('Asia/Bangkok', instant)::date AS "localDate" FROM unnest(ARRAY[${earliest}::timestamptz, ${now}::timestamptz]) AS instant) occurrence
    CROSS JOIN LATERAL (SELECT ((occurrence."localDate" + s."localTime") AT TIME ZONE 'Asia/Bangkok') AS "dueAt") due
    WHERE due."dueAt" >= ${earliest}::timestamptz AND due."dueAt" <= ${now}::timestamptz
      AND NOT EXISTS (SELECT 1 FROM "LineAccountBinding" extra WHERE extra."userId" = u."id" AND extra."unlinkedAt" IS NULL AND extra."id" <> b."id")
      AND NOT EXISTS (SELECT 1 FROM "MedicationLineReminderNotification" n WHERE n."scheduleId" = s."id" AND n."localDate" = occurrence."localDate" AND n."localTime" = s."localTime")
    ORDER BY due."dueAt" ASC, s."id" ASC
    LIMIT ${MEDICATION_LINE_REMINDER_MATERIALIZE_LIMIT}
    ON CONFLICT ("scheduleId", "localDate", "localTime") DO NOTHING
  `);
}

async function closeExhausted(database: Database, now: Date): Promise<number> {
  return database.medicationLineReminderNotification.updateMany({ where: { state: MedicationLineReminderState.CLAIMED, attemptCount: { gte: MEDICATION_LINE_REMINDER_MAX_ATTEMPTS }, leaseExpiresAt: { lte: now } }, data: { state: MedicationLineReminderState.OUTCOME_UNKNOWN, leaseToken: null, leaseExpiresAt: null, safeOutcome: MedicationLineReminderOutcome.PROCESS_OUTCOME_UNKNOWN, terminalAt: now, updatedAt: now } }).then(({ count }) => count);
}

// Never-attempted rows (e.g. after a worker outage or backlog) are suppressed in bulk so they neither reach LINE
// late nor consume claim slots ahead of current occurrences. Attempted rows keep the retry-window semantics.
async function expireLateFirstAttempts(database: Database, now: Date): Promise<number> {
  const earliest = new Date(now.getTime() - MEDICATION_LINE_REMINDER_MAX_LATENESS_MS);
  return database.$executeRaw(Prisma.sql`
    UPDATE "MedicationLineReminderNotification" SET "state" = 'SUPPRESSED'::"MedicationLineReminderState",
      "safeOutcome" = 'DELIVERY_WINDOW_EXPIRED'::"MedicationLineReminderOutcome", "leaseToken" = NULL, "leaseExpiresAt" = NULL, "terminalAt" = ${now}, "updatedAt" = ${now}
    WHERE "attemptCount" = 0 AND "firstAttemptAt" IS NULL
      AND ("state" = 'PENDING'::"MedicationLineReminderState" OR ("state" = 'CLAIMED'::"MedicationLineReminderState" AND "leaseExpiresAt" <= ${now}))
      AND (("localDate" + "localTime") AT TIME ZONE 'Asia/Bangkok') < ${earliest}::timestamptz
  `);
}

async function claim(database: Database, now: Date): Promise<Claim | null> {
  const leaseToken = randomUUID();
  const leaseExpiresAt = new Date(now.getTime() + MEDICATION_LINE_REMINDER_LEASE_MS);
  const rows = await database.$transaction((tx) => tx.$queryRaw<Claim[]>(Prisma.sql`
    WITH candidate AS (
      SELECT "id" FROM "MedicationLineReminderNotification"
      WHERE "attemptCount" < ${MEDICATION_LINE_REMINDER_MAX_ATTEMPTS}
        AND (("state" IN ('PENDING'::"MedicationLineReminderState", 'RETRY_SCHEDULED'::"MedicationLineReminderState") AND "dueAt" <= ${now})
          OR ("state" = 'CLAIMED'::"MedicationLineReminderState" AND "leaseExpiresAt" <= ${now}))
      ORDER BY "dueAt" ASC, "createdAt" ASC, "id" ASC FOR UPDATE SKIP LOCKED LIMIT 1
    )
    UPDATE "MedicationLineReminderNotification" n SET "state" = 'CLAIMED'::"MedicationLineReminderState", "leaseToken" = ${leaseToken}::uuid,
      "leaseExpiresAt" = ${leaseExpiresAt}, "terminalAt" = NULL, "updatedAt" = ${now}
    FROM candidate WHERE n."id" = candidate."id" RETURNING n.*
  `), { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  return rows[0] ?? null;
}

async function eligibility(database: Database, notification: Claim, now: Date): Promise<Eligibility> {
  if (!notification.recipientUserId || !notification.bindingId || notification.bindingLifecycleVersion === null || notification.preferenceVersion === null) return { eligible: false, outcome: MedicationLineReminderOutcome.AUTHORITY_CHANGED };
  // The dueAt column becomes the next-attempt time after a retry; the occurrence instant comes from its immutable key.
  const dueAt = occurrenceDueAt(notification);
  if (!dueAt) return { eligible: false, outcome: MedicationLineReminderOutcome.STALE_SOURCE };
  type PreliminaryEligibility =
    | { eligible: true; lineUserId: string; actor: ActorContext; localTime: string }
    | { eligible: false; outcome: SafeSuppression };
  const preliminary = await database.$transaction(async (transaction): Promise<PreliminaryEligibility> => {
    const schedule = await transaction.medicationSchedule.findUnique({ where: { id: notification.scheduleId }, select: { id: true, localTime: true, personalMedication: { select: { id: true, status: true, updatedAt: true, patientProfileId: true } } } });
    if (!schedule || schedule.personalMedication.id !== notification.personalMedicationId || schedule.personalMedication.status !== PersonalMedicationStatus.ACTIVE || schedule.personalMedication.updatedAt.getTime() !== notification.sourceUpdatedAt.getTime()) return { eligible: false, outcome: MedicationLineReminderOutcome.STALE_SOURCE };
    let localTime: string;
    try { localTime = fromMedicationTimeCarrier(schedule.localTime); } catch { return { eligible: false, outcome: MedicationLineReminderOutcome.STALE_SOURCE }; }
    if (localTime !== occurrenceLocalTime(notification)) return { eligible: false, outcome: MedicationLineReminderOutcome.STALE_SOURCE };
    const profile = await transaction.patientProfile.findUnique({ where: { id: schedule.personalMedication.patientProfileId }, select: { personId: true } });
    const person = profile ? await transaction.person.findUnique({
      where: { id: profile.personId },
      select: {
        user: {
          select: {
            id: true,
            personId: true,
            status: true,
            roles: { select: { role: true } },
          },
        },
      },
    }) : null;
    const user = person?.user ?? null;
    if (!user || user.id !== notification.recipientUserId || user.status !== UserStatus.ACTIVE || !user.roles.some(({ role }) => role === Role.PATIENT) || !((await resolveEligibleLineRoles(user.id, transaction)).includes(Role.PATIENT))) return { eligible: false, outcome: MedicationLineReminderOutcome.AUTHORITY_CHANGED };
    const patientActor: ActorContext = { userId: user.id, personId: user.personId, roles: [Role.PATIENT], hospitalMemberships: [], osmHospitalRelationships: [] };
    const [allBindings, preference] = await Promise.all([
      transaction.lineAccountBinding.findMany({ where: { userId: user.id, unlinkedAt: null }, orderBy: { id: "asc" }, take: 2, select: { id: true, lifecycleVersion: true, lineUserId: true, reachability: true, reachabilityObservedAt: true } }),
      transaction.lineMedicationReminderPreference.findUnique({ where: { userId: user.id }, select: { enabled: true, bindingId: true, bindingLifecycleVersion: true, preferenceVersion: true } }),
    ]);
    const binding = allBindings[0];
    if (allBindings.length !== 1 || binding?.id !== notification.bindingId || binding.lifecycleVersion !== notification.bindingLifecycleVersion || !binding.lineUserId) return { eligible: false, outcome: MedicationLineReminderOutcome.LINE_INELIGIBLE };
    if (!preference?.enabled || preference.bindingId !== notification.bindingId || preference.bindingLifecycleVersion !== notification.bindingLifecycleVersion || preference.preferenceVersion !== notification.preferenceVersion) return { eligible: false, outcome: MedicationLineReminderOutcome.OPT_IN_REVOKED };
    if (!isFreshMedicationReminderFriend({ reachability: binding.reachability, observedAt: binding.reachabilityObservedAt, now })) return { eligible: false, outcome: MedicationLineReminderOutcome.LINE_INELIGIBLE };
    return { eligible: true, lineUserId: binding.lineUserId, actor: patientActor, localTime };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  if (!preliminary.eligible) return preliminary;

  const localDate = notification.localDate.toISOString().slice(0, 10);
  const source = await revalidateOwnPersonalMedicationReminderOccurrence(preliminary.actor, {
    sourceKey: createReminderSourceKey(notification.scheduleId, notification.localDate.toISOString().slice(0, 10)),
    sourceVersion: 1,
    kind: "PERSONAL_MEDICATION_DAILY",
    personalMedicationId: notification.personalMedicationId,
    localDate,
    localTime: preliminary.localTime,
    dueAt: dueAt.toISOString(),
    aggregateVersion: notification.sourceUpdatedAt.toISOString(),
  }, { database });
  if (source.status !== "CURRENT" || source.aggregateVersion !== notification.sourceUpdatedAt.toISOString()) return { eligible: false, outcome: MedicationLineReminderOutcome.STALE_SOURCE };
  return { eligible: true, lineUserId: preliminary.lineUserId };
}

async function settle(database: Database, notification: Claim, input: { state: MedicationLineReminderState; outcome: MedicationLineReminderOutcome | null; now: Date; dueAt?: Date; terminal: boolean }): Promise<boolean> {
  const result = await database.medicationLineReminderNotification.updateMany({ where: { id: notification.id, state: MedicationLineReminderState.CLAIMED, leaseToken: notification.leaseToken }, data: { state: input.state, safeOutcome: input.outcome, dueAt: input.dueAt ?? notification.dueAt, leaseToken: null, leaseExpiresAt: null, terminalAt: input.terminal ? input.now : null, updatedAt: input.now } });
  return result.count === 1;
}

async function reserveAttempt(database: Database, notification: Claim, now: Date): Promise<{ attemptCount: number; firstAttemptAt: Date } | null> {
  const firstAttemptAt = notification.firstAttemptAt ?? now;
  const result = await database.medicationLineReminderNotification.updateMany({ where: { id: notification.id, state: MedicationLineReminderState.CLAIMED, leaseToken: notification.leaseToken, leaseExpiresAt: { gt: now }, attemptCount: notification.attemptCount }, data: { attemptCount: { increment: 1 }, firstAttemptAt, lastAttemptAt: now, leaseExpiresAt: new Date(now.getTime() + MEDICATION_LINE_REMINDER_LEASE_MS), safeOutcome: MedicationLineReminderOutcome.PROCESS_OUTCOME_UNKNOWN, updatedAt: now } });
  return result.count === 1 ? { attemptCount: notification.attemptCount + 1, firstAttemptAt } : null;
}

function countOutcome(result: MedicationLineReminderDrainResult, state: MedicationLineReminderState | null): void {
  if (state === MedicationLineReminderState.PROVIDER_ACCEPTED) result.providerAccepted += 1;
  else if (state === MedicationLineReminderState.RETRY_SCHEDULED) result.retryScheduled += 1;
  else if (state === MedicationLineReminderState.SUPPRESSED) result.suppressed += 1;
  else if (state === MedicationLineReminderState.PERMANENT_FAILURE) result.permanentFailure += 1;
  else if (state === MedicationLineReminderState.OUTCOME_UNKNOWN) result.unknownOutcome += 1;
}

async function finish(database: Database, notification: Claim, attempt: { attemptCount: number; firstAttemptAt: Date }, outcome: LinePushResult, dependencies: MedicationLineReminderDependencies): Promise<MedicationLineReminderState | null> {
  const now = nowOf(dependencies);
  if (outcome.kind === "ACCEPTED" || outcome.kind === "DUPLICATE_ACCEPTED") {
    const state = await settle(database, notification, { state: MedicationLineReminderState.PROVIDER_ACCEPTED, outcome: null, now, terminal: true });
    return state ? MedicationLineReminderState.PROVIDER_ACCEPTED : null;
  }
  if (outcome.kind === "PERMANENT_FAILURE") {
    const state = await settle(database, notification, { state: MedicationLineReminderState.PERMANENT_FAILURE, outcome: MedicationLineReminderOutcome.PERMANENT_HTTP_FAILURE, now, terminal: true });
    return state ? MedicationLineReminderState.PERMANENT_FAILURE : null;
  }
  const insideWindow = now.getTime() - attempt.firstAttemptAt.getTime() < MEDICATION_LINE_REMINDER_RETRY_WINDOW_MS;
  if (attempt.attemptCount < MEDICATION_LINE_REMINDER_MAX_ATTEMPTS && insideWindow) {
    const retryAt = new Date(now.getTime() + medicationLineReminderRetryDelayMs(attempt.attemptCount, dependencies.random));
    const safe = outcome.kind === "RETRYABLE_HTTP_FAILURE" ? MedicationLineReminderOutcome.TRANSIENT_HTTP_FAILURE : MedicationLineReminderOutcome.AMBIGUOUS_TRANSPORT_FAILURE;
    if (retryAt.getTime() - attempt.firstAttemptAt.getTime() < MEDICATION_LINE_REMINDER_RETRY_WINDOW_MS) {
      const saved = await settle(database, notification, { state: MedicationLineReminderState.RETRY_SCHEDULED, outcome: safe, now, dueAt: retryAt, terminal: false });
      return saved ? MedicationLineReminderState.RETRY_SCHEDULED : null;
    }
  }
  const unknown = outcome.kind === "AMBIGUOUS_TRANSPORT_FAILURE";
  const state = unknown ? MedicationLineReminderState.OUTCOME_UNKNOWN : MedicationLineReminderState.PERMANENT_FAILURE;
  const safe = unknown ? MedicationLineReminderOutcome.AMBIGUOUS_TRANSPORT_FAILURE : MedicationLineReminderOutcome.RETRY_WINDOW_EXPIRED;
  const saved = await settle(database, notification, { state, outcome: safe, now, terminal: true });
  return saved ? state : null;
}

export async function drainMedicationLineReminderOutbox(dependencies: MedicationLineReminderDependencies = {}): Promise<MedicationLineReminderDrainResult> {
  const database = dependencies.database ?? getPrisma();
  const batchSize = dependencies.batchSize ?? MEDICATION_LINE_REMINDER_BATCH_SIZE;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MEDICATION_LINE_REMINDER_BATCH_SIZE) throw new RangeError("Medication reminder batch exceeds its bound");
  const materialized = await materializeDueOccurrences(database, nowOf(dependencies));
  const result: MedicationLineReminderDrainResult = { materialized, claimed: 0, providerAccepted: 0, retryScheduled: 0, suppressed: await expireLateFirstAttempts(database, nowOf(dependencies)), permanentFailure: 0, unknownOutcome: await closeExhausted(database, nowOf(dependencies)) };
  for (let index = 0; index < batchSize; index += 1) {
    const notification = await claim(database, nowOf(dependencies));
    if (!notification) break;
    result.claimed += 1;
    const checkedAt = nowOf(dependencies);
    if (notification.firstAttemptAt && checkedAt.getTime() - notification.firstAttemptAt.getTime() >= MEDICATION_LINE_REMINDER_RETRY_WINDOW_MS) {
      const isAmbiguous = notification.safeOutcome === MedicationLineReminderOutcome.AMBIGUOUS_TRANSPORT_FAILURE || notification.safeOutcome === MedicationLineReminderOutcome.PROCESS_OUTCOME_UNKNOWN;
      const state = isAmbiguous ? MedicationLineReminderState.OUTCOME_UNKNOWN : MedicationLineReminderState.PERMANENT_FAILURE;
      const settled = await settle(database, notification, { state, outcome: isAmbiguous ? MedicationLineReminderOutcome.AMBIGUOUS_TRANSPORT_FAILURE : MedicationLineReminderOutcome.RETRY_WINDOW_EXPIRED, now: checkedAt, terminal: true });
      if (settled) countOutcome(result, state);
      continue;
    }
    if (!notification.firstAttemptAt) {
      const dueAt = occurrenceDueAt(notification);
      if (!dueAt || isMedicationLineReminderOccurrenceExpired(dueAt, checkedAt)) {
        const settled = await settle(database, notification, { state: MedicationLineReminderState.SUPPRESSED, outcome: dueAt ? MedicationLineReminderOutcome.DELIVERY_WINDOW_EXPIRED : MedicationLineReminderOutcome.STALE_SOURCE, now: checkedAt, terminal: true });
        if (settled) countOutcome(result, MedicationLineReminderState.SUPPRESSED);
        continue;
      }
    }
    const current = await eligibility(database, notification, checkedAt);
    if (!current.eligible) {
      const settled = await settle(database, notification, { state: MedicationLineReminderState.SUPPRESSED, outcome: current.outcome, now: nowOf(dependencies), terminal: true });
      if (settled) countOutcome(result, MedicationLineReminderState.SUPPRESSED);
      continue;
    }
    const attempt = await reserveAttempt(database, notification, nowOf(dependencies));
    if (!attempt) continue;
    const final = await eligibility(database, notification, nowOf(dependencies));
    if (!final.eligible) {
      const settled = await settle(database, notification, { state: MedicationLineReminderState.SUPPRESSED, outcome: final.outcome, now: nowOf(dependencies), terminal: true });
      if (settled) countOutcome(result, MedicationLineReminderState.SUPPRESSED);
      continue;
    }
    let provider: LinePushResult;
    try { provider = await (dependencies.push ?? ((lineUserId, text, retryKey) => new LineMessagingClient().pushText(lineUserId, text, retryKey)))(final.lineUserId, MEDICATION_LINE_REMINDER_TEXT, notification.retryKey); }
    catch { provider = { kind: "AMBIGUOUS_TRANSPORT_FAILURE" }; }
    countOutcome(result, await finish(database, notification, attempt, provider, dependencies));
  }
  (dependencies.logSummary ?? ((summary) => console.info("medication_line_reminder_drain", summary)))(result);
  return result;
}

export async function purgeTerminalMedicationLineReminderNotifications(input: { database?: Database; now?: Date; batchSize?: number } = {}): Promise<number> {
  const batchSize = input.batchSize ?? 100;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) throw new RangeError("Reminder purge batch exceeds its bound");
  const database = input.database ?? getPrisma();
  const now = new Date((input.now ?? new Date()).getTime());
  const cutoff = new Date(now.getTime() - MEDICATION_LINE_REMINDER_TERMINAL_RETENTION_MS);
  return database.$executeRaw`WITH expired AS (
    SELECT "id" FROM "MedicationLineReminderNotification" WHERE "terminalAt" < ${cutoff}
      AND "state" IN ('PROVIDER_ACCEPTED'::"MedicationLineReminderState", 'SUPPRESSED'::"MedicationLineReminderState", 'PERMANENT_FAILURE'::"MedicationLineReminderState", 'OUTCOME_UNKNOWN'::"MedicationLineReminderState")
    ORDER BY "terminalAt" ASC, "id" ASC FOR UPDATE SKIP LOCKED LIMIT ${batchSize}
  ) DELETE FROM "MedicationLineReminderNotification" n USING expired WHERE n."id" = expired."id"`;
}

export const medicationLineReminderDeliveryInternals = { materializeDueOccurrences, eligibility, nowOf, finish };
