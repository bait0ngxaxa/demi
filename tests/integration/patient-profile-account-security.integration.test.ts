import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Role,
  UserStatus,
} from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { getPatientDirectoryDetail } from "@/modules/patient-directory/services/patient-directory-query-service";
import { getOwnPatientHospitalProfile, updateOwnPatientHospitalProfile } from "@/modules/patient-hospital-profile/services/patient-hospital-profile-service";
import {
  ACCOUNT_RECOVERY_TTL_MS,
  completePatientAccountRecovery,
  getPatientAccountRecoveryAvailability,
  issuePatientAccountRecovery,
} from "@/modules/account-security/services/account-recovery-service";
import { ConflictError } from "@/shared/errors/application-error";

const prisma = getPrisma();
const legacyProfile = {
  gender: "ชาย",
  phoneNumber: "0812345678",
  addressText: "ที่อยู่เดิม",
  emergencyContactName: "ผู้ติดต่อเดิม",
  emergencyContactPhone: "0898765432",
  occupation: "อาชีพเดิม",
  educationLevel: "ระดับเดิม",
};

async function clearDatabase(): Promise<void> {
  await prisma.auditEvent.deleteMany();
  await prisma.accountRecovery.deleteMany();
  await prisma.patientHospitalProfile.deleteMany();
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

async function createHospital(name: string): Promise<{ id: string; name: string }> {
  const idSuffix = randomUUID();
  return prisma.hospital.create({
    data: {
      hospitalCode: `H-${idSuffix.slice(0, 12)}`,
      name,
      status: HospitalStatus.ACTIVE,
    },
    select: { id: true, name: true },
  });
}

async function createHospitalOwner(hospitalId: string): Promise<{
  actor: ActorContext;
  userId: string;
}> {
  const person = await prisma.person.create({
    data: { identityKeyHash: `integration-owner-${randomUUID()}` },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: { personId: person.id, status: UserStatus.ACTIVE, authSubject: randomUUID() },
    select: { id: true },
  });
  await prisma.userRole.create({ data: { userId: user.id, role: Role.HOSPITAL } });
  await prisma.hospitalMembership.create({
    data: {
      userId: user.id,
      hospitalId,
      membershipType: MembershipType.OWNER,
      status: MembershipStatus.ACTIVE,
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
          hospitalId,
          membershipType: MembershipType.OWNER,
          profession: null,
          status: MembershipStatus.ACTIVE,
          hospitalStatus: HospitalStatus.ACTIVE,
        },
      ],
      osmHospitalRelationships: [],
    },
  };
}

async function createPatient(hospitalIds: readonly string[]): Promise<{
  personId: string;
  userId: string;
  patientProfileId: string;
  relationshipIds: string[];
  actor: ActorContext;
}> {
  const person = await prisma.person.create({
    data: {
      identityKeyHash: `integration-patient-${randomUUID()}`,
      givenName: "สมชาย",
      familyName: "ใจดี",
    },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: { personId: person.id, status: UserStatus.ACTIVE, authSubject: randomUUID() },
    select: { id: true },
  });
  await prisma.userRole.create({ data: { userId: user.id, role: Role.PATIENT } });
  const patientProfile = await prisma.patientProfile.create({
    data: { personId: person.id, ...legacyProfile },
    select: { id: true },
  });
  const relationships = await Promise.all(
    hospitalIds.map((hospitalId, index) =>
      prisma.patientHospitalRelationship.create({
        data: {
          patientProfileId: patientProfile.id,
          hospitalId,
          hospitalNumber: `HN-${randomUUID().slice(0, 8)}-${index}`,
        },
        select: { id: true },
      }),
    ),
  );

  return {
    personId: person.id,
    userId: user.id,
    patientProfileId: patientProfile.id,
    relationshipIds: relationships.map(({ id }) => id),
    actor: {
      userId: user.id,
      personId: person.id,
      roles: [Role.PATIENT, Role.HOSPITAL],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    },
  };
}

async function createOsmActor(hospitalId: string): Promise<ActorContext> {
  const person = await prisma.person.create({
    data: { identityKeyHash: `integration-osm-${randomUUID()}` },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: { personId: person.id, status: UserStatus.ACTIVE, authSubject: randomUUID() },
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
      {
        hospitalId,
        status: MembershipStatus.ACTIVE,
        hospitalStatus: HospitalStatus.ACTIVE,
      },
    ],
  };
}

