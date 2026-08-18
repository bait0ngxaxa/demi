import {
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
import {
  assignOsmToPatient,
  unassignOsmFromPatient,
} from "@/modules/patient-assignment/services/patient-osm-assignment-service";
import { provisionPatient } from "@/modules/patient-provisioning/services/patient-provisioning-service";
import {
  getWorkforceDetail,
  restoreOsmRelationship,
  suspendOsmRelationship,
} from "@/modules/workforce/services/workforce-service";

const prisma = getPrisma();
let fixtureSequence = 0;

async function clearDatabase(): Promise<void> {
  await prisma.auditEvent.deleteMany();
  await prisma.patientOsmAssignment.deleteMany();
  await prisma.patientFollowupActivityProgress.deleteMany();
  await prisma.patientFollowup.deleteMany();
  await prisma.patientEvidenceArtifact.deleteMany();
  await prisma.patientBaseline.deleteMany();
  await prisma.patientAppointment.deleteMany();
  await prisma.patientGoalItem.deleteMany();
  await prisma.patientGoalPlan.deleteMany();
  await prisma.screeningAssessment.deleteMany();
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
  parentHospitalId?: string,
  status: HospitalStatus = HospitalStatus.ACTIVE,
): Promise<{ id: string; status: HospitalStatus }> {
  return prisma.hospital.create({
    data: {
      hospitalCode: code,
      name: `โรงพยาบาล ${code}`,
      parentHospitalId,
      status,
    },
    select: { id: true, status: true },
  });
}

async function createOwner(hospitalCode: string): Promise<{
  actor: ActorContext;
  hospitalId: string;
}> {
  fixtureSequence += 1;
  const hospital = await createHospital(hospitalCode);
  const person = await prisma.person.create({
    data: { identityKeyHash: `osm-lifecycle-owner-${fixtureSequence}` },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: {
      personId: person.id,
      authSubject: randomUUID(),
      status: UserStatus.ACTIVE,
    },
    select: { id: true },
  });

  await prisma.userRole.create({ data: { userId: user.id, role: Role.HOSPITAL } });
  await prisma.hospitalMembership.create({
    data: {
      userId: user.id,
      hospitalId: hospital.id,
      membershipType: MembershipType.OWNER,
      status: MembershipStatus.ACTIVE,
    },
  });

  return {
    hospitalId: hospital.id,
    actor: {
      userId: user.id,
      personId: person.id,
      roles: [Role.HOSPITAL],
      hospitalMemberships: [
        {
          hospitalId: hospital.id,
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

async function createOsmTarget(input: {
  hospitalId: string;
  userStatus?: UserStatus;
  relationshipStatus?: MembershipStatus;
  withHospitalMembership?: boolean;
}): Promise<{ userId: string; relationshipId: string; membershipId: string | null }> {
  fixtureSequence += 1;
  const userStatus = input.userStatus ?? UserStatus.ACTIVE;
  const person = await prisma.person.create({
    data: {
      identityKeyHash: `osm-lifecycle-target-${fixtureSequence}`,
      givenName: "สมชาย",
      familyName: "อสม.ต้นแบบ",
    },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: {
      personId: person.id,
      authSubject: userStatus === UserStatus.PROVISIONED ? null : randomUUID(),
      status: userStatus,
    },
    select: { id: true },
  });

  await prisma.userRole.create({ data: { userId: user.id, role: Role.OSM } });

  let membershipId: string | null = null;
  if (input.withHospitalMembership) {
    await prisma.userRole.create({ data: { userId: user.id, role: Role.HOSPITAL } });
    const membership = await prisma.hospitalMembership.create({
      data: {
        userId: user.id,
        hospitalId: input.hospitalId,
        membershipType: MembershipType.MEMBER,
        profession: "OTHER",
        status: MembershipStatus.ACTIVE,
      },
      select: { id: true },
    });
    membershipId = membership.id;
  }

  const relationship = await prisma.osmHospitalRelationship.create({
    data: {
      userId: user.id,
      hospitalId: input.hospitalId,
      status: input.relationshipStatus ?? MembershipStatus.ACTIVE,
    },
    select: { id: true },
  });

  return { userId: user.id, relationshipId: relationship.id, membershipId };
}

async function createPatient(owner: { actor: ActorContext }, hospitalId: string) {
  fixtureSequence += 1;
  return provisionPatient(owner.actor, {
    identity: { namespace: "osm-lifecycle-test", value: `patient-${fixtureSequence}` },
    targetHospitalId: hospitalId,
    givenName: "ผู้ป่วย",
    familyName: "ทดสอบ",
    hospitalNumber: `HN-OSM-${fixtureSequence}`,
  });
}

async function relationshipVersion(relationshipId: string): Promise<Date> {
  const relationship = await prisma.osmHospitalRelationship.findUniqueOrThrow({
    where: { id: relationshipId },
    select: { updatedAt: true },
  });

  return relationship.updatedAt;
}

describe("Phase 11D.0 OSM relationship lifecycle PostgreSQL workflow", () => {
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

  it("suspends only an exact OSM relationship when the exact-Hospital count is zero", async () => {
    const owner = await createOwner("OSM-LIFECYCLE-SUSPEND");
    const target = await createOsmTarget({
      hospitalId: owner.hospitalId,
      withHospitalMembership: true,
    });
    const patient = await createPatient(owner, owner.hospitalId);

    await assignOsmToPatient(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
      osmUserId: target.userId,
    });
    await unassignOsmFromPatient(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
    });

    const assignmentBefore = await prisma.patientOsmAssignment.findMany({
      where: { patientHospitalRelationshipId: patient.relationshipId },
      select: { id: true, endedAt: true, endedByUserId: true, osmUserId: true },
    });
    const membershipBefore = await prisma.hospitalMembership.findFirstOrThrow({
      where: { id: target.membershipId ?? undefined },
      select: { status: true, profession: true },
    });
    const userBefore = await prisma.user.findUniqueOrThrow({
      where: { id: target.userId },
      select: { status: true, authSubject: true, roles: { select: { role: true }, orderBy: { role: "asc" } } },
    });
    const version = await relationshipVersion(target.relationshipId);

    await expect(
      suspendOsmRelationship(owner.actor, {
        relationshipId: target.relationshipId,
        targetHospitalId: owner.hospitalId,
        expectedUpdatedAt: version.toISOString(),
      }),
    ).resolves.toMatchObject({
      relationshipId: target.relationshipId,
      hospitalId: owner.hospitalId,
      relationshipStatus: MembershipStatus.SUSPENDED,
    });

    await expect(
      prisma.osmHospitalRelationship.findUnique({
        where: { id: target.relationshipId },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: MembershipStatus.SUSPENDED });
    await expect(
      prisma.user.findUnique({
        where: { id: target.userId },
        select: { status: true, authSubject: true, roles: { select: { role: true }, orderBy: { role: "asc" } } },
      }),
    ).resolves.toEqual(userBefore);
    await expect(
      prisma.hospitalMembership.findFirst({
        where: { id: target.membershipId ?? undefined },
        select: { status: true, profession: true },
      }),
    ).resolves.toEqual(membershipBefore);
    await expect(
      prisma.patientOsmAssignment.findMany({
        where: { patientHospitalRelationshipId: patient.relationshipId },
        select: { id: true, endedAt: true, endedByUserId: true, osmUserId: true },
      }),
    ).resolves.toEqual(assignmentBefore);

    const auditEvents = await prisma.auditEvent.findMany({
      where: {
        action: "osm_relationship.suspended",
        resourceId: target.relationshipId,
      },
      select: { actorUserId: true, metadata: true },
    });
    expect(auditEvents).toEqual([
      {
        actorUserId: owner.actor.userId,
        metadata: { fromStatus: MembershipStatus.ACTIVE, toStatus: MembershipStatus.SUSPENDED },
      },
    ]);
    expect(JSON.stringify(auditEvents)).not.toContain("HN-OSM-");
    expect(JSON.stringify(auditEvents)).not.toContain("ผู้ป่วย");
  });

  it("blocks suspension with current exact-Hospital assignments and writes no lifecycle success audit", async () => {
    const owner = await createOwner("OSM-LIFECYCLE-BLOCK");
    const target = await createOsmTarget({ hospitalId: owner.hospitalId });
    const patient = await createPatient(owner, owner.hospitalId);

    await assignOsmToPatient(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
      osmUserId: target.userId,
    });
    const version = await relationshipVersion(target.relationshipId);
    const assignmentBefore = await prisma.patientOsmAssignment.findFirstOrThrow({
      where: { patientHospitalRelationshipId: patient.relationshipId, endedAt: null },
      select: { id: true, endedAt: true, osmUserId: true },
    });

    await expect(
      suspendOsmRelationship(owner.actor, {
        relationshipId: target.relationshipId,
        targetHospitalId: owner.hospitalId,
        expectedUpdatedAt: version.toISOString(),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await expect(
      prisma.osmHospitalRelationship.findUnique({
        where: { id: target.relationshipId },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: MembershipStatus.ACTIVE });
    await expect(
      prisma.patientOsmAssignment.findUnique({
        where: { id: assignmentBefore.id },
        select: { id: true, endedAt: true, osmUserId: true },
      }),
    ).resolves.toEqual(assignmentBefore);
    await expect(
      prisma.auditEvent.count({ where: { action: "osm_relationship.suspended" } }),
    ).resolves.toBe(0);
  });

  it.each([UserStatus.PROVISIONED, UserStatus.INVITED, UserStatus.SUSPENDED])(
    "rejects suspension when target User is %s",
    async (userStatus) => {
      const owner = await createOwner(`OSM-LIFECYCLE-USER-${userStatus}`);
      const target = await createOsmTarget({ hospitalId: owner.hospitalId, userStatus });
      const version = await relationshipVersion(target.relationshipId);

      await expect(
        suspendOsmRelationship(owner.actor, {
          relationshipId: target.relationshipId,
          targetHospitalId: owner.hospitalId,
          expectedUpdatedAt: version.toISOString(),
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(
        prisma.osmHospitalRelationship.findUnique({
          where: { id: target.relationshipId },
          select: { status: true },
        }),
      ).resolves.toEqual({ status: MembershipStatus.ACTIVE });
    },
  );

  it("fails closed for a missing Role.OSM, stale version, invalid source state, and inactive Hospital", async () => {
    const owner = await createOwner("OSM-LIFECYCLE-GUARDS");
    const missingRole = await createOsmTarget({ hospitalId: owner.hospitalId });
    await prisma.userRole.delete({
      where: { userId_role: { userId: missingRole.userId, role: Role.OSM } },
    });
    const missingRoleVersion = await relationshipVersion(missingRole.relationshipId);

    await expect(
      suspendOsmRelationship(owner.actor, {
        relationshipId: missingRole.relationshipId,
        targetHospitalId: owner.hospitalId,
        expectedUpdatedAt: missingRoleVersion.toISOString(),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const staleTarget = await createOsmTarget({ hospitalId: owner.hospitalId });
    await expect(
      suspendOsmRelationship(owner.actor, {
        relationshipId: staleTarget.relationshipId,
        targetHospitalId: owner.hospitalId,
        expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const invalidSource = await createOsmTarget({
      hospitalId: owner.hospitalId,
      relationshipStatus: MembershipStatus.SUSPENDED,
    });
    const invalidSourceVersion = await relationshipVersion(invalidSource.relationshipId);
    await expect(
      suspendOsmRelationship(owner.actor, {
        relationshipId: invalidSource.relationshipId,
        targetHospitalId: owner.hospitalId,
        expectedUpdatedAt: invalidSourceVersion.toISOString(),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await prisma.hospital.update({
      where: { id: owner.hospitalId },
      data: { status: HospitalStatus.SUSPENDED },
    });
    const inactiveHospitalTarget = await createOsmTarget({ hospitalId: owner.hospitalId });
    const inactiveHospitalVersion = await relationshipVersion(inactiveHospitalTarget.relationshipId);
    await expect(
      suspendOsmRelationship(owner.actor, {
        relationshipId: inactiveHospitalTarget.relationshipId,
        targetHospitalId: owner.hospitalId,
        expectedUpdatedAt: inactiveHospitalVersion.toISOString(),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("does not infer OSM lifecycle authority from Hospital hierarchy or expose another Hospital", async () => {
    const parent = await createOwner("OSM-LIFECYCLE-PARENT");
    const child = await createOwner("OSM-LIFECYCLE-CHILD");
    await prisma.hospital.update({
      where: { id: child.hospitalId },
      data: { parentHospitalId: parent.hospitalId },
    });
    const childTarget = await createOsmTarget({ hospitalId: child.hospitalId });
    const parentTarget = await createOsmTarget({ hospitalId: parent.hospitalId });

    await expect(
      suspendOsmRelationship(parent.actor, {
        relationshipId: childTarget.relationshipId,
        targetHospitalId: child.hospitalId,
        expectedUpdatedAt: (await relationshipVersion(childTarget.relationshipId)).toISOString(),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      getWorkforceDetail(parent.actor, {
        kind: "osm",
        relationshipId: childTarget.relationshipId,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      suspendOsmRelationship(child.actor, {
        relationshipId: parentTarget.relationshipId,
        targetHospitalId: parent.hospitalId,
        expectedUpdatedAt: (await relationshipVersion(parentTarget.relationshipId)).toISOString(),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("restores a suspended relationship without recreating ended assignment history", async () => {
    const owner = await createOwner("OSM-LIFECYCLE-RESTORE");
    const target = await createOsmTarget({
      hospitalId: owner.hospitalId,
      relationshipStatus: MembershipStatus.SUSPENDED,
    });
    const patient = await createPatient(owner, owner.hospitalId);
    const endedAt = new Date("2026-08-18T05:00:00.000Z");
    const assignment = await prisma.patientOsmAssignment.create({
      data: {
        patientHospitalRelationshipId: patient.relationshipId,
        osmUserId: target.userId,
        assignedByUserId: owner.actor.userId,
        createdAt: new Date("2026-08-17T05:00:00.000Z"),
        endedAt,
        endedByUserId: owner.actor.userId,
      },
      select: { id: true, endedAt: true },
    });
    const userBefore = await prisma.user.findUniqueOrThrow({
      where: { id: target.userId },
      select: { status: true, roles: { select: { role: true }, orderBy: { role: "asc" } } },
    });
    const version = await relationshipVersion(target.relationshipId);

    await expect(
      restoreOsmRelationship(owner.actor, {
        relationshipId: target.relationshipId,
        targetHospitalId: owner.hospitalId,
        expectedUpdatedAt: version.toISOString(),
      }),
    ).resolves.toMatchObject({
      relationshipId: target.relationshipId,
      relationshipStatus: MembershipStatus.ACTIVE,
    });

    await expect(
      prisma.patientOsmAssignment.findUnique({
        where: { id: assignment.id },
        select: { endedAt: true },
      }),
    ).resolves.toEqual({ endedAt: endedAt });
    await expect(
      prisma.patientOsmAssignment.count({
        where: {
          osmUserId: target.userId,
          endedAt: null,
          patientHospitalRelationship: { hospitalId: owner.hospitalId },
        },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.user.findUnique({
        where: { id: target.userId },
        select: { status: true, roles: { select: { role: true }, orderBy: { role: "asc" } } },
      }),
    ).resolves.toEqual(userBefore);
    await expect(
      prisma.auditEvent.count({
        where: { action: "osm_relationship.restored", resourceId: target.relationshipId },
      }),
    ).resolves.toBe(1);
  });

  it("blocks restore when legacy current assignments exist and does not repair them", async () => {
    const owner = await createOwner("OSM-LIFECYCLE-RECONCILE");
    const target = await createOsmTarget({ hospitalId: owner.hospitalId });
    const patient = await createPatient(owner, owner.hospitalId);
    await assignOsmToPatient(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
      osmUserId: target.userId,
    });
    await prisma.osmHospitalRelationship.update({
      where: { id: target.relationshipId },
      data: { status: MembershipStatus.SUSPENDED },
    });
    const version = await relationshipVersion(target.relationshipId);

    await expect(
      restoreOsmRelationship(owner.actor, {
        relationshipId: target.relationshipId,
        targetHospitalId: owner.hospitalId,
        expectedUpdatedAt: version.toISOString(),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await expect(
      prisma.osmHospitalRelationship.findUnique({
        where: { id: target.relationshipId },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: MembershipStatus.SUSPENDED });
    await expect(
      prisma.patientOsmAssignment.findFirst({
        where: { patientHospitalRelationshipId: patient.relationshipId },
        select: { endedAt: true, osmUserId: true },
      }),
    ).resolves.toEqual({ endedAt: null, osmUserId: target.userId });
    await expect(
      prisma.auditEvent.count({ where: { action: "osm_relationship.restored" } }),
    ).resolves.toBe(0);
  });

  it("requires an active User and existing Role.OSM for restore", async () => {
    const owner = await createOwner("OSM-LIFECYCLE-RESTORE-GUARDS");
    const statuses = [UserStatus.PROVISIONED, UserStatus.INVITED, UserStatus.SUSPENDED] as const;

    for (const userStatus of statuses) {
      const target = await createOsmTarget({
        hospitalId: owner.hospitalId,
        userStatus,
        relationshipStatus: MembershipStatus.SUSPENDED,
      });
      const version = await relationshipVersion(target.relationshipId);

      await expect(
        restoreOsmRelationship(owner.actor, {
          relationshipId: target.relationshipId,
          targetHospitalId: owner.hospitalId,
          expectedUpdatedAt: version.toISOString(),
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    }

    const missingRole = await createOsmTarget({
      hospitalId: owner.hospitalId,
      relationshipStatus: MembershipStatus.SUSPENDED,
    });
    await prisma.userRole.delete({
      where: { userId_role: { userId: missingRole.userId, role: Role.OSM } },
    });
    const missingRoleVersion = await relationshipVersion(missingRole.relationshipId);

    await expect(
      restoreOsmRelationship(owner.actor, {
        relationshipId: missingRole.relationshipId,
        targetHospitalId: owner.hospitalId,
        expectedUpdatedAt: missingRoleVersion.toISOString(),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const staleTarget = await createOsmTarget({
      hospitalId: owner.hospitalId,
      relationshipStatus: MembershipStatus.SUSPENDED,
    });
    await expect(
      restoreOsmRelationship(owner.actor, {
        relationshipId: staleTarget.relationshipId,
        targetHospitalId: owner.hospitalId,
        expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const inactiveHospitalTarget = await createOsmTarget({
      hospitalId: owner.hospitalId,
      relationshipStatus: MembershipStatus.SUSPENDED,
    });
    await prisma.hospital.update({
      where: { id: owner.hospitalId },
      data: { status: HospitalStatus.SUSPENDED },
    });
    await expect(
      restoreOsmRelationship(owner.actor, {
        relationshipId: inactiveHospitalTarget.relationshipId,
        targetHospitalId: owner.hospitalId,
        expectedUpdatedAt: (await relationshipVersion(inactiveHospitalTarget.relationshipId)).toISOString(),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await prisma.hospital.update({
      where: { id: owner.hospitalId },
      data: { status: HospitalStatus.ACTIVE },
    });
    const activeSource = await createOsmTarget({
      hospitalId: owner.hospitalId,
      relationshipStatus: MembershipStatus.ACTIVE,
    });
    await expect(
      restoreOsmRelationship(owner.actor, {
        relationshipId: activeSource.relationshipId,
        targetHospitalId: owner.hospitalId,
        expectedUpdatedAt: (await relationshipVersion(activeSource.relationshipId)).toISOString(),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("keeps multi-Hospital relationships isolated and projects exact-Hospital counts", async () => {
    const ownerA = await createOwner("OSM-LIFECYCLE-HOSPITAL-A");
    const ownerB = await createOwner("OSM-LIFECYCLE-HOSPITAL-B");
    const target = await createOsmTarget({ hospitalId: ownerA.hospitalId });
    const relationshipB = await prisma.osmHospitalRelationship.create({
      data: {
        userId: target.userId,
        hospitalId: ownerB.hospitalId,
        status: MembershipStatus.ACTIVE,
      },
      select: { id: true },
    });
    const patientA = await createPatient(ownerA, ownerA.hospitalId);
    const patientB = await createPatient(ownerB, ownerB.hospitalId);

    const detailAWithoutAssignments = await getWorkforceDetail(ownerA.actor, {
      kind: "osm",
      relationshipId: target.relationshipId,
    });
    expect(detailAWithoutAssignments).toMatchObject({
      currentAssignmentCount: 0,
      actions: { suspend: true, restore: false },
    });

    await assignOsmToPatient(ownerB.actor, {
      patientHospitalRelationshipId: patientB.relationshipId,
      osmUserId: target.userId,
    });
    const detailAWithOnlyBAssignment = await getWorkforceDetail(ownerA.actor, {
      kind: "osm",
      relationshipId: target.relationshipId,
    });
    const detailB = await getWorkforceDetail(ownerB.actor, {
      kind: "osm",
      relationshipId: relationshipB.id,
    });
    expect(detailAWithOnlyBAssignment).toMatchObject({
      currentAssignmentCount: 0,
      actions: { suspend: true, restore: false },
    });
    expect(detailB).toMatchObject({
      currentAssignmentCount: 1,
      actions: { suspend: false, restore: false },
      lifecycleBlockReason: "CURRENT_ASSIGNMENTS",
    });
    await expect(
      getWorkforceDetail(ownerA.actor, { kind: "osm", relationshipId: relationshipB.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await assignOsmToPatient(ownerA.actor, {
      patientHospitalRelationshipId: patientA.relationshipId,
      osmUserId: target.userId,
    });
    const blockedDetailA = await getWorkforceDetail(ownerA.actor, {
      kind: "osm",
      relationshipId: target.relationshipId,
    });
    expect(blockedDetailA).toMatchObject({
      currentAssignmentCount: 1,
      actions: { suspend: false, restore: false },
      lifecycleBlockReason: "CURRENT_ASSIGNMENTS",
    });
    await expect(
      suspendOsmRelationship(ownerA.actor, {
        relationshipId: relationshipB.id,
        targetHospitalId: ownerB.hospitalId,
        expectedUpdatedAt: (await relationshipVersion(relationshipB.id)).toISOString(),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      suspendOsmRelationship(ownerB.actor, {
        relationshipId: target.relationshipId,
        targetHospitalId: ownerA.hospitalId,
        expectedUpdatedAt: (await relationshipVersion(target.relationshipId)).toISOString(),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await unassignOsmFromPatient(ownerA.actor, {
      patientHospitalRelationshipId: patientA.relationshipId,
    });
    await suspendOsmRelationship(ownerA.actor, {
      relationshipId: target.relationshipId,
      targetHospitalId: ownerA.hospitalId,
      expectedUpdatedAt: (await relationshipVersion(target.relationshipId)).toISOString(),
    });
    await restoreOsmRelationship(ownerA.actor, {
      relationshipId: target.relationshipId,
      targetHospitalId: ownerA.hospitalId,
      expectedUpdatedAt: (await relationshipVersion(target.relationshipId)).toISOString(),
    });

    await expect(
      prisma.osmHospitalRelationship.findUnique({
        where: { id: relationshipB.id },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: MembershipStatus.ACTIVE });
    await expect(
      prisma.patientOsmAssignment.count({
        where: {
          osmUserId: target.userId,
          endedAt: null,
          patientHospitalRelationship: { hospitalId: ownerB.hospitalId },
        },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.user.findUnique({ where: { id: target.userId }, select: { status: true } }),
    ).resolves.toEqual({ status: UserStatus.ACTIVE });
    await expect(
      prisma.userRole.findMany({
        where: { userId: target.userId },
        select: { role: true },
        orderBy: { role: "asc" },
      }),
    ).resolves.toEqual([{ role: Role.OSM }]);
  });

  it("does not commit SUSPENDED with a newly committed current assignment", async () => {
    const owner = await createOwner("OSM-LIFECYCLE-CONCURRENT");
    const target = await createOsmTarget({ hospitalId: owner.hospitalId });
    const patient = await createPatient(owner, owner.hospitalId);
    const version = await relationshipVersion(target.relationshipId);

    await Promise.allSettled([
      suspendOsmRelationship(owner.actor, {
        relationshipId: target.relationshipId,
        targetHospitalId: owner.hospitalId,
        expectedUpdatedAt: version.toISOString(),
      }),
      assignOsmToPatient(owner.actor, {
        patientHospitalRelationshipId: patient.relationshipId,
        osmUserId: target.userId,
      }),
    ]);

    const relationship = await prisma.osmHospitalRelationship.findUniqueOrThrow({
      where: { id: target.relationshipId },
      select: { status: true },
    });
    const currentAssignmentCount = await prisma.patientOsmAssignment.count({
      where: {
        osmUserId: target.userId,
        endedAt: null,
        patientHospitalRelationship: { hospitalId: owner.hospitalId },
      },
    });

    expect(relationship.status === MembershipStatus.SUSPENDED && currentAssignmentCount > 0).toBe(
      false,
    );
  });
});
