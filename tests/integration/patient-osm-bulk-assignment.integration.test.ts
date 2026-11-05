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
import { provisionPatientFixture as provisionPatient } from "./support/patient-provisioning";
import { ForbiddenError } from "@/shared/errors/application-error";
import { BulkAssignmentSelectionUnavailableError } from "@/modules/patient-assignment/services/patient-osm-bulk-assignment-errors";

const prisma = getPrisma();
let sequence = 0;

async function clearDatabase(): Promise<void> {
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

async function createOsm(
  hospitalId: string,
  name: { givenName: string | null; familyName: string | null } = { givenName: "อสม.", familyName: null },
): Promise<string> {
  sequence += 1;
  const person = await prisma.person.create({
    data: {
      identityKeyHash: `bulk-assignment-osm-${sequence}`,
      givenName: name.givenName,
      familyName: name.familyName ?? String(sequence),
    },
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

  it("lets a MEMBER bulk-assign (ADR-0026) and denies a SUSPENDED MEMBER without writing", async () => {
    const hospital = await createHospital("BULK-ASSIGN-MEMBER");
    const owner = await createHospitalActor(hospital.id, MembershipType.OWNER);
    const member = await createHospitalActor(hospital.id, MembershipType.MEMBER);
    const suspended = await createHospitalActor(hospital.id, MembershipType.MEMBER);
    await prisma.hospitalMembership.updateMany({ where: { userId: suspended.userId }, data: { status: MembershipStatus.SUSPENDED } });
    const osmUserId = await createOsm(hospital.id);
    const ids = await createPatients(owner.actor, hospital.id, 2, "member");

    await expect(
      assignOsmToPatients(suspended.actor, {
        hospitalId: hospital.id,
        osmUserId,
        patientHospitalRelationshipIds: ids,
        submissionNonce: newNonce(),
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(await prisma.patientOsmAssignment.count()).toBe(0);
    await expect(
      assignOsmToPatients(member.actor, {
        hospitalId: hospital.id,
        osmUserId,
        patientHospitalRelationshipIds: ids,
        submissionNonce: newNonce(),
      }),
    ).resolves.toMatchObject({ assignedCount: 2 });
    expect(await prisma.patientOsmAssignment.count({ where: { assignedByUserId: member.userId, endedAt: null } })).toBe(2);
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

  it("rolls the whole batch back when one patient already has an OSM or has left care, naming exactly those", async () => {
    const hospital = await createHospital("BULK-ASSIGN-ROLLBACK");
    const owner = await createHospitalActor(hospital.id, MembershipType.OWNER);
    const osmUserId = await createOsm(hospital.id);
    const otherOsmUserId = await createOsm(hospital.id);
    const ids = await createPatients(owner.actor, hospital.id, 5, "rollback");
    await assignOsmToPatient(owner.actor, {
      patientHospitalRelationshipId: ids[2] as string,
      osmUserId: otherOsmUserId,
    });
    await prisma.patientHospitalRelationship.update({
      where: { id: ids[4] as string },
      data: { endedAt: new Date(), endedByUserId: owner.userId, endReason: "สิ้นสุดการดูแลสังเคราะห์" },
    });

    const rejected = assignOsmToPatients(owner.actor, {
      hospitalId: hospital.id,
      osmUserId,
      patientHospitalRelationshipIds: ids,
      submissionNonce: newNonce(),
    });
    await expect(rejected).rejects.toBeInstanceOf(BulkAssignmentSelectionUnavailableError);
    await expect(rejected).rejects.toMatchObject({
      code: "CONFLICT",
      unavailableRelationshipIds: [ids[2] as string, ids[4] as string].sort(),
    });

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

  it("pages through every eligible OSM, including 40 with identical names, in a stable order", async () => {
    const hospital = await createHospital("BULK-ASSIGN-PAGING");
    const otherHospital = await createHospital("BULK-ASSIGN-PAGING-OTHER");
    const owner = await createHospitalActor(hospital.id, MembershipType.OWNER);
    const member = await createHospitalActor(hospital.id, MembershipType.MEMBER);
    const otherOwner = await createHospitalActor(otherHospital.id, MembershipType.OWNER);
    const sameName = { givenName: "สมชาย", familyName: "ใจดี" };
    const eligible: string[] = [];

    for (let index = 0; index < 40; index += 1) {
      eligible.push(await createOsm(hospital.id, sameName));
    }

    eligible.push(await createOsm(hospital.id, { givenName: null, familyName: null }));
    eligible.push(await createOsm(hospital.id, { givenName: "อรุณ", familyName: "แสงทอง" }));

    const suspended = await createOsm(hospital.id, sameName);
    await prisma.osmHospitalRelationship.updateMany({
      where: { userId: suspended },
      data: { status: MembershipStatus.SUSPENDED },
    });
    const inactive = await createOsm(hospital.id, sameName);
    await prisma.user.update({ where: { id: inactive }, data: { status: UserStatus.SUSPENDED } });
    const foreign = await createOsm(otherHospital.id, sameName);

    async function readAll(value?: string): Promise<string[]> {
      const ids: string[] = [];

      for (let page = 1; page <= 10; page += 1) {
        const result = await listPatientOsmBulkCandidates(owner.actor, {
          hospitalId: hospital.id,
          ...(value ? { value } : {}),
          page,
        });

        expect(result.page).toBe(page);
        expect(result.candidates.length).toBeLessThanOrEqual(10);
        expect(result.hasPreviousPage).toBe(page > 1);
        ids.push(...result.candidates.map(({ userId }) => userId));

        if (!result.hasNextPage) {
          expect(result.totalPages).toBe(page);
          return ids;
        }

        expect(result.candidates).toHaveLength(10);
      }

      throw new Error("pagination did not terminate");
    }

    const all = await readAll();
    const firstPage = await listPatientOsmBulkCandidates(owner.actor, { hospitalId: hospital.id });

    expect(all).toHaveLength(42);
    expect(new Set(all).size).toBe(42);
    expect([...all].sort()).toEqual([...eligible].sort());
    expect(all).not.toContain(suspended);
    expect(all).not.toContain(inactive);
    expect(all).not.toContain(foreign);
    expect(all).not.toContain(owner.userId);
    expect(firstPage).toMatchObject({ page: 1, totalPages: 5, hasPreviousPage: false, hasNextPage: true });
    expect(firstPage.candidates.map(({ userId }) => userId)).toEqual(all.slice(0, 10));
    expect(await readAll()).toEqual(all);
    expect(await readAll("สมชาย")).toHaveLength(40);

    // A search is paged on its own: one match is one page.
    const exact = await listPatientOsmBulkCandidates(owner.actor, { hospitalId: hospital.id, value: "อรุณ" });
    expect(exact).toMatchObject({ page: 1, totalPages: 1, hasNextPage: false });
    expect(exact.candidates).toHaveLength(1);

    // A page past the end is clamped to the last page of the same search.
    const beyond = await listPatientOsmBulkCandidates(owner.actor, { hospitalId: hospital.id, value: "สมชาย", page: 99 });
    expect(beyond).toMatchObject({ page: 4, totalPages: 4, hasNextPage: false });
    expect(beyond.candidates.map(({ userId }) => userId)).toEqual((await readAll("สมชาย")).slice(30));
    await expect(
      listPatientOsmBulkCandidates(owner.actor, { hospitalId: hospital.id, page: 0 }),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    // Authorization is re-checked on every page: a MEMBER pages like the OWNER until its membership is suspended.
    await expect(
      listPatientOsmBulkCandidates(member.actor, { hospitalId: hospital.id, page: 2 }),
    ).resolves.toBeDefined();
    await prisma.hospitalMembership.updateMany({ where: { userId: member.userId }, data: { status: MembershipStatus.SUSPENDED } });
    await expect(
      listPatientOsmBulkCandidates(member.actor, { hospitalId: hospital.id, page: 2 }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      listPatientOsmBulkCandidates(otherOwner.actor, { hospitalId: hospital.id, page: 2 }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  }, 120_000);

  it("pages every patient without an OSM in a stable order, with search and clamping", async () => {
    const hospital = await createHospital("BULK-ASSIGN-PATIENT-PAGING");
    const owner = await createHospitalActor(hospital.id, MembershipType.OWNER);
    const osmUserId = await createOsm(hospital.id);
    const ids = await createPatients(owner.actor, hospital.id, 53, "page");
    await assignOsmToPatient(owner.actor, { patientHospitalRelationshipId: ids[0] as string, osmUserId });

    async function readAll(value?: string): Promise<string[]> {
      const seen: string[] = [];

      for (let page = 1; page <= 10; page += 1) {
        const view = await getPatientOsmBulkAssignmentView(owner.actor, {
          hospitalId: hospital.id,
          ...(value ? { value } : {}),
          page,
        });

        expect(view).toMatchObject({ page, pageSize: 25, hasPreviousPage: page > 1 });
        expect(view.patients.length).toBeLessThanOrEqual(25);
        seen.push(...view.patients.map(({ patientHospitalRelationshipId }) => patientHospitalRelationshipId));

        if (!view.hasNextPage) {
          return seen;
        }
      }

      throw new Error("pagination did not terminate");
    }

    const first = await getPatientOsmBulkAssignmentView(owner.actor, { hospitalId: hospital.id });
    expect(first).toMatchObject({ page: 1, totalPages: 3, totalWithoutOsm: 52, hasNextPage: true });
    expect(first.patients).toHaveLength(25);

    const all = await readAll();
    expect(all).toHaveLength(52);
    expect(new Set(all).size).toBe(52);
    expect([...all].sort()).toEqual(ids.slice(1).sort());
    expect(await readAll()).toEqual(all);

    const last = await getPatientOsmBulkAssignmentView(owner.actor, { hospitalId: hospital.id, page: 3 });
    expect(last.patients.map(({ patientHospitalRelationshipId }) => patientHospitalRelationshipId)).toEqual(all.slice(50));
    expect(last).toMatchObject({ hasNextPage: false, totalWithoutOsm: 52 });

    const beyond = await getPatientOsmBulkAssignmentView(owner.actor, { hospitalId: hospital.id, page: 40 });
    expect(beyond).toMatchObject({ page: 3, totalPages: 3, totalWithoutOsm: 52 });
    expect(beyond.patients.map(({ patientHospitalRelationshipId }) => patientHospitalRelationshipId)).toEqual(all.slice(50));

    // The name search "page-1" matches page-1 and page-10 to page-19 (page-0 already has an OSM).
    const searched = await readAll("page-1");
    const searchedView = await getPatientOsmBulkAssignmentView(owner.actor, { hospitalId: hospital.id, value: "page-1" });
    expect(searchedView).toMatchObject({ totalWithoutOsm: 11, totalPages: 1 });
    expect(searched).toHaveLength(11);
    expect(searched.every((id) => all.includes(id))).toBe(true);

    const none = await getPatientOsmBulkAssignmentView(owner.actor, { hospitalId: hospital.id, value: "ไม่มีชื่อนี้", page: 5 });
    expect(none).toMatchObject({ page: 1, totalPages: 1, totalWithoutOsm: 0, patients: [] });
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
    // ADR-0026: a MEMBER sees the same view and scopes as the OWNER.
    await expect(
      getPatientOsmBulkAssignmentView(member.actor, { hospitalId: hospital.id }),
    ).resolves.toMatchObject({ hospital: { hospitalId: hospital.id } });
    expect(await listPatientOsmAssignmentScopes(owner.actor)).toEqual([
      { hospitalId: hospital.id, hospitalName: "โรงพยาบาล BULK-ASSIGN-VIEW-A" },
    ]);
    expect(await listPatientOsmAssignmentScopes(member.actor)).toEqual(await listPatientOsmAssignmentScopes(owner.actor));
  });
});
