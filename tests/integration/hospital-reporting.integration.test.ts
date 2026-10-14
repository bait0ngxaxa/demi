import { randomUUID } from "node:crypto";

import {
  FollowupActivityProgressStatus,
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  PatientProgramStatus,
  Prisma,
  Role,
  UserStatus,
  type PrismaClient,
} from "@prisma/client";
import ExcelJS from "exceljs";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { getProgramReportingProjection } from "@/modules/reporting/services/program-report-query-service";
import {
  exportGlobalAdminHospitalReportingWorkbook,
  exportHospitalReportingWorkbook,
} from "@/modules/reporting/services/hospital-report-workbook-service";
import {
  getGlobalAdminHospitalReportingDatasetForExport,
  getGlobalAdminHospitalReportingPage,
  getHospitalReportingDatasetForExport,
  getHospitalReportingPage,
  getParentChildHospitalReportingPage,
} from "@/modules/reporting/services/hospital-report-query-service";
import { getGlobalReportingDirectory } from "@/modules/reporting/services/global-reporting-service";
import { resolveGlobalReportingAccessContext } from "@/modules/reporting/services/global-reporting-access-service";
import {
  listParentChildHospitalReportTargetGroups,
  resolveParentChildHospitalReportAccessContext,
} from "@/modules/reporting/services/parent-child-hospital-report-access-service";
import * as globalReportingAccessModule from "@/modules/reporting/services/global-reporting-access-service";
import { GLOBAL_REPORTING_CAPABILITIES } from "@/modules/reporting/policies/global-reporting-policy";
import { ForbiddenError, NotFoundError } from "@/shared/errors/application-error";

const prisma = getPrisma();
const previousCursorSecret = process.env.DEMI_HOSPITAL_REPORTING_CURSOR_SECRET;

type Fixture = {
  hospitalIds: string[];
  personIds: string[];
  userIds: string[];
  relationshipIds: string[];
  profileIds: string[];
  baselineIds: string[];
  programIds: string[];
};

type ActorFixture = { actor: ActorContext; userId: string };

let currentFixture: Fixture | null = null;

function newFixture(): Fixture {
  return { hospitalIds: [], personIds: [], userIds: [], relationshipIds: [], profileIds: [], baselineIds: [], programIds: [] };
}

async function cleanFixture(fixture: Fixture): Promise<void> {
  const programIds = fixture.programIds;
  if (programIds.length > 0) {
    await prisma.patientFollowupActivityProgress.deleteMany({ where: { followup: { patientProgramId: { in: programIds } } } });
    await prisma.patientProgramRoundActivity.deleteMany({ where: { patientProgramId: { in: programIds } } });
    await prisma.patientProgramRoundVitals.deleteMany({ where: { patientProgramId: { in: programIds } } });
    await prisma.screeningAssessment.deleteMany({ where: { patientProgramId: { in: programIds } } });
    await prisma.patientProgramServiceOneRoutine.deleteMany({ where: { patientProgramId: { in: programIds } } });
    await prisma.patientProgramServiceOneFloatingChart.deleteMany({ where: { patientProgramId: { in: programIds } } });
    await prisma.patientProgramServiceOneDreamCard.deleteMany({ where: { patientProgramId: { in: programIds } } });
    await prisma.patientProgramServiceOneConfidence.deleteMany({ where: { patientProgramId: { in: programIds } } });
    await prisma.patientFinalAssessment.deleteMany({ where: { patientProgramId: { in: programIds } } });
    await prisma.patientGoalPlan.updateMany({
      where: { patientProgramId: { in: programIds }, sourceFollowupId: { not: null } },
      data: { sourceFollowupId: null },
    });
    await prisma.patientFollowup.deleteMany({ where: { patientProgramId: { in: programIds } } });
    await prisma.patientGoalItem.deleteMany({ where: { goalPlan: { patientProgramId: { in: programIds } } } });
    await prisma.patientGoalPlan.deleteMany({ where: { patientProgramId: { in: programIds } } });
    await prisma.patientProgram.deleteMany({ where: { id: { in: programIds } } });
  }
  if (fixture.baselineIds.length > 0) await prisma.patientBaseline.deleteMany({ where: { id: { in: fixture.baselineIds } } });
  if (fixture.relationshipIds.length > 0) await prisma.patientHospitalRelationship.deleteMany({ where: { id: { in: fixture.relationshipIds } } });
  if (fixture.profileIds.length > 0) await prisma.patientProfile.deleteMany({ where: { id: { in: fixture.profileIds } } });
  if (fixture.userIds.length > 0) {
    await prisma.auditEvent.deleteMany({
      where: {
        actorUserId: { in: fixture.userIds },
        action: {
          in: [
            "hospital_reporting.export.prepared",
            "global_reporting.access.read",
            "global_reporting.access.denied",
            "global_reporting.export.prepared",
            "global_reporting.export.denied",
            "parent_child_reporting.access.read",
            "parent_child_reporting.access.denied",
            "parent_child_reporting.access.failed",
          ],
        },
      },
    });
    await prisma.hospitalMembership.deleteMany({ where: { userId: { in: fixture.userIds } } });
    await prisma.osmHospitalRelationship.deleteMany({ where: { userId: { in: fixture.userIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: fixture.userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: fixture.userIds } } });
  }
  if (fixture.hospitalIds.length > 0) {
    await prisma.hospital.updateMany({ where: { id: { in: fixture.hospitalIds } }, data: { parentHospitalId: null } });
    await prisma.hospital.deleteMany({ where: { id: { in: fixture.hospitalIds } } });
  }
  if (fixture.personIds.length > 0) await prisma.person.deleteMany({ where: { id: { in: fixture.personIds } } });
}

async function createHospital(
  fixture: Fixture,
  input: { name: string; status?: HospitalStatus; parentHospitalId?: string },
): Promise<{ id: string; name: string; hospitalCode: string; status: HospitalStatus }> {
  const hospital = await prisma.hospital.create({
    data: {
      hospitalCode: `HR-${randomUUID().slice(0, 20)}`,
      name: input.name,
      status: input.status ?? HospitalStatus.ACTIVE,
      parentHospitalId: input.parentHospitalId,
    },
    select: { id: true, name: true, hospitalCode: true, status: true },
  });
  fixture.hospitalIds.push(hospital.id);
  return hospital;
}

async function createActor(
  fixture: Fixture,
  input: {
    role: Role;
    hospital?: { id: string; status: HospitalStatus };
    membershipType?: MembershipType;
    membershipStatus?: MembershipStatus;
    userStatus?: UserStatus;
  },
): Promise<ActorFixture> {
  const personIdKey = randomUUID();
  const person = await prisma.person.create({
    data: {
      identityKeyHash: `hospital-report-actor-${personIdKey}`,
      givenName: "ผู้ดูแล",
      familyName: personIdKey.slice(0, 8),
    },
    select: { id: true },
  });
  fixture.personIds.push(person.id);
  const user = await prisma.user.create({
    data: { personId: person.id, authSubject: randomUUID(), status: input.userStatus ?? UserStatus.ACTIVE },
    select: { id: true },
  });
  fixture.userIds.push(user.id);
  await prisma.userRole.create({ data: { userId: user.id, role: input.role } });

  const hospitalMemberships: ActorContext["hospitalMemberships"][number][] = [];
  const osmHospitalRelationships: ActorContext["osmHospitalRelationships"][number][] = [];
  if (input.hospital && input.role === Role.HOSPITAL) {
    const membershipType = input.membershipType ?? MembershipType.OWNER;
    const status = input.membershipStatus ?? MembershipStatus.ACTIVE;
    await prisma.hospitalMembership.create({
      data: { userId: user.id, hospitalId: input.hospital.id, membershipType, status },
    });
    hospitalMemberships.push({
      hospitalId: input.hospital.id,
      membershipType,
      profession: null,
      status,
      hospitalStatus: input.hospital.status,
    });
  }
  if (input.hospital && input.role === Role.OSM) {
    await prisma.osmHospitalRelationship.create({
      data: { userId: user.id, hospitalId: input.hospital.id, status: MembershipStatus.ACTIVE },
    });
    osmHospitalRelationships.push({
      hospitalId: input.hospital.id,
      status: MembershipStatus.ACTIVE,
      hospitalStatus: input.hospital.status,
    });
  }

  return {
    userId: user.id,
    actor: {
      userId: user.id,
      personId: person.id,
      roles: [input.role],
      hospitalMemberships,
      osmHospitalRelationships,
    },
  };
}

