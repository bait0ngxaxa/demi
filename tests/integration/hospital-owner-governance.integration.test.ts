import {
  AppointmentLocationType,
  AppointmentType,
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Role,
  UserStatus,
  WorkforceActivationMode,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { createAppointment } from "@/modules/appointments/services/appointment-service";
import { assignOsmToPatient } from "@/modules/patient-assignment/services/patient-osm-assignment-service";
import { provisionPatient } from "@/modules/patient-provisioning/services/patient-provisioning-service";
import {
  demoteHospitalOwner,
  getWorkforceDetail,
  listWorkforce,
  promoteHospitalOwner,
} from "@/modules/workforce/services/workforce-service";
import { ConflictError, ForbiddenError } from "@/shared/errors/application-error";

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
  label: string,
  status: HospitalStatus = HospitalStatus.ACTIVE,
  parentHospitalId?: string,
): Promise<{ id: string; status: HospitalStatus }> {
  sequence += 1;
  return prisma.hospital.create({
    data: {
      hospitalCode: `12D0-${label}-${sequence}`,
      name: `โรงพยาบาล 12D0 ${label}`,
      status,
      parentHospitalId,
    },
    select: { id: true, status: true },
  });
}

async function createUser(
  label: string,
  status: UserStatus = UserStatus.ACTIVE,
  roles: readonly Role[] = [Role.HOSPITAL],
): Promise<{ userId: string; personId: string }> {
  sequence += 1;
  const person = await prisma.person.create({
    data: {
      identityKeyHash: `12d0-${label}-${sequence}`,
      givenName: "ผู้ใช้งาน",
      familyName: label,
    },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: {
      personId: person.id,
      authSubject: status === UserStatus.PROVISIONED ? null : randomUUID(),
      status,
    },
    select: { id: true },
  });

  for (const role of roles) {
    await prisma.userRole.create({ data: { userId: user.id, role } });
  }

  return { userId: user.id, personId: person.id };
}

type StaffFixture = {
  actor: ActorContext;
  userId: string;
  personId: string;
  membershipId: string;
  updatedAt: Date;
};

async function createStaff(input: {
  label: string;
  hospitalId: string;
  membershipType: MembershipType;
  membershipStatus?: MembershipStatus;
  userStatus?: UserStatus;
  roles?: readonly Role[];
  profession?: "DOCTOR" | "NURSE" | "COORDINATOR" | "OTHER";
}): Promise<StaffFixture> {
  const hospital = await prisma.hospital.findUniqueOrThrow({
    where: { id: input.hospitalId },
    select: { status: true },
  });
  const user = await createUser(input.label, input.userStatus, input.roles);
  const membership = await prisma.hospitalMembership.create({
    data: {
      userId: user.userId,
      hospitalId: input.hospitalId,
      membershipType: input.membershipType,
      profession: input.profession ?? "DOCTOR",
      status: input.membershipStatus ?? MembershipStatus.ACTIVE,
    },
    select: { id: true, status: true, membershipType: true, profession: true, updatedAt: true },
  });

  return {
    ...user,
    membershipId: membership.id,
    updatedAt: membership.updatedAt,
    actor: {
      userId: user.userId,
      personId: user.personId,
      roles: input.roles ?? [Role.HOSPITAL],
      hospitalMemberships: [
        {
          hospitalId: input.hospitalId,
          membershipType: membership.membershipType,
          profession: membership.profession,
          status: membership.status,
          hospitalStatus: hospital.status,
        },
      ],
      osmHospitalRelationships: [],
    },
  };
}

