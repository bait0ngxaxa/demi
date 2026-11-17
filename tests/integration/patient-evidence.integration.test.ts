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
import {
  createPatientEvidenceArtifact,
  removePatientEvidenceArtifact,
} from "@/modules/patient-evidence/services/patient-evidence-service";
import type { PatientEvidenceStorage } from "@/modules/patient-evidence/storage/patient-evidence-storage";
import { ConflictError, ForbiddenError, NotFoundError } from "@/shared/errors/application-error";
import { provisionPatientFixture as provisionPatient } from "./support/patient-provisioning";

const prisma = getPrisma();
let sequence = 0;

async function clearDatabase(): Promise<void> {
  await prisma.patientProgramServiceOneArtifactAssociation.deleteMany();
  await prisma.patientEvidenceArtifact.deleteMany();
  await prisma.patientFollowupActivityProgress.deleteMany();
  // Adjusted Goal Plans reference Follow-ups that may reference Goal Plans; clear the link first.
  await prisma.patientGoalPlan.updateMany({ where: { sourceFollowupId: { not: null } }, data: { sourceFollowupId: null } });
  await prisma.patientFollowup.deleteMany();
  await prisma.patientAppointmentAssigneeAcceptance.deleteMany();
  await prisma.patientAppointment.deleteMany();
  await prisma.patientGoalItem.deleteMany();
  await prisma.patientGoalPlan.deleteMany();
  await prisma.screeningAssessment.deleteMany();
  await prisma.auditEvent.deleteMany();
  await prisma.patientOsmAssignment.deleteMany();
  await prisma.patientActivation.deleteMany();
  await prisma.patientHospitalHealthHistory.deleteMany();
  await prisma.patientHospitalRelationship.deleteMany();
  await prisma.patientProfile.deleteMany();
  await prisma.workforceActivation.deleteMany();
  await prisma.osmHospitalRelationship.deleteMany();
  await prisma.hospitalOnboardingApplication.deleteMany();
  await prisma.hospitalMembership.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.$transaction([
    prisma.$executeRaw`SELECT set_config('demi.service_area_purge', 'demo-reset', true)`,
    prisma.hospitalServiceArea.deleteMany(),
  ]);
  await prisma.hospitalServiceAreaEligibility.deleteMany();
  await prisma.user.deleteMany();
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
  const membershipType = input.membershipType ?? MembershipType.OWNER;
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

  it("N4: removes evidence by the uploader/Hospital rule and hides it from every read path", async () => {
    const hospital = await createHospital("REMOVE");
    const otherHospital = await createHospital("REMOVE-OTHER");
    const owner = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.OWNER });
    const member = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.MEMBER });
    const otherOwner = await createHospitalActor({ hospitalId: otherHospital.id, membershipType: MembershipType.OWNER });
    const osm = await createOsmActor(hospital.id);
    const patient = await provisionPatient(owner.actor, {
      identity: { namespace: "evidence-integration", value: "remove-patient" },
      targetHospitalId: hospital.id,
      givenName: "สมศรี",
      familyName: "ลบรูป",
    });
    await assignOsmToPatient(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
      osmUserId: osm.userId,
    });
    const storage = createFakeStorage();
    const upload = (actor: ActorContext, artifactId: string) =>
      createPatientEvidenceArtifact(
        actor,
        { relationshipId: patient.relationshipId, declaredMediaType: "image/jpeg", bytes: jpegBytes() },
        { artifactIdFactory: () => artifactId, database: prisma, storage },
      );
    const remove = (actor: ActorContext, artifactId: string, reason = "อัปโหลดผิดผู้ป่วย") =>
      removePatientEvidenceArtifact(
        actor,
        { artifactId, relationshipId: patient.relationshipId, reason },
        { database: prisma, storage },
      );
    const osmUpload = "44444444-4444-4444-8444-444444444444";
    const ownerUpload = "55555555-5555-4555-8555-555555555555";
    const keptUpload = "66666666-6666-4666-8666-666666666666";
    await upload(osm.actor, osmUpload);
    await upload(owner.actor, ownerUpload);
    await upload(owner.actor, keptUpload);

    // An อสม. may remove only their own uploads; another Hospital cannot see the relationship at all.
    await expect(remove(osm.actor, ownerUpload)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(remove(otherOwner.actor, keptUpload)).rejects.toBeInstanceOf(NotFoundError);
    await expect(remove(owner.actor, "99999999-9999-4999-8999-999999999999")).rejects.toBeInstanceOf(NotFoundError);

    await expect(remove(osm.actor, osmUpload, "  ถ่ายผิดคน  ")).resolves.toMatchObject({
      artifactId: osmUpload,
      patientHospitalRelationshipId: patient.relationshipId,
      hospitalId: hospital.id,
    });
    // A direct MEMBER may remove another user's upload.
    await expect(remove(member.actor, ownerUpload)).resolves.toMatchObject({ artifactId: ownerUpload });
    await expect(remove(owner.actor, osmUpload)).rejects.toBeInstanceOf(ConflictError);

    const removedRow = await prisma.patientEvidenceArtifact.findUnique({ where: { id: osmUpload } });
    expect(removedRow).toMatchObject({
      createdByUserId: osm.userId,
      removedByUserId: osm.userId,
      removalReason: "ถ่ายผิดคน",
    });
    expect(removedRow?.removedAt).toBeInstanceOf(Date);
    expect(await prisma.patientEvidenceArtifact.count({ where: { patientHospitalRelationshipId: patient.relationshipId } })).toBe(3);

    const audits = await prisma.auditEvent.findMany({ where: { action: "patient_evidence_artifact.removed" } });
    expect(audits.map(({ resourceId }) => resourceId).sort()).toEqual([osmUpload, ownerUpload].sort());
    expect(audits.find(({ resourceId }) => resourceId === osmUpload)).toMatchObject({
      actorUserId: osm.userId,
      metadata: { artifactId: osmUpload, patientHospitalRelationshipId: patient.relationshipId, hospitalId: hospital.id },
    });
    expect(JSON.stringify(audits.map(({ metadata }) => metadata))).not.toContain("ถ่ายผิดคน");

    expect(storage.keys.has(`relationship-evidence/${osmUpload}`)).toBe(false);
    expect(storage.keys.has(`relationship-evidence/${ownerUpload}`)).toBe(false);
    expect(storage.keys.has(`relationship-evidence/${keptUpload}`)).toBe(true);

    const listed = await listPatientEvidenceArtifacts(owner.actor, patient.relationshipId, { database: prisma });
    expect(listed.map(({ id }) => id)).toEqual([keptUpload]);
    for (const removedId of [osmUpload, ownerUpload]) {
      await expect(
        getPatientEvidenceArtifactAccess(owner.actor, patient.relationshipId, removedId, { database: prisma, storage }),
      ).rejects.toBeInstanceOf(NotFoundError);
    }
    await expect(
      getPatientEvidenceArtifactAccess(owner.actor, patient.relationshipId, keptUpload, { database: prisma, storage }),
    ).resolves.toMatchObject({ artifactId: keptUpload });
  });

  it("N4: still answers success when storage deletion fails after commit, leaving the row removed", async () => {
    const hospital = await createHospital("REMOVE-STORAGE");
    const owner = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.OWNER });
    const patient = await provisionPatient(owner.actor, {
      identity: { namespace: "evidence-integration", value: "remove-storage-patient" },
      givenName: "สมพร",
      familyName: "หลักฐาน",
      targetHospitalId: hospital.id,
    });
    const storage = createFakeStorage();
    const artifactId = "77777777-7777-4777-8777-777777777777";
    await createPatientEvidenceArtifact(
      owner.actor,
      { relationshipId: patient.relationshipId, declaredMediaType: "image/jpeg", bytes: jpegBytes() },
      { artifactIdFactory: () => artifactId, database: prisma, storage },
    );
    const failingStorage: PatientEvidenceStorage = {
      ...storage,
      removeObject: async () => {
        throw new Error("storage unavailable");
      },
    };
    const logged: unknown[] = [];

    await expect(
      removePatientEvidenceArtifact(
        owner.actor,
        { artifactId, relationshipId: patient.relationshipId, reason: "ซ้ำ" },
        { database: prisma, storage: failingStorage, logOperationalError: (entry) => logged.push(entry) },
      ),
    ).resolves.toMatchObject({ artifactId });

    expect(logged).toEqual([{ category: "storage_removal_failed", artifactId }]);
    expect((await prisma.patientEvidenceArtifact.findUnique({ where: { id: artifactId } }))?.removedAt).toBeInstanceOf(Date);
    // The leftover object (ADR-0034) is unreachable: the content path answers NotFound.
    expect(storage.keys.has(`relationship-evidence/${artifactId}`)).toBe(true);
    await expect(
      getPatientEvidenceArtifactAccess(owner.actor, patient.relationshipId, artifactId, { database: prisma, storage }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("N4: an ended care relationship follows the upload access rule (NotFound)", async () => {
    const hospital = await createHospital("REMOVE-ENDED");
    const owner = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.OWNER });
    const patient = await provisionPatient(owner.actor, {
      identity: { namespace: "evidence-integration", value: "remove-ended-patient" },
      givenName: "สมพร",
      familyName: "หลักฐาน",
      targetHospitalId: hospital.id,
    });
    const storage = createFakeStorage();
    const artifactId = "88888888-8888-4888-8888-888888888888";
    await createPatientEvidenceArtifact(
      owner.actor,
      { relationshipId: patient.relationshipId, declaredMediaType: "image/jpeg", bytes: jpegBytes() },
      { artifactIdFactory: () => artifactId, database: prisma, storage },
    );
    await prisma.patientHospitalRelationship.update({
      where: { id: patient.relationshipId },
      data: { endedAt: new Date(), endedByUserId: owner.userId, endReason: "ย้ายโรงพยาบาล" },
    });

    await expect(
      removePatientEvidenceArtifact(
        owner.actor,
        { artifactId, relationshipId: patient.relationshipId, reason: "ผิดคน" },
        { database: prisma, storage },
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect((await prisma.patientEvidenceArtifact.findUnique({ where: { id: artifactId } }))?.removedAt).toBeNull();
    expect(storage.keys.has(`relationship-evidence/${artifactId}`)).toBe(true);
  });

  it("N4: the database rejects a half-filled removal", async () => {
    const hospital = await createHospital("REMOVE-CHECK");
    const owner = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.OWNER });
    const patient = await provisionPatient(owner.actor, {
      identity: { namespace: "evidence-integration", value: "remove-check-patient" },
      givenName: "สมพร",
      familyName: "หลักฐาน",
      targetHospitalId: hospital.id,
    });
    const artifactId = "99999999-9999-4999-8999-999999999990";
    await createPatientEvidenceArtifact(
      owner.actor,
      { relationshipId: patient.relationshipId, declaredMediaType: "image/jpeg", bytes: jpegBytes() },
      { artifactIdFactory: () => artifactId, database: prisma, storage: createFakeStorage() },
    );

    for (const data of [
      { removedAt: new Date() },
      { removedByUserId: owner.userId },
      { removalReason: "เหตุผลเท่านั้น" },
      { removedByUserId: owner.userId, removalReason: "ไม่มีเวลา" },
    ]) {
      await expect(prisma.patientEvidenceArtifact.update({ where: { id: artifactId }, data }))
        .rejects.toThrow(/PatientEvidenceArtifact_removal_check/u);
    }

    await expect(
      prisma.patientEvidenceArtifact.update({
        where: { id: artifactId },
        data: { removedAt: new Date(), removedByUserId: owner.userId },
      }),
    ).resolves.toMatchObject({ removalReason: null });
  });
});
