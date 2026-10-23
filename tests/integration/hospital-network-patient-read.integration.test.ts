import { randomUUID } from "node:crypto";
import { HospitalStatus, MembershipStatus, MembershipType, Role, UserStatus } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { createAppointment } from "@/modules/appointments/services/appointment-service";
import { getAppointmentHistory } from "@/modules/appointments/services/appointment-query-service";
import { listWorkAppointments } from "@/modules/appointments/services/work-appointment-query-service";
import { transferHospitalServiceArea } from "@/modules/hospital-service-areas/services/hospital-network-governance-service";
import { attachHospitalServiceArea, endHospitalServiceArea } from "@/modules/hospital-service-areas/services/hospital-service-area-service";
import { assignOsmToPatient } from "@/modules/patient-assignment/services/patient-osm-assignment-service";
import {
  findPatientDirectory,
  getPatientDirectoryDetail,
  listPatientDirectoryScopes,
} from "@/modules/patient-directory/services/patient-directory-query-service";
import {
  getStaffPatientHospitalProfile,
  updateStaffPatientHospitalProfile,
} from "@/modules/patient-hospital-profile/services/patient-hospital-profile-service";
import { getPatientProgramPageContext } from "@/modules/patient-program/services/patient-program-query-service";
import { completePatientProgram, openPatientProgram } from "@/modules/patient-program/services/patient-program-service";
import { provisionPatientFixture as provisionPatient } from "./support/patient-provisioning";
import {
  promoteHospitalOwner,
  setHospitalMembershipNetworkPatientReadGrant,
} from "@/modules/workforce/services/workforce-service";
import { ForbiddenError, NotFoundError } from "@/shared/errors/application-error";

const db = getPrisma();
const hospitals: string[] = [];
const users: string[] = [];
const people: string[] = [];

async function hospital(kind: "PARENT" | "CHILD"): Promise<string> {
  const row = await db.hospital.create({
    data: {
      hospitalCode: `NPR-${randomUUID().slice(0, 20)}`,
      name: kind === "PARENT" ? "โรงพยาบาลแม่ข่ายทดสอบ" : "รพ.สต.ลูกข่ายทดสอบ",
      status: HospitalStatus.ACTIVE,
      serviceAreaEligibility: { create: { kind, verifiedAt: new Date() } },
    },
  });
  hospitals.push(row.id);
  return row.id;
}

async function staff(hospitalId: string, membershipType: MembershipType): Promise<ActorContext & { membershipId: string }> {
  const person = await db.person.create({ data: { identityKeyHash: randomUUID(), givenName: "บุคลากร", familyName: "เครือข่าย" } });
  people.push(person.id);
  const user = await db.user.create({
    data: { personId: person.id, status: UserStatus.ACTIVE, authSubject: randomUUID(), roles: { create: { role: Role.HOSPITAL } } },
  });
  users.push(user.id);
  const membership = await db.hospitalMembership.create({
    data: { userId: user.id, hospitalId, membershipType, status: MembershipStatus.ACTIVE },
  });
  return {
    membershipId: membership.id,
    userId: user.id,
    personId: person.id,
    roles: [Role.HOSPITAL],
    hospitalMemberships: [{ hospitalId, membershipType, profession: null, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE }],
    osmHospitalRelationships: [],
  };
}

type Network = {
  parentId: string;
  childId: string;
  otherChildId: string;
  parentOwner: Awaited<ReturnType<typeof staff>>;
  parentMember: Awaited<ReturnType<typeof staff>>;
  childOwner: Awaited<ReturnType<typeof staff>>;
  otherChildOwner: Awaited<ReturnType<typeof staff>>;
  relationshipId: string;
  otherChildRelationshipId: string;
  areaId: string;
};

