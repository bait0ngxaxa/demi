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
import {
  getPatientOsmBulkAssignmentView,
  listPatientOsmAssignmentScopes,
  listPatientOsmBulkCandidates,
} from "@/modules/patient-assignment/services/patient-osm-assignment-query-service";
import {
  assignOsmToPatient,
  assignOsmToPatients,
} from "@/modules/patient-assignment/services/patient-osm-assignment-service";
import { provisionPatient } from "@/modules/patient-provisioning/services/patient-provisioning-service";
import { ForbiddenError } from "@/shared/errors/application-error";

const prisma = getPrisma();
let sequence = 0;

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

function newNonce(): string {
  sequence += 1;
  return `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
}

async function createHospital(code: string): Promise<{ id: string }> {
  return prisma.hospital.create({
    data: { hospitalCode: code, name: `โรงพยาบาล ${code}`, status: HospitalStatus.ACTIVE },
    select: { id: true },
  });
}

async function createHospitalActor(
  hospitalId: string,
  membershipType: MembershipType,
): Promise<{ actor: ActorContext; userId: string }> {
  sequence += 1;
  const person = await prisma.person.create({
    data: { identityKeyHash: `bulk-assignment-hospital-${sequence}` },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: { personId: person.id, status: UserStatus.ACTIVE },
    select: { id: true },
  });

  await prisma.userRole.create({ data: { userId: user.id, role: Role.HOSPITAL } });
  await prisma.hospitalMembership.create({
    data: { userId: user.id, hospitalId, membershipType, status: MembershipStatus.ACTIVE },
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

async function createOsm(hospitalId: string): Promise<string> {
  sequence += 1;
  const person = await prisma.person.create({
    data: { identityKeyHash: `bulk-assignment-osm-${sequence}`, givenName: "อสม.", familyName: String(sequence) },
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

  return user.id;
}

async function createPatients(
  actor: ActorContext,
  hospitalId: string,
  count: number,
  prefix: string,
): Promise<string[]> {
  const relationshipIds: string[] = [];

  for (let index = 0; index < count; index += 1) {
    const patient = await provisionPatient(actor, {
      identity: { namespace: "integration-bulk-assignment", value: `${prefix}-${index}` },
      targetHospitalId: hospitalId,
      givenName: "ผู้ป่วย",
      familyName: `${prefix}-${index}`,
    });
    relationshipIds.push(patient.relationshipId);
  }

  return relationshipIds;
}

async function activeAssignmentCount(): Promise<number> {
  return prisma.patientOsmAssignment.count({ where: { endedAt: null } });
}

describe("Bulk Patient ↔ OSM assignment PostgreSQL workflow", () => {
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

  it("assigns one OSM to many patients with one audit per assignment and replays a double submit", async () => {
    const hospital = await createHospital("BULK-ASSIGN-A");
    const owner = await createHospitalActor(hospital.id, MembershipType.OWNER);
    const osmUserId = await createOsm(hospital.id);
    const ids = await createPatients(owner.actor, hospital.id, 5, "bulk");
    const submissionNonce = newNonce();
    const request = {
      hospitalId: hospital.id,
      osmUserId,
      patientHospitalRelationshipIds: ids,
      submissionNonce,
    };

    const first = await assignOsmToPatients(owner.actor, request);
    const second = await assignOsmToPatients(owner.actor, request);

    expect(first).toEqual({ operation: "ASSIGNED", hospitalId: hospital.id, osmUserId, assignedCount: 5 });
    expect(second).toEqual({ operation: "REPLAYED", hospitalId: hospital.id, osmUserId, assignedCount: 5 });
    expect(await activeAssignmentCount()).toBe(5);
    expect(await prisma.patientOsmAssignment.count()).toBe(5);
    expect(await prisma.auditEvent.count({ where: { action: "patient.osm_assigned" } })).toBe(5);
    expect(
      await prisma.auditEvent.count({
        where: { action: "patient.osm_bulk_assigned", resourceId: submissionNonce },
      }),
    ).toBe(1);
  });

  it("creates no duplicate assignment when the same request is submitted concurrently", async () => {
    const hospital = await createHospital("BULK-ASSIGN-CONCURRENT");
    const owner = await createHospitalActor(hospital.id, MembershipType.OWNER);
    const osmUserId = await createOsm(hospital.id);
    const ids = await createPatients(owner.actor, hospital.id, 4, "concurrent");
    const request = {
      hospitalId: hospital.id,
      osmUserId,
      patientHospitalRelationshipIds: ids,
      submissionNonce: newNonce(),
    };

    const outcomes = await Promise.allSettled([
      assignOsmToPatients(owner.actor, request),
      assignOsmToPatients(owner.actor, request),
    ]);

    expect(outcomes.some(({ status }) => status === "fulfilled")).toBe(true);
    expect(
      outcomes.filter(
        (outcome) => outcome.status === "fulfilled" && outcome.value.operation === "ASSIGNED",
      ),
    ).toHaveLength(1);
    expect(await activeAssignmentCount()).toBe(4);
    expect(await prisma.patientOsmAssignment.count()).toBe(4);
    expect(await prisma.auditEvent.count({ where: { action: "patient.osm_bulk_assigned" } })).toBe(1);
  });

  it("replays a reordered selection but rejects the same nonce for different patients", async () => {
    const hospital = await createHospital("BULK-ASSIGN-NONCE");
    const owner = await createHospitalActor(hospital.id, MembershipType.OWNER);
    const osmUserId = await createOsm(hospital.id);
    const ids = await createPatients(owner.actor, hospital.id, 6, "nonce");
    const firstIds = ids.slice(0, 3);
    const otherIds = ids.slice(3);
    const submissionNonce = newNonce();
    const request = (patientHospitalRelationshipIds: string[]) => ({
      hospitalId: hospital.id,
      osmUserId,
      patientHospitalRelationshipIds,
      submissionNonce,
    });

    await assignOsmToPatients(owner.actor, request(firstIds));

    await expect(assignOsmToPatients(owner.actor, request([...firstIds].reverse()))).resolves.toMatchObject({
      operation: "REPLAYED",
      assignedCount: 3,
    });
    await expect(assignOsmToPatients(owner.actor, request(otherIds))).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(assignOsmToPatients(owner.actor, request(ids))).rejects.toMatchObject({ code: "CONFLICT" });

    expect(await activeAssignmentCount()).toBe(3);
    expect(
      await prisma.patientOsmAssignment.count({
        where: { patientHospitalRelationshipId: { in: otherIds } },
      }),
    ).toBe(0);
  });

  it("rejects a legacy replay marker without a selection fingerprint", async () => {
    const hospital = await createHospital("BULK-ASSIGN-LEGACY");
    const owner = await createHospitalActor(hospital.id, MembershipType.OWNER);
    const osmUserId = await createOsm(hospital.id);
    const ids = await createPatients(owner.actor, hospital.id, 2, "legacy");
    const submissionNonce = newNonce();

    await prisma.auditEvent.create({
      data: {
        actorUserId: owner.userId,
        action: "patient.osm_bulk_assigned",
        resourceType: "PatientOsmBulkAssignment",
        resourceId: submissionNonce,
        metadata: { hospitalId: hospital.id, osmUserId, assignedCount: 2 },
      },
    });

    await expect(
      assignOsmToPatients(owner.actor, {
        hospitalId: hospital.id,
        osmUserId,
        patientHospitalRelationshipIds: ids,
        submissionNonce,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await prisma.patientOsmAssignment.count()).toBe(0);
  });

  it("lets exactly one of two concurrent batches with different OSMs win the same patients", async () => {
    const hospital = await createHospital("BULK-ASSIGN-RACE");
    const owner = await createHospitalActor(hospital.id, MembershipType.OWNER);
    const firstOsm = await createOsm(hospital.id);
    const secondOsm = await createOsm(hospital.id);
    const ids = await createPatients(owner.actor, hospital.id, 6, "race");

    const outcomes = await Promise.allSettled([firstOsm, secondOsm].map((osmUserId) =>
      assignOsmToPatients(owner.actor, {
        hospitalId: hospital.id,
        osmUserId,
        patientHospitalRelationshipIds: ids,
        submissionNonce: newNonce(),
      }),
    ));

    expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(await activeAssignmentCount()).toBe(6);
    expect(await prisma.patientOsmAssignment.count()).toBe(6);
    expect(await prisma.patientOsmAssignment.groupBy({ by: ["osmUserId"], where: { endedAt: null } })).toHaveLength(1);
  });

  it("re-checks eligibility at execution time: a deactivated OSM or demoted owner writes nothing", async () => {
    const hospital = await createHospital("BULK-ASSIGN-REVOKED");
    const owner = await createHospitalActor(hospital.id, MembershipType.OWNER);
    const osmUserId = await createOsm(hospital.id);
    const ids = await createPatients(owner.actor, hospital.id, 3, "revoked");
    const request = () => ({
      hospitalId: hospital.id,
      osmUserId,
      patientHospitalRelationshipIds: ids,
      submissionNonce: newNonce(),
    });

    await prisma.osmHospitalRelationship.updateMany({
      where: { userId: osmUserId },
      data: { status: MembershipStatus.SUSPENDED },
    });
    await expect(assignOsmToPatients(owner.actor, request())).rejects.toBeInstanceOf(ForbiddenError);

    await prisma.osmHospitalRelationship.updateMany({
      where: { userId: osmUserId },
      data: { status: MembershipStatus.ACTIVE },
    });
    await prisma.hospitalMembership.updateMany({
      where: { userId: owner.userId },
      data: { status: MembershipStatus.SUSPENDED },
    });
    await expect(assignOsmToPatients(owner.actor, request())).rejects.toBeInstanceOf(ForbiddenError);

    expect(await prisma.patientOsmAssignment.count()).toBe(0);
    expect(await prisma.auditEvent.count({ where: { action: "patient.osm_bulk_assigned" } })).toBe(0);
  });

  it.each([1, 50])("assigns a batch of %i patient(s) with one audit per assignment", async (size) => {
    const hospital = await createHospital(`BULK-ASSIGN-SIZE-${size}`);
    const owner = await createHospitalActor(hospital.id, MembershipType.OWNER);
    const osmUserId = await createOsm(hospital.id);
    const ids = await createPatients(owner.actor, hospital.id, size, `size${size}`);

    const result = await assignOsmToPatients(owner.actor, {
      hospitalId: hospital.id,
      osmUserId,
      patientHospitalRelationshipIds: ids,
      submissionNonce: newNonce(),
    });

    expect(result.assignedCount).toBe(size);
    expect(await activeAssignmentCount()).toBe(size);
    expect(await prisma.auditEvent.count({ where: { action: "patient.osm_assigned" } })).toBe(size);
  }, 120_000);

  it("denies a MEMBER and writes nothing", async () => {
    const hospital = await createHospital("BULK-ASSIGN-MEMBER");
    const owner = await createHospitalActor(hospital.id, MembershipType.OWNER);
    const member = await createHospitalActor(hospital.id, MembershipType.MEMBER);
    const osmUserId = await createOsm(hospital.id);
    const ids = await createPatients(owner.actor, hospital.id, 2, "member");

    await expect(
      assignOsmToPatients(member.actor, {
        hospitalId: hospital.id,
        osmUserId,
        patientHospitalRelationshipIds: ids,
        submissionNonce: newNonce(),
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(await prisma.patientOsmAssignment.count()).toBe(0);
  });

  it("denies a patient or an OSM of another hospital, and self-assignment", async () => {
    const hospital = await createHospital("BULK-ASSIGN-SCOPE-A");
    const otherHospital = await createHospital("BULK-ASSIGN-SCOPE-B");
    const owner = await createHospitalActor(hospital.id, MembershipType.OWNER);
    const otherOwner = await createHospitalActor(otherHospital.id, MembershipType.OWNER);
    const osmUserId = await createOsm(hospital.id);
    const otherOsmUserId = await createOsm(otherHospital.id);
    const ownIds = await createPatients(owner.actor, hospital.id, 2, "scope-own");
    const otherIds = await createPatients(otherOwner.actor, otherHospital.id, 1, "scope-other");

    await expect(
      assignOsmToPatients(owner.actor, {
        hospitalId: hospital.id,
        osmUserId,
        patientHospitalRelationshipIds: [...ownIds, ...otherIds],
        submissionNonce: newNonce(),
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      assignOsmToPatients(owner.actor, {
        hospitalId: hospital.id,
        osmUserId: otherOsmUserId,
        patientHospitalRelationshipIds: ownIds,
        submissionNonce: newNonce(),
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      assignOsmToPatients(owner.actor, {
        hospitalId: hospital.id,
        osmUserId: owner.userId,
        patientHospitalRelationshipIds: ownIds,
        submissionNonce: newNonce(),
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      assignOsmToPatients(owner.actor, {
        hospitalId: otherHospital.id,
        osmUserId: otherOsmUserId,
        patientHospitalRelationshipIds: otherIds,
        submissionNonce: newNonce(),
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(await prisma.patientOsmAssignment.count()).toBe(0);
  });

  it("rolls the whole batch back when one patient already has an OSM, and never reassigns", async () => {
    const hospital = await createHospital("BULK-ASSIGN-ROLLBACK");
    const owner = await createHospitalActor(hospital.id, MembershipType.OWNER);
    const osmUserId = await createOsm(hospital.id);
    const otherOsmUserId = await createOsm(hospital.id);
    const ids = await createPatients(owner.actor, hospital.id, 4, "rollback");
    await assignOsmToPatient(owner.actor, {
      patientHospitalRelationshipId: ids[2] as string,
      osmUserId: otherOsmUserId,
    });

    await expect(
      assignOsmToPatients(owner.actor, {
        hospitalId: hospital.id,
        osmUserId,
        patientHospitalRelationshipIds: ids,
        submissionNonce: newNonce(),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(await activeAssignmentCount()).toBe(1);
    expect(await prisma.patientOsmAssignment.count()).toBe(1);
    expect(
      await prisma.patientOsmAssignment.findFirstOrThrow({ select: { osmUserId: true, endedAt: true } }),
    ).toEqual({ osmUserId: otherOsmUserId, endedAt: null });
    expect(await prisma.auditEvent.count({ where: { action: "patient.osm_bulk_assigned" } })).toBe(0);
  });

  it("handles the 500-patient maximum in one transaction", async () => {
    const hospital = await createHospital("BULK-ASSIGN-MAX");
    const owner = await createHospitalActor(hospital.id, MembershipType.OWNER);
    const osmUserId = await createOsm(hospital.id);
    const ids = await createPatients(owner.actor, hospital.id, 500, "max");

    const result = await assignOsmToPatients(owner.actor, {
      hospitalId: hospital.id,
      osmUserId,
      patientHospitalRelationshipIds: ids,
      submissionNonce: newNonce(),
    });

    expect(result.assignedCount).toBe(500);
    expect(await activeAssignmentCount()).toBe(500);
  }, 300_000);

  it("lists only the unassigned patients and the eligible OSMs of the owned hospital", async () => {
    const hospital = await createHospital("BULK-ASSIGN-VIEW-A");
    const otherHospital = await createHospital("BULK-ASSIGN-VIEW-B");
    const owner = await createHospitalActor(hospital.id, MembershipType.OWNER);
    const otherOwner = await createHospitalActor(otherHospital.id, MembershipType.OWNER);
    const member = await createHospitalActor(hospital.id, MembershipType.MEMBER);
    const osmUserId = await createOsm(hospital.id);
    await createOsm(otherHospital.id);
    const ids = await createPatients(owner.actor, hospital.id, 3, "view");
    await createPatients(otherOwner.actor, otherHospital.id, 2, "view-other");
    await assignOsmToPatient(owner.actor, { patientHospitalRelationshipId: ids[0] as string, osmUserId });

    const view = await getPatientOsmBulkAssignmentView(owner.actor, { hospitalId: hospital.id });

    expect(view.totalWithoutOsm).toBe(2);
    expect(view.patients.map(({ patientHospitalRelationshipId }) => patientHospitalRelationshipId).sort()).toEqual(
      ids.slice(1).sort(),
    );
    expect(
      (await listPatientOsmBulkCandidates(owner.actor, { hospitalId: hospital.id })).candidates.map(
        ({ userId }) => userId,
      ),
    ).toEqual([osmUserId]);
    await expect(
      listPatientOsmBulkCandidates(owner.actor, { hospitalId: otherHospital.id }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      getPatientOsmBulkAssignmentView(owner.actor, { hospitalId: otherHospital.id }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      getPatientOsmBulkAssignmentView(member.actor, { hospitalId: hospital.id }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(await listPatientOsmAssignmentScopes(owner.actor)).toEqual([
      { hospitalId: hospital.id, hospitalName: "โรงพยาบาล BULK-ASSIGN-VIEW-A" },
    ]);
    expect(await listPatientOsmAssignmentScopes(member.actor)).toEqual([]);
  });
});