async function createStaffAcross(
  label: string,
  memberships: readonly { hospitalId: string; membershipType: MembershipType }[],
): Promise<{ actor: ActorContext; userId: string; personId: string; membershipIds: string[] }> {
  const user = await createUser(label, UserStatus.ACTIVE, [Role.HOSPITAL]);
  const actorMemberships: Array<ActorContext["hospitalMemberships"][number]> = [];
  const membershipIds: string[] = [];

  for (const input of memberships) {
    const hospital = await prisma.hospital.findUniqueOrThrow({
      where: { id: input.hospitalId },
      select: { status: true },
    });
    const membership = await prisma.hospitalMembership.create({
      data: {
        userId: user.userId,
        hospitalId: input.hospitalId,
        membershipType: input.membershipType,
        profession: "DOCTOR",
        status: MembershipStatus.ACTIVE,
      },
      select: { id: true, status: true, membershipType: true, profession: true },
    });
    membershipIds.push(membership.id);
    actorMemberships.push({
      hospitalId: input.hospitalId,
      membershipType: membership.membershipType,
      profession: membership.profession,
      status: membership.status,
      hospitalStatus: hospital.status,
    });
  }

  return {
    ...user,
    membershipIds,
    actor: {
      userId: user.userId,
      personId: user.personId,
      roles: [Role.HOSPITAL],
      hospitalMemberships: actorMemberships,
      osmHospitalRelationships: [],
    },
  };
}

async function createRoleActor(
  label: string,
  role: Role,
  hospitalId: string,
): Promise<{ actor: ActorContext; userId: string }> {
  const user = await createUser(label, UserStatus.ACTIVE, [role]);
  let osmHospitalRelationships: ActorContext["osmHospitalRelationships"] = [];

  if (role === Role.OSM) {
    const hospital = await prisma.hospital.findUniqueOrThrow({
      where: { id: hospitalId },
      select: { status: true },
    });
    await prisma.osmHospitalRelationship.create({
      data: { userId: user.userId, hospitalId, status: MembershipStatus.ACTIVE },
    });
    osmHospitalRelationships = [
      { hospitalId, status: MembershipStatus.ACTIVE, hospitalStatus: hospital.status },
    ];
  }

  return {
    userId: user.userId,
    actor: {
      userId: user.userId,
      personId: user.personId,
      roles: [role],
      hospitalMemberships: [],
      osmHospitalRelationships,
    },
  };
}

function scopedGovernanceInput(
  relationshipId: string,
  hospitalId: string,
  updatedAt: Date,
): {
  relationshipId: string;
  targetHospitalId: string;
  expectedUpdatedAt: string;
} {
  return { relationshipId, targetHospitalId: hospitalId, expectedUpdatedAt: updatedAt.toISOString() };
}

async function createPatientAndAppointment(
  owner: ActorContext,
  hospitalId: string,
  label: string,
): Promise<{ relationshipId: string; appointmentId: string }> {
  sequence += 1;
  const patient = await provisionPatient(owner, {
    identity: { namespace: "phase-12d0-integration", value: `${label}-${sequence}` },
    targetHospitalId: hospitalId,
    givenName: "ผู้ป่วย",
    familyName: `ทดสอบ ${label}`,
    hospitalNumber: `HN-12D0-${sequence}`,
  });
  const appointment = await createAppointment(owner, {
    patientHospitalRelationshipId: patient.relationshipId,
    submissionNonce: randomUUID(),
    scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    type: AppointmentType.CONSULTATION,
    responsibleUserId: null,
    durationMinutes: 30,
    locationType: AppointmentLocationType.CLINIC,
    locationDetail: "ห้องตรวจทดสอบ",
    note: "ข้อมูลทดสอบ Owner Governance",
  });
  return { relationshipId: patient.relationshipId, appointmentId: appointment.appointmentId };
}