async function createPatientProfile(fixture: Fixture, name: string): Promise<{ id: string }> {
  const person = await prisma.person.create({
    data: {
      identityKeyHash: `hospital-report-patient-${randomUUID()}`,
      givenName: "สมชาย",
      familyName: name,
    },
    select: { id: true },
  });
  fixture.personIds.push(person.id);
  const patientUser = await prisma.user.create({
    data: { personId: person.id, authSubject: randomUUID(), status: UserStatus.ACTIVE },
    select: { id: true },
  });
  fixture.userIds.push(patientUser.id);
  await prisma.userRole.create({ data: { userId: patientUser.id, role: Role.PATIENT } });
  const profile = await prisma.patientProfile.create({ data: { personId: person.id }, select: { id: true } });
  fixture.profileIds.push(profile.id);
  return profile;
}

async function createRelationship(
  fixture: Fixture,
  patientProfileId: string,
  hospitalId: string,
  hospitalNumber: string,
): Promise<{ id: string }> {
  const relationship = await prisma.patientHospitalRelationship.create({
    data: { patientProfileId, hospitalId, hospitalNumber },
    select: { id: true },
  });
  fixture.relationshipIds.push(relationship.id);
  return relationship;
}

async function createProgram(
  fixture: Fixture,
  input: {
    relationshipId: string;
    createdByUserId: string;
    status: PatientProgramStatus;
    initialBaselineId?: string;
  },
): Promise<{ id: string }> {
  const program = await prisma.patientProgram.create({
    data: {
      patientHospitalRelationshipId: input.relationshipId,
      initialBaselineId: input.initialBaselineId,
      createdByUserId: input.createdByUserId,
      status: input.status,
      startedAt: new Date("2026-08-17T05:00:00.000Z"),
      completedAt: input.status === PatientProgramStatus.COMPLETED ? new Date("2026-09-01T05:00:00.000Z") : null,
    },
    select: { id: true },
  });
  fixture.programIds.push(program.id);
  return program;
}

async function addProgramSources(input: {
  programId: string;
  relationshipId: string;
  recordedByUserId: string;
  rounds: number;
}): Promise<void> {
  const goalPlan = await prisma.patientGoalPlan.create({
    data: {
      patientHospitalRelationshipId: input.relationshipId,
      patientProgramId: input.programId,
      createdByUserId: input.recordedByUserId,
      submissionNonce: randomUUID(),
      templateKey: "demi-goals",
      templateVersion: "1",
      roundNumber: 1,
      primaryGoalCode: "weight",
      items: {
        create: [{ activityCode: "exercise_walk", targetDays: 3, targetValue: 0, targetUnit: "minutes", sortOrder: 1 }],
      },
    },
    select: { id: true },
  });

  await prisma.patientProgramServiceOneRoutine.create({
    data: { patientProgramId: input.programId, recordedByUserId: input.recordedByUserId },
  });

  for (let roundNumber = 1; roundNumber <= input.rounds; roundNumber += 1) {
    await prisma.patientFollowup.create({
      data: {
        patientHospitalRelationshipId: input.relationshipId,
        patientProgramId: input.programId,
        sourceGoalPlanId: goalPlan.id,
        createdByUserId: input.recordedByUserId,
        roundNumber,
        submissionNonce: randomUUID(),
        submissionRequestHash: randomUUID().replaceAll("-", "").padEnd(64, "0").slice(0, 64),
        recordedAt: new Date(`2026-08-${String(17 + roundNumber).padStart(2, "0")}T05:00:00.000Z`),
        weight: null,
        waistCircumference: null,
        systolicBloodPressure: null,
        diastolicBloodPressure: null,
        bloodSugar: roundNumber === 1 ? 0 : null,
        confidenceScore: null,
        reflectionNote: `SYNTHETIC_PRIVATE_NOTE_${roundNumber}`,
        activityProgress: {
          create: [{ goalActivityCode: "exercise_walk", status: FollowupActivityProgressStatus.PARTIAL }],
        },
      },
    });
  }
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolvePromise: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => { resolvePromise = resolve; });
  return { promise, resolve: resolvePromise };
}

