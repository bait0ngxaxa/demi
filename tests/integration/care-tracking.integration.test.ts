import { randomUUID } from "node:crypto";
import {
  AppointmentStatus,
  AppointmentType,
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  PatientProgramStatus,
  Prisma,
  PrismaClient,
  Role,
  UserStatus,
} from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { CARE_SIGNALS, CARE_STAGES } from "@/modules/care-tracking/domain/care-stage";
import {
  careTrackingQueryInternals,
  getCareTrackingPage,
  type CareTrackingPage,
} from "@/modules/care-tracking/services/care-tracking-query-service";
import { attachHospitalServiceArea } from "@/modules/hospital-service-areas/services/hospital-service-area-service";
import { assignOsmToPatient } from "@/modules/patient-assignment/services/patient-osm-assignment-service";
import { endPatientHospitalRelationship } from "@/modules/patient-hospital-relationship/services/patient-hospital-relationship-end-service";
import { openPatientProgram } from "@/modules/patient-program/services/patient-program-service";
import { ForbiddenError } from "@/shared/errors/application-error";

import { provisionPatientFixture } from "./support/patient-provisioning";
import { clearProgramRoundCompletions, openProgramRound } from "./support/program-rounds";

const db = getPrisma();
const hospitals: string[] = [];
const users: string[] = [];
const people: string[] = [];
const DAY_MS = 24 * 60 * 60 * 1000;

async function hospital(kind: "PARENT" | "CHILD" = "CHILD"): Promise<string> {
  const row = await db.hospital.create({
    data: {
      hospitalCode: `CT-${randomUUID().slice(0, 20)}`,
      name: kind === "PARENT" ? "โรงพยาบาลติดตามการดูแล" : "รพ.สต.ติดตามการดูแล",
      status: HospitalStatus.ACTIVE,
      serviceAreaEligibility: { create: { kind, verifiedAt: new Date() } },
    },
  });
  hospitals.push(row.id);
  return row.id;
}

async function person(givenName: string, familyName: string): Promise<string> {
  const row = await db.person.create({ data: { identityKeyHash: randomUUID(), givenName, familyName } });
  people.push(row.id);
  return row.id;
}

async function staff(hospitalId: string, membershipType: MembershipType): Promise<ActorContext> {
  const personId = await person("บุคลากร", "ติดตาม");
  const user = await db.user.create({
    data: { personId, status: UserStatus.ACTIVE, authSubject: randomUUID(), roles: { create: { role: Role.HOSPITAL } } },
  });
  users.push(user.id);
  await db.hospitalMembership.create({ data: { userId: user.id, hospitalId, membershipType, status: MembershipStatus.ACTIVE } });
  return {
    userId: user.id,
    personId,
    roles: [Role.HOSPITAL],
    hospitalMemberships: [{ hospitalId, membershipType, profession: null, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE }],
    osmHospitalRelationships: [],
  };
}

async function osm(hospitalId: string): Promise<ActorContext> {
  const personId = await person("อสม.", "ประจำหมู่บ้าน");
  const user = await db.user.create({ data: { personId, status: UserStatus.ACTIVE, roles: { create: { role: Role.OSM } } } });
  users.push(user.id);
  await db.osmHospitalRelationship.create({ data: { userId: user.id, hospitalId, status: MembershipStatus.ACTIVE } });
  return {
    userId: user.id,
    personId,
    roles: [Role.OSM],
    hospitalMemberships: [],
    osmHospitalRelationships: [{ hospitalId, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE }],
  };
}

async function roleActor(role: Role): Promise<ActorContext> {
  const personId = await person("ผู้ใช้", "ไม่มีสิทธิ์");
  const user = await db.user.create({ data: { personId, status: UserStatus.ACTIVE, roles: { create: { role } } } });
  users.push(user.id);
  return { userId: user.id, personId, roles: [role], hospitalMemberships: [], osmHospitalRelationships: [] };
}

