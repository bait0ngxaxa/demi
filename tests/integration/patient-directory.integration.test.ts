import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Profession,
  Role,
  UserStatus,
} from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { findPatientDirectory, getPatientDirectoryDetail, listPatientDirectoryScopes } from "@/modules/patient-directory/services/patient-directory-query-service";
import { provisionPatient } from "@/modules/patient-provisioning/services/patient-provisioning-service";
import { ForbiddenError, NotFoundError } from "@/shared/errors/application-error";

const prisma = getPrisma();
let actorSequence = 0;
let patientSequence = 0;

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
  profession?: Profession | null;
}): Promise<{ actor: ActorContext; userId: string }> {
  actorSequence += 1;
  const membershipStatus = input.membershipStatus ?? MembershipStatus.ACTIVE;
  const hospital = await prisma.hospital.findUniqueOrThrow({
    where: { id: input.hospitalId },
    select: { status: true },
  });
  const person = await prisma.person.create({
    data: { identityKeyHash: `directory-actor-${actorSequence}` },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: {
      personId: person.id,
      status: input.userStatus ?? UserStatus.ACTIVE,
    },
    select: { id: true },
  });
  await prisma.userRole.create({ data: { userId: user.id, role: Role.HOSPITAL } });
  await prisma.hospitalMembership.create({
    data: {
      userId: user.id,
      hospitalId: input.hospitalId,
      membershipType: input.membershipType ?? MembershipType.MEMBER,
      profession: input.profession ?? null,
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
          membershipType: input.membershipType ?? MembershipType.MEMBER,
          profession: input.profession ?? null,
          status: membershipStatus,
          hospitalStatus: input.hospitalStatus ?? hospital.status,
        },
      ],
      osmHospitalRelationships: [],
    },
  };
}

async function createOsmActor(hospitalId: string): Promise<ActorContext> {
  actorSequence += 1;
  const hospital = await prisma.hospital.findUniqueOrThrow({
    where: { id: hospitalId },
    select: { status: true },
  });
  const person = await prisma.person.create({
    data: { identityKeyHash: `directory-osm-${actorSequence}` },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: { personId: person.id, status: UserStatus.ACTIVE },
    select: { id: true },
  });
  await prisma.userRole.create({ data: { userId: user.id, role: Role.OSM } });
  await prisma.osmHospitalRelationship.create({
    data: { userId: user.id, hospitalId, status: MembershipStatus.ACTIVE },
  });

  return {
    userId: user.id,
    personId: person.id,
    roles: [Role.OSM],
    hospitalMemberships: [],
    osmHospitalRelationships: [
      { hospitalId, status: MembershipStatus.ACTIVE, hospitalStatus: hospital.status },
    ],
  };
}

async function createStandaloneAdmin(): Promise<ActorContext> {
  actorSequence += 1;
  const person = await prisma.person.create({
    data: { identityKeyHash: `directory-admin-${actorSequence}` },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: { personId: person.id, status: UserStatus.ACTIVE },
    select: { id: true },
  });
  await prisma.userRole.create({ data: { userId: user.id, role: Role.ADMIN } });

  return {
    userId: user.id,
    personId: person.id,
    roles: [Role.ADMIN],
    hospitalMemberships: [],
    osmHospitalRelationships: [],
  };
}

async function createPatient(
  actor: ActorContext,
  hospitalId: string,
  input: { givenName: string; familyName: string; hospitalNumber?: string },
) {
  patientSequence += 1;
  return provisionPatient(actor, {
    identity: { namespace: "integration-directory", value: `patient-${patientSequence}` },
    targetHospitalId: hospitalId,
    givenName: input.givenName,
    familyName: input.familyName,
    hospitalNumber: input.hospitalNumber,
  });
}

