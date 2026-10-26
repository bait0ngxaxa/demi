import { createHash, randomUUID } from "node:crypto";
import { HospitalStatus, LineReachability, MembershipStatus, MembershipType, Profession, Role, SupportReportStatus, UserStatus } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { createPersonalMedication, stopPersonalMedication } from "@/modules/medications/services/personal-medication-service";
import { setOwnMedicationLineReminderPreference } from "@/modules/medications/services/medication-line-reminder-preference-service";
import { LineMessagingClient, type LinePushResult } from "@/modules/line/adapters/line-messaging-client";
import { drainMedicationLineReminderOutbox, medicationLineReminderDeliveryInternals } from "@/modules/medications/services/medication-line-reminder-delivery-service";
import { MEDICATION_LINE_REMINDER_TEXT } from "@/modules/medications/domain/medication-line-reminders";
import { getNotificationSchedulerReadiness } from "@/modules/notification-scheduler/services/notification-scheduler-readiness-service";
import { runNotificationSchedulerTick } from "@/modules/notification-scheduler/services/notification-scheduler-tick-service";
import { createSupportReport, getAdminSupportReport, getOwnSupportReport, listAdminSupportReports, listOwnSupportReports, SupportReportRateLimitError, updateAdminSupportReportStatus } from "@/modules/support/services/support-report-service";
import { updateOwnContactEmail } from "@/modules/account-settings/services/contact-setting-service";
import { provisionPatientFixture as provisionPatient } from "./support/patient-provisioning";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/application-error";

// Runs before each delivery-time source revalidation, letting a test advance its clock while one notification is processed.
const revalidation = vi.hoisted(() => ({ beforeEach: (): void => undefined }));
vi.mock("@/modules/medications/services/medication-reminder-occurrence-query-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/medications/services/medication-reminder-occurrence-query-service")>();
  return { ...actual, revalidateOwnPersonalMedicationReminderOccurrence: (...args: Parameters<typeof actual.revalidateOwnPersonalMedicationReminderOccurrence>) => { revalidation.beforeEach(); return actual.revalidateOwnPersonalMedicationReminderOccurrence(...args); } };
});

const prisma = getPrisma();
const reminderNow = new Date("2026-10-14T00:05:00.000Z"); // 07:05 in Asia/Bangkok; the 07:00 occurrence is due within tolerance.
const bangkok = (local: string): Date => new Date(`${local}+07:00`);
const personIds: string[] = [];
const userIds: string[] = [];
const profileIds: string[] = [];
const hospitalIds: string[] = [];
const medicationIds: string[] = [];
let connected = false;

async function cleanup(): Promise<void> {
  if (!connected) return;
  if (medicationIds.length) {
    await prisma.medicationLineReminderNotification.deleteMany({ where: { personalMedicationId: { in: medicationIds } } });
    await prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`ALTER TABLE "MedicationSchedule" DISABLE TRIGGER "MedicationSchedule_guard_write_trigger"`;
      try {
        await transaction.medicationSchedule.deleteMany({ where: { personalMedicationId: { in: medicationIds } } });
      } finally {
        await transaction.$executeRaw`ALTER TABLE "MedicationSchedule" ENABLE TRIGGER "MedicationSchedule_guard_write_trigger"`;
      }
    });
    await prisma.personalMedication.deleteMany({ where: { id: { in: medicationIds } } });
  }
  if (userIds.length) {
    await prisma.medicationLineReminderNotification.deleteMany({ where: { recipientUserId: { in: userIds } } });
    await prisma.lineMedicationReminderPreference.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userContactSetting.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.supportReport.deleteMany({ where: { OR: [{ reporterUserId: { in: userIds } }, { statusUpdaterUserId: { in: userIds } }] } });
    await prisma.patientActivation.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.lineAccountBinding.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.auditEvent.deleteMany({ where: { actorUserId: { in: userIds } } });
  }
  if (hospitalIds.length) await prisma.supportReport.deleteMany({ where: { hospitalId: { in: hospitalIds } } });
  if (profileIds.length) {
    await prisma.patientHospitalHealthHistory.deleteMany({ where: { relationship: { hospitalId: { in: hospitalIds } } } });
    await prisma.patientHospitalRelationship.deleteMany({ where: { hospitalId: { in: hospitalIds } } });
    await prisma.patientProfile.deleteMany({ where: { id: { in: profileIds } } });
  }
  if (userIds.length) {
    await prisma.osmHospitalRelationship.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.hospitalMembership.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  if (hospitalIds.length) {
    await prisma.hospital.deleteMany({ where: { id: { in: hospitalIds } } });
  }
  if (personIds.length) await prisma.person.deleteMany({ where: { id: { in: personIds } } });
  personIds.length = 0; userIds.length = 0; profileIds.length = 0; hospitalIds.length = 0; medicationIds.length = 0;
}

async function createUser(role: Role): Promise<{ actor: ActorContext; userId: string }> {
  const person = await prisma.person.create({ data: { identityKeyHash: `phase-c-${randomUUID()}`, givenName: "ข้อมูลทดสอบ" }, select: { id: true } });
  personIds.push(person.id);
  const user = await prisma.user.create({ data: { personId: person.id, status: UserStatus.ACTIVE, roles: { create: [{ role }] } }, select: { id: true } });
  userIds.push(user.id);
  return { userId: user.id, actor: { userId: user.id, personId: person.id, roles: [role], hospitalMemberships: [], osmHospitalRelationships: [] } };
}

async function createHospitalOwner(): Promise<{ hospitalId: string; actor: ActorContext; userId: string }> {
  const hospital = await prisma.hospital.create({ data: { hospitalCode: `PHASE-C-${randomUUID().slice(0, 12)}`, name: "โรงพยาบาลทดสอบ Phase C", status: HospitalStatus.ACTIVE }, select: { id: true } });
  hospitalIds.push(hospital.id);
  const owner = await createUser(Role.HOSPITAL);
  await prisma.hospitalMembership.create({ data: { userId: owner.userId, hospitalId: hospital.id, membershipType: MembershipType.OWNER, status: MembershipStatus.ACTIVE } });
  owner.actor.hospitalMemberships = [{ hospitalId: hospital.id, membershipType: MembershipType.OWNER, profession: null, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE }];
  return { hospitalId: hospital.id, actor: owner.actor, userId: owner.userId };
}

async function createPatient(owner: ActorContext, hospitalId: string): Promise<{ actor: ActorContext; userId: string; profileId: string; relationshipId: string }> {
  const patient = await provisionPatient(owner, { identity: { namespace: "phase-c-engagement-integration", value: randomUUID() }, targetHospitalId: hospitalId, givenName: "ผู้ป่วยสังเคราะห์", familyName: `Phase C ${randomUUID()}` });
  userIds.push(patient.userId); personIds.push(patient.personId); profileIds.push(patient.patientProfileId);
  await prisma.user.update({ where: { id: patient.userId }, data: { status: UserStatus.ACTIVE, authSubject: randomUUID() } });
  return { actor: { userId: patient.userId, personId: patient.personId, roles: [Role.PATIENT], hospitalMemberships: [], osmHospitalRelationships: [] }, userId: patient.userId, profileId: patient.patientProfileId, relationshipId: patient.relationshipId };
}