async function network(): Promise<Network> {
  const parentId = await hospital("PARENT");
  const childId = await hospital("CHILD");
  const otherChildId = await hospital("CHILD");
  const parentOwner = await staff(parentId, MembershipType.OWNER);
  const parentMember = await staff(parentId, MembershipType.MEMBER);
  const childOwner = await staff(childId, MembershipType.OWNER);
  const otherChildOwner = await staff(otherChildId, MembershipType.OWNER);
  const provisioned = await provisionPatient(childOwner, {
    identity: { namespace: "network-read", value: randomUUID() },
    targetHospitalId: childId,
    givenName: "ผู้ป่วย",
    familyName: "ลูกข่าย",
    hospitalNumber: `HN-${randomUUID().slice(0, 8)}`,
  });
  users.push(provisioned.userId);
  people.push(provisioned.personId);
  await db.user.update({ where: { id: provisioned.userId }, data: { status: UserStatus.ACTIVE, authSubject: randomUUID() } });
  await openPatientProgram(childOwner, { patientHospitalRelationshipId: provisioned.relationshipId });
  // A Patient in a Child that is not part of this network.
  const other = await provisionPatient(otherChildOwner, {
    identity: { namespace: "network-read", value: randomUUID() },
    targetHospitalId: otherChildId,
    givenName: "ผู้ป่วย",
    familyName: "นอกเครือข่าย",
  });
  users.push(other.userId);
  people.push(other.personId);
  const area = await attachHospitalServiceArea(parentOwner, { parentHospitalId: parentId, childHospitalId: childId });
  return {
    parentId,
    childId,
    otherChildId,
    parentOwner,
    parentMember,
    childOwner,
    otherChildOwner,
    relationshipId: provisioned.relationshipId,
    otherChildRelationshipId: other.relationshipId,
    areaId: area.id,
  };
}

async function membershipVersion(membershipId: string): Promise<string> {
  return (await db.hospitalMembership.findUniqueOrThrow({ where: { id: membershipId } })).updatedAt.toISOString();
}

async function cleanup(): Promise<void> {
  if (hospitals.length === 0) return;
  const relationshipWhere = { hospitalId: { in: hospitals } };
  const relationshipIds = (await db.patientHospitalRelationship.findMany({ where: relationshipWhere, select: { id: true } }))
    .map(({ id }) => id);
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
    await tx.hospitalServiceArea.deleteMany({ where: { parentHospitalId: { in: hospitals } } });
  });
  await db.appointmentLineNotification.deleteMany({ where: { patientHospitalRelationshipId: { in: relationshipIds } } });
  await db.patientAppointmentRescheduleRequest.deleteMany({ where: { appointment: { patientHospitalRelationship: relationshipWhere } } });
  await db.patientAppointmentCancellationRequest.deleteMany({ where: { appointment: { patientHospitalRelationship: relationshipWhere } } });
  await db.patientAppointmentAssigneeAcceptance.deleteMany({ where: { appointment: { patientHospitalRelationship: relationshipWhere } } });
  await db.patientAppointment.deleteMany({ where: { patientHospitalRelationship: relationshipWhere } });
  await db.patientProgram.deleteMany({ where: { patientHospitalRelationship: relationshipWhere } });
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
  await db.hospital.deleteMany({ where: { id: { in: hospitals } } });
  hospitals.length = 0;
  users.length = 0;
  people.length = 0;
}

const directoryInput = (targetHospitalId: string): Record<string, unknown> => ({ targetHospitalId, lookupType: "NAME", value: "", page: "1" });

