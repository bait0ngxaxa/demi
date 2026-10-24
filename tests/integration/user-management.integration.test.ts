import { createHash, randomUUID } from "node:crypto";
import {
  HospitalStatus,
  LineProviderCleanupState,
  LineReachability,
  MembershipStatus,
  MembershipType,
  PatientActivationPurpose,
  Profession,
  Role,
  UserStatus,
  UserTakeoverProviderState,
  WorkforceActivationMode,
  WorkforceActivationOperationState,
  WorkforceActivationPurpose,
} from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const authenticatedActor = vi.hoisted(() => vi.fn());
vi.mock("@/modules/auth/services/application-access-service", () => ({ getProtectedApplicationActor: authenticatedActor }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getPrisma } from "@/lib/db/prisma";
import { createAppointment } from "@/modules/appointments/services/appointment-service";
import { createActorContextStore, resolveActorAccessByAuthSubject } from "@/modules/auth/services/actor-context-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { THAI_NATIONAL_IDENTITY_NAMESPACE } from "@/modules/identity/schemas/identity-schemas";
import { updatePatientHealthHistory } from "@/modules/patient-hospital-profile/services/patient-health-history-service";
import {
  correctWorkforcePersonName,
  PatientNameCorrectionRequiresAdminError,
} from "@/modules/patient-hospital-profile/services/patient-name-correction-service";
import { confirmPatientImportAction, previewPatientImportAction } from "@/modules/patient-provisioning/transport/server-actions";
import { listHospitalUsers, getHospitalUserDetail } from "@/modules/user-management/services/user-directory-service";
import {
  deleteUnusedUserRecord,
  findRelationRegistryGaps,
  UserRecordNotDeletableError,
} from "@/modules/user-management/services/user-record-deletion-service";
import {
  lockSuspectedTakeover,
  UserTakeoverNotEligibleError,
  UserTakeoverRequiresAdminError,
} from "@/modules/user-management/services/user-takeover-service";
import type { UserKind } from "@/modules/user-management/domain/user-management-values";
import { provisionHospitalMember, provisionOsm } from "@/modules/workforce/services/workforce-service";
import { ConflictError, ForbiddenError, NotFoundError } from "@/shared/errors/application-error";

import { provisionPatientFixture } from "./support/patient-provisioning";
import { createTemplateUpload } from "./support/patient-import-template-upload";

const db = getPrisma();
const now = new Date("2026-10-22T03:00:00.000Z");
let sequence = 40_000;

function nationalIdFor(value: number): string {
  const firstTwelve = `3${String(value).padStart(11, "0")}`;
  const sum = Array.from(firstTwelve, Number).reduce((total, digit, index) => total + digit * (13 - index), 0);
  return `${firstTwelve}${(11 - (sum % 11)) % 10}`;
}

async function clearDatabase(): Promise<void> {
  await db.userTakeoverLock.deleteMany();
  await db.lineAccountBinding.deleteMany();
  await db.auditEvent.deleteMany();
  await db.appointmentLineNotification.deleteMany();
  await db.patientAppointmentCoordinationEvent.deleteMany();
  await db.patientAppointmentAssigneeAcceptance.deleteMany();
  await db.patientAppointment.deleteMany();
  await db.patientOsmAssignment.deleteMany();
  await db.patientHospitalHealthHistory.deleteMany();
  await db.patientBaseline.deleteMany();
  await db.patientClassificationHistory.deleteMany();
  await db.patientClassification.deleteMany();
  await db.patientActivation.deleteMany();
  await db.patientHospitalRelationship.deleteMany();
  await db.patientProfile.deleteMany();
  await db.workforceActivation.deleteMany();
  await db.osmHospitalRelationship.deleteMany();
  await db.hospitalMembership.deleteMany();
  await db.userRole.deleteMany();
  await db.$transaction([
    db.$executeRaw`SELECT set_config('demi.service_area_purge', 'demo-reset', true)`,
    db.hospitalServiceArea.deleteMany(),
  ]);
  await db.hospitalServiceAreaEligibility.deleteMany();
  await db.user.deleteMany();
  await db.hospital.deleteMany();
  await db.person.deleteMany();
}

async function hospital() {
  sequence += 1;
  return db.hospital.create({
    data: { hospitalCode: `UM1-${sequence}`, name: `โรงพยาบาล UM-1 ${sequence}`, status: HospitalStatus.ACTIVE },
    select: { id: true, hospitalCode: true, name: true },
  });
}

async function hospitalActor(hospitalId: string, membershipType: MembershipType = MembershipType.OWNER): Promise<ActorContext> {
  sequence += 1;
  const person = await db.person.create({ data: { identityKeyHash: `um1-actor-${sequence}`, givenName: "ผู้ดูแล", familyName: `${sequence}` } });
  const user = await db.user.create({ data: { personId: person.id, status: UserStatus.ACTIVE, authSubject: randomUUID(), roles: { create: [{ role: Role.HOSPITAL }] } } });
  await db.hospitalMembership.create({ data: { userId: user.id, hospitalId, membershipType, status: MembershipStatus.ACTIVE } });
  return {
    userId: user.id, personId: person.id, roles: [Role.HOSPITAL],
    hospitalMemberships: [{ hospitalId, membershipType, profession: null, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE }],
    osmHospitalRelationships: [],
  };
}

async function staff(owner: ActorContext, hospitalId: string, nationalId = nationalIdFor(++sequence)) {
  return provisionHospitalMember(owner, { contactPhone: "0812345678", nationalId, givenName: "บุคลากร", familyName: "ทดสอบ", targetHospitalId: hospitalId, profession: Profession.NURSE }, { database: db });
}

async function osm(owner: ActorContext, hospitalId: string, nationalId = nationalIdFor(++sequence)) {
  return provisionOsm(owner, { contactPhone: "0812345678", nationalId, givenName: "อสม", familyName: "ทดสอบ", targetHospitalId: hospitalId }, { database: db });
}

async function patient(owner: ActorContext, hospitalId: string, nationalId = nationalIdFor(++sequence), hospitalNumber?: string) {
  return provisionPatientFixture(owner, {
    identity: { namespace: THAI_NATIONAL_IDENTITY_NAMESPACE, value: nationalId },
    givenName: "ผู้ป่วย", familyName: "ทดสอบ", targetHospitalId: hospitalId, ...(hospitalNumber ? { hospitalNumber } : {}),
  }, { database: db });
}

/** Workforce provisioning refuses a pending Person at a second Hospital, so the shared case is seeded directly. */
async function osmElsewhere(userId: string, hospitalId: string): Promise<void> {
  await db.userRole.upsert({ where: { userId_role: { userId, role: Role.OSM } }, create: { userId, role: Role.OSM }, update: {} });
  await db.osmHospitalRelationship.create({ data: { userId, hospitalId, status: MembershipStatus.ACTIVE } });
}

async function activate(userId: string, options: { mode?: WorkforceActivationMode; purpose?: WorkforceActivationPurpose; createdBy?: string } = {}) {
  await db.user.update({ where: { id: userId }, data: { status: UserStatus.ACTIVE, authSubject: randomUUID() } });
  if (options.createdBy) {
    await db.workforceActivation.create({ data: {
      userId, tokenHash: randomUUID().replace(/-/gu, "").padEnd(64, "0"), mode: options.mode ?? WorkforceActivationMode.REMOTE,
      purpose: options.purpose ?? WorkforceActivationPurpose.ACTIVATION, expiresAt: now, claimedAt: now, usedAt: now,
      operationState: WorkforceActivationOperationState.FINALIZED, createdByUserId: options.createdBy,
    } });
  }
}

async function updatedAtOf(kind: UserKind, relationshipId: string): Promise<string> {
  const row = kind === "staff"
    ? await db.hospitalMembership.findUniqueOrThrow({ where: { id: relationshipId } })
    : kind === "osm"
      ? await db.osmHospitalRelationship.findUniqueOrThrow({ where: { id: relationshipId } })
      : await db.patientHospitalRelationship.findUniqueOrThrow({ where: { id: relationshipId } });
  return row.updatedAt.toISOString();
}

async function deletion(kind: UserKind, relationshipId: string, targetHospitalId: string) {
  return { kind, relationshipId, targetHospitalId, expectedUpdatedAt: await updatedAtOf(kind, relationshipId), confirmation: "ลบรายการ" };
}

async function takeover(kind: UserKind, relationshipId: string, targetHospitalId: string) {
  return { kind, relationshipId, targetHospitalId, expectedUpdatedAt: await updatedAtOf(kind, relationshipId), confirmation: "ไม่ใช่เจ้าของจริง" };
}

async function expectNotDeletable(owner: ActorContext, input: Awaited<ReturnType<typeof deletion>>, blocker: string) {
  const error = await deleteUnusedUserRecord(owner, input, db).catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(UserRecordNotDeletableError);
  expect((error as UserRecordNotDeletableError).blockers).toContain(blocker);
}

describe("UM-1 owner user management (PostgreSQL)", () => {
  beforeAll(async () => {
    await db.$connect();
    await clearDatabase();
  });
  afterEach(async () => {
    authenticatedActor.mockReset();
    await clearDatabase();
  });
  afterAll(async () => {
    await clearDatabase();
    await db.$disconnect();
  });

  it("classifies every relation of every touched model (unknown relation fails closed)", () => {
    expect(findRelationRegistryGaps()).toEqual([]);
    expect(findRelationRegistryGaps([
      { name: "User", fields: [{ name: "brandNewCareData", kind: "object" }] },
    ])).toEqual(expect.arrayContaining(["User.brandNewCareData", "Person"]));
  });

  describe("directory", () => {
    it("lists all three kinds for the OWNER with status, method, search and cursor filters", async () => {
      const h = await hospital();
      const owner = await hospitalActor(h.id);
      const pending = await staff(owner, h.id);
      const assisted = await staff(owner, h.id);
      await activate(assisted.userId, { mode: WorkforceActivationMode.ASSISTED, createdBy: owner.userId });
      const selfRegistered = await osm(owner, h.id);
      await activate(selfRegistered.userId);
      await db.osmHospitalRelationship.update({ where: { id: selfRegistered.relationshipId }, data: { selfRegisteredAt: now } });
      const invited = await patient(owner, h.id, undefined, "HN-UM1-1");
      await activate(invited.userId);
      await db.patientActivation.create({ data: {
        userId: invited.userId, hospitalId: h.id, tokenHash: randomUUID().replace(/-/gu, "").padEnd(64, "1"),
        purpose: PatientActivationPurpose.ACTIVATION, expiresAt: now, usedAt: now, createdByUserId: owner.userId,
      } });
      await patient(owner, h.id, undefined, "HN-UM1-2");

      const staffPage = await listHospitalUsers(owner, { targetHospitalId: h.id, kind: "staff" }, db);
      // The OWNER's own membership is listed too.
      expect(staffPage.rows.map(({ relationshipId }) => relationshipId)).toEqual(expect.arrayContaining([pending.relationshipId, assisted.relationshipId]));
      expect((await listHospitalUsers(owner, { targetHospitalId: h.id, kind: "staff", status: "PENDING" }, db)).rows.map(({ relationshipId }) => relationshipId))
        .toEqual([pending.relationshipId]);
      expect((await listHospitalUsers(owner, { targetHospitalId: h.id, kind: "staff", method: "ASSISTED" }, db)).rows)
        .toEqual([expect.objectContaining({ relationshipId: assisted.relationshipId, method: "ASSISTED", status: "ACTIVE" })]);
      expect((await listHospitalUsers(owner, { targetHospitalId: h.id, kind: "staff", method: "NOT_ACTIVATED" }, db)).rows.map(({ relationshipId }) => relationshipId))
        .toEqual([pending.relationshipId]);
      expect((await listHospitalUsers(owner, { targetHospitalId: h.id, kind: "osm", method: "SELF_REGISTERED" }, db)).rows)
        .toEqual([expect.objectContaining({ relationshipId: selfRegistered.relationshipId, method: "SELF_REGISTERED" })]);
      expect((await listHospitalUsers(owner, { targetHospitalId: h.id, kind: "patient", method: "INVITE" }, db)).rows)
        .toEqual([expect.objectContaining({ relationshipId: invited.relationshipId, hospitalNumber: "HN-UM1-1" })]);
      expect((await listHospitalUsers(owner, { targetHospitalId: h.id, kind: "patient", search: "HN-UM1-2" }, db)).rows).toHaveLength(1);

      const first = await listHospitalUsers(owner, { targetHospitalId: h.id, kind: "patient", pageSize: 1 }, db);
      expect(first.rows).toHaveLength(1);
      const second = await listHospitalUsers(owner, { targetHospitalId: h.id, kind: "patient", pageSize: 1, cursor: first.nextCursor! }, db);
      expect(second.rows).toHaveLength(1);
      expect(second.rows[0]?.relationshipId).not.toBe(first.rows[0]?.relationshipId);
      // A cursor never carries over to other filters.
      await expect(listHospitalUsers(owner, { targetHospitalId: h.id, kind: "staff", pageSize: 1, cursor: first.nextCursor! }, db)).rejects.toThrow();
    });

    it("denies a MEMBER, an OWNER of another Hospital and the detail of another Hospital's record", async () => {
      const h = await hospital();
      const other = await hospital();
      const owner = await hospitalActor(h.id);
      const member = await hospitalActor(h.id, MembershipType.MEMBER);
      const otherOwner = await hospitalActor(other.id);
      const record = await staff(owner, h.id);

      await expect(listHospitalUsers(member, { targetHospitalId: h.id, kind: "staff" }, db)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(listHospitalUsers(otherOwner, { targetHospitalId: h.id, kind: "staff" }, db)).rejects.toBeInstanceOf(ForbiddenError);
      // A stale context claiming OWNER is re-checked in the database.
      await expect(listHospitalUsers({ ...otherOwner, hospitalMemberships: owner.hospitalMemberships }, { targetHospitalId: h.id, kind: "staff" }, db))
        .rejects.toBeInstanceOf(ForbiddenError);
      expect((await getHospitalUserDetail(owner, { kind: "staff", relationshipId: record.relationshipId }, db)).contactPhone).toBe("0812345678");
      await expect(getHospitalUserDetail(member, { kind: "staff", relationshipId: record.relationshipId }, db)).rejects.toBeInstanceOf(NotFoundError);
      await expect(getHospitalUserDetail(otherOwner, { kind: "staff", relationshipId: record.relationshipId }, db)).rejects.toBeInstanceOf(NotFoundError);
      await expect(getHospitalUserDetail(owner, { kind: "staff", relationshipId: record.relationshipId }, db)).resolves.toMatchObject({
        status: "PENDING", deletionBlockers: [], activation: { method: "NOT_ACTIVATED", addedByName: expect.any(String) },
      });
    });
  });

  describe("ลบรายการ (hard delete of unused records)", () => {
    it("deletes an unused staff record, revokes its link, audits without identifiers and lets the same ID be added again", async () => {
      const h = await hospital();
      const owner = await hospitalActor(h.id);
      const nationalId = nationalIdFor(++sequence);
      const record = await staff(owner, h.id, nationalId);
      expect(await db.workforceActivation.count({ where: { userId: record.userId } })).toBe(1);

      await expect(deleteUnusedUserRecord(owner, await deletion("staff", record.relationshipId, h.id), db))
        .resolves.toEqual({ kind: "staff", hospitalId: h.id });
      expect(await db.user.count({ where: { id: record.userId } })).toBe(0);
      expect(await db.person.count({ where: { id: record.personId } })).toBe(0);
      expect(await db.workforceActivation.count({ where: { userId: record.userId } })).toBe(0);
      const audit = await db.auditEvent.findFirstOrThrow({ where: { action: "user_record.deleted" } });
      expect(audit).toMatchObject({ actorUserId: owner.userId, resourceType: "Hospital", resourceId: h.id, metadata: { kind: "staff", outcome: "DELETED" } });

      // Idempotent from the OWNER's view: a second request finds nothing to delete.
      await expect(deleteUnusedUserRecord(owner, { kind: "staff", relationshipId: record.relationshipId, targetHospitalId: h.id,
        expectedUpdatedAt: now.toISOString(), confirmation: "ลบรายการ" }, db)).rejects.toBeInstanceOf(NotFoundError);
      const again = await staff(owner, h.id, nationalId);
      expect(again.reusedExistingUser).toBe(false);
    });

    it("refuses staff that was activated, is an OWNER, is shared with another Hospital, or changed; and non-OWNERs", async () => {
      const h = await hospital();
      const other = await hospital();
      const owner = await hospitalActor(h.id);
      const member = await hospitalActor(h.id, MembershipType.MEMBER);
      const otherOwner = await hospitalActor(other.id);

      const activated = await staff(owner, h.id);
      await activate(activated.userId, { createdBy: owner.userId });
      await expectNotDeletable(owner, await deletion("staff", activated.relationshipId, h.id), "ACTIVATED");

      const secondOwner = await hospitalActor(h.id);
      const ownerMembership = await db.hospitalMembership.findFirstOrThrow({ where: { userId: secondOwner.userId } });
      await expectNotDeletable(owner, await deletion("staff", ownerMembership.id, h.id), "OWNER_MEMBERSHIP");

      const sharedId = nationalIdFor(++sequence);
      const shared = await staff(owner, h.id, sharedId);
      await osmElsewhere(shared.userId, other.id);
      await expectNotDeletable(owner, await deletion("staff", shared.relationshipId, h.id), "OTHER_RELATIONSHIP");

      const record = await staff(owner, h.id);
      await expect(deleteUnusedUserRecord(owner, { ...(await deletion("staff", record.relationshipId, h.id)), expectedUpdatedAt: now.toISOString() }, db))
        .rejects.toBeInstanceOf(ConflictError);
      await expect(deleteUnusedUserRecord(member, await deletion("staff", record.relationshipId, h.id), db)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(deleteUnusedUserRecord(otherOwner, await deletion("staff", record.relationshipId, h.id), db)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(deleteUnusedUserRecord(owner, { ...(await deletion("staff", record.relationshipId, h.id)), confirmation: "ลบ" }, db)).rejects.toThrow();
      expect(await db.hospitalMembership.count({ where: { id: record.relationshipId } })).toBe(1);
    });

    it("deletes an unused OSM and refuses one with an assignment or a started activation", async () => {
      const h = await hospital();
      const owner = await hospitalActor(h.id);
      const unused = await osm(owner, h.id);
      await expect(deleteUnusedUserRecord(owner, await deletion("osm", unused.relationshipId, h.id), db)).resolves.toMatchObject({ kind: "osm" });

      const assigned = await osm(owner, h.id);
      const target = await patient(owner, h.id);
      await db.patientOsmAssignment.create({ data: { patientHospitalRelationshipId: target.relationshipId, osmUserId: assigned.userId, assignedByUserId: owner.userId } });
      await expectNotDeletable(owner, await deletion("osm", assigned.relationshipId, h.id), "HAS_DATA");

      const claimed = await osm(owner, h.id);
      await db.workforceActivation.updateMany({ where: { userId: claimed.userId }, data: { claimedAt: now, operationState: WorkforceActivationOperationState.CLAIMED } });
      await expectNotDeletable(owner, await deletion("osm", claimed.relationshipId, h.id), "ACTIVATION_STARTED");
    });

    it("deletes an unused Patient and refuses one with an appointment, an assignment, another Hospital, an activation or ended care", async () => {
      const h = await hospital();
      const other = await hospital();
      const owner = await hospitalActor(h.id);
      const otherOwner = await hospitalActor(other.id);
      const nationalId = nationalIdFor(++sequence);
      const unused = await patient(owner, h.id, nationalId);
      await expect(getHospitalUserDetail(owner, { kind: "patient", relationshipId: unused.relationshipId }, db)).resolves.toMatchObject({ deletionBlockers: [] });
      await expect(deleteUnusedUserRecord(owner, await deletion("patient", unused.relationshipId, h.id), db)).resolves.toMatchObject({ kind: "patient" });
      expect(await db.patientProfile.count({ where: { personId: unused.personId } })).toBe(0);
      await expect(patient(owner, h.id, nationalId)).resolves.toMatchObject({ outcome: "CREATED" });

      const withAppointment = await patient(owner, h.id);
      await createAppointment(owner, { patientHospitalRelationshipId: withAppointment.relationshipId, submissionNonce: randomUUID(),
        scheduledAt: "2026-10-30T10:00:00+07:00", type: "FOLLOW_UP", responsibleUserId: null, locationType: "CLINIC", durationMinutes: 30 },
      { database: db, now: () => now });
      await expectNotDeletable(owner, await deletion("patient", withAppointment.relationshipId, h.id), "HAS_DATA");

      const assignedPatient = await patient(owner, h.id);
      const assignee = await osm(owner, h.id);
      await db.patientOsmAssignment.create({ data: { patientHospitalRelationshipId: assignedPatient.relationshipId, osmUserId: assignee.userId, assignedByUserId: owner.userId } });
      await expectNotDeletable(owner, await deletion("patient", assignedPatient.relationshipId, h.id), "HAS_DATA");

      const sharedId = nationalIdFor(++sequence);
      const shared = await patient(owner, h.id, sharedId);
      await patient(otherOwner, other.id, sharedId);
      await expectNotDeletable(owner, await deletion("patient", shared.relationshipId, h.id), "OTHER_RELATIONSHIP");

      const activated = await patient(owner, h.id);
      await activate(activated.userId);
      await expectNotDeletable(owner, await deletion("patient", activated.relationshipId, h.id), "ACTIVATED");

      const ended = await patient(owner, h.id);
      await db.patientHospitalRelationship.update({ where: { id: ended.relationshipId }, data: { endedAt: now, endedByUserId: owner.userId, endReason: "ทดสอบ" } });
      await expectNotDeletable(owner, await deletion("patient", ended.relationshipId, h.id), "REMOVED");
    });

    it("treats an unmodified Excel import snapshot as part of the record, and any later edit as data", async () => {
      const h = await hospital();
      const owner = await hospitalActor(h.id);
      authenticatedActor.mockResolvedValue(owner);
      const ids = [nationalIdFor(++sequence), nationalIdFor(++sequence)];
      const row = (nationalId: string) => ({
        nationalId, givenName: "สมหญิง", familyName: "นำเข้า", hospitalNumber: `HN-${nationalId.slice(-5)}`, gender: "หญิง",
        phoneNumber: "0812345678", weight: 70, height: 160, diabetesClassification: "กลุ่มเสี่ยง", historyHypertension: "มี", familyDiabetes: "ไม่มี",
      });
      const upload = await createTemplateUpload(h, ids.map(row));
      const form = new FormData();
      form.set("file", new File([await upload.arrayBuffer()], upload.name));
      form.set("targetHospitalId", h.id);
      form.set("effectiveDate", "2026-10-01");
      const preview = await previewPatientImportAction(form);
      if (preview.status !== "SUCCESS") throw new Error("Preview failed");
      form.set("previewTargetHospitalId", h.id);
      form.set("fileFingerprint", preview.preview.fileFingerprint);
      form.set("previewBinding", preview.preview.previewBinding);
      form.set("importContractVersion", preview.preview.importContractVersion);
      const confirmed = await confirmPatientImportAction(form);
      if (confirmed.status !== "SUCCESS") throw new Error("Import failed");

      const [first, second] = await Promise.all(ids.map((nationalId) => db.patientHospitalRelationship.findFirstOrThrow({
        where: { hospitalNumber: `HN-${nationalId.slice(-5)}` }, include: { baseline: true, healthHistory: true, hospitalProfile: true },
      })));
      expect(first?.baseline && first.healthHistory && first.hospitalProfile).toBeTruthy();
      await expect(deleteUnusedUserRecord(owner, await deletion("patient", first!.id, h.id), db)).resolves.toMatchObject({ kind: "patient" });
      expect(await db.patientBaseline.count({ where: { patientHospitalRelationshipId: first!.id } })).toBe(0);

      await updatePatientHealthHistory(owner, second!.id, {
        expectedVersion: 1, diabetes: "YES", hypertension: "YES", otherConditions: null, familyHypertension: "UNKNOWN",
        familyDiabetes: "NO", familyHeartDisease: "UNKNOWN", familyStroke: "UNKNOWN", diagnosisYear: null,
      }, db);
      await expectNotDeletable(owner, await deletion("patient", second!.id, h.id), "HAS_DATA");
    });
  });

  describe("name edit for staff and OSM (E3 rule)", () => {
    it("lets the OWNER correct a single-Hospital name with version CAS and refuses a shared Person", async () => {
      const h = await hospital();
      const other = await hospital();
      const owner = await hospitalActor(h.id);
      const otherOwner = await hospitalActor(other.id);
      const record = await staff(owner, h.id);
      const name = { expectedVersion: 1, givenName: "สมศรี", familyName: "แก้ไขแล้ว" };

      await expect(correctWorkforcePersonName(otherOwner, { kind: "staff", relationshipId: record.relationshipId }, name, db)).rejects.toBeInstanceOf(NotFoundError);
      await expect(correctWorkforcePersonName(owner, { kind: "staff", relationshipId: record.relationshipId }, name, db)).resolves.toEqual({ version: 2 });
      expect(await db.person.findUniqueOrThrow({ where: { id: record.personId } })).toMatchObject({ givenName: "สมศรี", version: 2 });
      await expect(correctWorkforcePersonName(owner, { kind: "staff", relationshipId: record.relationshipId }, { ...name, givenName: "อื่น" }, db))
        .rejects.toBeInstanceOf(ConflictError);
      expect(await db.auditEvent.findFirstOrThrow({ where: { action: "workforce.person_name.corrected" } })).toMatchObject({
        resourceType: "Person", resourceId: record.personId, metadata: expect.objectContaining({ kind: "staff", basis: "HOSPITAL_OWNER_SINGLE_HOSPITAL" }),
      });

      const sharedId = nationalIdFor(++sequence);
      const shared = await osm(owner, h.id, sharedId);
      await db.hospitalMembership.create({ data: { userId: shared.userId, hospitalId: other.id, membershipType: MembershipType.MEMBER, status: MembershipStatus.ACTIVE } });
      await expect(correctWorkforcePersonName(owner, { kind: "osm", relationshipId: shared.relationshipId }, name, db))
        .rejects.toBeInstanceOf(PatientNameCorrectionRequiresAdminError);
      // The national ID is never accepted as a name-edit field.
      await expect(correctWorkforcePersonName(owner, { kind: "osm", relationshipId: shared.relationshipId }, { ...name, nationalId: sharedId }, db)).rejects.toThrow();
    });
  });

  describe("บัญชีนี้ไม่ใช่เจ้าของจริง (suspected takeover)", () => {
    async function selfRegisteredOsm(owner: ActorContext, hospitalId: string) {
      const record = await osm(owner, hospitalId);
      const authSubject = randomUUID();
      await db.user.update({ where: { id: record.userId }, data: { status: UserStatus.ACTIVE, authSubject } });
      await db.osmHospitalRelationship.update({ where: { id: record.relationshipId }, data: { status: MembershipStatus.ACTIVE, selfRegisteredAt: now } });
      await db.workforceActivation.updateMany({ where: { userId: record.userId }, data: { revokedAt: now } });
      await db.workforceActivation.create({ data: {
        userId: record.userId, tokenHash: randomUUID().replace(/-/gu, "").padEnd(64, "2"), purpose: WorkforceActivationPurpose.SELF_REGISTRATION,
        expiresAt: now, claimedAt: now, usedAt: now, operationState: WorkforceActivationOperationState.FINALIZED, createdByUserId: record.userId,
      } });
      const lineUserId = `U${randomUUID().replace(/-/gu, "")}`;
      const binding = await db.lineAccountBinding.create({ data: {
        userId: record.userId, lineUserId, lineSubjectFingerprint: createHash("sha256").update(lineUserId).digest("hex"),
        lineSubjectFingerprintKeyId: "synthetic-um1", reachability: LineReachability.FRIEND, reachabilityObservedAt: now,
        linkedAt: new Date(now.getTime() + 60_000),
      } });
      return { ...record, authSubject, bindingId: binding.id };
    }

    it("locks the account in one transaction, revokes provider sessions outside it and stops access on the next request", async () => {
      const h = await hospital();
      const owner = await hospitalActor(h.id);
      const target = await selfRegisteredOsm(owner, h.id);
      const revokeProviderSessions = vi.fn(async () => "CONFIRMED" as const);

      await expect(lockSuspectedTakeover(owner, await takeover("osm", target.relationshipId, h.id), { database: db, now: () => now, revokeProviderSessions }))
        .resolves.toEqual({ providerState: UserTakeoverProviderState.CONFIRMED, alreadyLocked: false });
      expect(revokeProviderSessions).toHaveBeenCalledWith(target.authSubject);
      expect(await db.user.findUniqueOrThrow({ where: { id: target.userId } })).toMatchObject({ status: UserStatus.SUSPENDED });
      expect(await db.osmHospitalRelationship.findUniqueOrThrow({ where: { id: target.relationshipId } })).toMatchObject({ status: MembershipStatus.SUSPENDED });
      expect(await db.lineAccountBinding.findUniqueOrThrow({ where: { id: target.bindingId } })).toMatchObject({
        unlinkedAt: now, providerCleanupState: LineProviderCleanupState.PENDING,
      });
      expect(await db.userTakeoverLock.findUniqueOrThrow({ where: { userId: target.userId } })).toMatchObject({
        hospitalId: h.id, lockedByUserId: owner.userId, providerState: UserTakeoverProviderState.CONFIRMED,
      });
      expect(await db.auditEvent.findFirstOrThrow({ where: { action: "user.takeover_locked" } })).toMatchObject({
        actorUserId: owner.userId, resourceId: target.userId, metadata: expect.objectContaining({ hospitalId: h.id, relationshipsSuspended: 1, lineBindingsUnlinked: 1 }),
      });
      await expect(resolveActorAccessByAuthSubject(target.authSubject, createActorContextStore(db)))
        .resolves.toEqual({ status: "ACCOUNT_NOT_ACTIVE", accountStatus: UserStatus.SUSPENDED });
      await expect(getHospitalUserDetail(owner, { kind: "osm", relationshipId: target.relationshipId }, db)).resolves.toMatchObject({
        status: "SUSPENDED", takeoverBlock: "LOCKED", takeoverLock: { providerState: UserTakeoverProviderState.CONFIRMED },
      });
    });

    it("keeps an ambiguous provider result in quarantine and only retries the provider step", async () => {
      const h = await hospital();
      const owner = await hospitalActor(h.id);
      const target = await patient(owner, h.id);
      const authSubject = randomUUID();
      await db.user.update({ where: { id: target.userId }, data: { status: UserStatus.ACTIVE, authSubject } });
      const input = await takeover("patient", target.relationshipId, h.id);

      await expect(lockSuspectedTakeover(owner, input, { database: db, now: () => now, revokeProviderSessions: async () => "AMBIGUOUS" }))
        .resolves.toEqual({ providerState: UserTakeoverProviderState.RECONCILIATION_REQUIRED, alreadyLocked: false });
      await expect(resolveActorAccessByAuthSubject(authSubject, createActorContextStore(db))).resolves.toMatchObject({ status: "ACCOUNT_NOT_ACTIVE" });
      // A Patient relationship has no suspension; the care relationship stays as it was.
      expect(await db.patientHospitalRelationship.findUniqueOrThrow({ where: { id: target.relationshipId } })).toMatchObject({ endedAt: null });

      await expect(lockSuspectedTakeover(owner, input, { database: db, now: () => now, revokeProviderSessions: async () => { throw new Error("network"); } }))
        .resolves.toEqual({ providerState: UserTakeoverProviderState.RECONCILIATION_REQUIRED, alreadyLocked: true });
      await expect(lockSuspectedTakeover(owner, input, { database: db, now: () => now, revokeProviderSessions: async () => "CONFIRMED" }))
        .resolves.toEqual({ providerState: UserTakeoverProviderState.CONFIRMED, alreadyLocked: true });
      expect(await db.auditEvent.count({ where: { action: "user.takeover_locked" } })).toBe(1);
      expect(await db.auditEvent.count({ where: { action: "user.takeover_provider_sessions" } })).toBe(3);
    });

    it("refuses a shared Person, an unactivated account, an OWNER membership and the actor's own account", async () => {
      const h = await hospital();
      const other = await hospital();
      const owner = await hospitalActor(h.id);
      const otherOwner = await hospitalActor(other.id);
      const sharedId = nationalIdFor(++sequence);
      const shared = await staff(owner, h.id, sharedId);
      await osmElsewhere(shared.userId, other.id);
      await activate(shared.userId, { createdBy: owner.userId });
      await db.hospitalMembership.update({ where: { id: shared.relationshipId }, data: { status: MembershipStatus.ACTIVE } });
      const revokeProviderSessions = vi.fn(async () => "CONFIRMED" as const);
      const deps = { database: db, now: () => now, revokeProviderSessions };

      await expect(lockSuspectedTakeover(owner, await takeover("staff", shared.relationshipId, h.id), deps)).rejects.toBeInstanceOf(UserTakeoverRequiresAdminError);
      expect(await db.user.findUniqueOrThrow({ where: { id: shared.userId } })).toMatchObject({ status: UserStatus.ACTIVE });

      await expect(lockSuspectedTakeover(otherOwner, await takeover("staff", shared.relationshipId, h.id), deps)).rejects.toBeInstanceOf(ForbiddenError);

      const unactivated = await osm(owner, h.id);
      await expect(lockSuspectedTakeover(owner, await takeover("osm", unactivated.relationshipId, h.id), deps)).rejects.toBeInstanceOf(UserTakeoverNotEligibleError);

      const secondOwner = await hospitalActor(h.id);
      const ownerMembership = await db.hospitalMembership.findFirstOrThrow({ where: { userId: secondOwner.userId } });
      await expect(lockSuspectedTakeover(owner, await takeover("staff", ownerMembership.id, h.id), deps)).rejects.toBeInstanceOf(UserTakeoverNotEligibleError);
      const ownMembership = await db.hospitalMembership.findFirstOrThrow({ where: { userId: owner.userId } });
      await expect(lockSuspectedTakeover(owner, await takeover("staff", ownMembership.id, h.id), deps)).rejects.toBeInstanceOf(ForbiddenError);
      expect(revokeProviderSessions).not.toHaveBeenCalled();
    });
  });
});