describe("Phase 6B.1 Patient directory PostgreSQL workflow", () => {
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

  it("allows OWNER and MEMBER reads with bounded search, local HN lookup, pagination, and minimal projection", async () => {
    const hospital = await createHospital("DIRECTORY-READ");
    const owner = await createHospitalActor({
      hospitalId: hospital.id,
      membershipType: MembershipType.OWNER,
    });
    const member = await createHospitalActor({
      hospitalId: hospital.id,
      membershipType: MembershipType.MEMBER,
      profession: Profession.NURSE,
    });

    for (let index = 0; index < 27; index += 1) {
      await createPatient(owner.actor, hospital.id, {
        givenName: `Patient ${String(index).padStart(2, "0")}`,
        familyName: "Directory",
        hospitalNumber: index < 2 ? "HN-SAME" : `HN-${String(index).padStart(3, "0")}`,
      });
    }

    const firstPatient = await prisma.patientHospitalRelationship.findFirstOrThrow({
      where: { hospitalId: hospital.id, hospitalNumber: "HN-SAME" },
      orderBy: { id: "asc" },
      select: { patientProfileId: true, id: true },
    });
    const dateOfBirth = new Date("1977-01-01T00:00:00.000Z");
    await prisma.patientProfile.update({
      where: { id: firstPatient.patientProfileId },
      data: {
        dateOfBirth,
        gender: "ชาย",
        phoneNumber: "0812345678",
        addressText: "99 ถนนตัวอย่าง",
        emergencyContactName: "สมหญิง ผู้ติดต่อ",
        emergencyContactPhone: "0898765432",
        occupation: "เกษตรกร",
        educationLevel: "มัธยมศึกษา",
      },
    });

    const firstPage = await findPatientDirectory(owner.actor, {
      targetHospitalId: hospital.id,
      lookupType: "NAME",
      value: "",
      page: "1",
    });
    const secondPage = await findPatientDirectory(owner.actor, {
      targetHospitalId: hospital.id,
      lookupType: "NAME",
      value: "",
      page: "2",
    });
    const memberPage = await findPatientDirectory(member.actor, {
      targetHospitalId: hospital.id,
      lookupType: "NAME",
      value: "Patient 01",
      page: "1",
    });
    const nameSearch = await findPatientDirectory(owner.actor, {
      targetHospitalId: hospital.id,
      lookupType: "NAME",
      value: "Patient 02",
      page: "1",
    });
    const hnLookup = await findPatientDirectory(owner.actor, {
      targetHospitalId: hospital.id,
      lookupType: "HOSPITAL_NUMBER",
      value: "HN-SAME",
      page: "1",
    });
    const emptyResult = await findPatientDirectory(owner.actor, {
      targetHospitalId: hospital.id,
      lookupType: "NAME",
      value: "ไม่มีชื่อนี้",
      page: "1",
    });

    expect(firstPage).toMatchObject({
      page: 1,
      pageSize: 25,
      total: 27,
      totalPages: 2,
      hasPreviousPage: false,
      hasNextPage: true,
    });
    expect(secondPage).toMatchObject({
      page: 2,
      items: expect.any(Array),
      hasPreviousPage: true,
      hasNextPage: false,
    });
    expect(firstPage.items).toHaveLength(25);
    expect(secondPage.items).toHaveLength(2);
    expect(firstPage.items[0]?.displayName).toBe("Patient 00 Directory");
    expect(firstPage.items[24]?.displayName).toBe("Patient 24 Directory");
    expect(secondPage.items[0]?.displayName).toBe("Patient 25 Directory");
    expect(memberPage.items).toHaveLength(1);
    expect(nameSearch.items).toHaveLength(1);
    expect(nameSearch.items[0]?.displayName).toBe("Patient 02 Directory");
    expect(hnLookup.items).toHaveLength(2);
    expect(hnLookup.items.every((item) => item.hospitalNumber === "HN-SAME")).toBe(true);
    expect(emptyResult.items).toEqual([]);

    const item = firstPage.items[0];
    expect(item).toBeDefined();
    expect(Object.keys(item ?? {}).sort()).toEqual([
      "displayName",
      "hospital",
      "hospitalNumber",
      "patientHospitalRelationshipId",
      "patientProfileId",
    ]);
    expect(JSON.stringify(firstPage)).not.toContain("identityKeyHash");
    expect(JSON.stringify(firstPage)).not.toContain("authSubject");
    expect(JSON.stringify(firstPage)).not.toContain("activation");
    expect(JSON.stringify(firstPage)).not.toContain("clinical");

    const detail = await getPatientDirectoryDetail(member.actor, firstPatient.id);
    expect(detail.profile).toEqual({
      dateOfBirth,
      gender: "ชาย",
      phoneNumber: "0812345678",
      addressText: "99 ถนนตัวอย่าง",
      emergencyContactName: "สมหญิง ผู้ติดต่อ",
      emergencyContactPhone: "0898765432",
      occupation: "เกษตรกร",
      educationLevel: "มัธยมศึกษา",
    });
  });

  it("keeps Patient reads inside the direct Hospital boundary and denies hierarchy, OSM, and ADMIN access", async () => {
    const parent = await createHospital("DIRECTORY-PARENT");
    const child = await createHospital("DIRECTORY-CHILD", HospitalStatus.ACTIVE, parent.id);
    const sibling = await createHospital("DIRECTORY-SIBLING", HospitalStatus.ACTIVE, parent.id);
    const unrelated = await createHospital("DIRECTORY-UNRELATED");
    const parentActor = await createHospitalActor({ hospitalId: parent.id });
    const childActor = await createHospitalActor({ hospitalId: child.id });
    const siblingActor = await createHospitalActor({ hospitalId: sibling.id });
    const unrelatedActor = await createHospitalActor({ hospitalId: unrelated.id });
    const childPatient = await createPatient(childActor.actor, child.id, {
      givenName: "ผู้ป่วย",
      familyName: "โรงพยาบาลลูก",
      hospitalNumber: "HN-CHILD",
    });
    const parentPatient = await createPatient(parentActor.actor, parent.id, {
      givenName: "ผู้ป่วย",
      familyName: "โรงพยาบาลแม่",
      hospitalNumber: "HN-PARENT",
    });
    const siblingPatient = await createPatient(siblingActor.actor, sibling.id, {
      givenName: "ผู้ป่วย",
      familyName: "โรงพยาบาลพี่น้อง",
      hospitalNumber: "HN-SIBLING",
    });
    await prisma.userRole.create({ data: { userId: parentActor.userId, role: Role.ADMIN } });
    const multiRoleParentActor: ActorContext = {
      ...parentActor.actor,
      roles: [Role.HOSPITAL, Role.ADMIN],
    };
    const osm = await createOsmActor(parent.id);
    const admin = await createStandaloneAdmin();

    await expect(
      findPatientDirectory(parentActor.actor, {
        targetHospitalId: child.id,
        lookupType: "NAME",
        value: "",
        page: "1",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      findPatientDirectory(childActor.actor, {
        targetHospitalId: parent.id,
        lookupType: "NAME",
        value: "",
        page: "1",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      findPatientDirectory(unrelatedActor.actor, {
        targetHospitalId: sibling.id,
        lookupType: "NAME",
        value: "",
        page: "1",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listPatientDirectoryScopes(osm)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listPatientDirectoryScopes(admin)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getPatientDirectoryDetail(parentActor.actor, childPatient.relationshipId)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(getPatientDirectoryDetail(childActor.actor, parentPatient.relationshipId)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(getPatientDirectoryDetail(siblingActor.actor, childPatient.relationshipId)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(getPatientDirectoryDetail(childActor.actor, siblingPatient.relationshipId)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(getPatientDirectoryDetail(admin, parentPatient.relationshipId)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(getPatientDirectoryDetail(multiRoleParentActor, parentPatient.relationshipId)).resolves.toMatchObject({
      patientHospitalRelationshipId: parentPatient.relationshipId,
    });
  });

  it("fails closed for inactive membership, inactive Hospital, forged Hospital context, and inaccessible detail IDs", async () => {
    const activeHospital = await createHospital("DIRECTORY-ACTIVE");
    const inactiveHospital = await createHospital("DIRECTORY-SUSPENDED", HospitalStatus.SUSPENDED);
    const activeActor = await createHospitalActor({ hospitalId: activeHospital.id });
    const inactiveMembershipActor = await createHospitalActor({
      hospitalId: activeHospital.id,
      membershipStatus: MembershipStatus.SUSPENDED,
    });
    const inactiveHospitalActor = await createHospitalActor({
      hospitalId: inactiveHospital.id,
      hospitalStatus: HospitalStatus.SUSPENDED,
    });
    const patient = await createPatient(activeActor.actor, activeHospital.id, {
      givenName: "ผู้ป่วย",
      familyName: "ทดสอบสิทธิ์",
      hospitalNumber: "HN-ACTIVE",
    });

    await expect(
      findPatientDirectory(inactiveMembershipActor.actor, {
        targetHospitalId: activeHospital.id,
        lookupType: "NAME",
        value: "",
        page: "1",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      findPatientDirectory(inactiveHospitalActor.actor, {
        targetHospitalId: inactiveHospital.id,
        lookupType: "NAME",
        value: "",
        page: "1",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      findPatientDirectory(activeActor.actor, {
        targetHospitalId: inactiveHospital.id,
        lookupType: "NAME",
        value: "",
        page: "1",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getPatientDirectoryDetail(activeActor.actor, patient.relationshipId)).resolves.toMatchObject({
      patientHospitalRelationshipId: patient.relationshipId,
      hospitalNumber: "HN-ACTIVE",
    });
    await expect(
      getPatientDirectoryDetail(activeActor.actor, "99999999-9999-4999-8999-999999999999"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