describe("Phase 12D.0 Hospital Owner governance PostgreSQL workflow", () => {
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

  it("exposes a bounded Owner/Member view and promotes only the target membership", async () => {
    const hospital = await createHospital("VIEW");
    const owner = await createStaff({
      label: "เจ้าของ",
      hospitalId: hospital.id,
      membershipType: MembershipType.OWNER,
    });
    const member = await createStaff({
      label: "สมาชิก",
      hospitalId: hospital.id,
      membershipType: MembershipType.MEMBER,
      profession: "NURSE",
    });

    const directory = await listWorkforce(owner.actor, { targetHospitalId: hospital.id });
    expect(directory.rows.map((row) => row.membershipType).sort()).toEqual([
      MembershipType.MEMBER,
      MembershipType.OWNER,
    ]);

    const detail = await getWorkforceDetail(owner.actor, {
      kind: "staff",
      relationshipId: member.membershipId,
    });
    expect(detail.ownerGovernance).toEqual({ canPromote: true, canDemote: false });
    expect(detail).not.toHaveProperty("authSubject");

    const before = await prisma.hospitalMembership.findUniqueOrThrow({
      where: { id: member.membershipId },
      select: { hospitalId: true, status: true, profession: true, updatedAt: true },
    });
    const beforeUser = await prisma.user.findUniqueOrThrow({
      where: { id: member.userId },
      select: { status: true },
    });

    const result = await promoteHospitalOwner(
      owner.actor,
      scopedGovernanceInput(member.membershipId, hospital.id, member.updatedAt),
    );

    const after = await prisma.hospitalMembership.findUniqueOrThrow({
      where: { id: member.membershipId },
      select: { membershipType: true, hospitalId: true, status: true, profession: true, updatedAt: true },
    });
    expect(result.membershipType).toBe(MembershipType.OWNER);
    expect(after).toMatchObject({
      membershipType: MembershipType.OWNER,
      hospitalId: before.hospitalId,
      status: before.status,
      profession: before.profession,
    });
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
    expect(await prisma.user.findUniqueOrThrow({ where: { id: member.userId }, select: { status: true } })).toEqual(
      beforeUser,
    );

    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { action: "hospital_owner.promoted", resourceId: member.membershipId },
      orderBy: { createdAt: "desc" },
    });
    expect(audit.metadata).toEqual({
      hospitalId: hospital.id,
      targetMembershipId: member.membershipId,
      targetUserId: member.userId,
      fromMembershipType: MembershipType.MEMBER,
      toMembershipType: MembershipType.OWNER,
    });
  });

  it("demotes another Owner and permits self-demotion while one Owner remains", async () => {
    const hospital = await createHospital("DEMOTE");
    const alice = await createStaff({
      label: "อลิซ",
      hospitalId: hospital.id,
      membershipType: MembershipType.OWNER,
    });
    const bob = await createStaff({
      label: "บ็อบ",
      hospitalId: hospital.id,
      membershipType: MembershipType.OWNER,
    });

    await demoteHospitalOwner(
      alice.actor,
      scopedGovernanceInput(bob.membershipId, hospital.id, bob.updatedAt),
    );
    expect(
      await prisma.hospitalMembership.findUniqueOrThrow({
        where: { id: bob.membershipId },
        select: { membershipType: true, status: true },
      }),
    ).toEqual({ membershipType: MembershipType.MEMBER, status: MembershipStatus.ACTIVE });
    expect(
      await prisma.auditEvent.count({ where: { action: "hospital_owner.demoted" } }),
    ).toBe(1);

    const carol = await createStaff({
      label: "แครอล",
      hospitalId: hospital.id,
      membershipType: MembershipType.OWNER,
    });
    const aliceVersion = await prisma.hospitalMembership.findUniqueOrThrow({
      where: { id: alice.membershipId },
      select: { updatedAt: true },
    });
    await demoteHospitalOwner(
      alice.actor,
      scopedGovernanceInput(alice.membershipId, hospital.id, aliceVersion.updatedAt),
    );
    expect(
      await prisma.hospitalMembership.findUniqueOrThrow({
        where: { id: alice.membershipId },
        select: { membershipType: true, status: true },
      }),
    ).toEqual({ membershipType: MembershipType.MEMBER, status: MembershipStatus.ACTIVE });
    expect(
      await prisma.hospitalMembership.findUniqueOrThrow({
        where: { id: carol.membershipId },
        select: { membershipType: true, status: true },
      }),
    ).toEqual({ membershipType: MembershipType.OWNER, status: MembershipStatus.ACTIVE });
  });

  it("protects the final eligible Owner and emits no success audit", async () => {
    const hospital = await createHospital("FINAL");
    const owner = await createStaff({
      label: "เจ้าของคนเดียว",
      hospitalId: hospital.id,
      membershipType: MembershipType.OWNER,
    });

    await expect(
      demoteHospitalOwner(
        owner.actor,
        scopedGovernanceInput(owner.membershipId, hospital.id, owner.updatedAt),
      ),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(
      await prisma.hospitalMembership.findUniqueOrThrow({
        where: { id: owner.membershipId },
        select: { membershipType: true, status: true },
      }),
    ).toEqual({ membershipType: MembershipType.OWNER, status: MembershipStatus.ACTIVE });
    expect(await prisma.auditEvent.count({ where: { action: "hospital_owner.demoted" } })).toBe(0);
  });

  it("fails closed for non-Owners, inactive scopes, and hierarchy-only authority", async () => {
    const parent = await createHospital("PARENT");
    const child = await createHospital("CHILD", HospitalStatus.ACTIVE, parent.id);
    const owner = await createStaff({
      label: "เจ้าของเป้าหมาย",
      hospitalId: child.id,
      membershipType: MembershipType.OWNER,
    });
    const target = await createStaff({
      label: "สมาชิกเป้าหมาย",
      hospitalId: child.id,
      membershipType: MembershipType.MEMBER,
    });
    const memberActor = await createStaff({
      label: "สมาชิกผู้เรียก",
      hospitalId: child.id,
      membershipType: MembershipType.MEMBER,
    });
    const osm = await createRoleActor("อสม.", Role.OSM, child.id);
    const patient = await createRoleActor("ผู้ป่วย", Role.PATIENT, child.id);
    const admin = await createRoleActor("ผู้ดูแลแพลตฟอร์ม", Role.ADMIN, child.id);
    const parentOwner = await createStaff({
      label: "เจ้าของโรงพยาบาลแม่",
      hospitalId: parent.id,
      membershipType: MembershipType.OWNER,
    });
    const suspendedOwner = await createStaff({
      label: "เจ้าของสมาชิกถูกระงับ",
      hospitalId: child.id,
      membershipType: MembershipType.OWNER,
      membershipStatus: MembershipStatus.SUSPENDED,
    });
    const suspendedHospital = await createHospital("SUSPENDED", HospitalStatus.SUSPENDED);
    const suspendedHospitalOwner = await createStaff({
      label: "เจ้าของโรงพยาบาลระงับ",
      hospitalId: suspendedHospital.id,
      membershipType: MembershipType.OWNER,
    });
    const suspendedTarget = await createStaff({
      label: "เป้าหมายโรงพยาบาลระงับ",
      hospitalId: suspendedHospital.id,
      membershipType: MembershipType.MEMBER,
    });

    const targetInput = scopedGovernanceInput(target.membershipId, child.id, target.updatedAt);
    const deniedCalls: Array<Promise<unknown>> = [
      promoteHospitalOwner(memberActor.actor, targetInput),
      promoteHospitalOwner(osm.actor, targetInput),
      promoteHospitalOwner(patient.actor, targetInput),
      promoteHospitalOwner(admin.actor, targetInput),
      promoteHospitalOwner(parentOwner.actor, targetInput),
      promoteHospitalOwner(suspendedOwner.actor, targetInput),
      promoteHospitalOwner(null, targetInput),
      promoteHospitalOwner(suspendedHospitalOwner.actor, scopedGovernanceInput(
        suspendedTarget.membershipId,
        suspendedHospital.id,
        suspendedTarget.updatedAt,
      )),
    ];
    const outcomes = await Promise.allSettled(deniedCalls);
    expect(outcomes.every((outcome) => outcome.status === "rejected")).toBe(true);
    for (const outcome of outcomes) {
      if (outcome.status === "rejected") {
        expect(outcome.reason).toBeInstanceOf(ForbiddenError);
      }
    }
    expect(owner.actor.userId).not.toBe(memberActor.actor.userId);
  });

  it("rejects inconsistent targets, stale writes, and stale actor contexts", async () => {
    const hospital = await createHospital("CONFLICTS");
    const owner = await createStaff({
      label: "เจ้าของตรวจสอบ",
      hospitalId: hospital.id,
      membershipType: MembershipType.OWNER,
    });
    const missingRole = await createStaff({
      label: "สมาชิกไม่มี Role",
      hospitalId: hospital.id,
      membershipType: MembershipType.MEMBER,
      roles: [],
    });
    const suspendedMembership = await createStaff({
      label: "สมาชิกระงับ",
      hospitalId: hospital.id,
      membershipType: MembershipType.MEMBER,
      membershipStatus: MembershipStatus.SUSPENDED,
    });
    const inactiveUser = await createStaff({
      label: "บัญชีไม่ใช้งาน",
      hospitalId: hospital.id,
      membershipType: MembershipType.MEMBER,
      userStatus: UserStatus.SUSPENDED,
    });
    const existingOwner = await createStaff({
      label: "เจ้าของเดิม",
      hospitalId: hospital.id,
      membershipType: MembershipType.OWNER,
    });
    const member = await createStaff({
      label: "สมาชิกเดิม",
      hospitalId: hospital.id,
      membershipType: MembershipType.MEMBER,
    });

    await expect(
      promoteHospitalOwner(
        owner.actor,
        scopedGovernanceInput(missingRole.membershipId, hospital.id, missingRole.updatedAt),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      promoteHospitalOwner(
        owner.actor,
        scopedGovernanceInput(suspendedMembership.membershipId, hospital.id, suspendedMembership.updatedAt),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      promoteHospitalOwner(
        owner.actor,
        scopedGovernanceInput(inactiveUser.membershipId, hospital.id, inactiveUser.updatedAt),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      promoteHospitalOwner(
        owner.actor,
        scopedGovernanceInput(existingOwner.membershipId, hospital.id, existingOwner.updatedAt),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      demoteHospitalOwner(
        owner.actor,
        scopedGovernanceInput(member.membershipId, hospital.id, member.updatedAt),
      ),
    ).rejects.toBeInstanceOf(ConflictError);

    await prisma.hospitalMembership.update({
      where: { id: member.membershipId },
      data: { profession: "NURSE" },
    });
    await expect(
      promoteHospitalOwner(
        owner.actor,
        scopedGovernanceInput(member.membershipId, hospital.id, member.updatedAt),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(
      await prisma.hospitalMembership.findUniqueOrThrow({
        where: { id: member.membershipId },
        select: { membershipType: true },
      }),
    ).toEqual({ membershipType: MembershipType.MEMBER });

    const staleActor = owner.actor;
    await prisma.hospitalMembership.update({
      where: { id: owner.membershipId },
      data: { membershipType: MembershipType.MEMBER },
    });
    await expect(
      promoteHospitalOwner(
        staleActor,
        scopedGovernanceInput(member.membershipId, hospital.id, (
          await prisma.hospitalMembership.findUniqueOrThrow({
            where: { id: member.membershipId },
            select: { updatedAt: true },
          })
        ).updatedAt),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const secondHospital = await createHospital("SUSPEND-AFTER-RENDER");
    const secondOwner = await createStaff({
      label: "เจ้าของก่อนระงับ",
      hospitalId: secondHospital.id,
      membershipType: MembershipType.OWNER,
    });
    const secondTarget = await createStaff({
      label: "สมาชิกก่อนระงับ",
      hospitalId: secondHospital.id,
      membershipType: MembershipType.MEMBER,
    });
    await prisma.hospital.update({
      where: { id: secondHospital.id },
      data: { status: HospitalStatus.SUSPENDED },
    });
    await expect(
      promoteHospitalOwner(
        secondOwner.actor,
        scopedGovernanceInput(secondTarget.membershipId, secondHospital.id, secondTarget.updatedAt),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(await prisma.auditEvent.count()).toBe(0);
  });

  it("isolates exact Hospitals and does not let a related Hospital grant authority", async () => {
    const hospitalA = await createHospital("ISOLATION-A");
    const hospitalB = await createHospital("ISOLATION-B");
    const participant = await createStaffAcross("ผู้ใช้สองโรงพยาบาล", [
      { hospitalId: hospitalA.id, membershipType: MembershipType.MEMBER },
      { hospitalId: hospitalB.id, membershipType: MembershipType.MEMBER },
    ]);
    const ownerA = await createStaff({
      label: "เจ้าของ A",
      hospitalId: hospitalA.id,
      membershipType: MembershipType.OWNER,
    });
    const ownerB = await createStaff({
      label: "เจ้าของ B",
      hospitalId: hospitalB.id,
      membershipType: MembershipType.OWNER,
    });
    const beforeB = await prisma.hospitalMembership.findUniqueOrThrow({
      where: { id: participant.membershipIds[1] },
      select: { membershipType: true, status: true, updatedAt: true },
    });

    await promoteHospitalOwner(
      ownerA.actor,
      scopedGovernanceInput(participant.membershipIds[0], hospitalA.id, (
        await prisma.hospitalMembership.findUniqueOrThrow({
          where: { id: participant.membershipIds[0] },
          select: { updatedAt: true },
        })
      ).updatedAt),
    );

    expect(
      await prisma.hospitalMembership.findUniqueOrThrow({
        where: { id: participant.membershipIds[0] },
        select: { membershipType: true },
      }),
    ).toEqual({ membershipType: MembershipType.OWNER });
    expect(
      await prisma.hospitalMembership.findUniqueOrThrow({
        where: { id: participant.membershipIds[1] },
        select: { membershipType: true, status: true, updatedAt: true },
      }),
    ).toEqual({ ...beforeB });

    await expect(
      promoteHospitalOwner(
        ownerB.actor,
        scopedGovernanceInput(participant.membershipIds[0], hospitalA.id, (
          await prisma.hospitalMembership.findUniqueOrThrow({
            where: { id: participant.membershipIds[0] },
            select: { updatedAt: true },
          })
        ).updatedAt),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("preserves unrelated account, role, lifecycle, OSM, Patient, and appointment state", async () => {
    const hospitalA = await createHospital("NO-CASCADE-A");
    const hospitalB = await createHospital("NO-CASCADE-B");
    const owner = await createStaff({
      label: "เจ้าของไม่กระจายผล",
      hospitalId: hospitalA.id,
      membershipType: MembershipType.OWNER,
    });
    const target = await createStaffAcross("สมาชิกสองโรงพยาบาล", [
      { hospitalId: hospitalA.id, membershipType: MembershipType.MEMBER },
      { hospitalId: hospitalB.id, membershipType: MembershipType.MEMBER },
    ]);
    const osmUser = await createRoleActor("อสม.ไม่กระจายผล", Role.OSM, hospitalA.id);
    const patient = await createPatientAndAppointment(owner.actor, hospitalA.id, "NO-CASCADE");
    await assignOsmToPatient(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
      osmUserId: osmUser.userId,
    });
    await prisma.workforceActivation.create({
      data: {
        userId: target.userId,
        tokenHash: `12d0-activation-${sequence}`,
        mode: WorkforceActivationMode.REMOTE,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        createdByUserId: owner.userId,
      },
    });

    const before = {
      user: await prisma.user.findUniqueOrThrow({
        where: { id: target.userId },
        select: { status: true },
      }),
      roles: await prisma.userRole.findMany({
        where: { userId: target.userId },
        select: { role: true },
        orderBy: { role: "asc" },
      }),
      memberships: await prisma.hospitalMembership.findMany({
        where: { userId: target.userId },
        select: { hospitalId: true, membershipType: true, status: true, profession: true },
        orderBy: { hospitalId: "asc" },
      }),
      activation: await prisma.workforceActivation.findFirstOrThrow({
        where: { userId: target.userId },
        select: { tokenHash: true, mode: true, claimedAt: true, usedAt: true, revokedAt: true },
      }),
      hospitals: await prisma.hospital.findMany({
        where: { id: { in: [hospitalA.id, hospitalB.id] } },
        select: { id: true, status: true },
        orderBy: { id: "asc" },
      }),
      osm: await prisma.osmHospitalRelationship.findMany({
        where: { userId: osmUser.userId },
        select: { hospitalId: true, status: true },
      }),
      patientRelationship: await prisma.patientHospitalRelationship.findUniqueOrThrow({
        where: { id: patient.relationshipId },
        select: { hospitalId: true, hospitalNumber: true },
      }),
      assignment: await prisma.patientOsmAssignment.findFirstOrThrow({
        where: { patientHospitalRelationshipId: patient.relationshipId },
        select: { osmUserId: true, endedAt: true },
      }),
      appointment: await prisma.patientAppointment.findUniqueOrThrow({
        where: { id: patient.appointmentId },
        select: { status: true, scheduledAt: true },
      }),
    };

    await promoteHospitalOwner(
      owner.actor,
      scopedGovernanceInput(target.membershipIds[0], hospitalA.id, (
        await prisma.hospitalMembership.findUniqueOrThrow({
          where: { id: target.membershipIds[0] },
          select: { updatedAt: true },
        })
      ).updatedAt),
    );

    const after = {
      user: await prisma.user.findUniqueOrThrow({
        where: { id: target.userId },
        select: { status: true },
      }),
      roles: await prisma.userRole.findMany({
        where: { userId: target.userId },
        select: { role: true },
        orderBy: { role: "asc" },
      }),
      memberships: await prisma.hospitalMembership.findMany({
        where: { userId: target.userId },
        select: { hospitalId: true, membershipType: true, status: true, profession: true },
        orderBy: { hospitalId: "asc" },
      }),
      activation: await prisma.workforceActivation.findFirstOrThrow({
        where: { userId: target.userId },
        select: { tokenHash: true, mode: true, claimedAt: true, usedAt: true, revokedAt: true },
      }),
      hospitals: await prisma.hospital.findMany({
        where: { id: { in: [hospitalA.id, hospitalB.id] } },
        select: { id: true, status: true },
        orderBy: { id: "asc" },
      }),
      osm: await prisma.osmHospitalRelationship.findMany({
        where: { userId: osmUser.userId },
        select: { hospitalId: true, status: true },
      }),
      patientRelationship: await prisma.patientHospitalRelationship.findUniqueOrThrow({
        where: { id: patient.relationshipId },
        select: { hospitalId: true, hospitalNumber: true },
      }),
      assignment: await prisma.patientOsmAssignment.findFirstOrThrow({
        where: { patientHospitalRelationshipId: patient.relationshipId },
        select: { osmUserId: true, endedAt: true },
      }),
      appointment: await prisma.patientAppointment.findUniqueOrThrow({
        where: { id: patient.appointmentId },
        select: { status: true, scheduledAt: true },
      }),
    };

    expect(after.user).toEqual(before.user);
    expect(after.roles).toEqual(before.roles);
    expect(after.activation).toEqual(before.activation);
    const beforeHospitalBMembership = before.memberships.find(
      ({ hospitalId }) => hospitalId === hospitalB.id,
    );
    const afterHospitalBMembership = after.memberships.find(
      ({ hospitalId }) => hospitalId === hospitalB.id,
    );
    expect(afterHospitalBMembership).toEqual(beforeHospitalBMembership);
    expect(after.hospitals).toEqual(before.hospitals);
    expect(after.osm).toEqual(before.osm);
    expect(after.patientRelationship).toEqual(before.patientRelationship);
    expect(after.assignment).toEqual(before.assignment);
    expect(after.appointment).toEqual(before.appointment);
    const afterHospitalAMembership = after.memberships.find(
      ({ hospitalId }) => hospitalId === hospitalA.id,
    );
    expect(afterHospitalAMembership).toMatchObject({
      hospitalId: hospitalA.id,
      membershipType: MembershipType.OWNER,
      status: MembershipStatus.ACTIVE,
      profession: "DOCTOR",
    });
  });

  it("prevents concurrent demotions from leaving zero eligible Owners", async () => {
    const hospital = await createHospital("RACE");
    const alice = await createStaff({
      label: "อลิซแข่ง",
      hospitalId: hospital.id,
      membershipType: MembershipType.OWNER,
    });
    const bob = await createStaff({
      label: "บ็อบแข่ง",
      hospitalId: hospital.id,
      membershipType: MembershipType.OWNER,
    });

    const outcomes = await Promise.allSettled([
      demoteHospitalOwner(
        alice.actor,
        scopedGovernanceInput(alice.membershipId, hospital.id, alice.updatedAt),
      ),
      demoteHospitalOwner(
        bob.actor,
        scopedGovernanceInput(bob.membershipId, hospital.id, bob.updatedAt),
      ),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    const owners = await prisma.hospitalMembership.findMany({
      where: {
        hospitalId: hospital.id,
        membershipType: MembershipType.OWNER,
        status: MembershipStatus.ACTIVE,
        user: {
          status: UserStatus.ACTIVE,
          roles: { some: { role: Role.HOSPITAL } },
        },
      },
      select: { id: true },
    });
    expect(owners).toHaveLength(1);
    expect(await prisma.auditEvent.count({ where: { action: "hospital_owner.demoted" } })).toBe(1);
  });
});
