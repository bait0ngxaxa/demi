import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Prisma,
  Role,
  UserStatus,
} from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  getPatientOsmAssignmentManagementView,
  listPatientOsmCandidates,
} from "@/modules/patient-assignment/services/patient-osm-assignment-query-service";
import {
  assignOsmToPatient,
  unassignOsmFromPatient,
} from "@/modules/patient-assignment/services/patient-osm-assignment-service";
import {
  findAssignedPatientDirectory,
  getPatientDirectoryDetail,
} from "@/modules/patient-directory/services/patient-directory-query-service";
import { provisionPatient } from "@/modules/patient-provisioning/services/patient-provisioning-service";
import { ForbiddenError, NotFoundError } from "@/shared/errors/application-error";

const prisma = getPrisma();
let actorSequence = 0;

async function clearDatabase(): Promise<void> {
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
): Promise<{ id: string; status: HospitalStatus }> {
  return prisma.hospital.create({
    data: {
      hospitalCode: code,
      name: `โรงพยาบาล ${code}`,
      status,
      parentHospitalId,
    },
    select: { id: true, status: true },
  });
}

async function createHospitalActor(input: {
  hospitalId: string;
  membershipType?: MembershipType;
  membershipStatus?: MembershipStatus;
  userStatus?: UserStatus;
  hospitalStatus?: HospitalStatus;
}): Promise<{ actor: ActorContext; userId: string }> {
  actorSequence += 1;
  const hospital = await prisma.hospital.findUniqueOrThrow({
    where: { id: input.hospitalId },
    select: { status: true },
  });
  const person = await prisma.person.create({
    data: { identityKeyHash: `assignment-hospital-${actorSequence}` },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: { personId: person.id, status: input.userStatus ?? UserStatus.ACTIVE },
    select: { id: true },
  });
  const membershipType = input.membershipType ?? MembershipType.OWNER;
  const membershipStatus = input.membershipStatus ?? MembershipStatus.ACTIVE;
  await prisma.userRole.create({ data: { userId: user.id, role: Role.HOSPITAL } });
  await prisma.hospitalMembership.create({
    data: {
      userId: user.id,
      hospitalId: input.hospitalId,
      membershipType,
      status: membershipStatus,
    },
  });

  return {
    userId: user.id,
    actor: {
      userId: user.id,
      personId: person.id,
      roles: [Role.HOSPITAL],
      hospitalMemberships: [
        {
          hospitalId: input.hospitalId,
          membershipType,
          profession: null,
          status: membershipStatus,
          hospitalStatus: input.hospitalStatus ?? hospital.status,
        },
      ],
      osmHospitalRelationships: [],
    },
  };
}

async function createOsmActor(input: {
  hospitalId: string;
  userStatus?: UserStatus;
  relationshipStatus?: MembershipStatus;
}): Promise<{ actor: ActorContext; userId: string }> {
  actorSequence += 1;
  const hospital = await prisma.hospital.findUniqueOrThrow({
    where: { id: input.hospitalId },
    select: { status: true },
  });
  const person = await prisma.person.create({
    data: { identityKeyHash: `assignment-osm-${actorSequence}` },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: { personId: person.id, status: input.userStatus ?? UserStatus.ACTIVE },
    select: { id: true },
  });
  const relationshipStatus = input.relationshipStatus ?? MembershipStatus.ACTIVE;
  await prisma.userRole.create({ data: { userId: user.id, role: Role.OSM } });
  await prisma.osmHospitalRelationship.create({
    data: {
      userId: user.id,
      hospitalId: input.hospitalId,
      status: relationshipStatus,
    },
  });

  return {
    userId: user.id,
    actor: {
      userId: user.id,
      personId: person.id,
      roles: [Role.OSM],
      hospitalMemberships: [],
      osmHospitalRelationships: [
        {
          hospitalId: input.hospitalId,
          status: relationshipStatus,
          hospitalStatus: hospital.status,
        },
      ],
    },
  };
}

async function createPlainUser(): Promise<string> {
  actorSequence += 1;
  const person = await prisma.person.create({
    data: { identityKeyHash: `assignment-plain-${actorSequence}` },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: { personId: person.id, status: UserStatus.ACTIVE },
    select: { id: true },
  });

  return user.id;
}

async function createPatient(
  actor: ActorContext,
  hospitalId: string,
  input: { identity: string; givenName: string; familyName: string; hospitalNumber?: string },
) {
  return provisionPatient(actor, {
    identity: { namespace: "integration-assignment", value: input.identity },
    targetHospitalId: hospitalId,
    givenName: input.givenName,
    familyName: input.familyName,
    hospitalNumber: input.hospitalNumber,
  });
}