async function createWorkforce(hospitalId: string, role: Role): Promise<ActorContext> {
  const created = await createUser(role);
  if (role === Role.OSM) {
    await prisma.osmHospitalRelationship.create({ data: { userId: created.userId, hospitalId, status: MembershipStatus.ACTIVE } });
    created.actor.osmHospitalRelationships = [{ hospitalId, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE }];
  } else if (role === Role.HOSPITAL) {
    await prisma.hospitalMembership.create({ data: { userId: created.userId, hospitalId, membershipType: MembershipType.MEMBER, profession: Profession.NURSE, status: MembershipStatus.ACTIVE } });
    created.actor.hospitalMemberships = [{ hospitalId, membershipType: MembershipType.MEMBER, profession: Profession.NURSE, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE }];
  } else throw new Error("Unsupported workforce role");
  return created.actor;
}

async function addMedication(actor: ActorContext, times: string[]): Promise<string> {
  const medication = await createPersonalMedication(actor, { medicationName: "ชื่อยาที่ห้ามอยู่ในข้อความ", instructionText: null, times }, { database: prisma, now: () => reminderNow });
  medicationIds.push(medication.id);
  return medication.id;
}

async function setupReminderSubject(input: { times?: string[]; optInAt?: Date } = {}): Promise<{ patient: Awaited<ReturnType<typeof createPatient>>; medicationId: string; lineUserId: string }> {
  const owner = await createHospitalOwner();
  const patient = await createPatient(owner.actor, owner.hospitalId);
  const lineUserId = `U${randomUUID().replace(/-/gu, "")}`;
  await prisma.lineAccountBinding.create({ data: {
    userId: patient.userId, lineUserId, lineSubjectFingerprint: createHash("sha256").update(lineUserId).digest("hex"),
    lineSubjectFingerprintKeyId: "phase-c-integration-v1", reachability: LineReachability.FRIEND, reachabilityObservedAt: reminderNow,
  } });
  const medicationId = await addMedication(patient.actor, input.times ?? ["07:00"]);
  const optInAt = input.optInAt ?? reminderNow;
  await setOwnMedicationLineReminderPreference(patient.actor, true, { database: prisma, now: () => optInAt });
  return { patient, medicationId, lineUserId };
}

type PushCall = { lineUserId: string; text: string; retryKey: string };
function drainAt(now: Date | (() => Date), calls: PushCall[], respond: (call: PushCall) => LinePushResult = () => ({ kind: "ACCEPTED" })) {
  return drainMedicationLineReminderOutbox({
    database: prisma, now: typeof now === "function" ? now : () => now, random: () => 0.5, logSummary: () => undefined,
    push: async (lineUserId, text, retryKey) => { const call = { lineUserId, text, retryKey }; calls.push(call); return respond(call); },
  });
}

function reminderRows(ids: string[]) {
  return prisma.medicationLineReminderNotification.findMany({ where: { personalMedicationId: { in: ids } }, orderBy: [{ localDate: "asc" }, { localTime: "asc" }, { personalMedicationId: "asc" }] });
}