describe("ADR-0016 network Patient read / PostgreSQL", () => {
  beforeAll(async () => { await db.$connect(); });
  afterEach(cleanup);
  afterAll(async () => { await db.$disconnect(); });

  it("lets the Parent OWNER read every Child Patient read-only, audited, and nothing outside the network", async () => {
    const n = await network();

    const scopes = await listPatientDirectoryScopes(n.parentOwner);
    expect(scopes).toEqual(expect.arrayContaining([
      expect.objectContaining({ hospitalId: n.parentId, access: "DIRECT" }),
      expect.objectContaining({ hospitalId: n.childId, access: "NETWORK" }),
    ]));
    expect(scopes.map(({ hospitalId }) => hospitalId)).not.toContain(n.otherChildId);

    const page = await findPatientDirectory(n.parentOwner, directoryInput(n.childId));
    expect(page.hospital).toMatchObject({ hospitalId: n.childId, access: "NETWORK" });
    expect(page.items.map(({ patientHospitalRelationshipId }) => patientHospitalRelationshipId)).toEqual([n.relationshipId]);
    expect(await getPatientDirectoryDetail(n.parentOwner, n.relationshipId)).toMatchObject({ access: "NETWORK" });
    expect((await getPatientProgramPageContext(n.parentOwner, n.relationshipId)).canManage).toBe(false);
    await expect(getAppointmentHistory(n.parentOwner, n.relationshipId)).resolves.toBeDefined();
    await expect(getStaffPatientHospitalProfile(n.parentOwner, n.relationshipId, db)).resolves.toBeDefined();

    const inNetworkAppointment = await createAppointment(n.childOwner, {
      patientHospitalRelationshipId: n.relationshipId,
      submissionNonce: randomUUID(),
      scheduledAt: "2026-12-20T10:00:00+07:00",
      type: "FOLLOW_UP",
      responsibleUserId: null,
      locationType: "CLINIC",
      durationMinutes: 30,
    });
    const outsideNetworkAppointment = await createAppointment(n.otherChildOwner, {
      patientHospitalRelationshipId: n.otherChildRelationshipId,
      submissionNonce: randomUUID(),
      scheduledAt: "2026-12-20T10:00:00+07:00",
      type: "FOLLOW_UP",
      responsibleUserId: null,
      locationType: "CLINIC",
      durationMinutes: 30,
    });
    const appointmentPage = await listWorkAppointments(n.parentOwner, {
      hospitalId: n.childId,
      tab: "UPCOMING",
    });
    expect(appointmentPage.items.map(({ appointmentId }) => appointmentId)).toEqual([inNetworkAppointment.appointmentId]);
    expect(appointmentPage.hospitals.map(({ hospitalId }) => hospitalId)).toContain(n.childId);
    expect(appointmentPage.hospitals.map(({ hospitalId }) => hospitalId)).not.toContain(n.otherChildId);
    expect(appointmentPage.canCreate).toBe(false);
    expect(appointmentPage.responsibleOptions).toEqual([]);
    const invalidChildSelection = await listWorkAppointments(n.parentOwner, {
      hospitalId: n.otherChildId,
      tab: "UPCOMING",
    });
    expect(invalidChildSelection.items.map(({ appointmentId }) => appointmentId)).not.toContain(outsideNetworkAppointment.appointmentId);

    const audits = await db.auditEvent.findMany({ where: { actorUserId: n.parentOwner.userId, action: "patient.network_read" } });
    expect(audits.length).toBeGreaterThanOrEqual(5);
    expect(audits.every(({ metadata }) => (metadata as { parentHospitalId?: string }).parentHospitalId === n.parentId)).toBe(true);

    // Outside the network: an unattached Child stays invisible.
    await expect(findPatientDirectory(n.parentOwner, directoryInput(n.otherChildId))).rejects.toBeInstanceOf(ForbiddenError);
    // Child staff keep seeing only their own Hospital.
    expect((await listPatientDirectoryScopes(n.childOwner)).map(({ hospitalId }) => hospitalId)).toEqual([n.childId]);
    await expect(findPatientDirectory(n.childOwner, directoryInput(n.parentId))).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("audits the network read of a Child Patient whose current OSM is someone else, even when the reader is an OSM there", async () => {
    const n = await network();
    async function osmAtChild(userId: string): Promise<void> {
      await db.userRole.upsert({ where: { userId_role: { userId, role: Role.OSM } }, update: {}, create: { userId, role: Role.OSM } });
      await db.osmHospitalRelationship.create({ data: { userId, hospitalId: n.childId, status: MembershipStatus.ACTIVE } });
    }
    await osmAtChild(n.parentOwner.userId);
    const otherOsm = await staff(n.otherChildId, MembershipType.MEMBER);
    await osmAtChild(otherOsm.userId);
    const ownPatient = await provisionPatient(n.childOwner, {
      identity: { namespace: "network-read", value: randomUUID() },
      targetHospitalId: n.childId,
      givenName: "ผู้ป่วย",
      familyName: "ของอสม",
    });
    users.push(ownPatient.userId);
    people.push(ownPatient.personId);
    await db.user.update({ where: { id: ownPatient.userId }, data: { status: UserStatus.ACTIVE, authSubject: randomUUID() } });
    await assignOsmToPatient(n.childOwner, { patientHospitalRelationshipId: n.relationshipId, osmUserId: otherOsm.userId });
    await assignOsmToPatient(n.childOwner, { patientHospitalRelationshipId: ownPatient.relationshipId, osmUserId: n.parentOwner.userId });
    for (const patientHospitalRelationshipId of [n.relationshipId, ownPatient.relationshipId]) {
      await createAppointment(n.childOwner, {
        patientHospitalRelationshipId,
        submissionNonce: randomUUID(),
        scheduledAt: "2026-12-20T10:00:00+07:00",
        type: "FOLLOW_UP",
        responsibleUserId: null,
        locationType: "CLINIC",
        durationMinutes: 30,
      });
    }
    const readerAndOsm: ActorContext = {
      ...n.parentOwner,
      roles: [Role.HOSPITAL, Role.OSM],
      osmHospitalRelationships: [{ hospitalId: n.childId, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE }],
    };
    await db.auditEvent.deleteMany({ where: { actorUserId: n.parentOwner.userId, action: "patient.network_read" } });

    const page = await listWorkAppointments(readerAndOsm, { hospitalId: n.childId, tab: "UPCOMING" });

    expect(page.items).toHaveLength(2);
    const audited = await db.auditEvent.findMany({
      where: { actorUserId: n.parentOwner.userId, action: "patient.network_read", resourceType: "PatientHospitalRelationship" },
      select: { resourceId: true },
    });
    // ADR-0016: only the Patient the actor serves as current OSM is a direct read.
    expect(audited.map(({ resourceId }) => resourceId)).toEqual([n.relationshipId]);
  });

  it("never lets a network reader write Child data", async () => {
    const n = await network();
    const appointment = {
      patientHospitalRelationshipId: n.relationshipId,
      submissionNonce: randomUUID(),
      scheduledAt: "2026-12-20T10:00:00+07:00",
      type: "FOLLOW_UP",
      responsibleUserId: null,
      locationType: "CLINIC",
      durationMinutes: 30,
    };
    const forbiddenOrHidden = (error: unknown): boolean => error instanceof ForbiddenError || error instanceof NotFoundError;

    await expect(createAppointment(n.parentOwner, appointment)).rejects.toSatisfy(forbiddenOrHidden);
    await expect(updateStaffPatientHospitalProfile(n.parentOwner, n.relationshipId, { expectedVersion: 0, phoneNumber: "0811111111" }, db))
      .rejects.toSatisfy(forbiddenOrHidden);
    const program = await db.patientProgram.findFirstOrThrow({ where: { patientHospitalRelationshipId: n.relationshipId } });
    await expect(completePatientProgram(n.parentOwner, { patientProgramId: program.id })).rejects.toSatisfy(forbiddenOrHidden);
    expect((await db.patientProgram.findUniqueOrThrow({ where: { id: program.id } })).status).toBe("ACTIVE");
    await expect(provisionPatient(n.parentOwner, {
      identity: { namespace: "network-read", value: randomUUID() },
      targetHospitalId: n.childId,
      givenName: "ห้าม",
      familyName: "สร้าง",
    })).rejects.toSatisfy(forbiddenOrHidden);
    await expect(assignOsmToPatient(n.parentOwner, { patientHospitalRelationshipId: n.relationshipId, osmUserId: n.childOwner.userId }))
      .rejects.toSatisfy(forbiddenOrHidden);
    expect(await db.patientAppointment.count({ where: { patientHospitalRelationshipId: n.relationshipId } })).toBe(0);
    expect(await db.patientHospitalRelationship.count({ where: { hospitalId: n.childId } })).toBe(1);
  });

  it("requires an OWNER grant for a MEMBER, and ending or transferring removes access immediately", async () => {
    const n = await network();
    await expect(findPatientDirectory(n.parentMember, directoryInput(n.childId))).rejects.toBeInstanceOf(ForbiddenError);
    expect((await listPatientDirectoryScopes(n.parentMember)).map(({ access }) => access)).toEqual(["DIRECT"]);

    await setHospitalMembershipNetworkPatientReadGrant(n.parentOwner, {
      relationshipId: n.parentMember.membershipId,
      targetHospitalId: n.parentId,
      expectedUpdatedAt: await membershipVersion(n.parentMember.membershipId),
      granted: true,
    });
    await expect(findPatientDirectory(n.parentMember, directoryInput(n.childId))).resolves.toMatchObject({ items: [expect.anything()] });
    await expect(setHospitalMembershipNetworkPatientReadGrant(n.parentMember, {
      relationshipId: n.parentMember.membershipId,
      targetHospitalId: n.parentId,
      expectedUpdatedAt: await membershipVersion(n.parentMember.membershipId),
      granted: false,
    })).rejects.toBeInstanceOf(ForbiddenError);

    await setHospitalMembershipNetworkPatientReadGrant(n.parentOwner, {
      relationshipId: n.parentMember.membershipId,
      targetHospitalId: n.parentId,
      expectedUpdatedAt: await membershipVersion(n.parentMember.membershipId),
      granted: false,
    });
    await expect(getPatientDirectoryDetail(n.parentMember, n.relationshipId)).rejects.toBeInstanceOf(NotFoundError);
    expect(await db.auditEvent.count({
      where: { actorUserId: n.parentOwner.userId, action: { in: ["hospital_membership.network_patient_read_granted", "hospital_membership.network_patient_read_revoked"] } },
    })).toBe(2);

    // Promotion to OWNER clears the MEMBER-only grant (SQL CHECK) and reading continues by role.
    await setHospitalMembershipNetworkPatientReadGrant(n.parentOwner, {
      relationshipId: n.parentMember.membershipId,
      targetHospitalId: n.parentId,
      expectedUpdatedAt: await membershipVersion(n.parentMember.membershipId),
      granted: true,
    });
    await promoteHospitalOwner(n.parentOwner, {
      relationshipId: n.parentMember.membershipId,
      targetHospitalId: n.parentId,
      expectedUpdatedAt: await membershipVersion(n.parentMember.membershipId),
    });
    expect((await db.hospitalMembership.findUniqueOrThrow({ where: { id: n.parentMember.membershipId } })).networkPatientReadGrantedAt).toBeNull();

    await endHospitalServiceArea(n.parentOwner, { parentHospitalId: n.parentId, areaId: n.areaId, confirm: true, endReason: "สิ้นสุดการดูแล" });
    await expect(findPatientDirectory(n.parentOwner, directoryInput(n.childId))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getPatientDirectoryDetail(n.parentOwner, n.relationshipId)).rejects.toBeInstanceOf(NotFoundError);

    const area = await attachHospitalServiceArea(n.parentOwner, { parentHospitalId: n.parentId, childHospitalId: n.childId });
    const newParentId = await hospital("PARENT");
    const newParentOwner = await staff(newParentId, MembershipType.OWNER);
    const adminPerson = await db.person.create({ data: { identityKeyHash: randomUUID() } });
    people.push(adminPerson.id);
    const adminUser = await db.user.create({ data: { personId: adminPerson.id, status: UserStatus.ACTIVE, roles: { create: { role: Role.ADMIN } } } });
    users.push(adminUser.id);
    const admin: ActorContext = { userId: adminUser.id, personId: adminPerson.id, roles: [Role.ADMIN], hospitalMemberships: [], osmHospitalRelationships: [] };
    await transferHospitalServiceArea(admin, { areaId: area.id, toParentHospitalId: newParentId, confirm: true, reason: "โอนให้แม่ข่ายใหม่" });
    await expect(findPatientDirectory(n.parentOwner, directoryInput(n.childId))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(findPatientDirectory(newParentOwner, directoryInput(n.childId))).resolves.toMatchObject({ hospital: { access: "NETWORK" } });
    // Platform ADMIN gains no Patient access through governing the network.
    await expect(getPatientDirectoryDetail(admin, n.relationshipId)).rejects.toSatisfy(
      (error) => error instanceof ForbiddenError || error instanceof NotFoundError,
    );
  });
});
