import { randomUUID } from "node:crypto";
import { HospitalStatus, MembershipStatus, MembershipType, Role, UserStatus } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { THAI_NATIONAL_IDENTITY_NAMESPACE } from "@/modules/identity/schemas/identity-schemas";
import { assignOsmToPatient } from "@/modules/patient-assignment/services/patient-osm-assignment-service";
import { findPatientDirectory } from "@/modules/patient-directory/services/patient-directory-query-service";
import { endPatientHospitalRelationship } from "@/modules/patient-hospital-relationship/services/patient-hospital-relationship-end-service";
import {
  PatientHospitalRelationshipReopenHospitalInactiveError,
  previewPatientHospitalRelationshipReopen,
  reopenPatientHospitalRelationship,
} from "@/modules/patient-hospital-relationship/services/patient-hospital-relationship-reopen-service";
import { PatientProvisioningConflictError } from "@/modules/patient-provisioning/services/patient-provisioning-transaction";
import { ApplicationError, ConflictError, ForbiddenError, NotFoundError } from "@/shared/errors/application-error";

import { provisionPatientFixture as provisionPatient } from "./support/patient-provisioning";

const db = getPrisma();
const endedAt = new Date("2026-10-16T03:00:00Z");
const reopenedAt = new Date("2026-10-20T03:00:00Z");
const hospitals: string[] = [];
const users: string[] = [];
const people: string[] = [];
const END_REASON = "ย้ายไปรับการดูแลที่อื่น";
const REOPEN_REASON = "แอดมินโรงพยาบาลสิ้นสุดการดูแลผิดราย";

/** A national ID with a valid checksum, unique per call. */
function nationalId(): string {
  const body = `1${String(Math.floor(Math.random() * 1e11)).padStart(11, "0")}`;
  const sum = Array.from(body, Number).reduce((total, digit, index) => total + digit * (13 - index), 0);
  return `${body}${(11 - (sum % 11)) % 10}`;
}

async function account(roles: Role[]): Promise<ActorContext> {
  const person = await db.person.create({ data: { identityKeyHash: randomUUID(), givenName: "ทดสอบ", familyName: "เปิดการดูแล" } });
  people.push(person.id);
  const user = await db.user.create({ data: { personId: person.id, status: UserStatus.ACTIVE, authSubject: randomUUID(), roles: { create: roles.map((role) => ({ role })) } } });
  users.push(user.id);
  return { userId: user.id, personId: person.id, roles, hospitalMemberships: [], osmHospitalRelationships: [] };
}

async function staff(hospitalId: string, membershipType: MembershipType): Promise<ActorContext> {
  const actor = await account([Role.HOSPITAL]);
  await db.hospitalMembership.create({ data: { userId: actor.userId, hospitalId, membershipType, status: MembershipStatus.ACTIVE } });
  return { ...actor, hospitalMemberships: [{ hospitalId, membershipType, profession: null, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE }] };
}

async function osm(hospitalId: string): Promise<ActorContext> {
  const actor = await account([Role.OSM]);
  await db.osmHospitalRelationship.create({ data: { userId: actor.userId, hospitalId, status: MembershipStatus.ACTIVE } });
  return { ...actor, osmHospitalRelationships: [{ hospitalId, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE }] };
}

async function hospital(): Promise<string> {
  const row = await db.hospital.create({ data: { hospitalCode: randomUUID().slice(0, 32), name: "โรงพยาบาลเปิดการดูแล", status: HospitalStatus.ACTIVE } });
  hospitals.push(row.id);
  return row.id;
}

async function provision(owner: ActorContext, hospitalId: string, id: string) {
  const provisioned = await provisionPatient(owner, { identity: { namespace: THAI_NATIONAL_IDENTITY_NAMESPACE, value: id }, targetHospitalId: hospitalId, givenName: "สมหญิง", familyName: "ใจดี" });
  if (!users.includes(provisioned.userId)) users.push(provisioned.userId);
  if (!people.includes(provisioned.personId)) people.push(provisioned.personId);
  return provisioned;
}

