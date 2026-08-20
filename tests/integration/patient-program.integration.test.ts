import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  PatientProgramStatus,
  Role,
  UserStatus,
} from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { assignOsmToPatient } from "@/modules/patient-assignment/services/patient-osm-assignment-service";
import { getPatientBaseline } from "@/modules/patient-baseline/services/patient-baseline-query-service";
import { createPatientBaseline } from "@/modules/patient-baseline/services/patient-baseline-service";
import {
  getPatientProgramDetail,
  getPatientProgramPageContext,
} from "@/modules/patient-program/services/patient-program-query-service";
import {
  completePatientProgram,
  openPatientProgram,
} from "@/modules/patient-program/services/patient-program-service";
import {
  recordPatientProgramServiceOneConfidence,
  recordPatientProgramServiceOneDreamCard,
  recordPatientProgramServiceOneFloatingChart,
  recordPatientProgramServiceOneRoutine,
} from "@/modules/patient-program/services/patient-program-service-one-service";
import { provisionPatient } from "@/modules/patient-provisioning/services/patient-provisioning-service";
import { ConflictError, ForbiddenError, NotFoundError } from "@/shared/errors/application-error";

const prisma = getPrisma();
let sequence = 0;

async function clearDatabase(): Promise<void> {
  await prisma.patientProgramServiceOneConfidence.deleteMany();
  await prisma.patientProgramServiceOneDreamCard.deleteMany();
  await prisma.patientProgramServiceOneFloatingChart.deleteMany();
  await prisma.patientProgramServiceOneRoutine.deleteMany();
  await prisma.patientProgram.deleteMany();
  await prisma.patientBaseline.deleteMany();
  await prisma.patientFollowupActivityProgress.deleteMany();
  await prisma.patientFollowup.deleteMany();
  await prisma.patientAppointment.deleteMany();
  await prisma.patientGoalItem.deleteMany();
  await prisma.patientGoalPlan.deleteMany();
  await prisma.screeningAssessment.deleteMany();
  await prisma.patientEvidenceArtifact.deleteMany();
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
): Promise<{ id: string }> {
  sequence += 1;
  return prisma.hospital.create({
    data: {
      hospitalCode: `PROGRAM-${code}-${sequence}`,
      name: `โรงพยาบาล Program ${code}`,
      status,
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
    data: { identityKeyHash: `program-hospital-${sequence}` },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: { personId: person.id, status: UserStatus.ACTIVE },
    select: { id: true },
  });
  const membershipType = input.membershipType ?? MembershipType.MEMBER;
  const hospital = await prisma.hospital.findUniqueOrThrow({
    where: { id: input.hospitalId },
    select: { status: true },
  });

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
          hospitalStatus: hospital.status,
        },
      ],
      osmHospitalRelationships: [],
    },
  };
}

async function createOsmActor(hospitalId: string): Promise<{ actor: ActorContext; userId: string }> {
  sequence += 1;
  const person = await prisma.person.create({
    data: { identityKeyHash: `program-osm-${sequence}` },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: { personId: person.id, status: UserStatus.ACTIVE },
    select: { id: true },
  });
  const hospital = await prisma.hospital.findUniqueOrThrow({
    where: { id: hospitalId },
    select: { status: true },
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
        {
          hospitalId,
          status: MembershipStatus.ACTIVE,
          hospitalStatus: hospital.status,
        },
      ],
    },
  };
}