describe("Phase 6B.2 Patient ↔ OSM assignment PostgreSQL workflow", () => {
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

  it("preserves assignment history across assign, repeat, reassign, and unassign", async () => {
    const hospital = await createHospital("ASSIGN-LIFECYCLE");
    const owner = await createHospitalActor({ hospitalId: hospital.id });
    const member = await createHospitalActor({
      hospitalId: hospital.id,
      membershipType: MembershipType.MEMBER,
    });
    const osmA = await createOsmActor({ hospitalId: hospital.id });
    const osmB = await createOsmActor({ hospitalId: hospital.id });
    const patient = await createPatient(owner.actor, hospital.id, {
      identity: "lifecycle-patient",
      givenName: "สมชาย",
      familyName: "มอบหมาย",
      hospitalNumber: "HN-LIFECYCLE",
    });

    await expect(
      assignOsmToPatient(owner.actor, {
        patientHospitalRelationshipId: patient.relationshipId,
        osmUserId: osmA.userId,
      }),
    ).resolves.toMatchObject({ operation: "ASSIGNED" });
    await expect(
      assignOsmToPatient(owner.actor, {
        patientHospitalRelationshipId: patient.relationshipId,
        osmUserId: osmA.userId,
      }),
    ).resolves.toMatchObject({ operation: "NOOP" });
    await expect(
      assignOsmToPatient(owner.actor, {
        patientHospitalRelationshipId: patient.relationshipId,
        osmUserId: osmB.userId,
      }),
    ).resolves.toMatchObject({ operation: "REASSIGNED" });
    await expect(
      unassignOsmFromPatient(owner.actor, {
        patientHospitalRelationshipId: patient.relationshipId,
      }),
    ).resolves.toMatchObject({ operation: "UNASSIGNED" });

    const history = await prisma.patientOsmAssignment.findMany({
      where: { patientHospitalRelationshipId: patient.relationshipId },
      orderBy: { createdAt: "asc" },
    });
    expect(history).toHaveLength(2);
    expect(history.filter((row) => row.endedAt === null)).toHaveLength(0);
    expect(history.map((row) => row.osmUserId)).toEqual([osmA.userId, osmB.userId]);

    const auditEvents = await prisma.auditEvent.findMany({
      where: {
        resourceType: "PatientOsmAssignment",
        actorUserId: owner.userId,
      },
      orderBy: { createdAt: "asc" },
    });
    expect(auditEvents.map((event) => event.action)).toEqual([
      "patient.osm_assigned",
      "patient.osm_reassigned",
      "patient.osm_unassigned",
    ]);
    expect(JSON.stringify(auditEvents)).not.toContain("HN-LIFECYCLE");
    expect(JSON.stringify(auditEvents)).not.toContain("สมชาย");

    await expect(
      assignOsmToPatient(member.actor, {
        patientHospitalRelationshipId: patient.relationshipId,
        osmUserId: osmA.userId,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("enforces same-Hospital OWNER authority and target OSM validation", async () => {
    const parent = await createHospital("ASSIGN-PARENT");
    const child = await createHospital("ASSIGN-CHILD", HospitalStatus.ACTIVE, parent.id);
    const unrelated = await createHospital("ASSIGN-OTHER");
    const parentOwner = await createHospitalActor({ hospitalId: parent.id });
    const childOwner = await createHospitalActor({ hospitalId: child.id });
    const childPatient = await createPatient(childOwner.actor, child.id, {
      identity: "child-patient",
      givenName: "ผู้ป่วย",
      familyName: "โรงพยาบาลลูก",
    });
    const parentPatient = await createPatient(parentOwner.actor, parent.id, {
      identity: "parent-patient",
      givenName: "ผู้ป่วย",
      familyName: "โรงพยาบาลแม่",
    });
    const unrelatedOsm = await createOsmActor({ hospitalId: unrelated.id });
    const inactiveOsm = await createOsmActor({
      hospitalId: parent.id,
      userStatus: UserStatus.SUSPENDED,
    });
    const relationshipSuspendedOsm = await createOsmActor({
      hospitalId: parent.id,
      relationshipStatus: MembershipStatus.SUSPENDED,
    });
    const plainUserId = await createPlainUser();
    const adminPerson = await prisma.person.create({
      data: { identityKeyHash: "assignment-admin" },
      select: { id: true },
    });
    const adminUser = await prisma.user.create({
      data: { personId: adminPerson.id, status: UserStatus.ACTIVE },
      select: { id: true },
    });
    await prisma.userRole.create({ data: { userId: adminUser.id, role: Role.ADMIN } });
    const admin: ActorContext = {
      userId: adminUser.id,
      personId: adminPerson.id,
      roles: [Role.ADMIN],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    };
    const inactiveOwner = await createHospitalActor({
      hospitalId: parent.id,
      membershipStatus: MembershipStatus.SUSPENDED,
    });
    const inactiveHospital = await createHospital("ASSIGN-SUSPENDED", HospitalStatus.SUSPENDED);
    const suspendedHospitalOwner = await createHospitalActor({
      hospitalId: inactiveHospital.id,
      hospitalStatus: HospitalStatus.SUSPENDED,
    });

    await expect(
      assignOsmToPatient(parentOwner.actor, {
        patientHospitalRelationshipId: childPatient.relationshipId,
        osmUserId: unrelatedOsm.userId,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      assignOsmToPatient(childOwner.actor, {
        patientHospitalRelationshipId: parentPatient.relationshipId,
        osmUserId: unrelatedOsm.userId,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      assignOsmToPatient(parentOwner.actor, {
        patientHospitalRelationshipId: parentPatient.relationshipId,
        osmUserId: unrelatedOsm.userId,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      assignOsmToPatient(parentOwner.actor, {
        patientHospitalRelationshipId: parentPatient.relationshipId,
        osmUserId: inactiveOsm.userId,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      assignOsmToPatient(parentOwner.actor, {
        patientHospitalRelationshipId: parentPatient.relationshipId,
        osmUserId: relationshipSuspendedOsm.userId,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      assignOsmToPatient(parentOwner.actor, {
        patientHospitalRelationshipId: parentPatient.relationshipId,
        osmUserId: plainUserId,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      assignOsmToPatient(admin, {
        patientHospitalRelationshipId: parentPatient.relationshipId,
        osmUserId: unrelatedOsm.userId,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      assignOsmToPatient(inactiveOwner.actor, {
        patientHospitalRelationshipId: parentPatient.relationshipId,
        osmUserId: unrelatedOsm.userId,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      assignOsmToPatient(suspendedHospitalOwner.actor, {
        patientHospitalRelationshipId: parentPatient.relationshipId,
        osmUserId: unrelatedOsm.userId,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      assignOsmToPatient(parentOwner.actor, {
        patientHospitalRelationshipId: parentPatient.relationshipId,
        osmUserId: parentOwner.userId,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("exposes OSM candidates only within the owner Hospital and keeps assignment optional", async () => {
    const hospital = await createHospital("ASSIGN-CANDIDATES");
    const otherHospital = await createHospital("ASSIGN-CANDIDATE-OTHER");
    const owner = await createHospitalActor({ hospitalId: hospital.id });
    const otherOwner = await createHospitalActor({ hospitalId: otherHospital.id });
    const candidate = await createOsmActor({ hospitalId: hospital.id });
    await createOsmActor({ hospitalId: otherHospital.id });
    const patient = await createPatient(owner.actor, hospital.id, {
      identity: "candidate-patient",
      givenName: "ผู้ป่วย",
      familyName: "ยังไม่มอบหมาย",
    });

    const candidates = await listPatientOsmCandidates(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
      value: "",
    });
    expect(candidates).toEqual([{ userId: candidate.userId, displayName: "ไม่ระบุชื่อ" }]);
    const view = await getPatientOsmAssignmentManagementView(owner.actor, patient.relationshipId);
    expect(view.currentAssignment).toBeNull();

    const otherPatient = await createPatient(otherOwner.actor, otherHospital.id, {
      identity: "candidate-other-patient",
      givenName: "ผู้ป่วย",
      familyName: "โรงพยาบาลอื่น",
    });
    await expect(
      listPatientOsmCandidates(owner.actor, {
        patientHospitalRelationshipId: otherPatient.relationshipId,
        value: "",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("allows OSM read only for active assignments and current OSM/Hospital state", async () => {
    const hospitalA = await createHospital("ASSIGN-READ-A");
    const hospitalB = await createHospital("ASSIGN-READ-B");
    const ownerA = await createHospitalActor({ hospitalId: hospitalA.id });
    const ownerB = await createHospitalActor({ hospitalId: hospitalB.id });
    const osmA = await createOsmActor({ hospitalId: hospitalA.id });
    const osmB = await createOsmActor({ hospitalId: hospitalB.id });
    const patientA = await createPatient(ownerA.actor, hospitalA.id, {
      identity: "same-human",
      givenName: "ผู้ป่วย",
      familyName: "โรงพยาบาลเอ",
      hospitalNumber: "HN-A",
    });
    const patientB = await createPatient(ownerB.actor, hospitalB.id, {
      identity: "same-human",
      givenName: "ผู้ป่วย",
      familyName: "โรงพยาบาลเอ",
      hospitalNumber: "HN-B",
    });
    const unassigned = await createPatient(ownerA.actor, hospitalA.id, {
      identity: "unassigned-human",
      givenName: "ผู้ป่วย",
      familyName: "ยังไม่มอบหมาย",
    });

    await assignOsmToPatient(ownerA.actor, {
      patientHospitalRelationshipId: patientA.relationshipId,
      osmUserId: osmA.userId,
    });

    const assigned = await findAssignedPatientDirectory(osmA.actor, {
      lookupType: "NAME",
      value: "",
      page: "1",
    });
    expect(assigned.items.map((item) => item.patientHospitalRelationshipId)).toEqual([
      patientA.relationshipId,
    ]);
    await expect(
      findAssignedPatientDirectory(osmB.actor, {
        lookupType: "NAME",
        value: "",
        page: "1",
      }),
    ).resolves.toMatchObject({ total: 0, items: [] });
    await expect(getPatientDirectoryDetail(osmA.actor, patientA.relationshipId)).resolves.toMatchObject({
      hospitalNumber: "HN-A",
    });
    await expect(getPatientDirectoryDetail(osmA.actor, patientB.relationshipId)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(getPatientDirectoryDetail(osmA.actor, unassigned.relationshipId)).rejects.toBeInstanceOf(
      NotFoundError,
    );

    await unassignOsmFromPatient(ownerA.actor, {
      patientHospitalRelationshipId: patientA.relationshipId,
    });
    await expect(findAssignedPatientDirectory(osmA.actor, {
      lookupType: "NAME",
      value: "",
      page: "1",
    })).resolves.toMatchObject({ total: 0, items: [] });

    await assignOsmToPatient(ownerA.actor, {
      patientHospitalRelationshipId: patientA.relationshipId,
      osmUserId: osmA.userId,
    });
    await prisma.user.update({ where: { id: osmA.userId }, data: { status: UserStatus.SUSPENDED } });
    await expect(findAssignedPatientDirectory(osmA.actor, {
      lookupType: "NAME",
      value: "",
      page: "1",
    })).resolves.toMatchObject({ total: 0, items: [] });

    await prisma.user.update({ where: { id: osmA.userId }, data: { status: UserStatus.ACTIVE } });
    await prisma.osmHospitalRelationship.updateMany({
      where: { userId: osmA.userId, hospitalId: hospitalA.id },
      data: { status: MembershipStatus.SUSPENDED },
    });
    await expect(findAssignedPatientDirectory(osmA.actor, {
      lookupType: "NAME",
      value: "",
      page: "1",
    })).resolves.toMatchObject({ total: 0, items: [] });
  });

  it("keeps one active assignment under concurrent assignment attempts", async () => {
    const hospital = await createHospital("ASSIGN-CONCURRENT");
    const owner = await createHospitalActor({ hospitalId: hospital.id });
    const osmA = await createOsmActor({ hospitalId: hospital.id });
    const osmB = await createOsmActor({ hospitalId: hospital.id });
    const patient = await createPatient(owner.actor, hospital.id, {
      identity: "concurrent-patient",
      givenName: "ผู้ป่วย",
      familyName: "พร้อมกัน",
    });

    const results = await Promise.allSettled([
      assignOsmToPatient(owner.actor, {
        patientHospitalRelationshipId: patient.relationshipId,
        osmUserId: osmA.userId,
      }),
      assignOsmToPatient(owner.actor, {
        patientHospitalRelationshipId: patient.relationshipId,
        osmUserId: osmB.userId,
      }),
    ]);

    expect(results.some((result) => result.status === "fulfilled")).toBe(true);
    expect(
      await prisma.patientOsmAssignment.count({
        where: { patientHospitalRelationshipId: patient.relationshipId, endedAt: null },
      }),
    ).toBe(1);
    await expect(
      prisma.patientOsmAssignment.create({
        data: {
          patientHospitalRelationshipId: patient.relationshipId,
          osmUserId: osmA.userId,
          assignedByUserId: owner.userId,
        },
      }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });
});