/** Hospital A ended the Patient's care; Hospital B still cares for the same Patient. */
async function fixture() {
  const hospitalId = await hospital();
  const otherHospitalId = await hospital();
  const owner = await staff(hospitalId, MembershipType.OWNER);
  const member = await staff(hospitalId, MembershipType.MEMBER);
  const otherOwner = await staff(otherHospitalId, MembershipType.OWNER);
  const assignedOsm = await osm(hospitalId);
  const admin = await account([Role.ADMIN]);
  const id = nationalId();
  const provisioned = await provision(owner, hospitalId, id);
  const other = await provision(otherOwner, otherHospitalId, id);
  await assignOsmToPatient(owner, { patientHospitalRelationshipId: provisioned.relationshipId, osmUserId: assignedOsm.userId });
  await endPatientHospitalRelationship(owner, { relationshipId: provisioned.relationshipId, endReason: END_REASON, confirmRetention: true }, { database: db, now: () => endedAt });
  return { hospitalId, otherHospitalId, owner, member, otherOwner, osm: assignedOsm, admin, nationalId: id,
    relationshipId: provisioned.relationshipId, otherRelationshipId: other.relationshipId };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

function reopenInput(f: Fixture, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { hospitalId: f.hospitalId, nationalId: f.nationalId, reopenReason: REOPEN_REASON, expectedEndedAt: endedAt.toISOString(), ...overrides };
}

const dependencies = { database: db, now: () => reopenedAt };

async function cleanup(): Promise<void> {
  const relationshipIds = (await db.patientHospitalRelationship.findMany({ where: { hospitalId: { in: hospitals } }, select: { id: true } })).map(({ id }) => id);
  const profileIds = (await db.patientProfile.findMany({ where: { personId: { in: people } }, select: { id: true } })).map(({ id }) => id);
  await db.$transaction([
    db.$executeRaw`SELECT set_config('demi.service_area_purge', 'demo-reset', true)`,
    db.patientHospitalRelationshipReopening.deleteMany({ where: { hospitalId: { in: hospitals } } }),
  ]);
  await db.auditEvent.deleteMany({ where: { actorUserId: { in: users } } });
  await db.patientOsmAssignment.deleteMany({ where: { patientHospitalRelationshipId: { in: relationshipIds } } });
  await db.patientActivation.deleteMany({ where: { hospitalId: { in: hospitals } } });
  await db.patientHospitalHealthHistory.deleteMany({ where: { relationship: { id: { in: relationshipIds } } } });
  await db.patientHospitalProfile.deleteMany({ where: { relationship: { id: { in: relationshipIds } } } });
  await db.patientHospitalRelationship.deleteMany({ where: { id: { in: relationshipIds } } });
  await db.patientProfile.deleteMany({ where: { id: { in: profileIds } } });
  await db.osmHospitalRelationship.deleteMany({ where: { OR: [{ hospitalId: { in: hospitals } }, { userId: { in: users } }] } });
  await db.hospitalMembership.deleteMany({ where: { hospitalId: { in: hospitals } } });
  await db.userRole.deleteMany({ where: { userId: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.person.deleteMany({ where: { id: { in: people } } });
  await db.hospital.deleteMany({ where: { id: { in: hospitals } } });
  hospitals.length = 0; users.length = 0; people.length = 0;
}

describe("ADR-0032: a platform ADMIN reopens an ended care relationship (PostgreSQL)", () => {
  beforeAll(async () => { await db.$connect(); });
  afterEach(cleanup);
  afterAll(async () => { await db.$disconnect(); });

  it("reopens the row, keeps the cleared end and the reopen in history, and the Hospital sees the Patient again", async () => {
    const f = await fixture();
    const before = await findPatientDirectory(f.owner, { targetHospitalId: f.hospitalId, lookupType: "NAME", page: 1 }, { database: db });
    expect(before.items.map(({ patientHospitalRelationshipId }) => patientHospitalRelationshipId)).not.toContain(f.relationshipId);

    expect(await previewPatientHospitalRelationshipReopen(f.admin, { hospitalId: f.hospitalId, nationalId: f.nationalId }, { database: db }))
      .toEqual({ maskedName: expect.any(String), endedAt });
    const result = await reopenPatientHospitalRelationship(f.admin, reopenInput(f), dependencies);

    expect(result).toMatchObject({ relationshipId: f.relationshipId, hospitalId: f.hospitalId, reopenedAt, activationLinkRequired: true });
    expect(result.maskedName).not.toContain("สมหญิง");
    expect(await db.patientHospitalRelationship.findUniqueOrThrow({ where: { id: f.relationshipId } }))
      .toMatchObject({ endedAt: null, endedByUserId: null, endReason: null });
    expect(await db.patientHospitalRelationshipReopening.findMany({ where: { patientHospitalRelationshipId: f.relationshipId } })).toEqual([
      expect.objectContaining({
        hospitalId: f.hospitalId,
        previousEndedAt: endedAt,
        previousEndedByUserId: f.owner.userId,
        previousEndReason: END_REASON,
        reopenedAt,
        reopenedByUserId: f.admin.userId,
        reopenReason: REOPEN_REASON,
      }),
    ]);
    const audit = await db.auditEvent.findFirstOrThrow({ where: { action: "patient.hospital_relationship.reopened", resourceId: f.relationshipId } });
    expect(audit.actorUserId).toBe(f.admin.userId);
    expect(JSON.stringify(audit.metadata)).not.toContain(REOPEN_REASON);
    expect(JSON.stringify(audit.metadata)).not.toContain(END_REASON);
    expect(audit.metadata).toMatchObject({ hospitalId: f.hospitalId, previousEndedAt: endedAt.toISOString(), reopenedAt: reopenedAt.toISOString() });

    const after = await findPatientDirectory(f.owner, { targetHospitalId: f.hospitalId, lookupType: "NAME", page: 1 }, { database: db });
    expect(after.items.map(({ patientHospitalRelationshipId }) => patientHospitalRelationshipId)).toContain(f.relationshipId);
    // Nothing else is restored: the ended OSM assignment stays ended.
    expect(await db.patientOsmAssignment.count({ where: { patientHospitalRelationshipId: f.relationshipId, endedAt: null } })).toBe(0);
    // Re-import of the same national ID no longer answers ENDED_RELATIONSHIP; it reuses the same relationship.
    const readded = await provision(f.owner, f.hospitalId, f.nationalId);
    expect(readded.relationshipId).toBe(f.relationshipId);
    // The other Hospital's relationship is untouched.
    expect(await db.patientHospitalRelationship.findUniqueOrThrow({ where: { id: f.otherRelationshipId } })).toMatchObject({ endedAt: null });
  });

  it("before a reopen, the same national ID answers ENDED_RELATIONSHIP and a direct database clear is still refused", async () => {
    const f = await fixture();
    await expect(provision(f.owner, f.hospitalId, f.nationalId)).rejects.toMatchObject({ kind: "ENDED_RELATIONSHIP" });
    await expect(provision(f.owner, f.hospitalId, f.nationalId)).rejects.toBeInstanceOf(PatientProvisioningConflictError);
    await expect(db.patientHospitalRelationship.update({ where: { id: f.relationshipId }, data: { endedAt: null, endedByUserId: null, endReason: null } })).rejects.toThrow();
  });

  it("refuses the Hospital owner, staff, อสม. and an ADMIN role that is no longer persisted", async () => {
    const f = await fixture();
    for (const actor of [f.owner, f.member, f.osm]) {
      await expect(reopenPatientHospitalRelationship(actor, reopenInput(f), dependencies)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(previewPatientHospitalRelationshipReopen(actor, { hospitalId: f.hospitalId, nationalId: f.nationalId }, { database: db })).rejects.toBeInstanceOf(ForbiddenError);
      // A forged ADMIN role in the actor context is not enough.
      await expect(reopenPatientHospitalRelationship({ ...actor, roles: [...actor.roles, Role.ADMIN] }, reopenInput(f), dependencies)).rejects.toBeInstanceOf(ForbiddenError);
    }
    await db.userRole.deleteMany({ where: { userId: f.admin.userId } });
    await expect(reopenPatientHospitalRelationship(f.admin, reopenInput(f), dependencies)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await db.patientHospitalRelationship.findUniqueOrThrow({ where: { id: f.relationshipId } })).toMatchObject({ endedAt });
    expect(await db.patientHospitalRelationshipReopening.count({ where: { patientHospitalRelationshipId: f.relationshipId } })).toBe(0);
  });

  it("answers the same not-found for an unknown person, another Hospital's relationship and a relationship that is not ended", async () => {
    const f = await fixture();
    const unknown = reopenPatientHospitalRelationship(f.admin, reopenInput(f, { nationalId: nationalId() }), dependencies);
    const otherHospital = reopenPatientHospitalRelationship(f.admin, reopenInput(f, { hospitalId: f.otherHospitalId }), dependencies);
    const elsewhere = await hospital();
    const noRelationship = reopenPatientHospitalRelationship(f.admin, reopenInput(f, { hospitalId: elsewhere }), dependencies);
    for (const attempt of [unknown, otherHospital, noRelationship]) {
      await expect(attempt).rejects.toBeInstanceOf(NotFoundError);
      await expect(attempt).rejects.toMatchObject({ message: new NotFoundError().message });
    }
    await expect(previewPatientHospitalRelationshipReopen(f.admin, { hospitalId: f.otherHospitalId, nationalId: f.nationalId }, { database: db })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses a Hospital that is not ACTIVE and changes nothing", async () => {
    const f = await fixture();
    await db.hospital.update({ where: { id: f.hospitalId }, data: { status: HospitalStatus.SUSPENDED } });
    await expect(reopenPatientHospitalRelationship(f.admin, reopenInput(f), dependencies)).rejects.toBeInstanceOf(PatientHospitalRelationshipReopenHospitalInactiveError);
    expect(await db.patientHospitalRelationship.findUniqueOrThrow({ where: { id: f.relationshipId } })).toMatchObject({ endedAt, endReason: END_REASON });
    expect(await db.patientHospitalRelationshipReopening.count({ where: { patientHospitalRelationshipId: f.relationshipId } })).toBe(0);
  });

  it("refuses a reopen confirmed against a different end, and a blank reason", async () => {
    const f = await fixture();
    await expect(reopenPatientHospitalRelationship(f.admin, reopenInput(f, { expectedEndedAt: reopenedAt.toISOString() }), dependencies)).rejects.toBeInstanceOf(ConflictError);
    await expect(reopenPatientHospitalRelationship(f.admin, reopenInput(f, { reopenReason: "   " }), dependencies)).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await db.patientHospitalRelationship.findUniqueOrThrow({ where: { id: f.relationshipId } })).toMatchObject({ endedAt });
  });

  it("two concurrent reopens commit exactly once and write one history row", async () => {
    const f = await fixture();
    const results = await Promise.allSettled([
      reopenPatientHospitalRelationship(f.admin, reopenInput(f), dependencies),
      reopenPatientHospitalRelationship(f.admin, reopenInput(f), dependencies),
    ]);
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    expect(rejected?.reason).toBeInstanceOf(ApplicationError);
    expect(["CONFLICT", "NOT_FOUND"]).toContain((rejected?.reason as ApplicationError).code);
    expect(await db.patientHospitalRelationshipReopening.count({ where: { patientHospitalRelationshipId: f.relationshipId } })).toBe(1);
    expect(await db.auditEvent.count({ where: { action: "patient.hospital_relationship.reopened", resourceId: f.relationshipId } })).toBe(1);
    expect(await db.patientHospitalRelationship.findUniqueOrThrow({ where: { id: f.relationshipId } })).toMatchObject({ endedAt: null });
  });

  it("keeps the history append-only", async () => {
    const f = await fixture();
    await reopenPatientHospitalRelationship(f.admin, reopenInput(f), dependencies);
    const row = await db.patientHospitalRelationshipReopening.findFirstOrThrow({ where: { patientHospitalRelationshipId: f.relationshipId } });
    await expect(db.patientHospitalRelationshipReopening.update({ where: { id: row.id }, data: { reopenReason: "แก้ไข" } })).rejects.toThrow();
    await expect(db.patientHospitalRelationshipReopening.delete({ where: { id: row.id } })).rejects.toThrow();
  });
});