async function patient(owner: ActorContext, hospitalId: string, givenName: string, familyName: string, hospitalNumber?: string): Promise<{ relationshipId: string; userId: string }> {
  const provisioned = await provisionPatientFixture(owner, {
    identity: { namespace: "care-tracking", value: randomUUID() },
    targetHospitalId: hospitalId,
    givenName,
    familyName,
    ...(hospitalNumber ? { hospitalNumber } : {}),
  });
  users.push(provisioned.userId);
  people.push(provisioned.personId);
  return { relationshipId: provisioned.relationshipId, userId: provisioned.userId };
}

async function activeProgramId(relationshipId: string): Promise<string> {
  return (await db.patientProgram.findFirstOrThrow({ where: { patientHospitalRelationshipId: relationshipId, status: PatientProgramStatus.ACTIVE }, select: { id: true } })).id;
}

async function addCompletedExtraRound(programId: string, relationshipId: string, userId: string, complete: boolean): Promise<void> {
  await db.patientProgramRound.create({
    data: { patientProgramId: programId, patientHospitalRelationshipId: relationshipId, roundNumber: 7, origin: "EXTRA", openedAt: new Date(), openedByUserId: userId, submissionNonce: randomUUID() },
  });
  if (complete) {
    await db.patientProgramRoundCompletion.create({
      data: { patientProgramId: programId, patientHospitalRelationshipId: relationshipId, roundNumber: 7, completedByUserId: userId, submissionNonce: randomUUID() },
    });
  }
}

async function appointment(relationshipId: string, createdByUserId: string, scheduledAt: Date): Promise<void> {
  await db.patientAppointment.create({
    data: { patientHospitalRelationshipId: relationshipId, createdByUserId, type: AppointmentType.FOLLOW_UP, scheduledAt, status: AppointmentStatus.SCHEDULED, submissionNonce: randomUUID() },
  });
}

type Fixture = Awaited<ReturnType<typeof careFixture>>;

/** One Hospital with a Patient in every stage, an OSM, a second Hospital and an attached network Child. */
async function careFixture() {
  const hospitalId = await hospital("PARENT");
  const otherHospitalId = await hospital();
  const childHospitalId = await hospital();
  const owner = await staff(hospitalId, MembershipType.OWNER);
  const member = await staff(hospitalId, MembershipType.MEMBER);
  const otherOwner = await staff(otherHospitalId, MembershipType.OWNER);
  const childOwner = await staff(childHospitalId, MembershipType.OWNER);
  const assignedOsm = await osm(hospitalId);
  const now = new Date();

  const notStarted = await patient(owner, hospitalId, "กมล", "ยังไม่เริ่ม", `HN-${randomUUID().slice(0, 8)}`);
  const ready = await patient(owner, hospitalId, "ขวัญ", "รอเปิด");
  await db.patientBaseline.create({ data: { patientHospitalRelationshipId: ready.relationshipId, recordedOn: new Date(now.getTime() - 60 * DAY_MS), recordedByUserId: owner.userId } });
  await appointment(ready.relationshipId, owner.userId, new Date(now.getTime() + 7 * DAY_MS));

  const inRound = await patient(owner, hospitalId, "คณิต", "ครั้งที่หนึ่ง");
  await openPatientProgram(owner, { patientHospitalRelationshipId: inRound.relationshipId });
  await appointment(inRound.relationshipId, owner.userId, new Date(now.getTime() - 2 * DAY_MS));
  await assignOsmToPatient(owner, { patientHospitalRelationshipId: inRound.relationshipId, osmUserId: assignedOsm.userId });

  const extra = await patient(owner, hospitalId, "จันทร์", "ครั้งเพิ่มเติม");
  await openPatientProgram(owner, { patientHospitalRelationshipId: extra.relationshipId });
  const extraProgramId = await activeProgramId(extra.relationshipId);
  await openProgramRound(extraProgramId, 7);
  await addCompletedExtraRound(extraProgramId, extra.relationshipId, owner.userId, false);

  const awaitingAfter = await patient(owner, hospitalId, "ฉัตร", "รอประเมิน");
  await openPatientProgram(owner, { patientHospitalRelationshipId: awaitingAfter.relationshipId });
  const afterProgramId = await activeProgramId(awaitingAfter.relationshipId);
  await openProgramRound(afterProgramId, 7);
  await addCompletedExtraRound(afterProgramId, awaitingAfter.relationshipId, owner.userId, true);

  const awaitingEnd = await patient(owner, hospitalId, "ชล", "รอจบ");
  await openPatientProgram(owner, { patientHospitalRelationshipId: awaitingEnd.relationshipId });
  const endProgramId = await activeProgramId(awaitingEnd.relationshipId);
  await openProgramRound(endProgramId, 7);
  await db.patientFinalAssessment.create({ data: { patientProgramId: endProgramId, patientHospitalRelationshipId: awaitingEnd.relationshipId, recordedByUserId: owner.userId, weight: 70 } });

  const completed = await patient(owner, hospitalId, "ญาณ", "จบโปรแกรม");
  await db.patientProgram.create({ data: { patientHospitalRelationshipId: completed.relationshipId, createdByUserId: owner.userId, status: PatientProgramStatus.COMPLETED, startedAt: new Date(now.getTime() - 90 * DAY_MS), completedAt: now } });

  const ended = await patient(owner, hospitalId, "ฐิติ", "สิ้นสุด");
  await endPatientHospitalRelationship(owner, { relationshipId: ended.relationshipId, endReason: "ย้ายไปรับการดูแลที่อื่น", confirmRetention: true });

  const outsider = await patient(otherOwner, otherHospitalId, "ณัฐ", "ต่างโรงพยาบาล");
  const childPatient = await patient(childOwner, childHospitalId, "ดารา", "ลูกข่าย");
  await openPatientProgram(childOwner, { patientHospitalRelationshipId: childPatient.relationshipId });
  await attachHospitalServiceArea(owner, { parentHospitalId: hospitalId, childHospitalId });

  return {
    hospitalId, otherHospitalId, childHospitalId, owner, member, otherOwner, childOwner, assignedOsm,
    patients: { notStarted, ready, inRound, extra, awaitingAfter, awaitingEnd, completed, ended, outsider, childPatient },
  };
}