function barrier(): { entered: Promise<void>; release: () => void; wait: () => Promise<void> } {
  let signalEntered: () => void = () => undefined;
  let release: () => void = () => undefined;
  const entered = new Promise<void>((resolve) => { signalEntered = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  return { entered, release, wait: async () => { signalEntered(); await gate; } };
}

describe("Phase C engagement PostgreSQL workflow", () => {
  beforeAll(async () => {
    const url = process.env.DEMI_TEST_DATABASE_URL;
    if (!url || process.env.DATABASE_URL !== url || process.env.DIRECT_URL !== url || process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)) throw new Error("Verified local disposable PostgreSQL required");
    await prisma.$connect(); connected = true;
  });
  afterEach(async () => { revalidation.beforeEach = () => undefined; vi.unstubAllEnvs(); vi.restoreAllMocks(); await cleanup(); });
  afterAll(async () => { if (connected) { await cleanup(); await prisma.$disconnect(); } });

  it("materializes one Bangkok 07:00 occurrence and concurrent drains send one generic LINE message", async () => {
    const subject = await setupReminderSubject();
    const callBarrier = barrier();
    const calls: Array<{ lineUserId: string; text: string; retryKey: string }> = [];
    const dependencies = {
      database: prisma, now: () => reminderNow, batchSize: 20, logSummary: () => undefined,
      push: async (lineUserId: string, text: string, retryKey: string) => {
        calls.push({ lineUserId, text, retryKey });
        if (calls.length === 1) await callBarrier.wait();
        return { kind: "ACCEPTED" as const };
      },
    };
    const first = drainMedicationLineReminderOutbox(dependencies);
    await callBarrier.entered;
    const overlapping = await drainMedicationLineReminderOutbox(dependencies);
    callBarrier.release();
    const completed = await first;
    const rows = await prisma.medicationLineReminderNotification.findMany({ where: { personalMedicationId: subject.medicationId } });
    expect(overlapping.claimed).toBe(0);
    expect(completed.providerAccepted).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ lineUserId: subject.lineUserId, retryKey: rows[0]?.retryKey });
    expect(calls[0]?.text).not.toContain("ชื่อยาที่ห้ามอยู่ในข้อความ");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ localDate: new Date("2026-10-14T00:00:00.000Z"), localTime: new Date("1970-01-01T07:00:00.000Z"), state: "PROVIDER_ACCEPTED", attemptCount: 1 });
  });

  it.each([10, 50, 100, 200])("drains %i synchronized eligible patients across repeated scheduler batches without duplicates", async (size) => {
    const subjects = [];
    for (let index = 0; index < size; index += 1) subjects.push(await setupReminderSubject());
    await prisma.notificationSchedulerState.update({ where: { id: 1 }, data: { lastTickCompletedAt: null, lastTickStatus: null } });
    let clock = 0;
    const keys = new Set<string>();
    vi.spyOn(LineMessagingClient.prototype, "pushText").mockImplementation(async (_user, _text, retryKey) => {
      expect(keys.has(retryKey)).toBe(false);
      keys.add(retryKey); clock += 400; return { kind: "ACCEPTED" };
    });
    const tickStartedAt = performance.now();
    const result = await runNotificationSchedulerTick({
      database: prisma, now: () => new Date(reminderNow.getTime() + clock), monotonicNow: () => clock,
      drainAppointment: async () => ({ claimed: 0, remainingDue: 0 }),
      purgeAppointment: async () => 0, purgeMedication: async () => 0, logSummary: () => undefined,
    });
    expect(result).toMatchObject({ status: "COMPLETED", steps: { medicationDrain: { batches: Math.ceil(size / 5), counts: { providerAccepted: size, remainingDue: 0, deliveryWindowExpired: 0 } } } });
    process.stdout.write(`${JSON.stringify({ benchmark: "local-postgresql-mocked-line", size, simulatedProviderAndDbMs: clock, tickWallMs: Math.round(performance.now() - tickStartedAt) })}\n`);
    expect(keys.size).toBe(size);
    const rows = await reminderRows(subjects.map(({ medicationId }) => medicationId));
    expect(rows).toHaveLength(size);
    expect(rows.every((row) => row.state === "PROVIDER_ACCEPTED" && row.attemptCount === 1)).toBe(true);
    expect(clock).toBeLessThan(15 * 60_000);
  }, 120_000);

  it.each([1, 2])("releases an undispatched medication claim when the budget expires at revalidation %i", async (at) => {
    const subject = await setupReminderSubject();
    let allow = true;
    let checks = 0;
    revalidation.beforeEach = () => { checks += 1; if (checks === at) allow = false; };
    const push = vi.fn(async (): Promise<LinePushResult> => ({ kind: "ACCEPTED" }));
    const result = await drainMedicationLineReminderOutbox({ database: prisma, now: () => reminderNow,
      shouldContinue: () => allow, push, logSummary: () => undefined });
    expect(result).toMatchObject({ claimed: 1, remainingDue: 1, providerAccepted: 0 });
    expect(push).not.toHaveBeenCalled();
    expect(await reminderRows([subject.medicationId])).toMatchObject([{ state: "PENDING", attemptCount: 0, firstAttemptAt: null, leaseToken: null }]);
    revalidation.beforeEach = () => undefined;
    expect(await drainAt(reminderNow, [])).toMatchObject({ providerAccepted: 1, remainingDue: 0 });
  });

  it("restores a retry reservation on budget stop without losing its ambiguous outcome or stable key", async () => {
    const subject = await setupReminderSubject();
    const calls: PushCall[] = [];
    await drainAt(reminderNow, calls, () => ({ kind: "AMBIGUOUS_TRANSPORT_FAILURE" }));
    const [before] = await reminderRows([subject.medicationId]);
    if (!before) throw new Error("expected durable retry");
    let checks = 0;
    const push = vi.fn(async (): Promise<LinePushResult> => ({ kind: "ACCEPTED" }));
    const stopped = await drainMedicationLineReminderOutbox({ database: prisma, now: () => before.dueAt,
      shouldContinue: () => ++checks < 3, push, logSummary: () => undefined });
    expect(stopped).toMatchObject({ claimed: 1, remainingDue: 1 });
    expect(push).not.toHaveBeenCalled();
    expect(await reminderRows([subject.medicationId])).toMatchObject([{ state: "RETRY_SCHEDULED", attemptCount: 1,
      firstAttemptAt: before.firstAttemptAt, lastAttemptAt: before.lastAttemptAt,
      safeOutcome: "AMBIGUOUS_TRANSPORT_FAILURE", retryKey: before.retryKey, leaseToken: null }]);
    expect(await drainAt(before.dueAt, calls, () => ({ kind: "DUPLICATE_ACCEPTED" }))).toMatchObject({ providerAccepted: 1 });
    expect(calls.map(({ retryKey }) => retryKey)).toEqual([before.retryKey, before.retryKey]);
  });

  it("settles an owned slow attempt, stops mid-batch and recovers the remaining durable work after restart", async () => {
    const subject = await setupReminderSubject();
    await addMedication(subject.patient.actor, ["07:00"]);
    let clock = 0;
    const push = vi.fn(async (): Promise<LinePushResult> => { clock += 8_000; return { kind: "AMBIGUOUS_TRANSPORT_FAILURE" }; });
    const first = await drainMedicationLineReminderOutbox({ database: prisma, now: () => new Date(reminderNow.getTime() + clock),
      shouldContinue: () => clock < 1_000, push, random: () => 0.5, logSummary: () => undefined });
    expect(first).toMatchObject({ claimed: 1, retryScheduled: 1, remainingDue: 1 });
    expect(push).toHaveBeenCalledOnce();
    const recovered = await drainAt(new Date(reminderNow.getTime() + 300_000), []);
    expect(recovered).toMatchObject({ providerAccepted: 2, remainingDue: 0 });
  });

  it("does not materialize after medication reminders are opted out or the medication is stopped", async () => {
    const subject = await setupReminderSubject();
    await setOwnMedicationLineReminderPreference(subject.patient.actor, false, { database: prisma, now: () => reminderNow });
    const calls: string[] = [];
    const disabled = await drainMedicationLineReminderOutbox({ database: prisma, now: () => reminderNow, push: async () => { calls.push("push"); return { kind: "ACCEPTED" }; }, logSummary: () => undefined });
    expect(disabled.materialized).toBe(0);
    await setOwnMedicationLineReminderPreference(subject.patient.actor, true, { database: prisma, now: () => reminderNow });
    const medication = await prisma.personalMedication.findUniqueOrThrow({ where: { id: subject.medicationId }, select: { updatedAt: true } });
    await stopPersonalMedication(subject.patient.actor, { medicationId: subject.medicationId, expectedUpdatedAt: medication.updatedAt.toISOString() }, { database: prisma, now: () => reminderNow });
    const stopped = await drainMedicationLineReminderOutbox({ database: prisma, now: () => reminderNow, push: async () => { calls.push("push"); return { kind: "ACCEPTED" }; }, logSummary: () => undefined });
    expect(stopped.materialized).toBe(0);
    expect(calls).toEqual([]);
  });

  it("materializes an occurrence only up to its inclusive lateness bound", async () => {
    const subject = await setupReminderSubject();
    expect(await medicationLineReminderDeliveryInternals.materializeDueOccurrences(prisma, new Date(bangkok("2026-10-14T07:15:00.000").getTime() + 1))).toBe(0);
    const calls: PushCall[] = [];
    const onBound = await drainAt(bangkok("2026-10-14T07:15:00.000"), calls);
    expect(onBound).toMatchObject({ materialized: 1, providerAccepted: 1 });
    expect(calls).toHaveLength(1);
    expect(await reminderRows([subject.medicationId])).toMatchObject([{ dueAt: bangkok("2026-10-14T07:00:00.000"), state: "PROVIDER_ACCEPTED" }]);
  });

  it("does not catch up earlier same-day occurrences when the worker runs or the patient opts in at 20:00", async () => {
    const subject = await setupReminderSubject({ times: ["07:00", "12:00", "18:00", "20:00"], optInAt: bangkok("2026-10-14T20:00:00.000") });
    const calls: PushCall[] = [];
    expect(await drainAt(bangkok("2026-10-14T20:05:00.000"), calls)).toMatchObject({ materialized: 1, providerAccepted: 1 });
    expect(await drainAt(bangkok("2026-10-14T20:10:00.000"), calls)).toMatchObject({ materialized: 0, claimed: 0 });
    expect(calls).toHaveLength(1);
    expect(await reminderRows([subject.medicationId])).toMatchObject([{ localTime: new Date("1970-01-01T20:00:00.000Z"), dueAt: bangkok("2026-10-14T20:00:00.000"), state: "PROVIDER_ACCEPTED" }]);
  });

  it("delivers medications sharing one time exactly once each across overlapping drains", async () => {
    const subject = await setupReminderSubject();
    const secondMedicationId = await addMedication(subject.patient.actor, ["07:00"]);
    const calls: PushCall[] = [];
    const results = await Promise.all([drainAt(reminderNow, calls), drainAt(reminderNow, calls)]);
    const rows = await reminderRows([subject.medicationId, secondMedicationId]);
    expect(results.reduce((sum, { providerAccepted }) => sum + providerAccepted, 0)).toBe(2);
    expect(rows).toHaveLength(2);
    expect(rows.every(({ state, attemptCount }) => state === "PROVIDER_ACCEPTED" && attemptCount === 1)).toBe(true);
    expect(calls.map(({ retryKey }) => retryKey).sort()).toEqual(rows.map(({ retryKey }) => retryKey).sort());
    expect(calls.every(({ text }) => !text.includes("ชื่อยาที่ห้ามอยู่ในข้อความ"))).toBe(true);
  });

  it("computes occurrences across the Bangkok midnight and the UTC date boundary", async () => {
    const morning = await setupReminderSubject({ times: ["06:55"] });
    const calls: PushCall[] = [];
    expect(await drainAt(reminderNow, calls)).toMatchObject({ materialized: 1, providerAccepted: 1 });
    expect(await reminderRows([morning.medicationId])).toMatchObject([{ localDate: new Date("2026-10-14T00:00:00.000Z"), dueAt: new Date("2026-10-13T23:55:00.000Z") }]);
    const midnight = await setupReminderSubject({ times: ["00:00", "23:55"] });
    expect(await drainAt(new Date("2026-10-14T17:05:00.000Z"), calls)).toMatchObject({ materialized: 2, providerAccepted: 2 }); // 00:05 on 15 Oct in Bangkok.
    expect(await reminderRows([midnight.medicationId])).toMatchObject([
      { localDate: new Date("2026-10-14T00:00:00.000Z"), localTime: new Date("1970-01-01T23:55:00.000Z"), dueAt: new Date("2026-10-14T16:55:00.000Z") },
      { localDate: new Date("2026-10-15T00:00:00.000Z"), localTime: new Date("1970-01-01T00:00:00.000Z"), dueAt: new Date("2026-10-14T17:00:00.000Z") },
    ]);
    expect(calls).toHaveLength(3);
  });

  it("suppresses never-attempted occurrences after a prolonged worker outage without contacting LINE", async () => {
    const subject = await setupReminderSubject();
    expect(await medicationLineReminderDeliveryInternals.materializeDueOccurrences(prisma, bangkok("2026-10-14T07:01:00.000"))).toBe(1);
    const calls: PushCall[] = [];
    expect(await drainAt(bangkok("2026-10-14T13:00:00.000"), calls)).toMatchObject({ materialized: 0, claimed: 0, suppressed: 1, deliveryWindowExpired: 1 });
    expect(calls).toEqual([]);
    expect(await reminderRows([subject.medicationId])).toMatchObject([{ state: "SUPPRESSED", safeOutcome: "DELIVERY_WINDOW_EXPIRED", attemptCount: 0, firstAttemptAt: null }]);
  });

  it("does not start a first attempt that became late while the same batch was running", async () => {
    const subject = await setupReminderSubject();
    const secondMedicationId = await addMedication(subject.patient.actor, ["07:00"]);
    let clock = reminderNow;
    const calls: PushCall[] = [];
    const result = await drainAt(() => clock, calls, () => { clock = bangkok("2026-10-14T07:16:00.000"); return { kind: "ACCEPTED" }; });
    expect(result).toMatchObject({ materialized: 2, claimed: 2, providerAccepted: 1, suppressed: 1, deliveryWindowExpired: 1 });
    expect(calls).toHaveLength(1);
    const rows = await reminderRows([subject.medicationId, secondMedicationId]);
    expect(rows.map(({ state, safeOutcome }) => `${state}:${safeOutcome}`).sort()).toEqual(["PROVIDER_ACCEPTED:null", "SUPPRESSED:DELIVERY_WINDOW_EXPIRED"]);
  });

  it("prioritizes a due first attempt ahead of older retry work and still later settles that retry", async () => {
    const first = await setupReminderSubject();
    await drainAt(reminderNow, [], () => ({ kind: "RETRYABLE_HTTP_FAILURE" }));
    const fresh = await setupReminderSubject();
    await prisma.medicationLineReminderNotification.updateMany({ where: { personalMedicationId: first.medicationId }, data: { dueAt: new Date(reminderNow.getTime() - 1) } });
    const calls: string[] = [];
    await drainMedicationLineReminderOutbox({ database: prisma, now: () => reminderNow, batchSize: 1,
      push: async (user) => { calls.push(user); return { kind: "ACCEPTED" }; }, logSummary: () => undefined });
    expect(calls).toEqual([fresh.lineUserId]);
    expect(await drainAt(reminderNow, [])).toMatchObject({ providerAccepted: 1 });
    expect(await reminderRows([first.medicationId, fresh.medicationId])).toHaveLength(2);
  });

  it("retries an on-time occurrence after the lateness tolerance with the same retry key", async () => {
    const subject = await setupReminderSubject();
    const calls: PushCall[] = [];
    expect(await drainAt(reminderNow, calls, () => ({ kind: "RETRYABLE_HTTP_FAILURE" }))).toMatchObject({ materialized: 1, retryScheduled: 1 });
    const retried = await drainAt(bangkok("2026-10-14T09:00:00.000"), calls);
    expect(retried).toMatchObject({ materialized: 0, claimed: 1, providerAccepted: 1, suppressed: 0 });
    const [row] = await reminderRows([subject.medicationId]);
    expect(row).toMatchObject({ state: "PROVIDER_ACCEPTED", attemptCount: 2 });
    expect(calls.map(({ retryKey }) => retryKey)).toEqual([row?.retryKey, row?.retryKey]);
  });

  it.each([
    { stage: "eligibility before reservation", advanceOnRevalidation: 1 },
    { stage: "final eligibility after reservation", advanceOnRevalidation: 2 },
  ])("suppresses a 07:00 first attempt without calling LINE when 07:15 passes during $stage", async ({ advanceOnRevalidation }) => {
    const subject = await setupReminderSubject();
    let clock = reminderNow;
    let revalidations = 0;
    revalidation.beforeEach = () => { revalidations += 1; if (revalidations === advanceOnRevalidation) clock = bangkok("2026-10-14T07:15:00.001"); };
    const calls: PushCall[] = [];
    expect(await drainAt(() => clock, calls)).toMatchObject({ materialized: 1, claimed: 1, suppressed: 1, providerAccepted: 0 });
    expect(revalidations).toBe(advanceOnRevalidation);
    expect(calls).toEqual([]);
    expect(await reminderRows([subject.medicationId])).toMatchObject([{ state: "SUPPRESSED", safeOutcome: "DELIVERY_WINDOW_EXPIRED", attemptCount: 0, firstAttemptAt: null, lastAttemptAt: null, leaseToken: null, terminalAt: bangkok("2026-10-14T07:15:00.001") }]);
  });

  it("delivers a genuine retry even when the clock advances during its revalidation", async () => {
    const subject = await setupReminderSubject();
    const calls: PushCall[] = [];
    expect(await drainAt(reminderNow, calls, () => ({ kind: "RETRYABLE_HTTP_FAILURE" }))).toMatchObject({ retryScheduled: 1 });
    let clock = bangkok("2026-10-14T07:20:00.000");
    revalidation.beforeEach = () => { clock = new Date(clock.getTime() + 5_000); }; // Past 07:15 yet inside the 30-second lease.
    expect(await drainAt(() => clock, calls)).toMatchObject({ claimed: 1, providerAccepted: 1, suppressed: 0 });
    const [row] = await reminderRows([subject.medicationId]);
    expect(row).toMatchObject({ state: "PROVIDER_ACCEPTED", attemptCount: 2, firstAttemptAt: reminderNow });
    expect(calls.map(({ retryKey }) => retryKey)).toEqual([row?.retryKey, row?.retryKey]);
  });

  it("suppresses materialized occurrences when the medication stops or LINE reminders are disabled before delivery", async () => {
    const stoppedSubject = await setupReminderSubject();
    const disabledSubject = await setupReminderSubject();
    expect(await medicationLineReminderDeliveryInternals.materializeDueOccurrences(prisma, bangkok("2026-10-14T07:01:00.000"))).toBe(2);
    const medication = await prisma.personalMedication.findUniqueOrThrow({ where: { id: stoppedSubject.medicationId }, select: { updatedAt: true } });
    await stopPersonalMedication(stoppedSubject.patient.actor, { medicationId: stoppedSubject.medicationId, expectedUpdatedAt: medication.updatedAt.toISOString() }, { database: prisma, now: () => reminderNow });
    await setOwnMedicationLineReminderPreference(disabledSubject.patient.actor, false, { database: prisma, now: () => reminderNow });
    const calls: PushCall[] = [];
    expect(await drainAt(reminderNow, calls)).toMatchObject({ materialized: 0, claimed: 2, suppressed: 2, providerAccepted: 0 });
    expect(calls).toEqual([]);
    expect(await reminderRows([stoppedSubject.medicationId])).toMatchObject([{ state: "SUPPRESSED", safeOutcome: "STALE_SOURCE", attemptCount: 0 }]);
    expect(await reminderRows([disabledSubject.medicationId])).toMatchObject([{ state: "SUPPRESSED", safeOutcome: "OPT_IN_REVOKED", attemptCount: 0 }]);
  });

  it("delivers eligible reminders regardless of the removed deployment kill switch", async () => {
    const subject = await setupReminderSubject();
    vi.stubEnv("DEMI_LINE_MEDICATION_REMINDERS_DISABLED", "true");
    const calls: PushCall[] = [];
    expect(await drainAt(reminderNow, calls)).toMatchObject({ materialized: 1, claimed: 1, providerAccepted: 1, suppressed: 0 });
    expect(calls).toHaveLength(1);
    expect(await reminderRows([subject.medicationId])).toMatchObject([{ state: "PROVIDER_ACCEPTED", attemptCount: 1 }]);
    expect(await prisma.lineMedicationReminderPreference.findUniqueOrThrow({ where: { userId: subject.patient.userId } })).toMatchObject({ enabled: true });
  });

  it("reports pending medication reminders and the oldest pending age for operators", async () => {
    const subject = await setupReminderSubject();
    expect(await medicationLineReminderDeliveryInternals.materializeDueOccurrences(prisma, bangkok("2026-10-14T07:01:00.000"))).toBe(1);
    const readiness = await getNotificationSchedulerReadiness({ database: prisma, now: bangkok("2026-10-14T07:03:00.000") });
    expect(readiness.outboxes.medicationLineReminders).toEqual({ pending: 1, oldestPendingAgeSeconds: 120, oldestDueAgeSeconds: 180 });
    expect(JSON.stringify(readiness)).not.toContain(subject.medicationId);
    expect(JSON.stringify(readiness)).not.toContain(subject.patient.userId);
  });

  it("keeps identifiers and message content out of scheduler tick and drain logs", async () => {
    const subject = await setupReminderSubject();
    await prisma.notificationSchedulerState.update({ where: { id: 1 }, data: { lastTickCompletedAt: null } });
    const logs = (["log", "info", "warn", "error", "debug"] as const).map((level) => vi.spyOn(console, level).mockImplementation(() => undefined));
    const calls: PushCall[] = [];
    try {
      const result = await runNotificationSchedulerTick({
        database: prisma,
        now: () => reminderNow,
        drainMedication: () => drainMedicationLineReminderOutbox({
          database: prisma, now: () => reminderNow, random: () => 0.5,
          push: async (lineUserId, text, retryKey) => { calls.push({ lineUserId, text, retryKey }); return { kind: "ACCEPTED" }; },
        }),
      });
      expect(result).toMatchObject({ status: "COMPLETED", steps: { medicationDrain: { status: "COMPLETED", counts: { materialized: 1, providerAccepted: 1 } }, appointmentDrain: { status: "COMPLETED" }, appointmentPurge: { status: "COMPLETED" }, medicationPurge: { status: "COMPLETED" } } });
    } finally {
      await prisma.notificationSchedulerState.update({ where: { id: 1 }, data: { lastTickCompletedAt: null } });
    }
    expect(calls).toHaveLength(1);
    const [row] = await reminderRows([subject.medicationId]);
    const binding = await prisma.lineAccountBinding.findFirstOrThrow({ where: { userId: subject.patient.userId } });
    const logged = logs.flatMap((spy) => spy.mock.calls);
    expect(logged.map(([label]) => label)).toEqual(expect.arrayContaining(["notification_scheduler_tick", "medication_line_reminder_drain", "appointment_line_notification_drain"]));
    const serialized = JSON.stringify(logged);
    for (const forbidden of [subject.patient.userId, subject.patient.actor.personId, subject.patient.profileId, subject.patient.relationshipId, subject.medicationId, subject.lineUserId, binding.id, row?.id, row?.scheduleId, row?.retryKey, "ชื่อยาที่ห้ามอยู่ในข้อความ", MEDICATION_LINE_REMINDER_TEXT]) {
      expect(forbidden).toBeTruthy();
      expect(serialized).not.toContain(forbidden as string);
    }
  });

  // WB-DF-14 (Product Owner 2026-10-26): reports go to the platform ADMIN only; no Hospital role reads them.
  async function createAdmin(): Promise<{ actor: ActorContext; userId: string }> {
    return createUser(Role.ADMIN);
  }

  it("lets every non-ADMIN role submit, with or without a Hospital, and routes the report to the platform ADMIN inbox", async () => {
    const owner = await createHospitalOwner();
    const patient = await createPatient(owner.actor, owner.hospitalId);
    const osm = await createWorkforce(owner.hospitalId, Role.OSM);
    const member = await createWorkforce(owner.hospitalId, Role.HOSPITAL);
    const caregiver = await createUser(Role.CAREGIVER);
    const admin = await createAdmin();
    const withHospital: string[] = [];
    for (const actor of [patient.actor, osm, member, owner.actor]) {
      withHospital.push((await createSupportReport(actor, { hospitalId: owner.hospitalId, category: "BUG", message: "หน้าจอบันทึกไม่ตอบสนอง" }, { database: prisma, now: () => reminderNow })).id);
    }
    const caregiverReport = await createSupportReport(caregiver.actor, { category: "ACCESS", message: "เปิดหน้าครอบครัวไม่ได้" }, { database: prisma, now: () => reminderNow });
    const patientWithoutHospital = await createSupportReport(patient.actor, { category: "OTHER", message: "ไม่เกี่ยวกับโรงพยาบาลใด" }, { database: prisma, now: () => reminderNow });

    const inbox = await listAdminSupportReports(admin.actor, { hospitalId: owner.hospitalId }, prisma);
    expect(new Set(inbox.items.map(({ id }) => id))).toEqual(new Set(withHospital));
    expect(inbox.items.every(({ hospitalName }) => hospitalName === "โรงพยาบาลทดสอบ Phase C")).toBe(true);
    for (const id of [caregiverReport.id, patientWithoutHospital.id]) {
      const detail = await getAdminSupportReport(admin.actor, id, prisma);
      expect(detail.hospital).toBeNull();
    }
    expect(await prisma.auditEvent.findFirst({ where: { actorUserId: caregiver.userId, resourceId: caregiverReport.id, action: "support_report.created" }, select: { metadata: true } })).toEqual({ metadata: { hospitalId: null, category: "ACCESS" } });

    const initial = await getAdminSupportReport(admin.actor, withHospital[0], prisma);
    expect(initial).toMatchObject({ status: SupportReportStatus.NEW, message: "หน้าจอบันทึกไม่ตอบสนอง", hospital: { id: owner.hospitalId } });
    const acknowledged = await updateAdminSupportReportStatus(admin.actor, { reportId: initial.id, expectedUpdatedAt: initial.updatedAt, status: SupportReportStatus.ACKNOWLEDGED }, { database: prisma, now: () => reminderNow });
    await expect(updateAdminSupportReportStatus(admin.actor, { reportId: initial.id, expectedUpdatedAt: initial.updatedAt, status: SupportReportStatus.RESOLVED }, { database: prisma, now: () => reminderNow })).rejects.toBeInstanceOf(ConflictError);
    const resolved = await updateAdminSupportReportStatus(admin.actor, { reportId: initial.id, expectedUpdatedAt: acknowledged.updatedAt, status: SupportReportStatus.RESOLVED }, { database: prisma, now: () => reminderNow });
    expect(new Date(resolved.updatedAt).getTime()).toBeGreaterThan(new Date(acknowledged.updatedAt).getTime());
    expect(await getAdminSupportReport(admin.actor, initial.id, prisma)).toMatchObject({ status: SupportReportStatus.RESOLVED, resolvedAt: resolved.updatedAt });
    expect(await prisma.supportReport.findUniqueOrThrow({ where: { id: initial.id }, select: { statusUpdaterUserId: true } })).toEqual({ statusUpdaterUserId: admin.userId });
    expect(await prisma.auditEvent.count({ where: { actorUserId: admin.userId, resourceId: initial.id, action: { in: ["support_report.acknowledged", "support_report.resolved"] } } })).toBe(2);
    await expect(updateAdminSupportReportStatus(admin.actor, { reportId: initial.id, expectedUpdatedAt: resolved.updatedAt, status: SupportReportStatus.RESOLVED }, { database: prisma, now: () => reminderNow })).rejects.toBeInstanceOf(ConflictError);
    expect((await listAdminSupportReports(admin.actor, { hospitalId: owner.hospitalId, status: SupportReportStatus.RESOLVED }, prisma)).items.map(({ id }) => id)).toEqual([initial.id]);
    expect((await listAdminSupportReports(admin.actor, { hospitalId: owner.hospitalId, category: "ACCESS" }, prisma)).items).toEqual([]);
  });

  it("refuses a submitter who holds ADMIN in the database, alone, combined, or missing from the session snapshot", async () => {
    const owner = await createHospitalOwner();
    const admin = await createAdmin();
    const patient = await createPatient(owner.actor, owner.hospitalId);
    await expect(createSupportReport(admin.actor, { category: "BUG", message: "รายงานถึงตัวเอง" }, { database: prisma, now: () => reminderNow })).rejects.toBeInstanceOf(ForbiddenError);
    await prisma.userRole.create({ data: { userId: patient.userId, role: Role.ADMIN } });
    await expect(createSupportReport({ ...patient.actor, roles: [Role.PATIENT, Role.ADMIN] }, { category: "BUG", message: "ผู้ป่วยที่เป็น ADMIN" }, { database: prisma, now: () => reminderNow })).rejects.toBeInstanceOf(ForbiddenError);
    // A stale session without ADMIN is still refused by the persisted roles.
    await expect(createSupportReport(patient.actor, { hospitalId: owner.hospitalId, category: "BUG", message: "session เก่า" }, { database: prisma, now: () => reminderNow })).rejects.toBeInstanceOf(ForbiddenError);
    expect(await prisma.supportReport.count({ where: { reporterUserId: { in: [admin.userId, patient.userId] } } })).toBe(0);
  });

  it("accepts only an ACTIVE Hospital the reporter is currently related to", async () => {
    const owner = await createHospitalOwner();
    const otherOwner = await createHospitalOwner();
    const patient = await createPatient(owner.actor, owner.hospitalId);
    const caregiver = await createUser(Role.CAREGIVER);
    const send = (actor: ActorContext, hospitalId: string) => createSupportReport(actor, { hospitalId, category: "BUG", message: "ทดสอบขอบเขตโรงพยาบาล" }, { database: prisma, now: () => reminderNow });
    await expect(send(patient.actor, otherOwner.hospitalId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(send(caregiver.actor, owner.hospitalId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(send(patient.actor, randomUUID())).rejects.toBeInstanceOf(ForbiddenError);
    await prisma.hospital.update({ where: { id: owner.hospitalId }, data: { status: HospitalStatus.SUSPENDED } });
    await expect(send(patient.actor, owner.hospitalId)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await prisma.supportReport.count({ where: { reporterUserId: { in: [patient.userId, caregiver.userId] } } })).toBe(0);
    await expect(createSupportReport(patient.actor, { category: "BUG", message: "ไม่ระบุโรงพยาบาล" }, { database: prisma, now: () => reminderNow })).resolves.toMatchObject({ id: expect.any(String) });
  });

  it("gives no Hospital OWNER, forged session, demoted or suspended ADMIN any inbox access", async () => {
    const owner = await createHospitalOwner();
    const patient = await createPatient(owner.actor, owner.hospitalId);
    const report = await createSupportReport(patient.actor, { hospitalId: owner.hospitalId, category: "BUG", message: "รายงานในโรงพยาบาลของ OWNER" }, { database: prisma, now: () => reminderNow });
    const statusInput = { reportId: report.id, expectedUpdatedAt: report.createdAt, status: SupportReportStatus.ACKNOWLEDGED };
    const forgedOwner: ActorContext = { ...owner.actor, roles: [Role.HOSPITAL, Role.ADMIN] };
    const demoted = await createAdmin();
    await prisma.userRole.delete({ where: { userId_role: { userId: demoted.userId, role: Role.ADMIN } } });
    const suspended = await createAdmin();
    await prisma.user.update({ where: { id: suspended.userId }, data: { status: UserStatus.SUSPENDED } });
    for (const actor of [owner.actor, forgedOwner, demoted.actor, suspended.actor]) {
      await expect(listAdminSupportReports(actor, { hospitalId: owner.hospitalId }, prisma)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(getAdminSupportReport(actor, report.id, prisma)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(updateAdminSupportReportStatus(actor, statusInput, { database: prisma, now: () => reminderNow })).rejects.toBeInstanceOf(ForbiddenError);
    }
    // The OWNER is not the reporter, so the reporter history does not expose it either.
    await expect(getOwnSupportReport(owner.actor, report.id, prisma)).rejects.toBeInstanceOf(NotFoundError);
    expect(await prisma.supportReport.findUniqueOrThrow({ where: { id: report.id }, select: { status: true, statusUpdaterUserId: true } })).toEqual({ status: SupportReportStatus.NEW, statusUpdaterUserId: null });
  });

  it("shows a reporter only their own reports and current statuses", async () => {
    const owner = await createHospitalOwner();
    const patient = await createPatient(owner.actor, owner.hospitalId);
    const other = await createPatient(owner.actor, owner.hospitalId);
    const admin = await createAdmin();
    const own = await createSupportReport(patient.actor, { hospitalId: owner.hospitalId, category: "BUG", message: "รายงานของฉัน" }, { database: prisma, now: () => reminderNow });
    const later = await createSupportReport(patient.actor, { category: "OTHER", message: "รายงานที่สองของฉัน" }, { database: prisma, now: () => new Date(reminderNow.getTime() + 1_000) });
    const others = await createSupportReport(other.actor, { category: "BUG", message: "รายงานของคนอื่น" }, { database: prisma, now: () => reminderNow });
    const detail = await getAdminSupportReport(admin.actor, own.id, prisma);
    await updateAdminSupportReportStatus(admin.actor, { reportId: own.id, expectedUpdatedAt: detail.updatedAt, status: SupportReportStatus.ACKNOWLEDGED }, { database: prisma, now: () => reminderNow });

    const history = await listOwnSupportReports(patient.actor, {}, prisma);
    expect(history.items.map(({ id, status, hospitalName }) => ({ id, status, hospitalName }))).toEqual([
      { id: later.id, status: SupportReportStatus.NEW, hospitalName: null },
      { id: own.id, status: SupportReportStatus.ACKNOWLEDGED, hospitalName: "โรงพยาบาลทดสอบ Phase C" },
    ]);
    expect(history.nextCursor).toBeNull();
    expect(await getOwnSupportReport(patient.actor, own.id, prisma)).toMatchObject({ message: "รายงานของฉัน", status: SupportReportStatus.ACKNOWLEDGED });
    await expect(getOwnSupportReport(patient.actor, others.id, prisma)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getOwnSupportReport(patient.actor, randomUUID(), prisma)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("paginates the ADMIN inbox with a cursor bound to its ADMIN and exact filters", async () => {
    const owner = await createHospitalOwner();
    const admin = await createAdmin();
    const otherAdmin = await createAdmin();
    const rows = Array.from({ length: 26 }, (_, index) => ({
      id: randomUUID(), hospitalId: owner.hospitalId, reporterUserId: owner.userId,
      category: "OTHER" as const, message: `รายงานทดสอบ ${index}`, status: "NEW" as const,
      createdAt: new Date(reminderNow.getTime() + index), updatedAt: new Date(reminderNow.getTime() + index),
    }));
    await prisma.supportReport.createMany({ data: rows });
    const first = await listAdminSupportReports(admin.actor, { hospitalId: owner.hospitalId }, prisma);
    expect(first.items).toHaveLength(25); expect(first.nextCursor).toBeTruthy();
    const second = await listAdminSupportReports(admin.actor, { hospitalId: owner.hospitalId, cursor: first.nextCursor ?? undefined }, prisma);
    expect(second.items).toHaveLength(1); expect(second.nextCursor).toBeNull();
    expect(new Set([...first.items, ...second.items].map(({ id }) => id))).toEqual(new Set(rows.map(({ id }) => id)));
    const cursor = first.nextCursor ?? "";
    await expect(listAdminSupportReports(admin.actor, { hospitalId: owner.hospitalId, cursor: `${cursor}x` }, prisma)).rejects.toBeInstanceOf(ValidationError);
    // WB-DF-14 P1: the default view is NEW, so an explicit NEW continues it; ALL is a different view in both directions.
    expect((await listAdminSupportReports(admin.actor, { hospitalId: owner.hospitalId, status: SupportReportStatus.NEW, cursor }, prisma)).items).toHaveLength(1);
    await expect(listAdminSupportReports(admin.actor, { hospitalId: owner.hospitalId, status: "ALL", cursor }, prisma)).rejects.toBeInstanceOf(ValidationError);
    const allFirst = await listAdminSupportReports(admin.actor, { hospitalId: owner.hospitalId, status: "ALL" }, prisma);
    const allCursor = allFirst.nextCursor ?? "";
    expect(allCursor).not.toBe("");
    expect((await listAdminSupportReports(admin.actor, { hospitalId: owner.hospitalId, status: "ALL", cursor: allCursor }, prisma)).items).toHaveLength(1);
    await expect(listAdminSupportReports(admin.actor, { hospitalId: owner.hospitalId, cursor: allCursor }, prisma)).rejects.toBeInstanceOf(ValidationError);
    await expect(listAdminSupportReports(otherAdmin.actor, { hospitalId: owner.hospitalId, cursor }, prisma)).rejects.toBeInstanceOf(ValidationError);
    const ownHistory = await listOwnSupportReports(owner.actor, {}, prisma);
    expect(ownHistory.items).toHaveLength(25);
    await expect(listOwnSupportReports(owner.actor, { cursor }, prisma)).rejects.toBeInstanceOf(ValidationError);
    expect((await listOwnSupportReports(owner.actor, { cursor: ownHistory.nextCursor ?? "" }, prisma)).items).toHaveLength(1);
  });

  // WB-DF-14 P1 (Product Owner 2026-10-26): the inbox opens on NEW; ALL is an explicit, validated choice.
  it("opens the ADMIN inbox on NEW, lists every status only for an explicit ALL, and rejects an unknown status", async () => {
    const owner = await createHospitalOwner();
    const patient = await createPatient(owner.actor, owner.hospitalId);
    const admin = await createAdmin();
    const fresh = await createSupportReport(patient.actor, { hospitalId: owner.hospitalId, category: "BUG", message: "รายงานใหม่" }, { database: prisma, now: () => reminderNow });
    const handled = await createSupportReport(patient.actor, { hospitalId: owner.hospitalId, category: "BUG", message: "รายงานที่รับทราบแล้ว" }, { database: prisma, now: () => new Date(reminderNow.getTime() + 1_000) });
    const current = await getAdminSupportReport(admin.actor, handled.id, prisma);
    await updateAdminSupportReportStatus(admin.actor, { reportId: handled.id, expectedUpdatedAt: current.updatedAt, status: SupportReportStatus.ACKNOWLEDGED }, { database: prisma, now: () => reminderNow });

    const byDefault = await listAdminSupportReports(admin.actor, { hospitalId: owner.hospitalId }, prisma);
    expect(byDefault.status).toBe(SupportReportStatus.NEW);
    expect(byDefault.items.map(({ id }) => id)).toEqual([fresh.id]);
    const all = await listAdminSupportReports(admin.actor, { hospitalId: owner.hospitalId, status: "ALL" }, prisma);
    expect(all.status).toBe("ALL");
    expect(all.items.map(({ id }) => id)).toEqual([handled.id, fresh.id]);
    for (const status of ["", "all", "OPEN"]) {
      await expect(listAdminSupportReports(admin.actor, { hospitalId: owner.hospitalId, status }, prisma)).rejects.toBeInstanceOf(ValidationError);
    }
  });

  // WB-DF-14 P2 (Product Owner 2026-10-26): only the ADMIN detail names the reporter, by display name and current roles.
  it("names the reporter with current roles on the ADMIN detail only, without any other identifier", async () => {
    const owner = await createHospitalOwner();
    const patient = await createPatient(owner.actor, owner.hospitalId);
    const unnamed = await createUser(Role.CAREGIVER);
    const admin = await createAdmin();
    await prisma.userRole.create({ data: { userId: patient.userId, role: Role.OSM } });
    await prisma.person.update({ where: { id: unnamed.actor.personId }, data: { givenName: null, familyName: null } });
    const patientReport = await createSupportReport(patient.actor, { hospitalId: owner.hospitalId, category: "BUG", message: "ผู้แจ้งหลายบทบาท" }, { database: prisma, now: () => reminderNow });
    const unnamedReport = await createSupportReport(unnamed.actor, { category: "OTHER", message: "ผู้แจ้งไม่มีชื่อ" }, { database: prisma, now: () => reminderNow });
    const person = await prisma.person.findUniqueOrThrow({ where: { id: patient.actor.personId }, select: { givenName: true, familyName: true } });

    const detail = await getAdminSupportReport(admin.actor, patientReport.id, prisma);
    expect(detail.reporter).toEqual({ displayName: `${person.givenName ?? ""} ${person.familyName ?? ""}`.trim(), roles: [Role.OSM, Role.PATIENT] });
    expect((await getAdminSupportReport(admin.actor, unnamedReport.id, prisma)).reporter).toEqual({ displayName: "ไม่พบชื่อผู้ใช้", roles: [Role.CAREGIVER] });
    // Current roles, not a snapshot: a later role change shows on the next read.
    await prisma.userRole.delete({ where: { userId_role: { userId: patient.userId, role: Role.OSM } } });
    expect((await getAdminSupportReport(admin.actor, patientReport.id, prisma)).reporter.roles).toEqual([Role.PATIENT]);
    const serialized = JSON.stringify(detail);
    for (const forbidden of [patient.userId, patient.actor.personId]) expect(serialized).not.toContain(forbidden);

    const list = await listAdminSupportReports(admin.actor, { hospitalId: owner.hospitalId, status: "ALL" }, prisma);
    expect(list.items.length).toBeGreaterThan(0);
    for (const item of list.items) expect(Object.keys(item).sort()).toEqual(["category", "createdAt", "hospitalName", "id", "resolvedAt", "status", "updatedAt"]);
    expect(await getOwnSupportReport(patient.actor, patientReport.id, prisma)).not.toHaveProperty("reporter");
    expect(JSON.stringify(await listOwnSupportReports(patient.actor, {}, prisma))).not.toContain("reporter");
  });

  it("rate limits reports per user and keeps contact email separate from authentication", async () => {
    const owner = await createHospitalOwner();
    const patient = await createPatient(owner.actor, owner.hospitalId);
    for (let index = 0; index < 5; index += 1) await createSupportReport(patient.actor, { hospitalId: owner.hospitalId, category: "OTHER", message: `ปัญหาทดสอบ ${index}` }, { database: prisma, now: () => reminderNow });
    await expect(createSupportReport(patient.actor, { hospitalId: owner.hospitalId, category: "OTHER", message: "รายงานครั้งที่หก" }, { database: prisma, now: () => reminderNow })).rejects.toBeInstanceOf(SupportReportRateLimitError);
    const before = await prisma.user.findUniqueOrThrow({ where: { id: patient.userId }, select: { authSubject: true } });
    const contact = await updateOwnContactEmail(patient.actor, { email: "contact@example.org", expectedVersion: 0 }, { database: prisma, now: () => reminderNow });
    expect(contact).toEqual({ email: "contact@example.org", version: 1 });
    await expect(updateOwnContactEmail(patient.actor, { email: "other@example.org", expectedVersion: 0 }, { database: prisma, now: () => reminderNow })).rejects.toBeInstanceOf(ConflictError);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: patient.userId }, select: { authSubject: true } })).toEqual(before);
  });
});