async function createAdminActor(): Promise<ActorContext> {
  sequence += 1;
  const person = await prisma.person.create({
    data: { identityKeyHash: `program-admin-${sequence}` },
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

function baselineInput(relationshipId: string): Record<string, unknown> {
  return {
    patientHospitalRelationshipId: relationshipId,
    recordedOn: "2026-08-17",
    weight: 72.5,
    waistCircumference: 90,
    bloodPressureSystolic: 120,
    bloodPressureDiastolic: 80,
    bloodSugarDtx: 95,
    adaptationSummary: "สรุปข้อมูลตั้งต้น",
    adaptationObstacles: "อุปสรรค",
    adaptationOpportunities: "โอกาส",
    confidenceScore: 7,
    confidenceImprovementPlan: "แผน",
    summary: "สรุป",
    recommendations: "คำแนะนำ",
  };
}

async function createPatient(
  actor: ActorContext,
  hospitalId: string,
  value: string,
): Promise<{ relationshipId: string }> {
  const result = await provisionPatient(actor, {
    identity: { namespace: "program-integration", value },
    targetHospitalId: hospitalId,
    givenName: "สมชาย",
    familyName: "โปรแกรม",
    hospitalNumber: `HN-PROGRAM-${value}`,
  });

  return { relationshipId: result.relationshipId };
}

describe("Phase 15B.0 Patient Program PostgreSQL workflow", () => {
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

  it("opens and reads a relationship-scoped active Program with safe audit metadata", async () => {
    const hospital = await createHospital("OPEN");
    const owner = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.OWNER });
    const patient = await createPatient(owner.actor, hospital.id, "open");

    const opened = await openPatientProgram(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
    });
    const page = await getPatientProgramPageContext(owner.actor, patient.relationshipId);

    expect(opened).toMatchObject({
      operation: "OPENED",
      patientHospitalRelationshipId: patient.relationshipId,
      hospitalId: hospital.id,
      status: PatientProgramStatus.ACTIVE,
      completedAt: null,
    });
    expect(page.active).toMatchObject({
      programId: opened.patientProgramId,
      patientHospitalRelationshipId: patient.relationshipId,
      status: PatientProgramStatus.ACTIVE,
      initialBaseline: null,
    });
    expect(await prisma.patientProgram.count({
      where: { patientHospitalRelationshipId: patient.relationshipId, status: PatientProgramStatus.ACTIVE },
    })).toBe(1);
    const audit = await prisma.auditEvent.findFirst({
      where: { action: "patient_program.created", resourceId: opened.patientProgramId },
    });
    expect(audit?.actorUserId).toBe(owner.userId);
    expect(JSON.stringify(audit?.metadata)).not.toContain("weight");
    expect(JSON.stringify(audit?.metadata)).not.toContain("bloodPressure");
  });

  it("enforces exact Hospital/OSM scope and denies ADMIN-only access", async () => {
    const hospital = await createHospital("SCOPE");
    const otherHospital = await createHospital("OTHER");
    const owner = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.OWNER });
    const otherOwner = await createHospitalActor({
      hospitalId: otherHospital.id,
      membershipType: MembershipType.OWNER,
    });
    const osm = await createOsmActor(hospital.id);
    const unrelatedOsm = await createOsmActor(hospital.id);
    const admin = await createAdminActor();
    const patient = await createPatient(owner.actor, hospital.id, "scope");

    await assignOsmToPatient(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
      osmUserId: osm.userId,
    });
    const opened = await openPatientProgram(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
    });

    await expect(
      getPatientProgramDetail(otherOwner.actor, patient.relationshipId, opened.patientProgramId),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      getPatientProgramDetail(unrelatedOsm.actor, patient.relationshipId, opened.patientProgramId),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      getPatientProgramDetail(admin, patient.relationshipId, opened.patientProgramId),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      getPatientProgramDetail(osm.actor, patient.relationshipId, opened.patientProgramId),
    ).resolves.toMatchObject({ programId: opened.patientProgramId });
    await expect(
      recordPatientProgramServiceOneRoutine(osm.actor, {
        patientProgramId: opened.patientProgramId,
      }),
    ).resolves.toMatchObject({ activity: "ROUTINE", operation: "RECORDED" });
    await expect(
      recordPatientProgramServiceOneDreamCard(unrelatedOsm.actor, {
        patientProgramId: opened.patientProgramId,
        description: "ไม่ควรเข้าถึง",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      recordPatientProgramServiceOneFloatingChart(otherOwner.actor, {
        patientProgramId: opened.patientProgramId,
        summary: "ไม่ควรเข้าถึง",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      recordPatientProgramServiceOneConfidence(admin, {
        patientProgramId: opened.patientProgramId,
        score: 5,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("protects the one-active invariant under concurrent open requests", async () => {
    const hospital = await createHospital("CONCURRENT");
    const owner = await createHospitalActor({ hospitalId: hospital.id });
    const patient = await createPatient(owner.actor, hospital.id, "concurrent");
    const input = { patientHospitalRelationshipId: patient.relationshipId };

    const outcomes = await Promise.allSettled([
      openPatientProgram(owner.actor, input),
      openPatientProgram(owner.actor, input),
    ]);
    const fulfilled = outcomes.filter((outcome) => outcome.status === "fulfilled");
    const rejected = outcomes.filter((outcome) => outcome.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(ConflictError);
    expect(await prisma.patientProgram.count({
      where: { patientHospitalRelationshipId: patient.relationshipId, status: PatientProgramStatus.ACTIVE },
    })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { action: "patient_program.created" } })).toBe(1);
  });

  it("converges concurrent Program opening and Baseline creation to one linked initial context", async () => {
    const hospital = await createHospital("PROGRAM-BASELINE-RACE");
    const owner = await createHospitalActor({ hospitalId: hospital.id });
    const patient = await createPatient(owner.actor, hospital.id, "program-baseline-race");

    const [opened, baseline] = await Promise.all([
      openPatientProgram(owner.actor, {
        patientHospitalRelationshipId: patient.relationshipId,
      }),
      createPatientBaseline(owner.actor, baselineInput(patient.relationshipId)),
    ]);
    const activeProgram = await prisma.patientProgram.findUniqueOrThrow({
      where: { id: opened.patientProgramId },
    });

    expect(await prisma.patientProgram.count({
      where: {
        patientHospitalRelationshipId: patient.relationshipId,
        status: PatientProgramStatus.ACTIVE,
      },
    })).toBe(1);
    expect(await prisma.patientBaseline.count({
      where: { patientHospitalRelationshipId: patient.relationshipId },
    })).toBe(1);
    expect(activeProgram.initialBaselineId).toBe(baseline.patientBaselineId);
    expect(await prisma.auditEvent.count({
      where: { action: "patient_program.created", resourceId: opened.patientProgramId },
    })).toBe(1);
    expect(await prisma.auditEvent.count({
      where: { action: "patient_baseline.created", resourceId: baseline.patientBaselineId },
    })).toBe(1);
  });

  it("does not reuse a historical Baseline for a later episode", async () => {
    const hospital = await createHospital("HISTORY");
    const owner = await createHospitalActor({ hospitalId: hospital.id });
    const patient = await createPatient(owner.actor, hospital.id, "history");
    const baseline = await createPatientBaseline(owner.actor, baselineInput(patient.relationshipId));
    const first = await openPatientProgram(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
    });
    const firstBeforeCompletion = await prisma.patientProgram.findUniqueOrThrow({
      where: { id: first.patientProgramId },
    });

    const completed = await completePatientProgram(owner.actor, {
      patientProgramId: first.patientProgramId,
    });
    const repeated = await completePatientProgram(owner.actor, {
      patientProgramId: first.patientProgramId,
    });
    const second = await openPatientProgram(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
    });
    const firstAfterCompletion = await prisma.patientProgram.findUniqueOrThrow({
      where: { id: first.patientProgramId },
    });
    const secondStored = await prisma.patientProgram.findUniqueOrThrow({
      where: { id: second.patientProgramId },
    });
    const page = await getPatientProgramPageContext(owner.actor, patient.relationshipId);

    expect(firstBeforeCompletion.initialBaselineId).toBe(baseline.patientBaselineId);
    expect(completed).toMatchObject({ operation: "COMPLETED", status: PatientProgramStatus.COMPLETED });
    expect(repeated).toMatchObject({
      operation: "ALREADY_COMPLETED",
      completedAt: completed.completedAt,
    });
    expect(second.status).toBe(PatientProgramStatus.ACTIVE);
    expect(secondStored.initialBaselineId).toBeNull();
    expect(firstAfterCompletion.initialBaselineId).toBe(baseline.patientBaselineId);
    expect(firstAfterCompletion.status).toBe(PatientProgramStatus.COMPLETED);
    expect(page.active?.programId).toBe(second.patientProgramId);
    expect(page.history.map((program) => program.programId)).toEqual([
      second.patientProgramId,
      first.patientProgramId,
    ]);
    expect(await prisma.auditEvent.count({ where: { action: "patient_program.completed" } })).toBe(1);
    expect(await getPatientProgramDetail(owner.actor, patient.relationshipId, first.patientProgramId)).toMatchObject({
      programId: first.patientProgramId,
      status: PatientProgramStatus.COMPLETED,
    });
  });

  it("associates the exact Baseline identity and rejects cross-relationship or invalid lifecycle rows", async () => {
    const hospital = await createHospital("BASELINE");
    const owner = await createHospitalActor({ hospitalId: hospital.id });
    const patient = await createPatient(owner.actor, hospital.id, "baseline");
    const opened = await openPatientProgram(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
    });
    const baseline = await createPatientBaseline(owner.actor, baselineInput(patient.relationshipId));
    const stored = await prisma.patientProgram.findUniqueOrThrow({ where: { id: opened.patientProgramId } });

    expect(stored.initialBaselineId).toBe(baseline.patientBaselineId);
    expect((await getPatientBaseline(owner.actor, patient.relationshipId))?.id).toBe(
      baseline.patientBaselineId,
    );

    const otherPatient = await createPatient(owner.actor, hospital.id, "other-baseline");
    await createPatientBaseline(owner.actor, baselineInput(otherPatient.relationshipId));

    await expect(
      prisma.patientProgram.create({
        data: {
          patientHospitalRelationshipId: otherPatient.relationshipId,
          initialBaselineId: baseline.patientBaselineId,
          createdByUserId: owner.userId,
          status: PatientProgramStatus.ACTIVE,
        },
      }),
    ).rejects.toBeDefined();

    await expect(
      prisma.patientProgram.create({
        data: {
          patientHospitalRelationshipId: otherPatient.relationshipId,
          createdByUserId: owner.userId,
          status: PatientProgramStatus.ACTIVE,
          completedAt: new Date("2026-08-18T00:00:00.000Z"),
        },
      }),
    ).rejects.toBeDefined();
  });

  it("records Service 1 progressively and exposes structural detail without an overall completion claim", async () => {
    const hospital = await createHospital("SERVICE-ONE-PROGRESS");
    const owner = await createHospitalActor({ hospitalId: hospital.id });
    const patient = await createPatient(owner.actor, hospital.id, "service-one-progress");
    const opened = await openPatientProgram(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
    });

    const empty = await getPatientProgramDetail(
      owner.actor,
      patient.relationshipId,
      opened.patientProgramId,
    );
    expect(empty.serviceOne).toMatchObject({
      routine: { recorded: false, recordedAt: null, recordedBy: null },
      floatingChart: { recorded: false, summary: null },
      dreamCard: { recorded: false, description: null },
      confidence: { recorded: false, score: null, improvementPlan: null },
    });

    await recordPatientProgramServiceOneRoutine(
      owner.actor,
      { patientProgramId: opened.patientProgramId },
      { now: () => new Date("2026-08-20T05:00:00.000Z") },
    );
    await recordPatientProgramServiceOneFloatingChart(
      owner.actor,
      { patientProgramId: opened.patientProgramId, summary: "  สรุปจากกราฟ  " },
      { now: () => new Date("2026-08-20T05:01:00.000Z") },
    );
    await recordPatientProgramServiceOneDreamCard(
      owner.actor,
      { patientProgramId: opened.patientProgramId, description: "  ความฝัน  " },
      { now: () => new Date("2026-08-20T05:02:00.000Z") },
    );
    await recordPatientProgramServiceOneConfidence(
      owner.actor,
      { patientProgramId: opened.patientProgramId, score: 0, improvementPlan: "  แผนสะท้อนผล  " },
      { now: () => new Date("2026-08-20T05:03:00.000Z") },
    );

    const detail = await getPatientProgramDetail(
      owner.actor,
      patient.relationshipId,
      opened.patientProgramId,
    );
    expect(detail.serviceOne).toMatchObject({
      routine: { recorded: true },
      floatingChart: { recorded: true, summary: "สรุปจากกราฟ" },
      dreamCard: { recorded: true, description: "ความฝัน" },
      confidence: { recorded: true, score: 0, improvementPlan: "แผนสะท้อนผล" },
    });
    expect(JSON.stringify(detail.serviceOne)).not.toContain("membership");
    expect(await prisma.patientProgramServiceOneRoutine.count({ where: { patientProgramId: opened.patientProgramId } })).toBe(1);
    expect(await prisma.patientProgramServiceOneFloatingChart.count({ where: { patientProgramId: opened.patientProgramId } })).toBe(1);
    expect(await prisma.patientProgramServiceOneDreamCard.count({ where: { patientProgramId: opened.patientProgramId } })).toBe(1);
    expect(await prisma.patientProgramServiceOneConfidence.count({ where: { patientProgramId: opened.patientProgramId } })).toBe(1);

    const auditMetadata = await prisma.auditEvent.findMany({
      where: { action: { startsWith: "patient_program.service_one." } },
      select: { action: true, metadata: true },
    });
    expect(auditMetadata.filter(({ action }) => action.startsWith("patient_program.service_one.")).length).toBe(4);
    expect(JSON.stringify(auditMetadata)).not.toContain("สรุปจากกราฟ");
    expect(JSON.stringify(auditMetadata)).not.toContain("ความฝัน");
    expect(JSON.stringify(auditMetadata)).not.toContain("แผนสะท้อนผล");
    expect(JSON.stringify(auditMetadata)).not.toContain("\"score\"");
  });

  it("does not overwrite one-time activity records and audits only the first successful write", async () => {
    const hospital = await createHospital("SERVICE-ONE-IMMUTABLE");
    const owner = await createHospitalActor({ hospitalId: hospital.id });
    const patient = await createPatient(owner.actor, hospital.id, "service-one-immutable");
    const opened = await openPatientProgram(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
    });

    const firstRoutine = await recordPatientProgramServiceOneRoutine(owner.actor, {
      patientProgramId: opened.patientProgramId,
    });
    const repeatedRoutine = await recordPatientProgramServiceOneRoutine(owner.actor, {
      patientProgramId: opened.patientProgramId,
    });
    expect(firstRoutine.operation).toBe("RECORDED");
    expect(repeatedRoutine).toMatchObject({
      operation: "ALREADY_RECORDED",
      recordId: firstRoutine.recordId,
      recordedAt: firstRoutine.recordedAt,
    });

    const firstChart = await recordPatientProgramServiceOneFloatingChart(owner.actor, {
      patientProgramId: opened.patientProgramId,
      summary: "ข้อมูลเดิม",
    });
    await expect(
      recordPatientProgramServiceOneFloatingChart(owner.actor, {
        patientProgramId: opened.patientProgramId,
        summary: "ข้อมูลใหม่",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(
      await prisma.patientProgramServiceOneFloatingChart.findUniqueOrThrow({
        where: { patientProgramId: opened.patientProgramId },
        select: { id: true, summary: true },
      }),
    ).toEqual({ id: firstChart.recordId, summary: "ข้อมูลเดิม" });
    expect(await prisma.auditEvent.count({
      where: { action: "patient_program.service_one.routine_recorded" },
    })).toBe(1);
    expect(await prisma.auditEvent.count({
      where: { action: "patient_program.service_one.floating_chart_recorded" },
    })).toBe(1);
  });

  it("keeps historical Service 1 readable after Program completion and rejects new writes", async () => {
    const hospital = await createHospital("SERVICE-ONE-HISTORY");
    const owner = await createHospitalActor({ hospitalId: hospital.id });
    const patient = await createPatient(owner.actor, hospital.id, "service-one-history");
    const opened = await openPatientProgram(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
    });
    await recordPatientProgramServiceOneRoutine(owner.actor, {
      patientProgramId: opened.patientProgramId,
    });

    const completed = await completePatientProgram(owner.actor, {
      patientProgramId: opened.patientProgramId,
    });
    await expect(
      recordPatientProgramServiceOneConfidence(owner.actor, {
        patientProgramId: opened.patientProgramId,
        score: 10,
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    const historical = await getPatientProgramDetail(
      owner.actor,
      patient.relationshipId,
      opened.patientProgramId,
    );
    expect(historical).toMatchObject({
      status: PatientProgramStatus.COMPLETED,
      serviceOne: {
        routine: { recorded: true },
        confidence: { recorded: false, score: null },
      },
    });
    expect(completed.operation).toBe("COMPLETED");
  });

  it("protects concurrent duplicate routine submissions with one record and one audit", async () => {
    const hospital = await createHospital("SVC1-CONCURRENT");
    const owner = await createHospitalActor({ hospitalId: hospital.id });
    const patient = await createPatient(owner.actor, hospital.id, "service-one-concurrent");
    const opened = await openPatientProgram(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
    });

    const outcomes = await Promise.allSettled([
      recordPatientProgramServiceOneRoutine(owner.actor, {
        patientProgramId: opened.patientProgramId,
      }),
      recordPatientProgramServiceOneRoutine(owner.actor, {
        patientProgramId: opened.patientProgramId,
      }),
    ]);
    const fulfilled = outcomes.filter(
      (outcome): outcome is PromiseFulfilledResult<Awaited<ReturnType<typeof recordPatientProgramServiceOneRoutine>>> =>
        outcome.status === "fulfilled",
    );

    expect(fulfilled).toHaveLength(2);
    expect(new Set(fulfilled.map(({ value }) => value.operation))).toEqual(
      new Set(["RECORDED", "ALREADY_RECORDED"]),
    );
    expect(await prisma.patientProgramServiceOneRoutine.count({
      where: { patientProgramId: opened.patientProgramId },
    })).toBe(1);
    expect(await prisma.auditEvent.count({
      where: { action: "patient_program.service_one.routine_recorded" },
    })).toBe(1);
  });

  it("serializes a Service 1 write against Program completion", async () => {
    const hospital = await createHospital("SVC1-COMPLETION-RACE");
    const owner = await createHospitalActor({ hospitalId: hospital.id });
    const patient = await createPatient(owner.actor, hospital.id, "service-one-completion-race");
    const opened = await openPatientProgram(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
    });

    const outcomes = await Promise.allSettled([
      recordPatientProgramServiceOneFloatingChart(owner.actor, {
        patientProgramId: opened.patientProgramId,
        summary: "แข่งกับการจบโปรแกรม",
      }),
      completePatientProgram(owner.actor, { patientProgramId: opened.patientProgramId }),
    ]);
    const storedProgram = await prisma.patientProgram.findUniqueOrThrow({
      where: { id: opened.patientProgramId },
      select: { status: true, completedAt: true },
    });
    const storedChart = await prisma.patientProgramServiceOneFloatingChart.findUnique({
      where: { patientProgramId: opened.patientProgramId },
      select: { recordedAt: true },
    });

    expect(storedProgram.status).toBe(PatientProgramStatus.COMPLETED);
    expect(storedProgram.completedAt).not.toBeNull();
    if (storedChart) {
      expect(storedChart.recordedAt.getTime()).toBeLessThanOrEqual(storedProgram.completedAt?.getTime() ?? 0);
      expect(outcomes[0]?.status).toBe("fulfilled");
    } else {
      expect(outcomes[0]?.status).toBe("rejected");
      expect((outcomes[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);
    }
  });

  it("enforces activity cardinality and the database confidence range", async () => {
    const hospital = await createHospital("SVC1-CONSTRAINTS");
    const owner = await createHospitalActor({ hospitalId: hospital.id });
    const patient = await createPatient(owner.actor, hospital.id, "service-one-constraints");
    const opened = await openPatientProgram(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
    });
    await recordPatientProgramServiceOneConfidence(owner.actor, {
      patientProgramId: opened.patientProgramId,
      score: 5,
    });

    await expect(
      prisma.patientProgramServiceOneConfidence.create({
        data: {
          patientProgramId: opened.patientProgramId,
          recordedByUserId: owner.userId,
          score: 6,
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });

    const secondPatient = await createPatient(owner.actor, hospital.id, "service-one-score-check");
    const secondProgram = await openPatientProgram(owner.actor, {
      patientHospitalRelationshipId: secondPatient.relationshipId,
    });
    await expect(
      prisma.patientProgramServiceOneConfidence.create({
        data: {
          patientProgramId: secondProgram.patientProgramId,
          recordedByUserId: owner.userId,
          score: 11,
        },
      }),
    ).rejects.toBeDefined();
  });
});
