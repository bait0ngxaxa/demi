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
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { getProgramReportingProjection } from "@/modules/reporting/services/program-report-query-service";
import { exportHospitalReportingWorkbook } from "@/modules/reporting/services/hospital-report-workbook-service";
import {
  getHospitalReportingDatasetForExport,
  getHospitalReportingPage,
} from "@/modules/reporting/services/hospital-report-query-service";
import { NotFoundError } from "@/shared/errors/application-error";

const prisma = getPrisma();
const previousReportingEnabled = process.env.DEMI_HOSPITAL_REPORTING_ENABLED;
const previousProductionApproval = process.env.DEMI_HOSPITAL_REPORTING_PRODUCTION_APPROVED;
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
    await prisma.patientProgramServiceOneRoutine.deleteMany({ where: { patientProgramId: { in: programIds } } });
    await prisma.patientFinalAssessment.deleteMany({ where: { patientProgramId: { in: programIds } } });
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
      where: { actorUserId: { in: fixture.userIds }, action: "hospital_reporting.export.prepared" },
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
                    await prisma.hospitalMembership.update({
                      where: { userId_hospitalId: { userId, hospitalId } },
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
    process.env.DEMI_HOSPITAL_REPORTING_ENABLED = "true";
    delete process.env.DEMI_HOSPITAL_REPORTING_PRODUCTION_APPROVED;
    process.env.DEMI_HOSPITAL_REPORTING_CURSOR_SECRET = "synthetic-hospital-reporting-integration-secret";
    await prisma.$connect();
  });

  afterEach(async () => {
    if (currentFixture) await cleanFixture(currentFixture);
    currentFixture = null;
  });

  afterAll(async () => {
    if (previousReportingEnabled === undefined) delete process.env.DEMI_HOSPITAL_REPORTING_ENABLED;
    else process.env.DEMI_HOSPITAL_REPORTING_ENABLED = previousReportingEnabled;
    if (previousProductionApproval === undefined) delete process.env.DEMI_HOSPITAL_REPORTING_PRODUCTION_APPROVED;
    else process.env.DEMI_HOSPITAL_REPORTING_PRODUCTION_APPROVED = previousProductionApproval;
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

    await prisma.hospitalMembership.update({
      where: { userId_hospitalId: { userId: ownerA.userId, hospitalId: hospitalA.id } },
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
    await expect(prisma.hospitalMembership.findUnique({
      where: { userId_hospitalId: { userId: owner.userId, hospitalId: hospital.id } },
      select: { status: true },
    })).resolves.toMatchObject({ status: MembershipStatus.SUSPENDED });
  });
});