/** Patients created directly (no services) for paging, query-count and EXPLAIN fixtures. */
async function bulkPatients(hospitalId: string, ownerUserId: string, count: number, prefix: string): Promise<string[]> {
  const rows = Array.from({ length: count }, (_, index) => ({
    personId: randomUUID(),
    userId: randomUUID(),
    profileId: randomUUID(),
    relationshipId: randomUUID(),
    programId: randomUUID(),
    index,
  }));
  people.push(...rows.map((row) => row.personId));
  users.push(...rows.map((row) => row.userId));
  const now = Date.now();
  await db.person.createMany({ data: rows.map((row) => ({ id: row.personId, identityKeyHash: randomUUID(), givenName: `${prefix}${String(row.index).padStart(4, "0")}`, familyName: "ทดสอบ" })) });
  await db.user.createMany({ data: rows.map((row) => ({ id: row.userId, personId: row.personId, status: UserStatus.ACTIVE })) });
  await db.userRole.createMany({ data: rows.map((row) => ({ userId: row.userId, role: Role.PATIENT })) });
  await db.patientProfile.createMany({ data: rows.map((row) => ({ id: row.profileId, personId: row.personId })) });
  await db.patientHospitalRelationship.createMany({ data: rows.map((row) => ({ id: row.relationshipId, patientProfileId: row.profileId, hospitalId, hospitalNumber: `B${row.index}` })) });
  await db.patientBaseline.createMany({ data: rows.map((row) => ({ patientHospitalRelationshipId: row.relationshipId, recordedOn: new Date(now - (row.index % 90) * DAY_MS), recordedByUserId: ownerUserId })) });
  await db.patientProgram.createMany({ data: rows.map((row) => ({ id: row.programId, patientHospitalRelationshipId: row.relationshipId, createdByUserId: ownerUserId })) });
  await db.patientProgramRound.createMany({ data: rows.map((row) => ({ patientProgramId: row.programId, patientHospitalRelationshipId: row.relationshipId, roundNumber: 1, origin: "GUIDELINE" as const, openedAt: new Date(now - (row.index % 60) * DAY_MS), openedByUserId: ownerUserId, submissionNonce: randomUUID() })) });
  await db.patientAppointment.createMany({ data: rows.filter((row) => row.index % 3 !== 0).map((row) => ({ patientHospitalRelationshipId: row.relationshipId, createdByUserId: ownerUserId, type: AppointmentType.FOLLOW_UP, scheduledAt: new Date(now + ((row.index % 20) - 5) * DAY_MS), status: AppointmentStatus.SCHEDULED, submissionNonce: randomUUID() })) });
  return rows.map((row) => row.relationshipId);
}

