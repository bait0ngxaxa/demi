import { createHash, randomUUID } from "node:crypto";
import { HospitalStatus, LineReachability, MembershipStatus, MembershipType, Profession, Role, SupportReportStatus, UserStatus } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { createPersonalMedication, stopPersonalMedication } from "@/modules/medications/services/personal-medication-service";
import { setOwnMedicationLineReminderPreference } from "@/modules/medications/services/medication-line-reminder-preference-service";
import { drainMedicationLineReminderOutbox } from "@/modules/medications/services/medication-line-reminder-delivery-service";
import { createSupportReport, getOwnerSupportReport, listOwnerSupportReports, SupportReportRateLimitError, updateOwnerSupportReportStatus } from "@/modules/support/services/support-report-service";
import { updateOwnContactEmail } from "@/modules/account-settings/services/contact-setting-service";
import { provisionPatient } from "@/modules/patient-provisioning/services/patient-provisioning-service";
import { ConflictError, ValidationError } from "@/shared/errors/application-error";

const prisma = getPrisma();
const reminderNow = new Date("2026-10-14T02:00:00.000Z"); // 09:00 in Asia/Bangkok; the 07:00 occurrence is due.
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

async function setupReminderSubject(): Promise<{ patient: Awaited<ReturnType<typeof createPatient>>; medicationId: string; lineUserId: string }> {
  const owner = await createHospitalOwner();
  const patient = await createPatient(owner.actor, owner.hospitalId);
  const lineUserId = `U${randomUUID().replace(/-/gu, "")}`;
  await prisma.lineAccountBinding.create({ data: {
    userId: patient.userId, lineUserId, lineSubjectFingerprint: createHash("sha256").update(lineUserId).digest("hex"),
    lineSubjectFingerprintKeyId: "phase-c-integration-v1", reachability: LineReachability.FRIEND, reachabilityObservedAt: reminderNow,
  } });
  const medication = await createPersonalMedication(patient.actor, { medicationName: "ชื่อยาที่ห้ามอยู่ในข้อความ", instructionText: null, times: ["07:00"] }, { database: prisma, now: () => reminderNow });
  medicationIds.push(medication.id);
  await setOwnMedicationLineReminderPreference(patient.actor, true, { database: prisma, now: () => reminderNow });
  return { patient, medicationId: medication.id, lineUserId };
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
  afterEach(cleanup);
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
