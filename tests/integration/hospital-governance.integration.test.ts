import {
  AppointmentLocationType,
  AppointmentType,
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Role,
  UserStatus,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { getAppointmentHistory } from "@/modules/appointments/services/appointment-query-service";
import { createAppointment } from "@/modules/appointments/services/appointment-service";
import {
  getHospitalGovernanceDetail,
  listHospitalGovernanceDirectory,
  restoreHospital,
  suspendHospital,
} from "@/modules/hospital-governance/services/hospital-governance-service";
import { assignOsmToPatient } from "@/modules/patient-assignment/services/patient-osm-assignment-service";
import { getPatientDirectoryDetail } from "@/modules/patient-directory/services/patient-directory-query-service";
import { provisionPatient } from "@/modules/patient-provisioning/services/patient-provisioning-service";
import { listWorkforce } from "@/modules/workforce/services/workforce-service";
import { ConflictError, ForbiddenError, NotFoundError } from "@/shared/errors/application-error";

const prisma = getPrisma();
let sequence = 0;

async function clearDatabase(): Promise<void> {
  await prisma.patientFollowupActivityProgress.deleteMany();
  await prisma.patientFollowup.deleteMany();
  await prisma.patientProgramServiceOneArtifactAssociation.deleteMany();
  await prisma.patientEvidenceArtifact.deleteMany();
  await prisma.patientBaseline.deleteMany();
  await prisma.patientAppointment.deleteMany();
  await prisma.patientGoalItem.deleteMany();
  await prisma.patientGoalPlan.deleteMany();
  await prisma.screeningAssessment.deleteMany();
  await prisma.auditEvent.deleteMany();
  await prisma.patientOsmAssignment.deleteMany();
  await prisma.patientActivation.deleteMany();
  await prisma.patientHospitalRelationship.deleteMany();
  await prisma.patientProfile.deleteMany();
  await prisma.workforceActivation.deleteMany();
  await prisma.osmHospitalRelationship.deleteMany();
  await prisma.hospitalOnboardingApplication.deleteMany();
  await prisma.hospitalMembership.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.user.deleteMany();
  await prisma.hospital.updateMany({ data: { parentHospitalId: null } });
  await prisma.hospital.deleteMany();
  await prisma.person.deleteMany();
}

async function createHospital(
  code: string,
  status: HospitalStatus = HospitalStatus.ACTIVE,
  parentHospitalId?: string,
): Promise<{ id: string; status: HospitalStatus; updatedAt: Date }> {
  sequence += 1;
  return prisma.hospital.create({
    data: {
      hospitalCode: `12B0-${code}-${sequence}`,
      name: `โรงพยาบาล 12B0 ${code}`,
      status,
      parentHospitalId,
    },
    select: { id: true, status: true, updatedAt: true },
  });
}

async function createUser(prefix: string, status = UserStatus.ACTIVE): Promise<{
  userId: string;
  personId: string;
}> {
  sequence += 1;
  const person = await prisma.person.create({
    data: {
      identityKeyHash: `12b0-${prefix}-${sequence}`,
      givenName: "ผู้ใช้งาน",
      familyName: prefix,
    },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: {
      personId: person.id,
      authSubject: status === UserStatus.ACTIVE ? randomUUID() : null,
      status,
    },
    select: { id: true },
  });

  return { userId: user.id, personId: person.id };
}

async function createAdmin(): Promise<{ actor: ActorContext; userId: string }> {
  const user = await createUser("admin");
  await prisma.userRole.create({ data: { userId: user.userId, role: Role.ADMIN } });

  return {
    userId: user.userId,
    actor: {
      userId: user.userId,
      personId: user.personId,
      roles: [Role.ADMIN],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    },
  };
}

async function createOwner(hospitalId: string): Promise<{
  actor: ActorContext;
  userId: string;
  membershipId: string;
}> {
  const hospital = await prisma.hospital.findUniqueOrThrow({
    where: { id: hospitalId },
    select: { status: true },
  });
  const user = await createUser("owner");
  await prisma.userRole.create({ data: { userId: user.userId, role: Role.HOSPITAL } });
  const membership = await prisma.hospitalMembership.create({
    data: {
      userId: user.userId,
      hospitalId,
      membershipType: MembershipType.OWNER,
      status: MembershipStatus.ACTIVE,
    },
    select: { id: true },
  });

  return {
    userId: user.userId,
    membershipId: membership.id,
    actor: {
      userId: user.userId,
      personId: user.personId,
      roles: [Role.HOSPITAL],
      hospitalMemberships: [
        {
          hospitalId,
          membershipType: MembershipType.OWNER,
          profession: null,
          status: MembershipStatus.ACTIVE,
          hospitalStatus: hospital.status,
        },
      ],
      osmHospitalRelationships: [],
    },
  };
}

async function createMemberAcross(hospitalIds: readonly string[]): Promise<{
  actor: ActorContext;
  userId: string;
  membershipIds: string[];
}> {
  const user = await createUser("member");
  await prisma.userRole.create({ data: { userId: user.userId, role: Role.HOSPITAL } });
  const memberships: Array<ActorContext["hospitalMemberships"][number]> = [];
  const membershipIds: string[] = [];

  for (const hospitalId of hospitalIds) {
    const hospital = await prisma.hospital.findUniqueOrThrow({
      where: { id: hospitalId },
      select: { status: true },
    });
    const membership = await prisma.hospitalMembership.create({
      data: {
        userId: user.userId,
        hospitalId,
        membershipType: MembershipType.MEMBER,
        status: MembershipStatus.ACTIVE,
      },
      select: { id: true },
    });
    membershipIds.push(membership.id);
    memberships.push({
      hospitalId,
      membershipType: MembershipType.MEMBER,
      profession: null,
      status: MembershipStatus.ACTIVE,
      hospitalStatus: hospital.status,
    });
  }

  return {
    userId: user.userId,
    membershipIds,
    actor: {
      userId: user.userId,
      personId: user.personId,
      roles: [Role.HOSPITAL],
      hospitalMemberships: memberships,
      osmHospitalRelationships: [],
    },
  };
}

async function createOsmAcross(hospitalIds: readonly string[]): Promise<{
  actor: ActorContext;
  userId: string;
  relationshipIds: string[];
}> {
  const user = await createUser("osm");
  await prisma.userRole.create({ data: { userId: user.userId, role: Role.OSM } });
  const relationships: Array<ActorContext["osmHospitalRelationships"][number]> = [];
  const relationshipIds: string[] = [];

  for (const hospitalId of hospitalIds) {
    const hospital = await prisma.hospital.findUniqueOrThrow({
      where: { id: hospitalId },
      select: { status: true },
    });
    const relationship = await prisma.osmHospitalRelationship.create({
      data: {
        userId: user.userId,
        hospitalId,
        status: MembershipStatus.ACTIVE,
      },
      select: { id: true },
    });
    relationshipIds.push(relationship.id);
    relationships.push({
      hospitalId,
      status: MembershipStatus.ACTIVE,
      hospitalStatus: hospital.status,
    });
  }

  return {
    userId: user.userId,
    relationshipIds,
    actor: {
      userId: user.userId,
      personId: user.personId,
      roles: [Role.OSM],
      hospitalMemberships: [],
      osmHospitalRelationships: relationships,
    },
  };
}

async function createPatient(
  owner: ActorContext,
  hospitalId: string,
  label: string,
): Promise<{
  relationshipId: string;
  userId: string;
  personId: string;
}> {
  sequence += 1;
  return provisionPatient(owner, {
    identity: { namespace: "phase-12b0-integration", value: `${label}-${sequence}` },
    targetHospitalId: hospitalId,
    givenName: "ผู้ป่วย",
    familyName: `ทดสอบ ${label}`,
    hospitalNumber: `HN-12B0-${sequence}`,
  });
}

function bangkokIso(date: Date): string {
  const shifted = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  return `${shifted.toISOString().slice(0, -1)}+07:00`;
}

async function createTestAppointment(
  owner: ActorContext,
  relationshipId: string,
): Promise<{ appointmentId: string }> {
  const appointment = await createAppointment(owner, {
    patientHospitalRelationshipId: relationshipId,
    submissionNonce: randomUUID(),
    scheduledAt: bangkokIso(new Date(Date.now() + 24 * 60 * 60 * 1000)),
    type: AppointmentType.CONSULTATION,
    responsibleUserId: null,
    durationMinutes: 30,
    locationType: AppointmentLocationType.CLINIC,
    locationDetail: "ห้องตรวจทดสอบ",
    note: "ข้อมูลทดสอบวงจรโรงพยาบาล",
  });

  return { appointmentId: appointment.appointmentId };
}

describe("Phase 12B.0 Hospital governance PostgreSQL workflow", () => {
  beforeAll(async () => {
    await prisma.$connect();
    await clearDatabase();
  });

  afterEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("keeps the directory bounded, separates onboarding, and enforces exact audited transitions", async () => {
    const pending = await createHospital("PENDING", HospitalStatus.PENDING_VERIFICATION);
    const active = await createHospital("ACTIVE");
    const admin = await createAdmin();
    const owner = await createOwner(active.id);

    const directoryBefore = await listHospitalGovernanceDirectory(admin.actor);
    expect(directoryBefore).toHaveLength(1);
    expect(directoryBefore[0]).toMatchObject({ id: active.id, status: HospitalStatus.ACTIVE });
    expect(Object.keys(directoryBefore[0] ?? {}).sort()).toEqual([
      "createdAt",
      "hospitalCode",
      "id",
      "name",
      "status",
      "updatedAt",
    ]);
    expect(JSON.stringify(directoryBefore)).not.toContain("Patient");
    await expect(getHospitalGovernanceDetail(admin.actor, pending.id)).resolves.toMatchObject({
      id: pending.id,
      status: HospitalStatus.PENDING_VERIFICATION,
    });

    const staleBeforeConcurrentUpdate = await getHospitalGovernanceDetail(admin.actor, active.id);
    await prisma.hospital.update({
      where: { id: active.id },
      data: { name: "โรงพยาบาล 12B0 เปลี่ยนแปลงพร้อมกัน" },
    });
    await expect(
      suspendHospital(admin.actor, {
        hospitalId: active.id,
        expectedUpdatedAt: staleBeforeConcurrentUpdate.updatedAt.toISOString(),
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(await prisma.auditEvent.count({ where: { action: "hospital.suspended" } })).toBe(0);

    const currentActive = await getHospitalGovernanceDetail(admin.actor, active.id);
    const suspended = await suspendHospital(admin.actor, {
      hospitalId: active.id,
      expectedUpdatedAt: currentActive.updatedAt.toISOString(),
    });
    expect(suspended.status).toBe(HospitalStatus.SUSPENDED);
    expect(await prisma.hospital.findUniqueOrThrow({ where: { id: active.id }, select: { status: true } })).toEqual({
      status: HospitalStatus.SUSPENDED,
    });
    expect(await prisma.auditEvent.findMany({ where: { resourceId: active.id }, select: {
      action: true,
      resourceType: true,
      resourceId: true,
      metadata: true,
    }, orderBy: { createdAt: "asc" } })).toEqual([
      {
        action: "hospital.suspended",
        resourceType: "Hospital",
        resourceId: active.id,
        metadata: { fromStatus: "ACTIVE", toStatus: "SUSPENDED" },
      },
    ]);

    const directoryDuringSuspension = await listHospitalGovernanceDirectory(admin.actor);
    expect(directoryDuringSuspension).toHaveLength(1);
    expect(directoryDuringSuspension[0]).toMatchObject({ id: active.id, status: HospitalStatus.SUSPENDED });
    await expect(
      suspendHospital(admin.actor, {
        hospitalId: active.id,
        expectedUpdatedAt: suspended.updatedAt.toISOString(),
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      suspendHospital(admin.actor, {
        hospitalId: pending.id,
        expectedUpdatedAt: pending.updatedAt.toISOString(),
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    await expect(
      suspendHospital(owner.actor, {
        hospitalId: active.id,
        expectedUpdatedAt: suspended.updatedAt.toISOString(),
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const restored = await restoreHospital(admin.actor, {
      hospitalId: active.id,
      expectedUpdatedAt: suspended.updatedAt.toISOString(),
    });
    expect(restored.status).toBe(HospitalStatus.ACTIVE);
    expect(await prisma.auditEvent.count({ where: { resourceId: active.id } })).toBe(2);

    await prisma.user.update({ where: { id: admin.userId }, data: { status: UserStatus.SUSPENDED } });
    await expect(
      suspendHospital(admin.actor, {
        hospitalId: active.id,
        expectedUpdatedAt: restored.updatedAt.toISOString(),
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(await prisma.auditEvent.count({ where: { resourceId: active.id } })).toBe(2);
  });

  it("fails closed for a suspended Hospital, restores only valid scopes, and isolates another Hospital", async () => {
    const hospitalA = await createHospital("A");
    const hospitalB = await createHospital("B", HospitalStatus.ACTIVE, hospitalA.id);
    const admin = await createAdmin();
    const ownerA = await createOwner(hospitalA.id);
    const ownerB = await createOwner(hospitalB.id);
    const member = await createMemberAcross([hospitalA.id, hospitalB.id]);
    const osm = await createOsmAcross([hospitalA.id, hospitalB.id]);
    const patientA = await createPatient(ownerA.actor, hospitalA.id, "A");
    const patientB = await createPatient(ownerB.actor, hospitalB.id, "B");

    await assignOsmToPatient(ownerA.actor, {
      patientHospitalRelationshipId: patientA.relationshipId,
      osmUserId: osm.userId,
    });
    await assignOsmToPatient(ownerB.actor, {
      patientHospitalRelationshipId: patientB.relationshipId,
      osmUserId: osm.userId,
    });
    await createTestAppointment(ownerA.actor, patientA.relationshipId);

    const beforeMemberships = await prisma.hospitalMembership.findMany({
      where: { userId: member.userId },
      select: { hospitalId: true, status: true, updatedAt: true },
      orderBy: { hospitalId: "asc" },
    });
    const beforeOsmRelationships = await prisma.osmHospitalRelationship.findMany({
      where: { userId: osm.userId },
      select: { hospitalId: true, status: true, updatedAt: true },
      orderBy: { hospitalId: "asc" },
    });
    const beforePatientRelationships = await prisma.patientHospitalRelationship.findMany({
      where: { id: { in: [patientA.relationshipId, patientB.relationshipId] } },
      select: { id: true, hospitalId: true, updatedAt: true },
      orderBy: { id: "asc" },
    });
    const beforeAssignments = await prisma.patientOsmAssignment.findMany({
      where: { patientHospitalRelationshipId: { in: [patientA.relationshipId, patientB.relationshipId] } },
      select: { patientHospitalRelationshipId: true, osmUserId: true, endedAt: true, endedByUserId: true },
      orderBy: { patientHospitalRelationshipId: "asc" },
    });
    const beforeAppointmentCount = await prisma.patientAppointment.count({
      where: { patientHospitalRelationshipId: patientA.relationshipId },
    });
    const governedUserIds = [admin.userId, ownerA.userId, ownerB.userId, member.userId, osm.userId];
    const beforeUserStatuses = await prisma.user.findMany({
      where: { id: { in: governedUserIds } },
      select: { id: true, status: true },
      orderBy: { id: "asc" },
    });
    const beforeUserRoles = await prisma.userRole.findMany({
      where: { userId: { in: governedUserIds } },
      select: { userId: true, role: true },
      orderBy: [{ userId: "asc" }, { role: "asc" }],
    });

    await expect(getPatientDirectoryDetail(member.actor, patientA.relationshipId)).resolves.toMatchObject({
      patientHospitalRelationshipId: patientA.relationshipId,
    });
    await expect(getPatientDirectoryDetail(osm.actor, patientA.relationshipId)).resolves.toMatchObject({
      patientHospitalRelationshipId: patientA.relationshipId,
    });
    await expect(getAppointmentHistory(member.actor, patientA.relationshipId)).resolves.toMatchObject({
      items: expect.any(Array),
    });
    await expect(listWorkforce(ownerA.actor, { targetHospitalId: hospitalA.id })).resolves.toBeDefined();
    await expect(getPatientDirectoryDetail(member.actor, patientB.relationshipId)).resolves.toMatchObject({
      patientHospitalRelationshipId: patientB.relationshipId,
    });
    await expect(getPatientDirectoryDetail(osm.actor, patientB.relationshipId)).resolves.toMatchObject({
      patientHospitalRelationshipId: patientB.relationshipId,
    });

    const activeA = await getHospitalGovernanceDetail(admin.actor, hospitalA.id);
    const suspendedA = await suspendHospital(admin.actor, {
      hospitalId: hospitalA.id,
      expectedUpdatedAt: activeA.updatedAt.toISOString(),
    });

    expect(await prisma.hospitalMembership.findMany({
      where: { userId: member.userId },
      select: { hospitalId: true, status: true, updatedAt: true },
      orderBy: { hospitalId: "asc" },
    })).toEqual(beforeMemberships);
    expect(await prisma.osmHospitalRelationship.findMany({
      where: { userId: osm.userId },
      select: { hospitalId: true, status: true, updatedAt: true },
      orderBy: { hospitalId: "asc" },
    })).toEqual(beforeOsmRelationships);
    expect(await prisma.patientHospitalRelationship.findMany({
      where: { id: { in: [patientA.relationshipId, patientB.relationshipId] } },
      select: { id: true, hospitalId: true, updatedAt: true },
      orderBy: { id: "asc" },
    })).toEqual(beforePatientRelationships);
    expect(await prisma.patientOsmAssignment.findMany({
      where: { patientHospitalRelationshipId: { in: [patientA.relationshipId, patientB.relationshipId] } },
      select: { patientHospitalRelationshipId: true, osmUserId: true, endedAt: true, endedByUserId: true },
      orderBy: { patientHospitalRelationshipId: "asc" },
    })).toEqual(beforeAssignments);
    expect(await prisma.patientAppointment.count({
      where: { patientHospitalRelationshipId: patientA.relationshipId },
    })).toBe(beforeAppointmentCount);
    expect(await prisma.user.findMany({
      where: { id: { in: governedUserIds } },
      select: { id: true, status: true },
      orderBy: { id: "asc" },
    })).toEqual(beforeUserStatuses);
    expect(await prisma.userRole.findMany({
      where: { userId: { in: governedUserIds } },
      select: { userId: true, role: true },
      orderBy: [{ userId: "asc" }, { role: "asc" }],
    })).toEqual(beforeUserRoles);

    await expect(listWorkforce(ownerA.actor, { targetHospitalId: hospitalA.id })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(getPatientDirectoryDetail(member.actor, patientA.relationshipId)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(getPatientDirectoryDetail(osm.actor, patientA.relationshipId)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(getAppointmentHistory(member.actor, patientA.relationshipId)).rejects.toBeInstanceOf(
      NotFoundError,
    );

    expect(await prisma.hospital.findUniqueOrThrow({ where: { id: hospitalB.id }, select: { status: true } })).toEqual({
      status: HospitalStatus.ACTIVE,
    });
    await expect(listWorkforce(ownerB.actor, { targetHospitalId: hospitalB.id })).resolves.toBeDefined();
    await expect(getPatientDirectoryDetail(member.actor, patientB.relationshipId)).resolves.toMatchObject({
      patientHospitalRelationshipId: patientB.relationshipId,
    });
    await expect(getPatientDirectoryDetail(osm.actor, patientB.relationshipId)).resolves.toMatchObject({
      patientHospitalRelationshipId: patientB.relationshipId,
    });

    const restoredA = await restoreHospital(admin.actor, {
      hospitalId: hospitalA.id,
      expectedUpdatedAt: suspendedA.updatedAt.toISOString(),
    });
    expect(restoredA.status).toBe(HospitalStatus.ACTIVE);
    await expect(listWorkforce(ownerA.actor, { targetHospitalId: hospitalA.id })).resolves.toBeDefined();
    await expect(getPatientDirectoryDetail(member.actor, patientA.relationshipId)).resolves.toMatchObject({
      patientHospitalRelationshipId: patientA.relationshipId,
    });
    await expect(getPatientDirectoryDetail(osm.actor, patientA.relationshipId)).resolves.toMatchObject({
      patientHospitalRelationshipId: patientA.relationshipId,
    });
    await expect(getAppointmentHistory(member.actor, patientA.relationshipId)).resolves.toMatchObject({
      items: expect.any(Array),
    });

    await prisma.hospitalMembership.update({
      where: { userId_hospitalId: { userId: member.userId, hospitalId: hospitalA.id } },
      data: { status: MembershipStatus.SUSPENDED },
    });
    await prisma.osmHospitalRelationship.update({
      where: { userId_hospitalId: { userId: osm.userId, hospitalId: hospitalA.id } },
      data: { status: MembershipStatus.SUSPENDED },
    });
    await prisma.patientOsmAssignment.updateMany({
      where: { patientHospitalRelationshipId: patientA.relationshipId, endedAt: null },
      data: { endedAt: new Date(), endedByUserId: ownerA.userId },
    });

    const suspendedAgain = await suspendHospital(admin.actor, {
      hospitalId: hospitalA.id,
      expectedUpdatedAt: restoredA.updatedAt.toISOString(),
    });
    const restoredAgain = await restoreHospital(admin.actor, {
      hospitalId: hospitalA.id,
      expectedUpdatedAt: suspendedAgain.updatedAt.toISOString(),
    });
    expect(restoredAgain.status).toBe(HospitalStatus.ACTIVE);

    await expect(getPatientDirectoryDetail(member.actor, patientA.relationshipId)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(getPatientDirectoryDetail(osm.actor, patientA.relationshipId)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(getAppointmentHistory(member.actor, patientA.relationshipId)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(getPatientDirectoryDetail(member.actor, patientB.relationshipId)).resolves.toMatchObject({
      patientHospitalRelationshipId: patientB.relationshipId,
    });
    await expect(getPatientDirectoryDetail(osm.actor, patientB.relationshipId)).resolves.toMatchObject({
      patientHospitalRelationshipId: patientB.relationshipId,
    });

    const finalMemberships = await prisma.hospitalMembership.findMany({
      where: { userId: member.userId },
      select: { hospitalId: true, status: true, updatedAt: true },
      orderBy: { hospitalId: "asc" },
    });
    expect(finalMemberships.find((row) => row.hospitalId === hospitalB.id)).toEqual(
      beforeMemberships.find((row) => row.hospitalId === hospitalB.id),
    );
    expect(finalMemberships.find((row) => row.hospitalId === hospitalA.id)).toMatchObject({
      hospitalId: hospitalA.id,
      status: MembershipStatus.SUSPENDED,
    });
    const finalOsmRelationships = await prisma.osmHospitalRelationship.findMany({
      where: { userId: osm.userId },
      select: { hospitalId: true, status: true, updatedAt: true },
      orderBy: { hospitalId: "asc" },
    });
    expect(finalOsmRelationships.find((row) => row.hospitalId === hospitalB.id)).toEqual(
      beforeOsmRelationships.find((row) => row.hospitalId === hospitalB.id),
    );
    expect(finalOsmRelationships.find((row) => row.hospitalId === hospitalA.id)).toMatchObject({
      hospitalId: hospitalA.id,
      status: MembershipStatus.SUSPENDED,
    });
    expect(await prisma.patientOsmAssignment.findMany({
      where: { patientHospitalRelationshipId: { in: [patientA.relationshipId, patientB.relationshipId] } },
      select: { patientHospitalRelationshipId: true, osmUserId: true, endedAt: true, endedByUserId: true },
      orderBy: { patientHospitalRelationshipId: "asc" },
    })).toEqual(expect.arrayContaining([
      beforeAssignments.find((row) => row.patientHospitalRelationshipId === patientB.relationshipId),
      expect.objectContaining({
        patientHospitalRelationshipId: patientA.relationshipId,
        osmUserId: osm.userId,
        endedByUserId: ownerA.userId,
      }),
    ]));
    expect(await prisma.patientAppointment.count({
      where: { patientHospitalRelationshipId: patientA.relationshipId },
    })).toBe(beforeAppointmentCount);
    expect(await prisma.hospital.findUniqueOrThrow({ where: { id: hospitalB.id }, select: { status: true } })).toEqual({
      status: HospitalStatus.ACTIVE,
    });
  });
});