async function cleanup(): Promise<void> {
  if (hospitals.length === 0) return;
  const relationshipWhere = { hospitalId: { in: hospitals } };
  const relationshipIds = (await db.patientHospitalRelationship.findMany({ where: relationshipWhere, select: { id: true } })).map(({ id }) => id);
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
    await tx.hospitalServiceArea.deleteMany({ where: { parentHospitalId: { in: hospitals } } });
  });
  await db.appointmentLineNotification.deleteMany({ where: { patientHospitalRelationshipId: { in: relationshipIds } } });
  await db.patientAppointmentCancellationRequest.deleteMany({ where: { appointment: { patientHospitalRelationship: relationshipWhere } } });
  await db.patientAppointment.deleteMany({ where: { patientHospitalRelationship: relationshipWhere } });
  await db.patientFinalAssessment.deleteMany({ where: { patientHospitalRelationship: relationshipWhere } });
  await clearProgramRoundCompletions((await db.patientProgram.findMany({ where: { patientHospitalRelationship: relationshipWhere }, select: { id: true } })).map((program) => program.id));
  await db.patientProgram.deleteMany({ where: { patientHospitalRelationship: relationshipWhere } });
  await db.patientBaseline.deleteMany({ where: { patientHospitalRelationship: relationshipWhere } });
  await db.patientHospitalProfile.deleteMany({ where: { relationship: relationshipWhere } });
  await db.patientOsmAssignment.deleteMany({ where: { patientHospitalRelationship: relationshipWhere } });
  await db.patientActivation.deleteMany({ where: { hospitalId: { in: hospitals } } });
  await db.auditEvent.deleteMany({ where: { actorUserId: { in: users } } });
  await db.patientHospitalHealthHistory.deleteMany({ where: { relationship: relationshipWhere } });
  await db.patientHospitalRelationship.deleteMany({ where: relationshipWhere });
  await db.patientProfile.deleteMany({ where: { personId: { in: people } } });
  await db.hospitalServiceAreaEligibility.deleteMany({ where: { hospitalId: { in: hospitals } } });
  await db.hospitalMembership.deleteMany({ where: { hospitalId: { in: hospitals } } });
  await db.osmHospitalRelationship.deleteMany({ where: { hospitalId: { in: hospitals } } });
  await db.userRole.deleteMany({ where: { userId: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.person.deleteMany({ where: { id: { in: people } } });
  await db.hospitalContact.deleteMany({ where: { hospitalId: { in: hospitals } } });
  await db.hospital.deleteMany({ where: { id: { in: hospitals } } });
  hospitals.length = 0;
  users.length = 0;
  people.length = 0;
}

function ids(page: CareTrackingPage): string[] {
  return page.items.map((item) => item.relationshipId);
}

function itemOf(page: CareTrackingPage, relationshipId: string) {
  const item = page.items.find((candidate) => candidate.relationshipId === relationshipId);
  expect(item).toBeDefined();
  return item as NonNullable<typeof item>;
}

describe("CT-1 care tracking read model / PostgreSQL", () => {
  beforeAll(async () => { await db.$connect(); });
  afterEach(cleanup);
  afterAll(async () => { await db.$disconnect(); });

  it("derives every stage for the OWNER's Hospital, sorts signals first and resolves the next step", async () => {
    const f: Fixture = await careFixture();
    const page = await getCareTrackingPage(f.owner, { hospitalId: f.hospitalId });
    const p = f.patients;

    expect(page.hospital).toMatchObject({ id: f.hospitalId, access: "DIRECT" });
    expect(new Set(ids(page))).toEqual(new Set([p.notStarted, p.ready, p.inRound, p.extra, p.awaitingAfter, p.awaitingEnd].map((x) => x.relationshipId)));
    expect(itemOf(page, p.notStarted.relationshipId)).toMatchObject({ stage: "NOT_STARTED", stageLabel: "ยังไม่เริ่ม", nextStep: { type: "BASELINE" }, roundStrip: [], currentRound: null });
    expect(itemOf(page, p.ready.relationshipId)).toMatchObject({ stage: "READY_FOR_PROGRAM", signals: { overdueAppointment: false, noUpcomingAppointment: false, stale: true }, nextStep: { type: "OPEN_PROGRAM" } });
    const inRound = itemOf(page, p.inRound.relationshipId);
    expect(inRound).toMatchObject({ stage: "IN_ROUND", signals: { overdueAppointment: true, noUpcomingAppointment: true, stale: false }, assignedOsmDisplayName: "อสม. ประจำหมู่บ้าน", nextStep: { type: "ROUND", roundNumber: 1 } });
    expect(inRound.currentRound).toMatchObject({ roundNumber: 1, doneItems: 0 });
    expect(inRound.currentRound?.plannedItems).toBeGreaterThan(0);
    const extra = itemOf(page, p.extra.relationshipId);
    expect(extra).toMatchObject({ stage: "IN_EXTRA_ROUND", currentRound: { roundNumber: 7, plannedItems: 0 }, nextStep: { type: "ROUND", roundNumber: 7 } });
    expect(extra.roundStrip.map((round) => [round.roundNumber, round.state])).toEqual([1, 2, 3, 4, 5, 6].map((n) => [n, "COMPLETED"]).concat([[7, "NOT_STARTED"]]));
    // ADR-0022: seven opened rounds all completed go to After (the fixed next-step bug).
    expect(itemOf(page, p.awaitingAfter.relationshipId)).toMatchObject({ stage: "AWAITING_AFTER", currentRound: null, nextStep: { type: "AFTER" } });
    expect(itemOf(page, p.awaitingEnd.relationshipId)).toMatchObject({ stage: "AWAITING_PROGRAM_END", nextStep: { type: "PROGRAM" } });
    // NOT_STARTED raises no signal, so it sorts after every patient with one.
    expect(ids(page).at(-1)).toBe(p.notStarted.relationshipId);
    expect(page.items[0]?.relationshipId).toBe(p.ready.relationshipId);
  });

  it("keeps summary counts equal to the filtered list totals", async () => {
    const f = await careFixture();
    const all = await getCareTrackingPage(f.owner, { hospitalId: f.hospitalId, includeEnded: true });
    expect(all.summary.total).toBe(all.total);

    for (const stage of CARE_STAGES) {
      const filtered = await getCareTrackingPage(f.owner, { hospitalId: f.hospitalId, includeEnded: true, stages: [stage] });
      expect(filtered.total, stage).toBe(all.summary.stages[stage]);
      expect(filtered.summary).toEqual(all.summary);
    }
    for (const signal of CARE_SIGNALS) {
      const filtered = await getCareTrackingPage(f.owner, { hospitalId: f.hospitalId, includeEnded: true, signals: [signal] });
      expect(filtered.total, signal).toBe(all.summary.signals[signal]);
    }
    expect(all.summary.stages).toMatchObject({ NOT_STARTED: 1, READY_FOR_PROGRAM: 1, IN_ROUND: 1, IN_EXTRA_ROUND: 1, AWAITING_AFTER: 1, AWAITING_PROGRAM_END: 1, PROGRAM_COMPLETED: 1, CARE_ENDED: 1 });
  });

  it("hides ended stages by default and shows ended care to the OWNER only", async () => {
    const f = await careFixture();
    const p = f.patients;
    const ownerAll = await getCareTrackingPage(f.owner, { hospitalId: f.hospitalId, includeEnded: true });
    expect(itemOf(ownerAll, p.completed.relationshipId).stage).toBe("PROGRAM_COMPLETED");
    expect(itemOf(ownerAll, p.ended.relationshipId)).toMatchObject({ stage: "CARE_ENDED", nextStep: { type: "NONE", reason: "READ_ONLY" } });

    const ownerDefault = await getCareTrackingPage(f.owner, { hospitalId: f.hospitalId });
    expect(ids(ownerDefault)).not.toContain(p.completed.relationshipId);
    expect(ids(ownerDefault)).not.toContain(p.ended.relationshipId);

    const memberAll = await getCareTrackingPage(f.member, { hospitalId: f.hospitalId, includeEnded: true });
    expect(ids(memberAll)).toContain(p.completed.relationshipId);
    expect(ids(memberAll)).not.toContain(p.ended.relationshipId);
    expect(memberAll.summary.stages.CARE_ENDED).toBe(0);
  });

  it("scopes an OSM to their assigned patients and refuses other actors", async () => {
    const f = await careFixture();
    const osmPage = await getCareTrackingPage(f.assignedOsm, { hospitalId: f.hospitalId, includeEnded: true });
    expect(ids(osmPage)).toEqual([f.patients.inRound.relationshipId]);
    expect(osmPage.items[0]?.nextStep).toMatchObject({ type: "ROUND", roundNumber: 1 });

    const memberPage = await getCareTrackingPage(f.member, { hospitalId: f.hospitalId });
    expect(ids(memberPage)).not.toContain(f.patients.outsider.relationshipId);

    await expect(getCareTrackingPage(f.assignedOsm, { hospitalId: f.otherHospitalId })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getCareTrackingPage(f.otherOwner, { hospitalId: f.hospitalId })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getCareTrackingPage(await roleActor(Role.CAREGIVER), { hospitalId: f.hospitalId })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getCareTrackingPage(await roleActor(Role.PATIENT), { hospitalId: f.hospitalId })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getCareTrackingPage(null, { hospitalId: f.hospitalId })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("reads one network Child read-only for the Parent, audited, and nothing else", async () => {
    const f = await careFixture();
    const page = await getCareTrackingPage(f.owner, { hospitalId: f.hospitalId, childHospitalId: f.childHospitalId });

    expect(page.hospital).toMatchObject({ id: f.childHospitalId, access: "NETWORK" });
    expect(ids(page)).toEqual([f.patients.childPatient.relationshipId]);
    expect(page.items[0]).toMatchObject({ stage: "IN_ROUND", assignedOsmDisplayName: null, nextStep: { type: "NONE", reason: "READ_ONLY" } });
    expect(page.items[0]?.currentRound?.steps.every((step) => step.evidence === null || step.evidence.byDisplayName === null)).toBe(true);
    const audits = await db.auditEvent.findMany({ where: { actorUserId: f.owner.userId, action: "patient.network_read" }, select: { resourceType: true, resourceId: true, metadata: true } });
    expect(audits).toEqual([{ resourceType: "Hospital", resourceId: f.childHospitalId, metadata: { parentHospitalId: f.hospitalId, childHospitalId: f.childHospitalId, scope: "care-tracking" } }]);

    await expect(getCareTrackingPage(f.owner, { hospitalId: f.hospitalId, childHospitalId: f.otherHospitalId })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getCareTrackingPage(f.member, { hospitalId: f.hospitalId, childHospitalId: f.childHospitalId })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getCareTrackingPage(f.childOwner, { hospitalId: f.childHospitalId, childHospitalId: f.hospitalId })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getCareTrackingPage(f.assignedOsm, { hospitalId: f.hospitalId, childHospitalId: f.childHospitalId })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("searches by name terms and exact HN", async () => {
    const f = await careFixture();
    const hn = (await db.patientHospitalRelationship.findUniqueOrThrow({ where: { id: f.patients.notStarted.relationshipId }, select: { hospitalNumber: true } })).hospitalNumber;

    expect(ids(await getCareTrackingPage(f.owner, { hospitalId: f.hospitalId, search: "  คณิต  ครั้ง " }))).toEqual([f.patients.inRound.relationshipId]);
    expect(ids(await getCareTrackingPage(f.owner, { hospitalId: f.hospitalId, search: hn ?? "" }))).toEqual([f.patients.notStarted.relationshipId]);
    const none = await getCareTrackingPage(f.owner, { hospitalId: f.hospitalId, search: "ณัฐ" });
    expect(none.items).toEqual([]);
    expect(none.summary.total).toBe(0);
  });

  it("pages every patient exactly once with a stable order", async () => {
    const hospitalId = await hospital();
    const owner = await staff(hospitalId, MembershipType.OWNER);
    const created = await bulkPatients(hospitalId, owner.userId, 25, "หน้า");

    const first = await getCareTrackingPage(owner, { hospitalId, page: 1 });
    const second = await getCareTrackingPage(owner, { hospitalId, page: 2 });
    const again = await getCareTrackingPage(owner, { hospitalId, page: 1 });

    expect(first).toMatchObject({ total: 25, totalPages: 2, page: 1, pageSize: 20 });
    expect(first.items).toHaveLength(20);
    expect(second.items).toHaveLength(5);
    expect(ids(again)).toEqual(ids(first));
    expect(new Set([...ids(first), ...ids(second)])).toEqual(new Set(created));
    expect((await getCareTrackingPage(owner, { hospitalId, page: 99 })).page).toBe(2);
  });

  it("uses the same number of SQL statements for 1 and 25 patients", async () => {
    const small = await hospital();
    const large = await hospital();
    const smallOwner = await staff(small, MembershipType.OWNER);
    const largeOwner = await staff(large, MembershipType.OWNER);
    await bulkPatients(small, smallOwner.userId, 1, "หนึ่ง");
    await bulkPatients(large, largeOwner.userId, 25, "ยี่สิบห้า");
    const traced = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
    const queries: string[] = [];
    traced.$on("query", ({ query }) => queries.push(query));

    try {
      const count = async (actor: ActorContext, hospitalId: string): Promise<number> => {
        queries.length = 0;
        await getCareTrackingPage(actor, { hospitalId }, { database: traced });
        // Prisma query events may reach Node after the query promise resolves.
        await new Promise<void>((resolve) => setImmediate(resolve));
        return queries.length;
      };
      await count(smallOwner, small);
      const one = await count(smallOwner, small);
      const many = await count(largeOwner, large);

      expect(many).toBe(one);
      console.info(`Care tracking SQL statements per request: ${one} (1 patient) / ${many} (25 patients)`);
    } finally {
      await traced.$disconnect();
    }
  });

  it("explains the coarse statement for a Hospital with 500 patients", async () => {
    const hospitalId = await hospital();
    const owner = await staff(hospitalId, MembershipType.OWNER);
    const relationshipIds = await bulkPatients(hospitalId, owner.userId, 500, "แผน");
    await db.$executeRaw`ANALYZE`;

    const statement = careTrackingQueryInternals.buildCoarseStatement(relationshipIds, new Date());
    const plan = await db.$queryRaw<{ "QUERY PLAN": string }[]>(Prisma.sql`EXPLAIN (ANALYZE, BUFFERS) ${statement}`);
    const text = plan.map((row) => row["QUERY PLAN"]).join("\n");
    console.info(`Care tracking coarse statement, 500 patients:\n${text}`);
    expect(text).toContain("Execution Time");

    // The test tables hold little more than this Hospital, so the planner may prefer sequential scans; with
    // them disabled every join of the statement must still have an index path (no unindexed large table).
    const indexedPlan = await db.$transaction(async (transaction) => {
      await transaction.$executeRaw`SET LOCAL enable_seqscan = off`;
      return transaction.$queryRaw<{ "QUERY PLAN": string }[]>(Prisma.sql`EXPLAIN ${statement}`);
    });
    const indexedText = indexedPlan.map((row) => row["QUERY PLAN"]).join("\n");
    console.info(`Care tracking coarse statement with sequential scans disabled:\n${indexedText}`);
    expect(indexedText).not.toContain("Seq Scan");

    const page = await getCareTrackingPage(owner, { hospitalId });
    expect(page.summary.total).toBe(500);
  }, 120_000);
});
