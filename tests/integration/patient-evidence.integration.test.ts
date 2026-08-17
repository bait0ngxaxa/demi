import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Role,
  UserStatus,
} from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { assignOsmToPatient } from "@/modules/patient-assignment/services/patient-osm-assignment-service";
import { getPatientEvidenceArtifactAccess, listPatientEvidenceArtifacts } from "@/modules/patient-evidence/services/patient-evidence-query-service";
import { createPatientEvidenceArtifact } from "@/modules/patient-evidence/services/patient-evidence-service";
import type { PatientEvidenceStorage } from "@/modules/patient-evidence/storage/patient-evidence-storage";
import { ForbiddenError, NotFoundError } from "@/shared/errors/application-error";
import { provisionPatient } from "@/modules/patient-provisioning/services/patient-provisioning-service";

const prisma = getPrisma();
let sequence = 0;

async function clearDatabase(): Promise<void> {
  await prisma.patientEvidenceArtifact.deleteMany();
  await prisma.patientFollowupActivityProgress.deleteMany();
  await prisma.patientFollowup.deleteMany();
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

async function createHospital(code: string): Promise<{ id: string }> {
  sequence += 1;
  return prisma.hospital.create({
    data: {
      hospitalCode: `EVIDENCE-${code}-${sequence}`,
      name: `โรงพยาบาล Evidence ${code}`,
      status: HospitalStatus.ACTIVE,
    },
    select: { id: true },
  });
}

async function createHospitalActor(input: {
  hospitalId: string;
  membershipType?: MembershipType;
}): Promise<{ actor: ActorContext; userId: string }> {
  sequence += 1;
  const person = await prisma.person.create({
    data: { identityKeyHash: `evidence-hospital-${sequence}` },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: { personId: person.id, status: UserStatus.ACTIVE },
    select: { id: true },
  });
  const membershipType = input.membershipType ?? MembershipType.MEMBER;
  await prisma.userRole.create({ data: { userId: user.id, role: Role.HOSPITAL } });
  await prisma.hospitalMembership.create({
    data: {
      userId: user.id,
      hospitalId: input.hospitalId,
      membershipType,
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
          hospitalId: input.hospitalId,
          membershipType,
          profession: null,
          status: MembershipStatus.ACTIVE,
          hospitalStatus: HospitalStatus.ACTIVE,
        },
      ],
      osmHospitalRelationships: [],
    },
  };
}

async function addAdminRole(actor: { actor: ActorContext; userId: string }): Promise<void> {
  await prisma.userRole.create({ data: { userId: actor.userId, role: Role.ADMIN } });
  actor.actor.roles = [Role.ADMIN, Role.HOSPITAL];
}