function repeatableReadAdapter(
  onProgramCount: () => Promise<void>,
  observedOptions: { value: unknown },
): PrismaClient {
  const adapter = {
    $transaction<T>(
      operation: (transaction: Prisma.TransactionClient) => Promise<T>,
      options: { isolationLevel?: Prisma.TransactionIsolationLevel; maxWait?: number; timeout?: number },
    ): Promise<T> {
      observedOptions.value = options;
      return prisma.$transaction(async (transaction) => {
        let paused = false;
        const programDelegate = new Proxy(transaction.patientProgram, {
          get(target, property) {
            if (property === "count") {
              return async (args: Prisma.PatientProgramCountArgs) => {
                const count = await target.count(args);
                if (!paused) {
                  paused = true;
                  await onProgramCount();
                }
                return count;
              };
            }
            const value: unknown = Reflect.get(target, property, target);
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
        const transactionView = new Proxy(transaction, {
          get(target, property) {
            if (property === "patientProgram") return programDelegate;
            const value: unknown = Reflect.get(target, property, target);
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
        return operation(transactionView);
      }, options);
    },
  };
  return adapter as unknown as PrismaClient;
}

function dashboardReadWithMembershipRevocationAfterProgramLoad(
  userId: string,
  hospitalId: string,
): PrismaClient {
  let revoked = false;
  return new Proxy(prisma, {
    get(target, property) {
      if (property === "$transaction") {
        return <T>(
          operation: (transaction: Prisma.TransactionClient) => Promise<T>,
          options: { isolationLevel?: Prisma.TransactionIsolationLevel; maxWait?: number; timeout?: number },
        ): Promise<T> => target.$transaction(async (transaction) => {
          const programDelegate = new Proxy(transaction.patientProgram, {
            get(delegate, delegateProperty) {
              if (delegateProperty === "findMany") {
                return async (...args: Parameters<typeof delegate.findMany>) => {
                  const records = await delegate.findMany(...args);
                  if (!revoked) {
                    revoked = true;
                    await prisma.hospitalMembership.updateMany({ where: { userId, hospitalId, status: { not: "ENDED" } },
                      data: { status: MembershipStatus.SUSPENDED },
                    });
                  }
                  return records;
                };
              }
              const value: unknown = Reflect.get(delegate, delegateProperty, delegate);
              return typeof value === "function" ? value.bind(delegate) : value;
            },
          });
          const transactionView = new Proxy(transaction, {
            get(transactionTarget, transactionProperty) {
              if (transactionProperty === "patientProgram") return programDelegate;
              const value: unknown = Reflect.get(transactionTarget, transactionProperty, transactionTarget);
              return typeof value === "function" ? value.bind(transactionTarget) : value;
            },
          });
          return operation(transactionView);
        }, options);
      }
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

describe("Phase 18D.1 Hospital reporting PostgreSQL boundary", () => {
  beforeAll(async () => {
    process.env.DEMI_HOSPITAL_REPORTING_CURSOR_SECRET = "synthetic-hospital-reporting-integration-secret";
    await prisma.$connect();
  });

  afterEach(async () => {
    if (currentFixture) await cleanFixture(currentFixture);
    currentFixture = null;
  });

  afterAll(async () => {
    if (previousCursorSecret === undefined) delete process.env.DEMI_HOSPITAL_REPORTING_CURSOR_SECRET;
    else process.env.DEMI_HOSPITAL_REPORTING_CURSOR_SECRET = previousCursorSecret;
    await prisma.$disconnect();
  });

  it("keeps one row per exact Program, isolates Hospital scope, and rechecks distinct Owner reporting access", async () => {
    const fixture = newFixture();
    currentFixture = fixture;
    const parent = await createHospital(fixture, { name: "โรงพยาบาลแม่" });
    const hospitalA = await createHospital(fixture, { name: "โรงพยาบาล A", parentHospitalId: parent.id });
    const hospitalB = await createHospital(fixture, { name: "โรงพยาบาล B" });
    const suspendedHospital = await createHospital(fixture, { name: "โรงพยาบาลระงับ", status: HospitalStatus.SUSPENDED });
    const ownerA = await createActor(fixture, { role: Role.HOSPITAL, hospital: hospitalA });
    const memberA = await createActor(fixture, { role: Role.HOSPITAL, hospital: hospitalA, membershipType: MembershipType.MEMBER });
    const ownerB = await createActor(fixture, { role: Role.HOSPITAL, hospital: hospitalB });
    const ownerParent = await createActor(fixture, { role: Role.HOSPITAL, hospital: parent });
    const ownerSuspendedMembership = await createActor(fixture, { role: Role.HOSPITAL, hospital: hospitalA, membershipStatus: MembershipStatus.SUSPENDED });
    const suspendedUser = await createActor(fixture, { role: Role.HOSPITAL, hospital: hospitalA, userStatus: UserStatus.SUSPENDED });
    const ownerSuspendedHospital = await createActor(fixture, { role: Role.HOSPITAL, hospital: suspendedHospital });
    const osm = await createActor(fixture, { role: Role.OSM, hospital: hospitalA });
    const admin = await createActor(fixture, { role: Role.ADMIN });
    const patientRole = await createActor(fixture, { role: Role.PATIENT });

    const profile = await createPatientProfile(fixture, "รายงานสังเคราะห์");
    const relationshipA = await createRelationship(fixture, profile.id, hospitalA.id, "A-LOCAL-01");
    const relationshipB = await createRelationship(fixture, profile.id, hospitalB.id, "B-LOCAL-01");
    const noProgramProfile = await createPatientProfile(fixture, "ไม่มีโปรแกรม");
    const relationshipWithoutProgram = await createRelationship(fixture, noProgramProfile.id, hospitalA.id, "A-LOCAL-02");

    const baseline = await prisma.patientBaseline.create({
      data: {
        patientHospitalRelationshipId: relationshipA.id,
        recordedByUserId: ownerA.userId,
        recordedOn: new Date("2026-08-16T00:00:00.000Z"),
        weight: 0,
        bloodSugarDtx: null,
        bloodPressureSystolic: 120,
      },
      select: { id: true },
    });
    fixture.baselineIds.push(baseline.id);
    const completedProgram = await createProgram(fixture, {
      relationshipId: relationshipA.id,
      createdByUserId: ownerA.userId,
      status: PatientProgramStatus.COMPLETED,
      initialBaselineId: baseline.id,
    });
    const activeProgram = await createProgram(fixture, {
      relationshipId: relationshipA.id,
      createdByUserId: ownerA.userId,
      status: PatientProgramStatus.ACTIVE,
    });
    await addProgramSources({ programId: completedProgram.id, relationshipId: relationshipA.id, recordedByUserId: ownerA.userId, rounds: 7 });
    const otherHospitalProgram = await createProgram(fixture, {
      relationshipId: relationshipB.id,
      createdByUserId: ownerB.userId,
      status: PatientProgramStatus.ACTIVE,
    });

    const firstPage = await getHospitalReportingPage(ownerA.actor, { hospitalId: hospitalA.id, pageSize: 1 });
    expect(firstPage.page.items).toHaveLength(1);
    expect(firstPage.page.nextCursor).toBeTruthy();
    const secondPage = await getHospitalReportingPage(ownerA.actor, {
      hospitalId: hospitalA.id,
      cursor: firstPage.page.nextCursor ?? undefined,
      pageSize: 1,
    });
    expect(secondPage.page.items).toHaveLength(1);
    expect(secondPage.page.items[0]?.patientProgramId).not.toBe(firstPage.page.items[0]?.patientProgramId);

    const page = await getHospitalReportingPage(ownerA.actor, { hospitalId: hospitalA.id, pageSize: 20 });
    expect(page.counts).toEqual({
      patientHospitalRelationships: { grain: "PATIENT_HOSPITAL_RELATIONSHIP", value: 2 },
      relationshipsWithoutProgram: { grain: "PATIENT_HOSPITAL_RELATIONSHIP", value: 1 },
      programs: { grain: "PATIENT_PROGRAM", total: 2, active: 1, completed: 1 },
    });
    expect(page.page.items.some(({ patientHospitalRelationshipId }) => patientHospitalRelationshipId === relationshipWithoutProgram.id)).toBe(false);
    expect(page.page.items.map(({ patientProgramId }) => patientProgramId).sort()).toEqual([activeProgram.id, completedProgram.id].sort());
    const activeRow = page.page.items.find(({ patientProgramId }) => patientProgramId === activeProgram.id);
    const completedRow = page.page.items.find(({ patientProgramId }) => patientProgramId === completedProgram.id);
    expect(activeRow?.lifecycle).toMatchObject({ status: PatientProgramStatus.ACTIVE, completedAt: { state: "NOT_RECORDED" } });
    expect(completedRow?.lifecycle).toMatchObject({ status: PatientProgramStatus.COMPLETED, completedAt: { state: "RECORDED" } });
    expect(completedRow?.baseline).toMatchObject({ state: "PRESENT", value: { measurements: { weight: { state: "RECORDED", value: 0 }, bloodSugar: { state: "NOT_RECORDED" } } } });
    expect(completedRow?.finalAssessment).toEqual({ state: "MISSING" });
    expect(completedRow?.followups).toMatchObject({ totalCount: 7, hasMore: true });
    expect(JSON.stringify(page)).not.toContain("SYNTHETIC_PRIVATE_NOTE");
    expect(page.page.items.some(({ patientProgramId }) => patientProgramId === otherHospitalProgram.id)).toBe(false);

    const exportDataset = await getHospitalReportingDatasetForExport(ownerA.actor, { hospitalId: hospitalA.id });
    expect(exportDataset.programs).toHaveLength(2);
    expect(exportDataset.programs.find(({ patientProgramId }) => patientProgramId === completedProgram.id)?.followups.items).toHaveLength(7);
    expect(exportDataset.programs.some(({ patientProgramId }) => patientProgramId === otherHospitalProgram.id)).toBe(false);

    const generatedExport = await exportHospitalReportingWorkbook(ownerA.actor, { hospitalId: hospitalA.id });
    expect(generatedExport.buffer.subarray(0, 2).toString("ascii")).toBe("PK");
    const exportAudit = await prisma.auditEvent.findFirst({
      where: {
        actorUserId: ownerA.userId,
        action: "hospital_reporting.export.prepared",
        resourceType: "Hospital",
        resourceId: hospitalA.id,
      },
      select: { metadata: true },
    });
    expect(exportAudit?.metadata).toMatchObject({
      capability: "hospital:report:export",
      outcome: "prepared",
      programCount: 2,
      generatedAt: generatedExport.generatedAt.toISOString(),
    });
    expect(JSON.stringify(exportAudit?.metadata)).not.toContain("โรงพยาบาลทดสอบ");
    expect(JSON.stringify(exportAudit?.metadata)).not.toContain("SYNTHETIC_PRIVATE_NOTE");

    await expect(getHospitalReportingPage(memberA.actor, { hospitalId: hospitalA.id })).rejects.toBeInstanceOf(NotFoundError);
    await expect(getHospitalReportingDatasetForExport(memberA.actor, { hospitalId: hospitalA.id })).rejects.toBeInstanceOf(NotFoundError);
    await expect(getHospitalReportingPage(ownerB.actor, { hospitalId: hospitalA.id })).rejects.toBeInstanceOf(NotFoundError);
    await expect(getHospitalReportingPage(osm.actor, { hospitalId: hospitalA.id })).rejects.toBeInstanceOf(NotFoundError);
    await expect(getHospitalReportingPage(admin.actor, { hospitalId: hospitalA.id })).rejects.toBeInstanceOf(NotFoundError);
    await expect(getHospitalReportingPage(patientRole.actor, { hospitalId: hospitalA.id })).rejects.toBeInstanceOf(NotFoundError);
    await expect(getHospitalReportingPage(ownerParent.actor, { hospitalId: hospitalA.id })).rejects.toBeInstanceOf(NotFoundError);
    await expect(getHospitalReportingPage(ownerA.actor, { hospitalId: parent.id })).rejects.toBeInstanceOf(NotFoundError);
    await expect(getHospitalReportingPage(ownerSuspendedMembership.actor, { hospitalId: hospitalA.id })).rejects.toBeInstanceOf(NotFoundError);
    await expect(getHospitalReportingPage(suspendedUser.actor, { hospitalId: hospitalA.id })).rejects.toBeInstanceOf(NotFoundError);
    await expect(getHospitalReportingPage(ownerSuspendedHospital.actor, { hospitalId: suspendedHospital.id })).rejects.toBeInstanceOf(NotFoundError);

    const existingProgramReport = await getProgramReportingProjection(
      memberA.actor,
      relationshipA.id,
      completedProgram.id,
    );
    expect(existingProgramReport.patientProgramId).toBe(completedProgram.id);

    await prisma.hospitalMembership.updateMany({ where: { userId: ownerA.userId, hospitalId: hospitalA.id, status: { not: "ENDED" } },
      data: { status: MembershipStatus.SUSPENDED },
    });
    await expect(getHospitalReportingPage(ownerA.actor, {
      hospitalId: hospitalA.id,
      cursor: firstPage.page.nextCursor ?? undefined,
      pageSize: 1,
    })).rejects.toBeInstanceOf(NotFoundError);
    await expect(getHospitalReportingPage(ownerA.actor, { hospitalId: hospitalA.id })).rejects.toBeInstanceOf(NotFoundError);
    await expect(getHospitalReportingDatasetForExport(ownerA.actor, { hospitalId: hospitalA.id })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("collects export sources in a bounded PostgreSQL RepeatableRead snapshot", async () => {
    const fixture = newFixture();
    currentFixture = fixture;
    const hospital = await createHospital(fixture, { name: "โรงพยาบาล Snapshot" });
    const owner = await createActor(fixture, { role: Role.HOSPITAL, hospital });
    const profile = await createPatientProfile(fixture, "Snapshot");
    const relationship = await createRelationship(fixture, profile.id, hospital.id, "SNAPSHOT-01");
    await createProgram(fixture, {
      relationshipId: relationship.id,
      createdByUserId: owner.userId,
      status: PatientProgramStatus.ACTIVE,
    });

    const countReached = deferred();
    const continueRead = deferred();
    const observedOptions: { value: unknown } = { value: null };
    const adapter = repeatableReadAdapter(async () => {
      countReached.resolve();
      await continueRead.promise;
    }, observedOptions);
    const exportPromise = getHospitalReportingDatasetForExport(
      owner.actor,
      { hospitalId: hospital.id },
      { database: adapter },
    );

    await countReached.promise;
    const concurrentProgram = await prisma.patientProgram.create({
      data: {
        patientHospitalRelationshipId: relationship.id,
        createdByUserId: owner.userId,
        status: PatientProgramStatus.COMPLETED,
        startedAt: new Date("2026-08-17T05:00:00.000Z"),
        completedAt: new Date("2026-09-02T05:00:00.000Z"),
      },
      select: { id: true },
    });
    fixture.programIds.push(concurrentProgram.id);
    continueRead.resolve();

    const snapshot = await exportPromise;
    expect(observedOptions.value).toEqual({
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      maxWait: 5_000,
      timeout: 25_000,
    });
    expect(snapshot.counts.programs.total).toBe(1);
    expect(snapshot.programs).toHaveLength(1);
    expect(snapshot.programs.some(({ patientProgramId }) => patientProgramId === concurrentProgram.id)).toBe(false);
    expect(await prisma.patientProgram.count({ where: { patientHospitalRelationshipId: relationship.id } })).toBe(2);
  });

  it("withholds the finalized Dashboard projection when membership is revoked after Program data is read", async () => {
    const fixture = newFixture();
    currentFixture = fixture;
    const hospital = await createHospital(fixture, { name: "โรงพยาบาลเพิกถอนสิทธิ์" });
    const owner = await createActor(fixture, { role: Role.HOSPITAL, hospital });
    const profile = await createPatientProfile(fixture, "ข้อมูลสังเคราะห์สำหรับทดสอบการเพิกถอน");
    const relationship = await createRelationship(fixture, profile.id, hospital.id, "REVOKE-01");
    await createProgram(fixture, {
      relationshipId: relationship.id,
      createdByUserId: owner.userId,
      status: PatientProgramStatus.ACTIVE,
    });

    await expect(getHospitalReportingPage(
      owner.actor,
      { hospitalId: hospital.id },
      { database: dashboardReadWithMembershipRevocationAfterProgramLoad(owner.userId, hospital.id) },
    )).rejects.toBeInstanceOf(NotFoundError);
    await expect(prisma.hospitalMembership.findFirst({ where: { userId: owner.userId, hospitalId: hospital.id, status: { not: "ENDED" } },
      select: { status: true },
    })).resolves.toMatchObject({ status: MembershipStatus.SUSPENDED });
  });

  it("serves only the selected Hospital to an active ADMIN and reuses the customer workbook", async () => {
    const fixture = newFixture();
    currentFixture = fixture;
    const parent = await createHospital(fixture, { name: "โรงพยาบาลแม่ข่ายสังเคราะห์" });
    const child = await createHospital(fixture, { name: "หน่วยบริการลูกสังเคราะห์", parentHospitalId: parent.id });
    const sibling = await createHospital(fixture, { name: "หน่วยบริการพี่น้องสังเคราะห์", parentHospitalId: parent.id });
    const pending = await createHospital(fixture, {
      name: "หน่วยบริการรอตรวจสอบสังเคราะห์",
      status: HospitalStatus.PENDING_VERIFICATION,
      parentHospitalId: parent.id,
    });
    const suspended = await createHospital(fixture, {
      name: "หน่วยบริการระงับสังเคราะห์",
      status: HospitalStatus.SUSPENDED,
      parentHospitalId: parent.id,
    });
    const admin = await createActor(fixture, { role: Role.ADMIN });
    const childOwner = await createActor(fixture, { role: Role.HOSPITAL, hospital: child });
    const parentOwner = await createActor(fixture, { role: Role.HOSPITAL, hospital: parent });

    const childProfile = await createPatientProfile(fixture, "ระเบียนลูกที่เลือก");
    const childRelationship = await createRelationship(fixture, childProfile.id, child.id, "GLOBAL-CHILD-01");
    const childProgram = await createProgram(fixture, {
      relationshipId: childRelationship.id,
      createdByUserId: childOwner.userId,
      status: PatientProgramStatus.ACTIVE,
    });
    const parentProfile = await createPatientProfile(fixture, "ระเบียนแม่ที่ไม่เลือก");
    const parentRelationship = await createRelationship(fixture, parentProfile.id, parent.id, "GLOBAL-PARENT-01");
    const parentProgram = await createProgram(fixture, {
      relationshipId: parentRelationship.id,
      createdByUserId: parentOwner.userId,
      status: PatientProgramStatus.ACTIVE,
    });
    const siblingProfile = await createPatientProfile(fixture, "ระเบียนพี่น้องที่ไม่เลือก");
    const siblingRelationship = await createRelationship(fixture, siblingProfile.id, sibling.id, "GLOBAL-SIBLING-01");
    const siblingProgram = await createProgram(fixture, {
      relationshipId: siblingRelationship.id,
      createdByUserId: parentOwner.userId,
      status: PatientProgramStatus.ACTIVE,
    });

    {
      const directory = await getGlobalReportingDirectory(admin.actor);
      const parentGroup = directory.hierarchy.groups.find(({ mainHospital }) => mainHospital.id === parent.id);
      expect(parentGroup?.directChildren.map(({ id }) => id).sort()).toEqual(
        [child.id, sibling.id, pending.id, suspended.id].sort(),
      );
      expect(directory.statusCounts).toMatchObject({
        [HospitalStatus.ACTIVE]: expect.any(Number),
        [HospitalStatus.PENDING_VERIFICATION]: expect.any(Number),
        [HospitalStatus.SUSPENDED]: expect.any(Number),
      });
      expect(directory.statusCounts[HospitalStatus.PENDING_VERIFICATION]).toBeGreaterThanOrEqual(1);
      expect(directory.statusCounts[HospitalStatus.SUSPENDED]).toBeGreaterThanOrEqual(1);

      const globalPage = await getGlobalAdminHospitalReportingPage(admin.actor, { hospitalId: child.id, pageSize: 20 });
      const ownerPage = await getHospitalReportingPage(childOwner.actor, { hospitalId: child.id, pageSize: 20 });
      expect(globalPage.page.items.map(({ patientProgramId }) => patientProgramId)).toEqual([childProgram.id]);
      expect(globalPage.counts).toEqual(ownerPage.counts);
      expect(globalPage.page.items).toEqual(ownerPage.page.items);
      expect(globalPage.page.items.some(({ patientProgramId }) => [parentProgram.id, siblingProgram.id].includes(patientProgramId))).toBe(false);

      const dataset = await getGlobalAdminHospitalReportingDatasetForExport(admin.actor, { hospitalId: child.id });
      expect(dataset.programs.map(({ patientProgramId }) => patientProgramId)).toEqual([childProgram.id]);
      const generated = await exportGlobalAdminHospitalReportingWorkbook(admin.actor, { hospitalId: child.id });
      const workbook = new ExcelJS.Workbook();
      type ExcelJsInputBuffer = Parameters<typeof workbook.xlsx.load>[0];
      await workbook.xlsx.load(generated.buffer as unknown as ExcelJsInputBuffer);
      expect(workbook.worksheets.map(({ name }) => name)).toEqual(["Dashboard ภาพรวม", "รายงานการจัดบริการ"]);
      const workbookText = workbook.worksheets.flatMap((sheet) => {
        const values: string[] = [];
        sheet.eachRow((row) => row.eachCell({ includeEmpty: false }, (cell) => values.push(String(cell.value ?? ""))));
        return values;
      }).join(" ");
      expect(workbookText).toContain("ระเบียนลูกที่เลือก");
      expect(workbookText).not.toContain("ระเบียนแม่ที่ไม่เลือก");
      expect(workbookText).not.toContain("ระเบียนพี่น้องที่ไม่เลือก");
      expect(generated.hospitalCode).toBe(child.hospitalCode);

      const exportAudit = await prisma.auditEvent.findFirst({
        where: {
          actorUserId: admin.userId,
          action: "global_reporting.export.prepared",
          resourceId: child.id,
        },
        select: { metadata: true },
      });
      expect(exportAudit?.metadata).toMatchObject({
        capability: GLOBAL_REPORTING_CAPABILITIES.export,
        outcome: "prepared",
      });
      expect(JSON.stringify(exportAudit?.metadata)).not.toContain("ระเบียนลูกที่เลือก");

      await expect(getGlobalAdminHospitalReportingPage(admin.actor, { hospitalId: parent.id })).resolves.toMatchObject({
        counts: { programs: { total: 1 } },
      });
      await expect(getGlobalAdminHospitalReportingPage(admin.actor, { hospitalId: sibling.id })).resolves.toMatchObject({
        page: { items: [{ patientProgramId: siblingProgram.id }] },
      });
      await expect(getGlobalAdminHospitalReportingPage(admin.actor, { hospitalId: pending.id })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(getGlobalAdminHospitalReportingPage(admin.actor, { hospitalId: suspended.id })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(getGlobalAdminHospitalReportingDatasetForExport(admin.actor, { hospitalId: pending.id })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(getProgramReportingProjection(admin.actor, childRelationship.id, childProgram.id)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(getGlobalAdminHospitalReportingPage(childOwner.actor, { hospitalId: child.id })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(getGlobalAdminHospitalReportingPage(parentOwner.actor, { hospitalId: child.id })).rejects.toBeInstanceOf(ForbiddenError);
    }
  });

  it("rechecks current ADMIN status and denies suspended users or revoked ADMIN roles", async () => {
    const fixture = newFixture();
    currentFixture = fixture;
    const hospital = await createHospital(fixture, { name: "โรงพยาบาลควบคุมการปล่อยสังเคราะห์" });
    const admin = await createActor(fixture, { role: Role.ADMIN });
    const suspendedAdmin = await createActor(fixture, { role: Role.ADMIN, userStatus: UserStatus.SUSPENDED });

    await expect(resolveGlobalReportingAccessContext(
      admin.actor,
      GLOBAL_REPORTING_CAPABILITIES.hospitalRead,
      hospital.id,
    )).resolves.toMatchObject({ hospital: { id: hospital.id } });
    await expect(resolveGlobalReportingAccessContext(
      suspendedAdmin.actor,
      GLOBAL_REPORTING_CAPABILITIES.hospitalRead,
      hospital.id,
    )).rejects.toBeInstanceOf(ForbiddenError);

    await prisma.userRole.deleteMany({ where: { userId: admin.userId, role: Role.ADMIN } });
    await expect(resolveGlobalReportingAccessContext(
      admin.actor,
      GLOBAL_REPORTING_CAPABILITIES.hospitalRead,
      hospital.id,
    )).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("withholds a generated Global workbook when ADMIN access is revoked before file release", async () => {
    const fixture = newFixture();
    currentFixture = fixture;
    const hospital = await createHospital(fixture, { name: "โรงพยาบาลเพิกถอนก่อนส่งไฟล์สังเคราะห์" });
    const admin = await createActor(fixture, { role: Role.ADMIN });
    const originalResolve = globalReportingAccessModule.resolveGlobalReportingAccessContext;
    let authorizationChecks = 0;
    const authorizationSpy = vi.spyOn(globalReportingAccessModule, "resolveGlobalReportingAccessContext")
      .mockImplementation(async (...args: Parameters<typeof resolveGlobalReportingAccessContext>) => {
        authorizationChecks += 1;
        if (authorizationChecks === 3) throw new ForbiddenError();
        return originalResolve(...args);
      });

    try {
      await expect(
        exportGlobalAdminHospitalReportingWorkbook(admin.actor, { hospitalId: hospital.id }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    } finally {
      authorizationSpy.mockRestore();
    }

    expect(authorizationChecks).toBe(3);
    const exportAudits = await prisma.auditEvent.findMany({
      where: {
        actorUserId: admin.userId,
        resourceId: hospital.id,
        action: { in: ["global_reporting.export.prepared", "global_reporting.export.denied"] },
      },
      select: { action: true },
    });
    expect(exportAudits).toEqual([{ action: "global_reporting.export.denied" }]);
  });

  it("authorizes one current direct Child report target only through a current Parent OWNER", async () => {
    const fixture = newFixture();
    currentFixture = fixture;
    const parentA = await createHospital(fixture, { name: "โรงพยาบาลแม่ข่าย A สังเคราะห์" });
    const parentB = await createHospital(fixture, { name: "โรงพยาบาลแม่ข่าย B สังเคราะห์" });
    const child = await createHospital(fixture, { name: "โรงพยาบาลลูกข่ายสังเคราะห์", parentHospitalId: parentA.id });
    const sibling = await createHospital(fixture, { name: "โรงพยาบาลพี่น้องสังเคราะห์", parentHospitalId: parentA.id });
    const grandchild = await createHospital(fixture, { name: "โรงพยาบาลหลานสังเคราะห์", parentHospitalId: child.id });
    const unrelated = await createHospital(fixture, { name: "โรงพยาบาลอื่นสังเคราะห์" });
    const parentOwner = await createActor(fixture, { role: Role.HOSPITAL, hospital: parentA });
    const member = await createActor(fixture, {
      role: Role.HOSPITAL,
      hospital: parentA,
      membershipType: MembershipType.MEMBER,
    });
    const childOwner = await createActor(fixture, { role: Role.HOSPITAL, hospital: child });
    const admin = await createActor(fixture, { role: Role.ADMIN });
    const osm = await createActor(fixture, { role: Role.OSM, hospital: parentA });
    const patient = await createActor(fixture, { role: Role.PATIENT });
    const inactiveOwner = await createActor(fixture, {
      role: Role.HOSPITAL,
      hospital: parentA,
      userStatus: UserStatus.SUSPENDED,
    });
    const revokedOwner = await createActor(fixture, { role: Role.HOSPITAL, hospital: parentA });
    const roleRemovedOwner = await createActor(fixture, { role: Role.HOSPITAL, hospital: parentA });
    const parentBOwner = await createActor(fixture, { role: Role.HOSPITAL, hospital: parentB });

    await prisma.userRole.create({ data: { userId: childOwner.userId, role: Role.ADMIN } });
    await prisma.userRole.create({ data: { userId: parentOwner.userId, role: Role.ADMIN } });
    await prisma.userRole.create({ data: { userId: roleRemovedOwner.userId, role: Role.ADMIN } });
    const multiRoleParentOwner: ActorContext = {
      ...parentOwner.actor,
      roles: [Role.HOSPITAL, Role.ADMIN],
    };
    const multiRoleChildOwner: ActorContext = {
      ...childOwner.actor,
      roles: [Role.HOSPITAL, Role.ADMIN],
    };
    const multiRoleRoleRemovedOwner: ActorContext = {
      ...roleRemovedOwner.actor,
      roles: [Role.HOSPITAL, Role.ADMIN],
    };

    const access = await resolveParentChildHospitalReportAccessContext(
      multiRoleParentOwner,
      parentA.id,
      child.id,
    );
    expect(access).toEqual({
      actorId: multiRoleParentOwner.userId,
      capability: "hospital-network:child-report:read",
      parentHospitalId: parentA.id,
      hospital: { id: child.id, status: HospitalStatus.ACTIVE, parentHospitalId: parentA.id },
    });
    expect(Object.keys(access.hospital).sort()).toEqual(["id", "parentHospitalId", "status"]);
    expect(await prisma.hospitalMembership.findFirst({ where: { userId: parentOwner.userId, hospitalId: child.id, status: { not: "ENDED" } },
      select: { id: true },
    })).toBeNull();

    await expect(resolveParentChildHospitalReportAccessContext(member.actor, parentA.id, child.id))
      .rejects.toBeInstanceOf(ForbiddenError);
    await expect(resolveParentChildHospitalReportAccessContext(multiRoleChildOwner, parentA.id, child.id))
      .rejects.toBeInstanceOf(ForbiddenError);
    await expect(resolveParentChildHospitalReportAccessContext(admin.actor, parentA.id, child.id))
      .rejects.toBeInstanceOf(ForbiddenError);
    await expect(resolveParentChildHospitalReportAccessContext(osm.actor, parentA.id, child.id))
      .rejects.toBeInstanceOf(ForbiddenError);
    await expect(resolveParentChildHospitalReportAccessContext(patient.actor, parentA.id, child.id))
      .rejects.toBeInstanceOf(ForbiddenError);
    await expect(resolveParentChildHospitalReportAccessContext(inactiveOwner.actor, parentA.id, child.id))
      .rejects.toBeInstanceOf(NotFoundError);
    await expect(resolveParentChildHospitalReportAccessContext(parentOwner.actor, parentA.id, sibling.id))
      .resolves.toMatchObject({ hospital: { id: sibling.id } });
    await expect(resolveParentChildHospitalReportAccessContext(parentOwner.actor, parentA.id, grandchild.id))
      .rejects.toBeInstanceOf(NotFoundError);
    await expect(resolveParentChildHospitalReportAccessContext(parentOwner.actor, parentA.id, unrelated.id))
      .rejects.toBeInstanceOf(NotFoundError);
    await expect(resolveParentChildHospitalReportAccessContext(parentOwner.actor, parentA.id, parentB.id))
      .rejects.toBeInstanceOf(NotFoundError);
    await expect(resolveParentChildHospitalReportAccessContext(parentOwner.actor, parentA.id, parentA.id))
      .rejects.toBeInstanceOf(NotFoundError);
    await expect(resolveParentChildHospitalReportAccessContext(parentOwner.actor, "invalid-id", child.id))
      .rejects.toBeInstanceOf(NotFoundError);

    await expect(resolveParentChildHospitalReportAccessContext(revokedOwner.actor, parentA.id, child.id))
      .resolves.toMatchObject({ hospital: { id: child.id } });
    await prisma.hospitalMembership.updateMany({ where: { userId: revokedOwner.userId, hospitalId: parentA.id, status: { not: "ENDED" } },
      data: { status: MembershipStatus.SUSPENDED },
    });
    await expect(resolveParentChildHospitalReportAccessContext(revokedOwner.actor, parentA.id, child.id))
      .rejects.toBeInstanceOf(NotFoundError);

    await expect(resolveParentChildHospitalReportAccessContext(multiRoleRoleRemovedOwner, parentA.id, child.id))
      .resolves.toMatchObject({ hospital: { id: child.id } });
    await prisma.userRole.delete({ where: { userId_role: { userId: roleRemovedOwner.userId, role: Role.HOSPITAL } } });
    await expect(resolveParentChildHospitalReportAccessContext(multiRoleRoleRemovedOwner, parentA.id, child.id))
      .rejects.toBeInstanceOf(NotFoundError);

    await expect(resolveParentChildHospitalReportAccessContext(parentOwner.actor, parentA.id, child.id))
      .resolves.toMatchObject({ hospital: { id: child.id } });
    await prisma.hospital.update({ where: { id: parentA.id }, data: { status: HospitalStatus.SUSPENDED } });
    await expect(resolveParentChildHospitalReportAccessContext(parentOwner.actor, parentA.id, child.id))
      .rejects.toBeInstanceOf(NotFoundError);
    await prisma.hospital.update({ where: { id: parentA.id }, data: { status: HospitalStatus.ACTIVE } });

    await expect(resolveParentChildHospitalReportAccessContext(parentOwner.actor, parentA.id, child.id))
      .resolves.toMatchObject({ hospital: { id: child.id } });
    await prisma.hospital.update({ where: { id: child.id }, data: { status: HospitalStatus.SUSPENDED } });
    await expect(resolveParentChildHospitalReportAccessContext(parentOwner.actor, parentA.id, child.id))
      .rejects.toBeInstanceOf(NotFoundError);
    await prisma.hospital.update({ where: { id: child.id }, data: { status: HospitalStatus.ACTIVE } });

    await expect(resolveParentChildHospitalReportAccessContext(parentBOwner.actor, parentB.id, child.id))
      .rejects.toBeInstanceOf(NotFoundError);
    await expect(resolveParentChildHospitalReportAccessContext(parentOwner.actor, parentA.id, child.id))
      .resolves.toMatchObject({ hospital: { id: child.id } });
    await prisma.hospital.update({ where: { id: child.id }, data: { parentHospitalId: parentB.id } });
    await expect(resolveParentChildHospitalReportAccessContext(parentOwner.actor, parentA.id, child.id))
      .rejects.toBeInstanceOf(NotFoundError);
    await expect(resolveParentChildHospitalReportAccessContext(parentBOwner.actor, parentB.id, child.id))
      .resolves.toMatchObject({ hospital: { id: child.id, parentHospitalId: parentB.id } });
  });

  it("serves exact Child summary values to a multi-role Parent OWNER without exposing person-level report fields", async () => {
    const fixture = newFixture();
    currentFixture = fixture;
    const parentA = await createHospital(fixture, { name: "โรงพยาบาลแม่ข่าย A สังเคราะห์" });
    const parentB = await createHospital(fixture, { name: "โรงพยาบาลแม่ข่าย B สังเคราะห์" });
    const child = await createHospital(fixture, { name: "โรงพยาบาลลูกข่าย A สังเคราะห์", parentHospitalId: parentA.id });
    const sibling = await createHospital(fixture, { name: "โรงพยาบาลลูกข่ายข้างเคียงสังเคราะห์", parentHospitalId: parentA.id });
    const grandchild = await createHospital(fixture, { name: "โรงพยาบาลหลานสังเคราะห์", parentHospitalId: child.id });
    const inactiveChild = await createHospital(fixture, {
      name: "โรงพยาบาลลูกข่ายระงับสังเคราะห์",
      parentHospitalId: parentA.id,
      status: HospitalStatus.SUSPENDED,
    });
    const childB = await createHospital(fixture, { name: "โรงพยาบาลลูกข่าย B สังเคราะห์", parentHospitalId: parentB.id });
    const parentOwner = await createActor(fixture, { role: Role.HOSPITAL, hospital: parentA });
    await prisma.hospitalMembership.create({
      data: {
        userId: parentOwner.userId,
        hospitalId: parentB.id,
        membershipType: MembershipType.OWNER,
        status: MembershipStatus.ACTIVE,
      },
    });
    await prisma.userRole.create({ data: { userId: parentOwner.userId, role: Role.ADMIN } });
    const multiParentOwner: ActorContext = {
      ...parentOwner.actor,
      roles: [Role.HOSPITAL, Role.ADMIN],
      hospitalMemberships: [
        ...parentOwner.actor.hospitalMemberships,
        {
          hospitalId: parentB.id,
          membershipType: MembershipType.OWNER,
          profession: null,
          status: MembershipStatus.ACTIVE,
          hospitalStatus: HospitalStatus.ACTIVE,
        },
      ],
    };
    const childOwner = await createActor(fixture, { role: Role.HOSPITAL, hospital: child });
    const admin = await createActor(fixture, { role: Role.ADMIN });
    const parentPatient = await createPatientProfile(fixture, "ระเบียนของโรงพยาบาลแม่");
    const childPatient = await createPatientProfile(fixture, "ชื่อผู้ป่วยที่ห้ามเปิดเผย");
    const childNoProgramPatient = await createPatientProfile(fixture, "ระเบียนลูกที่ไม่มี Program");
    const childCompletedPatient = await createPatientProfile(fixture, "ระเบียน Program ที่สิ้นสุดแล้ว");
    const siblingPatient = await createPatientProfile(fixture, "ชื่อผู้ป่วยโรงพยาบาลข้างเคียง");
    const childBPatient = await createPatientProfile(fixture, "ระเบียนของ Child นอก Parent ที่เลือก");
    const parentRelationship = await createRelationship(fixture, parentPatient.id, parentA.id, "PARENT-LOCAL-SECRET");
    const childRelationship = await createRelationship(fixture, childPatient.id, child.id, "CHILD-LOCAL-SECRET");
    await createRelationship(fixture, childNoProgramPatient.id, child.id, "CHILD-NO-PROGRAM");
    const childCompletedRelationship = await createRelationship(fixture, childCompletedPatient.id, child.id, "CHILD-COMPLETED");
    const siblingRelationship = await createRelationship(fixture, siblingPatient.id, sibling.id, "SIBLING-LOCAL-SECRET");
    const childBRelationship = await createRelationship(fixture, childBPatient.id, childB.id, "OTHER-PARENT-CHILD");
    const parentProgram = await createProgram(fixture, {
      relationshipId: parentRelationship.id,
      createdByUserId: parentOwner.userId,
      status: PatientProgramStatus.ACTIVE,
    });
    const childProgram = await createProgram(fixture, {
      relationshipId: childRelationship.id,
      createdByUserId: childOwner.userId,
      status: PatientProgramStatus.ACTIVE,
    });
    const completedChildProgram = await createProgram(fixture, {
      relationshipId: childCompletedRelationship.id,
      createdByUserId: childOwner.userId,
      status: PatientProgramStatus.COMPLETED,
    });
    const siblingProgram = await createProgram(fixture, {
      relationshipId: siblingRelationship.id,
      createdByUserId: childOwner.userId,
      status: PatientProgramStatus.ACTIVE,
    });
    await createProgram(fixture, {
      relationshipId: childBRelationship.id,
      createdByUserId: childOwner.userId,
      status: PatientProgramStatus.ACTIVE,
    });
    await prisma.patientProgramServiceOneRoutine.create({
      data: { patientProgramId: childProgram.id, recordedByUserId: childOwner.userId },
    });
    await prisma.patientProgramServiceOneFloatingChart.create({
      data: { patientProgramId: completedChildProgram.id, recordedByUserId: childOwner.userId },
    });
    await prisma.patientProgramServiceOneDreamCard.create({
      data: { patientProgramId: childProgram.id, recordedByUserId: childOwner.userId },
    });
    await prisma.patientProgramServiceOneConfidence.create({
      data: { patientProgramId: completedChildProgram.id, recordedByUserId: childOwner.userId, score: 5 },
    });

    const targets = await listParentChildHospitalReportTargetGroups(
      multiParentOwner,
      [parentA.id, parentB.id],
    );
    expect(targets).toHaveLength(2);
    expect(targets[0]).toMatchObject({
      parent: { id: parentA.id, name: parentA.name },
      children: expect.arrayContaining([
        { id: child.id, name: child.name },
        { id: sibling.id, name: sibling.name },
      ]),
    });
    expect(targets[0]?.children).toHaveLength(2);
    expect(targets[1]).toMatchObject({
      parent: { id: parentB.id, name: parentB.name },
      children: [{ id: childB.id, name: childB.name }],
    });
    expect(targets.flatMap(({ children }) => children.map(({ id }) => id)))
      .not.toContain(grandchild.id);
    expect(targets.flatMap(({ children }) => children.map(({ id }) => id)))
      .not.toContain(inactiveChild.id);
    expect(await prisma.hospitalMembership.findFirst({ where: { userId: parentOwner.userId, hospitalId: child.id, status: { not: "ENDED" } },
      select: { id: true },
    })).toBeNull();

    const ownParentReport = await getHospitalReportingPage(multiParentOwner, { hospitalId: parentA.id });
    expect(ownParentReport.counts).toEqual({
      patientHospitalRelationships: { grain: "PATIENT_HOSPITAL_RELATIONSHIP", value: 1 },
      relationshipsWithoutProgram: { grain: "PATIENT_HOSPITAL_RELATIONSHIP", value: 0 },
      programs: { grain: "PATIENT_PROGRAM", total: 1, active: 1, completed: 0 },
    });

    const parentChildProjection = await getParentChildHospitalReportingPage(multiParentOwner, {
      parentHospitalId: parentA.id,
      hospitalId: child.id,
    });
    expect(parentChildProjection).toEqual({
      operation: "PARENT_CHILD_REPORT",
      access: "PARENT_OWNER",
      parent: { id: parentA.id, name: parentA.name },
      hospital: { id: child.id, name: child.name },
      content: {
        state: "AVAILABLE",
        dashboard: {
          state: "AVAILABLE",
          value: {
            patientHospitalRelationships: { grain: "PATIENT_HOSPITAL_RELATIONSHIP", value: 3 },
            relationshipsWithoutProgram: { grain: "PATIENT_HOSPITAL_RELATIONSHIP", value: 1 },
            programs: { grain: "PATIENT_PROGRAM", total: 2, active: 1, completed: 1 },
          },
        },
        serviceProcess: {
          state: "AVAILABLE",
          value: {
            programsWithRoutineRecord: { grain: "PATIENT_PROGRAM", value: 1 },
            programsWithFloatingChartRecord: { grain: "PATIENT_PROGRAM", value: 1 },
            programsWithDreamCardRecord: { grain: "PATIENT_PROGRAM", value: 1 },
            programsWithConfidenceRecord: { grain: "PATIENT_PROGRAM", value: 1 },
          },
        },
      },
    });
    expect(JSON.stringify(parentChildProjection)).not.toContain("ชื่อผู้ป่วยที่ห้ามเปิดเผย");
    expect(JSON.stringify(parentChildProjection)).not.toContain("ชื่อผู้ป่วยโรงพยาบาลข้างเคียง");
    expect(JSON.stringify(parentChildProjection)).not.toContain(childPatient.id);
    expect(JSON.stringify(parentChildProjection)).not.toContain("CHILD-LOCAL-SECRET");
    expect(JSON.stringify(parentChildProjection)).not.toContain(childProgram.id);
    expect(JSON.stringify(parentChildProjection)).not.toContain(siblingProgram.id);
    expect(JSON.stringify(parentChildProjection)).not.toContain(parentProgram.id);
    expect(JSON.stringify(parentChildProjection)).not.toContain("PARENT-LOCAL-SECRET");
    expect(JSON.stringify(parentChildProjection)).not.toContain("CHILD-NO-PROGRAM");

    const parentReadAudit = await prisma.auditEvent.findFirst({
      where: {
        actorUserId: parentOwner.userId,
        action: "parent_child_reporting.access.read",
        resourceType: "Hospital",
        resourceId: child.id,
      },
      select: { actorUserId: true, action: true, resourceId: true, metadata: true, createdAt: true },
    });
    expect(parentReadAudit).toMatchObject({
      actorUserId: parentOwner.userId,
      action: "parent_child_reporting.access.read",
      resourceId: child.id,
      metadata: {
        operation: "PARENT_CHILD_REPORT",
        outcome: "read",
        parentHospitalId: parentA.id,
      },
    });
    expect(parentReadAudit?.createdAt).toBeInstanceOf(Date);
    expect(JSON.stringify(parentReadAudit?.metadata)).not.toMatch(/ชื่อผู้ป่วย|LOCAL-SECRET|ProgramId|count|bloodSugar/iu);

    await expect(getParentChildHospitalReportingPage(admin.actor, {
      parentHospitalId: parentA.id,
      hospitalId: child.id,
    })).rejects.toBeInstanceOf(ForbiddenError);
    const deniedAudit = await prisma.auditEvent.findFirst({
      where: {
        actorUserId: admin.userId,
        action: "parent_child_reporting.access.denied",
        resourceId: child.id,
      },
      select: { metadata: true },
    });
    expect(deniedAudit?.metadata).toMatchObject({
      operation: "PARENT_CHILD_REPORT",
      outcome: "denied",
      parentHospitalId: parentA.id,
      reason: "NOT_AUTHORIZED",
    });
    await expect(getParentChildHospitalReportingPage(multiParentOwner, {
      parentHospitalId: parentA.id,
      hospitalId: sibling.id,
      cursor: "direct-owner-cursor",
    })).rejects.toBeInstanceOf(NotFoundError);

    const directChildReport = await getHospitalReportingPage(childOwner.actor, { hospitalId: child.id });
    expect(parentChildProjection.content.dashboard.value).toEqual(directChildReport.counts);
    expect(directChildReport.counts).toEqual({
      patientHospitalRelationships: { grain: "PATIENT_HOSPITAL_RELATIONSHIP", value: 3 },
      relationshipsWithoutProgram: { grain: "PATIENT_HOSPITAL_RELATIONSHIP", value: 1 },
      programs: { grain: "PATIENT_PROGRAM", total: 2, active: 1, completed: 1 },
    });
    expect(directChildReport.page.items).toHaveLength(2);
    expect(directChildReport.page.items.some(({ patientProgramId }) => patientProgramId === siblingProgram.id)).toBe(false);
    expect(directChildReport.page.items.some(({ patientProgramId }) => patientProgramId === parentProgram.id)).toBe(false);
    expect(directChildReport.page.items.some(({ patientProgramId }) => patientProgramId === childProgram.id)).toBe(true);
    expect(directChildReport.page.items.some(({ patientProgramId }) => patientProgramId === completedChildProgram.id)).toBe(true);
    expect(directChildReport.page.items.find(({ patientProgramId }) => patientProgramId === childProgram.id)?.patient.displayName)
      .toBe("สมชาย ชื่อผู้ป่วยที่ห้ามเปิดเผย");
    expect(directChildReport.page.items.find(({ patientProgramId }) => patientProgramId === childProgram.id)?.serviceOne.routine.state)
      .toBe("PRESENT");
    expect(directChildReport.page.items.find(({ patientProgramId }) => patientProgramId === completedChildProgram.id)?.serviceOne.floatingChart.state)
      .toBe("PRESENT");

    await prisma.hospital.update({ where: { id: child.id }, data: { parentHospitalId: parentB.id } });
    await expect(getParentChildHospitalReportingPage(multiParentOwner, {
      parentHospitalId: parentA.id,
      hospitalId: child.id,
    })).rejects.toBeInstanceOf(NotFoundError);
    await expect(getParentChildHospitalReportingPage(multiParentOwner, {
      parentHospitalId: parentB.id,
      hospitalId: child.id,
    })).resolves.toMatchObject({
      parent: { id: parentB.id },
      hospital: { id: child.id },
      content: {
        dashboard: {
          state: "AVAILABLE",
          value: { patientHospitalRelationships: { value: 3 }, programs: { total: 2, active: 1, completed: 1 } },
        },
      },
    });

    await prisma.hospitalMembership.updateMany({ where: { userId: parentOwner.userId, hospitalId: parentB.id, status: { not: "ENDED" } },
      data: { status: MembershipStatus.SUSPENDED },
    });
    await expect(getParentChildHospitalReportingPage(multiParentOwner, {
      parentHospitalId: parentB.id,
      hospitalId: child.id,
    })).rejects.toBeInstanceOf(NotFoundError);
  });
});