describe("Phase 17E.1 Patient profile and account security PostgreSQL workflows", () => {
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

  it("keeps profile values local to the exact Hospital, preserves fallback and rejects stale edits", async () => {
    const hospitalA = await createHospital("โรงพยาบาล เอ");
    const hospitalB = await createHospital("โรงพยาบาล บี");
    const ownerA = await createHospitalOwner(hospitalA.id);
    const ownerB = await createHospitalOwner(hospitalB.id);
    const patient = await createPatient([hospitalA.id, hospitalB.id]);
    const [relationshipA, relationshipB] = patient.relationshipIds;

    if (!relationshipA || !relationshipB) {
      throw new Error("Test Patient relationships were not created");
    }

    await expect(
      getOwnPatientHospitalProfile(patient.actor, relationshipA),
    ).resolves.toMatchObject({ source: "LEGACY_FALLBACK", version: 0, profile: legacyProfile });

    await expect(
      updateOwnPatientHospitalProfile(
        patient.actor,
        relationshipA,
        { expectedVersion: 0, gender: "หญิง", phoneNumber: "" },
        prisma,
      ),
    ).resolves.toEqual({ version: 1 });

    const profileA = await getOwnPatientHospitalProfile(patient.actor, relationshipA);
    const profileB = await getOwnPatientHospitalProfile(patient.actor, relationshipB);
    const legacyAfterEdit = await prisma.patientProfile.findUniqueOrThrow({
      where: { id: patient.patientProfileId },
    });
    const hospitalADetail = await getPatientDirectoryDetail(ownerA.actor, relationshipA);
    const hospitalBDetail = await getPatientDirectoryDetail(ownerB.actor, relationshipB);
    const osmActor = await createOsmActor(hospitalA.id);
    await prisma.patientOsmAssignment.create({
      data: {
        patientHospitalRelationshipId: relationshipA,
        osmUserId: osmActor.userId,
        assignedByUserId: ownerA.userId,
      },
    });
    const osmDetail = await getPatientDirectoryDetail(osmActor, relationshipA);

    expect(profileA).toMatchObject({
      source: "HOSPITAL_LOCAL",
      version: 1,
      profile: { gender: "หญิง", phoneNumber: null, addressText: legacyProfile.addressText },
    });
    expect(profileB).toMatchObject({
      source: "LEGACY_FALLBACK",
      version: 0,
      profile: legacyProfile,
    });
    expect(hospitalADetail).toMatchObject({
      profileSource: "HOSPITAL_LOCAL",
      profile: { gender: "หญิง", phoneNumber: null },
    });
    expect(hospitalBDetail).toMatchObject({
      profileSource: "LEGACY_FALLBACK",
      profile: { gender: "ชาย", phoneNumber: "0812345678" },
    });
    expect(osmDetail).toMatchObject({
      patientHospitalRelationshipId: relationshipA,
      profileSource: "HOSPITAL_LOCAL",
      profile: { phoneNumber: null, gender: "หญิง" },
    });
    expect(legacyAfterEdit).toMatchObject(legacyProfile);
    await expect(prisma.patientHospitalProfile.count()).resolves.toBe(1);

    const concurrent = await Promise.allSettled([
      updateOwnPatientHospitalProfile(
        patient.actor,
        relationshipA,
        { expectedVersion: 1, occupation: "ครู" },
        prisma,
      ),
      updateOwnPatientHospitalProfile(
        patient.actor,
        relationshipA,
        { expectedVersion: 1, educationLevel: "ปริญญาตรี" },
        prisma,
      ),
    ]);

    expect(concurrent.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(concurrent.filter(({ status }) => status === "rejected")).toHaveLength(1);
    const rejection = concurrent.find(({ status }) => status === "rejected");
    expect(rejection?.status === "rejected" ? rejection.reason : null).toBeInstanceOf(ConflictError);
  });

  it("issues, supersedes, claims, and completes one assisted recovery capability without changing domain data", async () => {
    const hospital = await createHospital("โรงพยาบาล กู้คืน");
    const owner = await createHospitalOwner(hospital.id);
    const patient = await createPatient([hospital.id]);
    const relationshipId = patient.relationshipIds[0];

    if (!relationshipId) {
      throw new Error("Test Patient relationship was not created");
    }

    const now = new Date();
    let tokenSequence = 0;
    const deliveredUrls: string[] = [];
    const delivery = {
      channel: "ASSISTED" as const,
      async deliver(url: string) {
        deliveredUrls.push(url);
        return { handoffUrl: url };
      },
    };
    const dependencies = {
      database: prisma,
      findPerson: async () => ({ id: patient.personId }),
      createToken: () => {
        tokenSequence += 1;
        return String(tokenSequence).padStart(43, "T");
      },
      now: () => now,
      delivery,
    };
    const issueInput = {
      nationalId: "1000000000009",
      nationalIdConfirmation: "1000000000009",
      identityVerified: true,
    };
    const personBefore = await prisma.person.findUniqueOrThrow({ where: { id: patient.personId } });
    const userBefore = await prisma.user.findUniqueOrThrow({ where: { id: patient.userId } });
    const patientProfileBefore = await prisma.patientProfile.findUniqueOrThrow({
      where: { id: patient.patientProfileId },
    });

    const first = await issuePatientAccountRecovery(owner.actor, relationshipId, issueInput, dependencies);
    const firstToken = first.handoffUrl?.split("#")[1];
    expect(first.expiresAt.getTime() - now.getTime()).toBe(ACCOUNT_RECOVERY_TTL_MS);
    expect(first.deliveryChannel).toBe("ASSISTED");
    expect(firstToken).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    const firstStored = await prisma.accountRecovery.findUniqueOrThrow({
      where: { id: first.recoveryId },
    });
    expect(firstStored.tokenHash).toBe(createHash("sha256").update(firstToken ?? "", "utf8").digest("hex"));
    expect(firstStored.tokenHash).not.toBe(firstToken);
    await expect(getPatientAccountRecoveryAvailability(firstToken, { database: prisma })).resolves.toEqual({
      expiresAt: first.expiresAt,
    });

    const second = await issuePatientAccountRecovery(owner.actor, relationshipId, issueInput, dependencies);
    const secondToken = second.handoffUrl?.split("#")[1];
    expect(secondToken).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    await expect(getPatientAccountRecoveryAvailability(firstToken, { database: prisma })).rejects.toBeInstanceOf(
      ConflictError,
    );
    await expect(getPatientAccountRecoveryAvailability(secondToken, { database: prisma })).resolves.toEqual({
      expiresAt: second.expiresAt,
    });
    expect(deliveredUrls).toEqual([`/recover#${firstToken}`, `/recover#${secondToken}`]);

    const replacePasswordAndRevokeSessions = vi.fn().mockResolvedValue(undefined);
    const newPassword = "integration-new-password-long";
    await completePatientAccountRecovery(
      { token: secondToken, newPassword, passwordConfirmation: newPassword },
      { database: prisma, replacePasswordAndRevokeSessions },
    );
    expect(replacePasswordAndRevokeSessions).toHaveBeenCalledWith({
      userId: patient.userId,
      authSubject: userBefore.authSubject,
      newPassword,
    });
    await expect(getPatientAccountRecoveryAvailability(secondToken, { database: prisma })).rejects.toBeInstanceOf(
      ConflictError,
    );
    await expect(prisma.accountRecovery.count({ where: { targetUserId: patient.userId } })).resolves.toBe(2);
    await expect(prisma.accountRecovery.count({
      where: { targetUserId: patient.userId, completedAt: null, revokedAt: null },
    })).resolves.toBe(0);

    expect(await prisma.person.findUniqueOrThrow({ where: { id: patient.personId } })).toEqual(personBefore);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: patient.userId } })).toEqual(userBefore);
    expect(await prisma.patientProfile.findUniqueOrThrow({ where: { id: patient.patientProfileId } })).toEqual(
      patientProfileBefore,
    );
    expect(await prisma.patientHospitalProfile.count()).toBe(0);
    expect(await prisma.patientHospitalRelationship.count()).toBe(1);
  });
});
