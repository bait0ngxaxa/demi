import { createHash, randomUUID } from "node:crypto";
import { HospitalStatus, LineReachability, MembershipStatus, MembershipType, Profession, Role, SupportReportStatus, UserStatus } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { createPersonalMedication, stopPersonalMedication } from "@/modules/medications/services/personal-medication-service";
import { setOwnMedicationLineReminderPreference } from "@/modules/medications/services/medication-line-reminder-preference-service";
import type { LinePushResult } from "@/modules/line/adapters/line-messaging-client";
import { drainMedicationLineReminderOutbox, medicationLineReminderDeliveryInternals } from "@/modules/medications/services/medication-line-reminder-delivery-service";
import { createSupportReport, getOwnerSupportReport, listOwnerSupportReports, SupportReportRateLimitError, updateOwnerSupportReportStatus } from "@/modules/support/services/support-report-service";
import { updateOwnContactEmail } from "@/modules/account-settings/services/contact-setting-service";
import { provisionPatient } from "@/modules/patient-provisioning/services/patient-provisioning-service";
import { ConflictError, ValidationError } from "@/shared/errors/application-error";

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
    await prisma.hospital.updateMany({ where: { id: { in: hospitalIds } }, data: { parentHospitalId: null } });
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
  afterEach(async () => { revalidation.beforeEach = () => undefined; await cleanup(); });
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
    expect(await drainAt(bangkok("2026-10-14T13:00:00.000"), calls)).toMatchObject({ materialized: 0, claimed: 0, suppressed: 1 });
    expect(calls).toEqual([]);
    expect(await reminderRows([subject.medicationId])).toMatchObject([{ state: "SUPPRESSED", safeOutcome: "DELIVERY_WINDOW_EXPIRED", attemptCount: 0, firstAttemptAt: null }]);
  });

  it("does not start a first attempt that became late while the same batch was running", async () => {
    const subject = await setupReminderSubject();
    const secondMedicationId = await addMedication(subject.patient.actor, ["07:00"]);
    let clock = reminderNow;
    const calls: PushCall[] = [];
    const result = await drainAt(() => clock, calls, () => { clock = bangkok("2026-10-14T07:16:00.000"); return { kind: "ACCEPTED" }; });
    expect(result).toMatchObject({ materialized: 2, claimed: 2, providerAccepted: 1, suppressed: 1 });
    expect(calls).toHaveLength(1);
    const rows = await reminderRows([subject.medicationId, secondMedicationId]);
    expect(rows.map(({ state, safeOutcome }) => `${state}:${safeOutcome}`).sort()).toEqual(["PROVIDER_ACCEPTED:null", "SUPPRESSED:DELIVERY_WINDOW_EXPIRED"]);
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

  it("routes reports from patient, OSM and staff to the hospital owner and audits status transitions", async () => {
    const owner = await createHospitalOwner();
    const patient = await createPatient(owner.actor, owner.hospitalId);
    const osm = await createWorkforce(owner.hospitalId, Role.OSM);
    const member = await createWorkforce(owner.hospitalId, Role.HOSPITAL);
    const reportIds: string[] = [];
    for (const actor of [patient.actor, osm, member]) {
      const created = await createSupportReport(actor, { hospitalId: owner.hospitalId, category: "BUG", message: "หน้าจอบันทึกไม่ตอบสนอง" }, { database: prisma, now: () => reminderNow });
      reportIds.push(created.id);
    }
    const inbox = await listOwnerSupportReports(owner.actor, { hospitalId: owner.hospitalId }, prisma);
    expect(new Set(inbox.items.map(({ id }) => id))).toEqual(new Set(reportIds));
    expect(inbox.items).toHaveLength(3);
    const initial = await getOwnerSupportReport(owner.actor, reportIds[0], prisma);
    const acknowledged = await updateOwnerSupportReportStatus(owner.actor, { reportId: initial.id, expectedUpdatedAt: initial.updatedAt, status: SupportReportStatus.ACKNOWLEDGED }, { database: prisma, now: () => reminderNow });
    const resolved = await updateOwnerSupportReportStatus(owner.actor, { reportId: initial.id, expectedUpdatedAt: acknowledged.updatedAt, status: SupportReportStatus.RESOLVED }, { database: prisma, now: () => reminderNow });
    expect((await getOwnerSupportReport(owner.actor, initial.id, prisma)).status).toBe(SupportReportStatus.RESOLVED);
    expect(await prisma.auditEvent.count({ where: { actorUserId: owner.userId, resourceId: initial.id, action: { in: ["support_report.acknowledged", "support_report.resolved"] } } })).toBe(2);
    expect(new Date(resolved.updatedAt).getTime()).toBeGreaterThan(new Date(acknowledged.updatedAt).getTime());
  });

  it("paginates the complete owner inbox with a cursor bound to its owner and hospital", async () => {
    const owner = await createHospitalOwner();
    const otherOwner = await createUser(Role.HOSPITAL);
    await prisma.hospitalMembership.create({ data: { userId: otherOwner.userId, hospitalId: owner.hospitalId, membershipType: MembershipType.OWNER, status: MembershipStatus.ACTIVE } });
    otherOwner.actor.hospitalMemberships = [{ hospitalId: owner.hospitalId, membershipType: MembershipType.OWNER, profession: null, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE }];
    const rows = Array.from({ length: 26 }, (_, index) => ({
      id: randomUUID(), hospitalId: owner.hospitalId, reporterUserId: owner.userId,
      category: "OTHER" as const, message: `รายงานทดสอบ ${index}`, status: "NEW" as const,
      createdAt: new Date(reminderNow.getTime() + index), updatedAt: new Date(reminderNow.getTime() + index),
    }));
    await prisma.supportReport.createMany({ data: rows });
    const first = await listOwnerSupportReports(owner.actor, { hospitalId: owner.hospitalId }, prisma);
    expect(first.items).toHaveLength(25); expect(first.nextCursor).toBeTruthy();
    const second = await listOwnerSupportReports(owner.actor, { hospitalId: owner.hospitalId, cursor: first.nextCursor ?? undefined }, prisma);
    expect(second.items).toHaveLength(1); expect(second.nextCursor).toBeNull();
    expect(new Set([...first.items, ...second.items].map(({ id }) => id))).toEqual(new Set(rows.map(({ id }) => id)));
    await expect(listOwnerSupportReports(owner.actor, { hospitalId: owner.hospitalId, cursor: `${first.nextCursor}x` }, prisma)).rejects.toBeInstanceOf(ValidationError);
    await expect(listOwnerSupportReports(otherOwner.actor, { hospitalId: owner.hospitalId, cursor: first.nextCursor ?? "" }, prisma)).rejects.toBeInstanceOf(ValidationError);
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