async function createOsmActor(hospitalId: string): Promise<{ actor: ActorContext; userId: string }> {
  sequence += 1;
  const person = await prisma.person.create({
    data: { identityKeyHash: `evidence-osm-${sequence}` },
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
    actor: {
      userId: user.id,
      personId: person.id,
      roles: [Role.OSM],
      hospitalMemberships: [],
      osmHospitalRelationships: [
        { hospitalId, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE },
      ],
    },
  };
}

async function createAdminActor(): Promise<ActorContext> {
  sequence += 1;
  const person = await prisma.person.create({
    data: { identityKeyHash: `evidence-admin-${sequence}` },
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

function createFakeStorage(): PatientEvidenceStorage & { keys: Set<string> } {
  const keys = new Set<string>();

  return {
    keys,
    uploadObject: async ({ objectKey }) => {
      keys.add(objectKey);
    },
    createTemporaryAccessUrl: async ({ objectKey }) => `https://fake-storage.invalid/${objectKey}`,
    removeObject: async ({ objectKey }) => {
      keys.delete(objectKey);
    },
  };
}

function jpegBytes(): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0x00]);
}

describe("Phase 10D.0 Patient Evidence PostgreSQL workflow", () => {
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

  it("creates relationship evidence through fake storage without cross-domain mutations", async () => {
    const hospital = await createHospital("DIRECT");
    const owner = await createHospitalActor({
      hospitalId: hospital.id,
      membershipType: MembershipType.OWNER,
    });
    const patient = await provisionPatient(owner.actor, {
      identity: { namespace: "evidence-integration", value: "direct-patient" },
      targetHospitalId: hospital.id,
      givenName: "สมชาย",
      familyName: "หลักฐาน",
      hospitalNumber: "HN-EVIDENCE-001",
    });
    const beforeCounts = {
      baselines: await prisma.patientBaseline.count(),
      followups: await prisma.patientFollowup.count(),
      screenings: await prisma.screeningAssessment.count(),
      goals: await prisma.patientGoalPlan.count(),
      appointments: await prisma.patientAppointment.count(),
    };
    const storage = createFakeStorage();
    const artifactId = "11111111-1111-4111-8111-111111111111";

    const created = await createPatientEvidenceArtifact(
      owner.actor,
      {
        relationshipId: patient.relationshipId,
        declaredMediaType: "image/jpeg",
        bytes: jpegBytes(),
        caption: "  รูปสถานะภาคสนาม  ",
      },
      {
        artifactIdFactory: () => artifactId,
        database: prisma,
        storage,
      },
    );
    const listed = await listPatientEvidenceArtifacts(owner.actor, patient.relationshipId, {
      database: prisma,
    });
    const access = await getPatientEvidenceArtifactAccess(
      owner.actor,
      patient.relationshipId,
      artifactId,
      { database: prisma, storage },
    );
    const row = await prisma.patientEvidenceArtifact.findUnique({ where: { id: artifactId } });
    const audit = await prisma.auditEvent.findFirst({
      where: { action: "patient_evidence_artifact.created", resourceId: artifactId },
    });

    expect(created.artifactId).toBe(artifactId);
    expect(listed[0]).toMatchObject({
      id: artifactId,
      patientHospitalRelationshipId: patient.relationshipId,
      caption: "รูปสถานะภาคสนาม",
      creator: { id: owner.userId },
    });
    expect(access.temporaryAccessUrl).toContain(artifactId);
    expect(row).toMatchObject({
      storageObjectKey: `relationship-evidence/${artifactId}`,
      mediaType: "image/jpeg",
      byteSize: 4,
      createdByUserId: owner.userId,
    });
    expect(JSON.stringify(audit?.metadata)).not.toContain("รูปสถานะภาคสนาม");
    expect(storage.keys.has(`relationship-evidence/${artifactId}`)).toBe(true);
    expect(await prisma.patientBaseline.count()).toBe(beforeCounts.baselines);
    expect(await prisma.patientFollowup.count()).toBe(beforeCounts.followups);
    expect(await prisma.screeningAssessment.count()).toBe(beforeCounts.screenings);
    expect(await prisma.patientGoalPlan.count()).toBe(beforeCounts.goals);
    expect(await prisma.patientAppointment.count()).toBe(beforeCounts.appointments);
  });

  it("allows exact OSM and valid multi-role paths while preserving anti-enumeration", async () => {
    const hospital = await createHospital("SCOPE");
    const otherHospital = await createHospital("OTHER");
    const owner = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.OWNER });
    const otherOwner = await createHospitalActor({
      hospitalId: otherHospital.id,
      membershipType: MembershipType.OWNER,
    });
    const osm = await createOsmActor(hospital.id);
    const unassignedOsm = await createOsmActor(hospital.id);
    const multiRole = await createHospitalActor({ hospitalId: hospital.id });
    await addAdminRole(multiRole);
    const admin = await createAdminActor();
    const patient = await provisionPatient(owner.actor, {
      identity: { namespace: "evidence-integration", value: "scope-patient" },
      targetHospitalId: hospital.id,
      givenName: "สมหญิง",
      familyName: "ขอบเขต",
    });
    const otherPatient = await provisionPatient(owner.actor, {
      identity: { namespace: "evidence-integration", value: "other-scope-patient" },
      targetHospitalId: hospital.id,
      givenName: "สมปอง",
      familyName: "อีกความสัมพันธ์",
    });
    await assignOsmToPatient(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
      osmUserId: osm.userId,
    });
    const storage = createFakeStorage();

    await expect(
      createPatientEvidenceArtifact(
        unassignedOsm.actor,
        { relationshipId: patient.relationshipId, declaredMediaType: "image/jpeg", bytes: jpegBytes() },
        { database: prisma, storage },
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      createPatientEvidenceArtifact(
        otherOwner.actor,
        { relationshipId: patient.relationshipId, declaredMediaType: "image/jpeg", bytes: jpegBytes() },
        { database: prisma, storage },
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      createPatientEvidenceArtifact(
        owner.actor,
        {
          relationshipId: "99999999-9999-4999-8999-999999999999",
          declaredMediaType: "image/jpeg",
          bytes: jpegBytes(),
        },
        { database: prisma, storage },
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      createPatientEvidenceArtifact(
        admin,
        { relationshipId: patient.relationshipId, declaredMediaType: "image/jpeg", bytes: jpegBytes() },
        { database: prisma, storage },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const osmArtifact = await createPatientEvidenceArtifact(
      osm.actor,
      { relationshipId: patient.relationshipId, declaredMediaType: "image/jpeg", bytes: jpegBytes() },
      { artifactIdFactory: () => "22222222-2222-4222-8222-222222222222", database: prisma, storage },
    );
    const multiRoleArtifact = await createPatientEvidenceArtifact(
      multiRole.actor,
      { relationshipId: patient.relationshipId, declaredMediaType: "image/jpeg", bytes: jpegBytes() },
      { artifactIdFactory: () => "33333333-3333-4333-8333-333333333333", database: prisma, storage },
    );

    expect(osmArtifact.patientHospitalRelationshipId).toBe(patient.relationshipId);
    expect(multiRoleArtifact.patientHospitalRelationshipId).toBe(patient.relationshipId);
    await expect(
      getPatientEvidenceArtifactAccess(
        owner.actor,
        otherPatient.relationshipId,
        osmArtifact.artifactId,
        { database: prisma, storage },
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
