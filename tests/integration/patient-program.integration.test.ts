import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  PatientProgramStatus,
  Role,
  UserStatus,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  assignOsmToPatient,
  unassignOsmFromPatient,
} from "@/modules/patient-assignment/services/patient-osm-assignment-service";
import { getPatientBaseline } from "@/modules/patient-baseline/services/patient-baseline-query-service";
import { createPatientBaseline } from "@/modules/patient-baseline/services/patient-baseline-service";
import { createPatientEvidenceArtifact } from "@/modules/patient-evidence/services/patient-evidence-service";
import type { PatientEvidenceStorage } from "@/modules/patient-evidence/storage/patient-evidence-storage";
import {
  getGoalPlanCreateContextForProgram,
  getGoalPlanDetailForProgram,
  getGoalPlanOverview,
  getGoalPlanOverviewForProgram,
} from "@/modules/goals/services/goal-query-service";
import { createGoalPlan, createGoalPlanForProgram } from "@/modules/goals/services/goal-service";
import { GOAL_TEMPLATE_KEY, GOAL_TEMPLATE_VERSION } from "@/modules/goals/domain/goal-templates";
import {
  getFollowupCreateContext,
  getFollowupCreateContextForProgram,
  getFollowupDetailForProgram,
  getFollowupHistory,
  getFollowupHistoryForProgram,
} from "@/modules/followups/services/followup-query-service";
import { createFollowup, createFollowupForProgram } from "@/modules/followups/services/followup-service";
import {
  getPatientProgramDetail,
  getPatientProgramPageContext,
} from "@/modules/patient-program/services/patient-program-query-service";
import {
  completePatientProgram,
  openPatientProgram,
} from "@/modules/patient-program/services/patient-program-service";
import {
  associatePatientProgramServiceOneArtifact,
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
  await prisma.patientProgramServiceOneArtifactAssociation.deleteMany();
  await prisma.patientProgramServiceOneConfidence.deleteMany();
  await prisma.patientProgramServiceOneDreamCard.deleteMany();
  await prisma.patientProgramServiceOneFloatingChart.deleteMany();
  await prisma.patientProgramServiceOneRoutine.deleteMany();
  await prisma.patientFollowupActivityProgress.deleteMany();
  await prisma.patientFollowup.deleteMany();
  await prisma.patientAppointment.deleteMany();
  await prisma.patientGoalItem.deleteMany();
  await prisma.patientGoalPlan.deleteMany();
  await prisma.patientProgram.deleteMany();
  await prisma.patientBaseline.deleteMany();
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

function createFakeStorage(): PatientEvidenceStorage {
  return {
    uploadObject: async () => undefined,
    createTemporaryAccessUrl: async ({ objectKey }) => `https://fake-storage.invalid/${objectKey}`,
    removeObject: async () => undefined,
  };
}

function jpegBytes(): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0x00]);
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

function goalProgramInput(
  patientProgramId: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    patientProgramId,
    submissionNonce: randomUUID(),
    sourceScreeningAssessmentId: null,
    primaryGoalCode: "weight",
    primaryGoalNote: "เป้าหมายของโปรแกรม",
    weeklyNote: "บันทึกของโปรแกรม",
    items: [
      { activityCode: "stop_sweet", targetDays: 4 },
      { activityCode: "exercise_walk", targetDays: 3, targetValue: 15, targetUnit: "minutes" },
    ],
    ...overrides,
  };
}

function followupProgramInput(
  patientProgramId: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    patientProgramId,
    submissionNonce: randomUUID(),
    appointmentId: null,
    sourceGoalPlanId: null,
    weight: 72.5,
    waistCircumference: 90,
    systolicBloodPressure: 120,
    diastolicBloodPressure: 80,
    bloodSugar: 95,
    confidenceScore: 7,
    reflectionNote: "บันทึกสะท้อนของโปรแกรม",
    confidencePlan: "แผนความมั่นใจของโปรแกรม",
    generalNote: "หมายเหตุของโปรแกรม",
    activityProgress: [],
    ...overrides,
  };
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
    const artifact = await createPatientEvidenceArtifact(
      owner.actor,
      {
        relationshipId: patient.relationshipId,
        declaredMediaType: "image/jpeg",
        bytes: jpegBytes(),
      },
      { storage: createFakeStorage() },
    );
    await expect(
      associatePatientProgramServiceOneArtifact(osm.actor, {
        patientProgramId: opened.patientProgramId,
        patientEvidenceArtifactId: artifact.artifactId,
        activity: "ROUTINE",
      }),
    ).resolves.toMatchObject({ activity: "ROUTINE", operation: "ASSOCIATED" });
    await expect(
      associatePatientProgramServiceOneArtifact(unrelatedOsm.actor, {
        patientProgramId: opened.patientProgramId,
        patientEvidenceArtifactId: artifact.artifactId,
        activity: "ROUTINE",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      associatePatientProgramServiceOneArtifact(admin, {
        patientProgramId: opened.patientProgramId,
        patientEvidenceArtifactId: artifact.artifactId,
        activity: "ROUTINE",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
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

  it("rechecks an OSM assignment when a stale Program page submits a Program workflow mutation", async () => {
    const hospital = await createHospital("OSM-DRIFT");
    const owner = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.OWNER });
    const osm = await createOsmActor(hospital.id);
    const patient = await createPatient(owner.actor, hospital.id, "osm-drift");

    await assignOsmToPatient(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
      osmUserId: osm.userId,
    });
    const opened = await openPatientProgram(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
    });

    await expect(
      getPatientProgramDetail(osm.actor, patient.relationshipId, opened.patientProgramId),
    ).resolves.toMatchObject({ programId: opened.patientProgramId });

    await unassignOsmFromPatient(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
    });

    await expect(
      recordPatientProgramServiceOneRoutine(osm.actor, {
        patientProgramId: opened.patientProgramId,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      createGoalPlanForProgram(osm.actor, goalProgramInput(opened.patientProgramId)),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      createFollowupForProgram(osm.actor, followupProgramInput(opened.patientProgramId)),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      getPatientProgramDetail(osm.actor, patient.relationshipId, opened.patientProgramId),
    ).rejects.toBeInstanceOf(NotFoundError);
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

  it("associates one relationship-owned artifact with each explicit image-bearing activity", async () => {
    const hospital = await createHospital("SERVICE-ONE-EVIDENCE");
    const owner = await createHospitalActor({ hospitalId: hospital.id });
    const patient = await createPatient(owner.actor, hospital.id, "service-one-evidence");
    const opened = await openPatientProgram(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
    });

    await recordPatientProgramServiceOneRoutine(owner.actor, {
      patientProgramId: opened.patientProgramId,
    });
    await recordPatientProgramServiceOneFloatingChart(owner.actor, {
      patientProgramId: opened.patientProgramId,
      summary: "สรุปที่บันทึกไว้",
    });
    await recordPatientProgramServiceOneDreamCard(owner.actor, {
      patientProgramId: opened.patientProgramId,
      description: "ความฝันที่บันทึกไว้",
    });

    const storage = createFakeStorage();
    const routineArtifact = await createPatientEvidenceArtifact(
      owner.actor,
      { relationshipId: patient.relationshipId, declaredMediaType: "image/jpeg", bytes: jpegBytes() },
      { storage },
    );
    const floatingChartArtifact = await createPatientEvidenceArtifact(
      owner.actor,
      { relationshipId: patient.relationshipId, declaredMediaType: "image/jpeg", bytes: jpegBytes() },
      { storage },
    );
    const dreamCardArtifact = await createPatientEvidenceArtifact(
      owner.actor,
      { relationshipId: patient.relationshipId, declaredMediaType: "image/jpeg", bytes: jpegBytes() },
      { storage },
    );

    await expect(
      associatePatientProgramServiceOneArtifact(owner.actor, {
        patientProgramId: opened.patientProgramId,
        patientEvidenceArtifactId: routineArtifact.artifactId,
        activity: "ROUTINE",
      }),
    ).resolves.toMatchObject({ activity: "ROUTINE", operation: "ASSOCIATED" });
    await expect(
      associatePatientProgramServiceOneArtifact(owner.actor, {
        patientProgramId: opened.patientProgramId,
        patientEvidenceArtifactId: floatingChartArtifact.artifactId,
        activity: "FLOATING_CHART",
      }),
    ).resolves.toMatchObject({ activity: "FLOATING_CHART", operation: "ASSOCIATED" });
    await expect(
      associatePatientProgramServiceOneArtifact(owner.actor, {
        patientProgramId: opened.patientProgramId,
        patientEvidenceArtifactId: dreamCardArtifact.artifactId,
        activity: "DREAM_CARD",
      }),
    ).resolves.toMatchObject({ activity: "DREAM_CARD", operation: "ASSOCIATED" });

    const detail = await getPatientProgramDetail(
      owner.actor,
      patient.relationshipId,
      opened.patientProgramId,
    );
    expect(detail.serviceOne).toMatchObject({
      routine: { evidence: { artifactId: routineArtifact.artifactId, mediaType: "image/jpeg" } },
      floatingChart: { evidence: { artifactId: floatingChartArtifact.artifactId } },
      dreamCard: { evidence: { artifactId: dreamCardArtifact.artifactId } },
    });
    expect(detail.serviceOne.confidence).not.toHaveProperty("evidence");
    expect(JSON.stringify(detail.serviceOne)).not.toContain("storageObjectKey");
    expect(await prisma.patientProgramServiceOneArtifactAssociation.count({
      where: { patientProgramId: opened.patientProgramId },
    })).toBe(3);
    expect(await prisma.auditEvent.count({
      where: { action: "patient_program.service_one.artifact_attached" },
    })).toBe(3);
  });

  it("keeps evidence immutable across activities, relationships, and Programs", async () => {
    const hospital = await createHospital("EVID-INT");
    const owner = await createHospitalActor({ hospitalId: hospital.id });
    const firstPatient = await createPatient(owner.actor, hospital.id, "service-one-evidence-first");
    const secondPatient = await createPatient(owner.actor, hospital.id, "service-one-evidence-second");
    const firstProgram = await openPatientProgram(owner.actor, {
      patientHospitalRelationshipId: firstPatient.relationshipId,
    });
    const secondProgram = await openPatientProgram(owner.actor, {
      patientHospitalRelationshipId: secondPatient.relationshipId,
    });
    await recordPatientProgramServiceOneRoutine(owner.actor, { patientProgramId: firstProgram.patientProgramId });
    await recordPatientProgramServiceOneFloatingChart(owner.actor, { patientProgramId: firstProgram.patientProgramId });
    await recordPatientProgramServiceOneRoutine(owner.actor, { patientProgramId: secondProgram.patientProgramId });

    const storage = createFakeStorage();
    const firstArtifact = await createPatientEvidenceArtifact(
      owner.actor,
      { relationshipId: firstPatient.relationshipId, declaredMediaType: "image/jpeg", bytes: jpegBytes() },
      { storage },
    );
    const secondArtifact = await createPatientEvidenceArtifact(
      owner.actor,
      { relationshipId: secondPatient.relationshipId, declaredMediaType: "image/jpeg", bytes: jpegBytes() },
      { storage },
    );
    const firstRoutine = await prisma.patientProgramServiceOneRoutine.findUniqueOrThrow({
      where: { patientProgramId: firstProgram.patientProgramId },
      select: { id: true },
    });
    await expect(
      prisma.patientProgramServiceOneArtifactAssociation.create({
        data: {
          patientProgramId: firstProgram.patientProgramId,
          patientHospitalRelationshipId: secondPatient.relationshipId,
          patientEvidenceArtifactId: firstArtifact.artifactId,
          routineId: firstRoutine.id,
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });

    await associatePatientProgramServiceOneArtifact(owner.actor, {
      patientProgramId: firstProgram.patientProgramId,
      patientEvidenceArtifactId: firstArtifact.artifactId,
      activity: "ROUTINE",
    });
    await expect(
      associatePatientProgramServiceOneArtifact(owner.actor, {
        patientProgramId: firstProgram.patientProgramId,
        patientEvidenceArtifactId: firstArtifact.artifactId,
        activity: "ROUTINE",
      }),
    ).resolves.toMatchObject({ operation: "ALREADY_ASSOCIATED" });
    await expect(
      associatePatientProgramServiceOneArtifact(owner.actor, {
        patientProgramId: firstProgram.patientProgramId,
        patientEvidenceArtifactId: firstArtifact.artifactId,
        activity: "FLOATING_CHART",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      associatePatientProgramServiceOneArtifact(owner.actor, {
        patientProgramId: firstProgram.patientProgramId,
        patientEvidenceArtifactId: secondArtifact.artifactId,
        activity: "ROUTINE",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

    await completePatientProgram(owner.actor, { patientProgramId: firstProgram.patientProgramId });
    const laterProgram = await openPatientProgram(owner.actor, {
      patientHospitalRelationshipId: firstPatient.relationshipId,
    });
    await recordPatientProgramServiceOneRoutine(owner.actor, { patientProgramId: laterProgram.patientProgramId });
    await expect(
      associatePatientProgramServiceOneArtifact(owner.actor, {
        patientProgramId: laterProgram.patientProgramId,
        patientEvidenceArtifactId: firstArtifact.artifactId,
        activity: "ROUTINE",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      associatePatientProgramServiceOneArtifact(owner.actor, {
        patientProgramId: firstProgram.patientProgramId,
        patientEvidenceArtifactId: secondArtifact.artifactId,
        activity: "ROUTINE",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
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
    const storage = createFakeStorage();
    const historicalArtifact = await createPatientEvidenceArtifact(
      owner.actor,
      {
        relationshipId: patient.relationshipId,
        declaredMediaType: "image/jpeg",
        bytes: jpegBytes(),
      },
      { storage },
    );
    await associatePatientProgramServiceOneArtifact(owner.actor, {
      patientProgramId: opened.patientProgramId,
      patientEvidenceArtifactId: historicalArtifact.artifactId,
      activity: "ROUTINE",
    });
    const unassociatedArtifact = await createPatientEvidenceArtifact(
      owner.actor,
      {
        relationshipId: patient.relationshipId,
        declaredMediaType: "image/jpeg",
        bytes: jpegBytes(),
      },
      { storage },
    );

    const completed = await completePatientProgram(owner.actor, {
      patientProgramId: opened.patientProgramId,
    });
    await expect(
      recordPatientProgramServiceOneConfidence(owner.actor, {
        patientProgramId: opened.patientProgramId,
        score: 10,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      associatePatientProgramServiceOneArtifact(owner.actor, {
        patientProgramId: opened.patientProgramId,
        patientEvidenceArtifactId: unassociatedArtifact.artifactId,
        activity: "ROUTINE",
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
        routine: { recorded: true, evidence: { artifactId: historicalArtifact.artifactId } },
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

  it("keeps concurrent evidence associations single-owner and orders completion safely", async () => {
    const hospital = await createHospital("EVID-RACE");
    const owner = await createHospitalActor({ hospitalId: hospital.id });
    const patient = await createPatient(owner.actor, hospital.id, "service-one-evidence-concurrent");
    const opened = await openPatientProgram(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
    });
    await recordPatientProgramServiceOneRoutine(owner.actor, {
      patientProgramId: opened.patientProgramId,
    });

    const storage = createFakeStorage();
    const firstArtifact = await createPatientEvidenceArtifact(
      owner.actor,
      { relationshipId: patient.relationshipId, declaredMediaType: "image/jpeg", bytes: jpegBytes() },
      { storage },
    );
    const secondArtifact = await createPatientEvidenceArtifact(
      owner.actor,
      { relationshipId: patient.relationshipId, declaredMediaType: "image/jpeg", bytes: jpegBytes() },
      { storage },
    );
    const associationOutcomes = await Promise.allSettled([
      associatePatientProgramServiceOneArtifact(owner.actor, {
        patientProgramId: opened.patientProgramId,
        patientEvidenceArtifactId: firstArtifact.artifactId,
        activity: "ROUTINE",
      }),
      associatePatientProgramServiceOneArtifact(owner.actor, {
        patientProgramId: opened.patientProgramId,
        patientEvidenceArtifactId: secondArtifact.artifactId,
        activity: "ROUTINE",
      }),
    ]);
    const associationFulfilled = associationOutcomes.filter(
      (outcome): outcome is PromiseFulfilledResult<Awaited<ReturnType<typeof associatePatientProgramServiceOneArtifact>>> =>
        outcome.status === "fulfilled",
    );
    const associationRejected = associationOutcomes.filter((outcome) => outcome.status === "rejected");

    expect(associationFulfilled).toHaveLength(1);
    expect(associationRejected).toHaveLength(1);
    expect(associationRejected[0]?.reason).toBeInstanceOf(ConflictError);
    expect(await prisma.patientProgramServiceOneArtifactAssociation.count({
      where: { patientProgramId: opened.patientProgramId },
    })).toBe(1);

    const racePatient = await createPatient(owner.actor, hospital.id, "service-one-evidence-completion-race");
    const raceProgram = await openPatientProgram(owner.actor, {
      patientHospitalRelationshipId: racePatient.relationshipId,
    });
    await recordPatientProgramServiceOneRoutine(owner.actor, {
      patientProgramId: raceProgram.patientProgramId,
    });
    const raceArtifact = await createPatientEvidenceArtifact(
      owner.actor,
      { relationshipId: racePatient.relationshipId, declaredMediaType: "image/jpeg", bytes: jpegBytes() },
      { storage },
    );
    const raceOutcomes = await Promise.allSettled([
      associatePatientProgramServiceOneArtifact(owner.actor, {
        patientProgramId: raceProgram.patientProgramId,
        patientEvidenceArtifactId: raceArtifact.artifactId,
        activity: "ROUTINE",
      }),
      completePatientProgram(owner.actor, { patientProgramId: raceProgram.patientProgramId }),
    ]);
    const storedProgram = await prisma.patientProgram.findUniqueOrThrow({
      where: { id: raceProgram.patientProgramId },
      select: { status: true, completedAt: true },
    });
    const storedAssociation = await prisma.patientProgramServiceOneArtifactAssociation.findUnique({
      where: {
        patientEvidenceArtifactId_patientHospitalRelationshipId: {
          patientEvidenceArtifactId: raceArtifact.artifactId,
          patientHospitalRelationshipId: racePatient.relationshipId,
        },
      },
      select: { createdAt: true },
    });

    expect(storedProgram.status).toBe(PatientProgramStatus.COMPLETED);
    expect(storedProgram.completedAt).not.toBeNull();
    if (storedAssociation) {
      expect(storedAssociation.createdAt.getTime()).toBeLessThanOrEqual(storedProgram.completedAt?.getTime() ?? 0);
      expect(raceOutcomes[0]?.status).toBe("fulfilled");
    } else {
      expect(raceOutcomes[0]?.status).toBe("rejected");
      expect((raceOutcomes[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);
    }
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

  it("isolates Goal Plans and Follow-ups by Program while preserving relationship history", async () => {
    const hospital = await createHospital("SERVICE-TWO-LINKAGE");
    const owner = await createHospitalActor({ hospitalId: hospital.id });
    const patient = await createPatient(owner.actor, hospital.id, "service-two-linkage");
    const legacyGoal = await createGoalPlan(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
      submissionNonce: randomUUID(),
      sourceScreeningAssessmentId: null,
      primaryGoalCode: "weight",
      primaryGoalNote: "ประวัติแผนก่อน Program",
      weeklyNote: null,
      items: [{ activityCode: "stop_sweet", targetDays: 4 }],
    });
    const legacyFollowup = await createFollowup(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
      submissionNonce: randomUUID(),
      appointmentId: null,
      sourceGoalPlanId: null,
      weight: 71,
      waistCircumference: null,
      systolicBloodPressure: null,
      diastolicBloodPressure: null,
      bloodSugar: null,
      confidenceScore: null,
      reflectionNote: null,
      confidencePlan: null,
      generalNote: "ประวัติติดตามก่อน Program",
      activityProgress: [],
    });
    const programA = await openPatientProgram(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
    });
    const goalA1 = await createGoalPlanForProgram(
      owner.actor,
      goalProgramInput(programA.patientProgramId),
    );
    const goalA2 = await createGoalPlanForProgram(
      owner.actor,
      goalProgramInput(programA.patientProgramId, { primaryGoalCode: "glucose" }),
    );
    const followupA1 = await createFollowupForProgram(
      owner.actor,
      followupProgramInput(programA.patientProgramId),
    );
    const followupA2 = await createFollowupForProgram(
      owner.actor,
      followupProgramInput(programA.patientProgramId, { weight: 70.5 }),
    );
    await expect(
      getGoalPlanCreateContextForProgram(owner.actor, programA.patientProgramId),
    ).resolves.toMatchObject({ patientProgramId: programA.patientProgramId });

    await completePatientProgram(owner.actor, { patientProgramId: programA.patientProgramId });
    const programB = await openPatientProgram(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
    });
    const goalB1 = await createGoalPlanForProgram(
      owner.actor,
      goalProgramInput(programB.patientProgramId),
    );
    const followupB1 = await createFollowupForProgram(
      owner.actor,
      followupProgramInput(programB.patientProgramId),
    );
    await expect(
      getFollowupCreateContextForProgram(owner.actor, programB.patientProgramId),
    ).resolves.toMatchObject({ patientProgramId: programB.patientProgramId, selectedGoalPlanId: null });

    expect(await prisma.patientGoalPlan.findMany({
      where: { patientHospitalRelationshipId: patient.relationshipId },
      orderBy: { createdAt: "asc" },
      select: { id: true, patientProgramId: true, roundNumber: true },
    })).toEqual([
      { id: legacyGoal.goalPlanId, patientProgramId: null, roundNumber: 1 },
      { id: goalA1.goalPlanId, patientProgramId: programA.patientProgramId, roundNumber: 1 },
      { id: goalA2.goalPlanId, patientProgramId: programA.patientProgramId, roundNumber: 2 },
      { id: goalB1.goalPlanId, patientProgramId: programB.patientProgramId, roundNumber: 1 },
    ]);
    expect(await prisma.patientFollowup.findMany({
      where: { patientHospitalRelationshipId: patient.relationshipId },
      orderBy: { createdAt: "asc" },
      select: { id: true, patientProgramId: true, roundNumber: true },
    })).toEqual([
      { id: legacyFollowup.followupId, patientProgramId: null, roundNumber: 1 },
      { id: followupA1.followupId, patientProgramId: programA.patientProgramId, roundNumber: 1 },
      { id: followupA2.followupId, patientProgramId: programA.patientProgramId, roundNumber: 2 },
      { id: followupB1.followupId, patientProgramId: programB.patientProgramId, roundNumber: 1 },
    ]);

    const goalAHistory = await getGoalPlanOverviewForProgram(owner.actor, programA.patientProgramId);
    const goalBHistory = await getGoalPlanOverviewForProgram(owner.actor, programB.patientProgramId);
    const followupAHistory = await getFollowupHistoryForProgram(owner.actor, programA.patientProgramId);
    const followupBHistory = await getFollowupHistoryForProgram(owner.actor, programB.patientProgramId);

    expect(goalAHistory.items.map((item) => item.goalPlanId)).toEqual([goalA2.goalPlanId, goalA1.goalPlanId]);
    expect(goalAHistory.latest?.roundNumber).toBe(2);
    expect(goalBHistory.items.map((item) => item.goalPlanId)).toEqual([goalB1.goalPlanId]);
    expect(goalBHistory.latest?.roundNumber).toBe(1);
    expect(followupAHistory.items.map((item) => item.followupId)).toEqual([
      followupA2.followupId,
      followupA1.followupId,
    ]);
    expect(followupBHistory.items.map((item) => item.followupId)).toEqual([followupB1.followupId]);
    expect(followupAHistory.canRecord).toBe(false);
    expect(followupBHistory.canRecord).toBe(true);
    await expect(
      getGoalPlanDetailForProgram(owner.actor, programA.patientProgramId, goalA1.goalPlanId),
    ).resolves.toMatchObject({ patientProgramId: programA.patientProgramId, roundNumber: 1 });
    await expect(
      getFollowupDetailForProgram(owner.actor, programA.patientProgramId, followupA1.followupId),
    ).resolves.toMatchObject({ patientProgramId: programA.patientProgramId, roundNumber: 1 });

    const relationshipGoalHistory = await getGoalPlanOverview(owner.actor, patient.relationshipId);
    const relationshipFollowupHistory = await getFollowupHistory(owner.actor, patient.relationshipId);
    expect(new Set(relationshipGoalHistory.items.map((item) => item.goalPlanId))).toEqual(
      new Set([goalA2.goalPlanId, goalB1.goalPlanId, goalA1.goalPlanId, legacyGoal.goalPlanId]),
    );
    expect(relationshipGoalHistory.items.find((item) => item.goalPlanId === legacyGoal.goalPlanId)?.patientProgramId).toBeNull();
    expect(relationshipGoalHistory.items.find((item) => item.goalPlanId === goalA1.goalPlanId)?.patientProgramId).toBe(
      programA.patientProgramId,
    );
    expect(new Set(relationshipFollowupHistory.items.map((item) => item.followupId))).toEqual(
      new Set([legacyFollowup.followupId, followupA1.followupId, followupA2.followupId, followupB1.followupId]),
    );
    expect(relationshipFollowupHistory.items.find((item) => item.followupId === legacyFollowup.followupId)?.patientProgramId).toBeNull();
    expect(relationshipFollowupHistory.items.find((item) => item.followupId === followupA1.followupId)?.patientProgramId).toBe(
      programA.patientProgramId,
    );
    expect(goalAHistory.items.some((item) => item.goalPlanId === legacyGoal.goalPlanId)).toBe(false);
    expect(followupAHistory.items.some((item) => item.followupId === legacyFollowup.followupId)).toBe(false);
  });

  it("keeps compatibility Follow-ups inside the pre-Program Goal Plan namespace", async () => {
    const hospital = await createHospital("S2-COMPAT");
    const owner = await createHospitalActor({ hospitalId: hospital.id });
    const patient = await createPatient(owner.actor, hospital.id, "service-two-compatibility-goal");
    const legacyGoal = await createGoalPlan(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
      submissionNonce: randomUUID(),
      sourceScreeningAssessmentId: null,
      primaryGoalCode: "weight",
      primaryGoalNote: "แผนก่อน Program",
      weeklyNote: null,
      items: [{ activityCode: "stop_sweet", targetDays: 4 }],
    });
    const program = await openPatientProgram(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
    });
    const programGoal = await createGoalPlanForProgram(
      owner.actor,
      goalProgramInput(program.patientProgramId),
    );

    const context = await getFollowupCreateContext(owner.actor, patient.relationshipId);

    expect(context.goalPlans.map((goalPlan) => goalPlan.goalPlanId)).toEqual([legacyGoal.goalPlanId]);
    await expect(
      createFollowup(owner.actor, {
        patientHospitalRelationshipId: patient.relationshipId,
        submissionNonce: randomUUID(),
        appointmentId: null,
        sourceGoalPlanId: programGoal.goalPlanId,
        weight: null,
        waistCircumference: null,
        systolicBloodPressure: null,
        diastolicBloodPressure: null,
        bloodSugar: null,
        confidenceScore: null,
        reflectionNote: null,
        confidencePlan: null,
        generalNote: null,
        activityProgress: [],
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await prisma.patientFollowup.count({
      where: { patientHospitalRelationshipId: patient.relationshipId },
    })).toBe(0);

    const legacyFollowup = await createFollowup(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
      submissionNonce: randomUUID(),
      appointmentId: null,
      sourceGoalPlanId: legacyGoal.goalPlanId,
      weight: null,
      waistCircumference: null,
      systolicBloodPressure: null,
      diastolicBloodPressure: null,
      bloodSugar: null,
      confidenceScore: null,
      reflectionNote: null,
      confidencePlan: null,
      generalNote: null,
      activityProgress: [{ goalActivityCode: "stop_sweet", status: "DONE" }],
    });
    const programFollowup = await createFollowupForProgram(
      owner.actor,
      followupProgramInput(program.patientProgramId, {
        sourceGoalPlanId: programGoal.goalPlanId,
        activityProgress: [{ goalActivityCode: "stop_sweet", status: "DONE" }],
      }),
    );

    await expect(prisma.patientFollowup.findUniqueOrThrow({
      where: { id: legacyFollowup.followupId },
      select: { patientProgramId: true, sourceGoalPlanId: true },
    })).resolves.toEqual({ patientProgramId: null, sourceGoalPlanId: legacyGoal.goalPlanId });
    await expect(prisma.patientFollowup.findUniqueOrThrow({
      where: { id: programFollowup.followupId },
      select: { patientProgramId: true, sourceGoalPlanId: true },
    })).resolves.toEqual({
      patientProgramId: program.patientProgramId,
      sourceGoalPlanId: programGoal.goalPlanId,
    });
  });

  it("orders relationship history chronologically while retaining Program-local round order", async () => {
    const hospital = await createHospital("S2-ORDER");
    const owner = await createHospitalActor({ hospitalId: hospital.id });
    const patient = await createPatient(owner.actor, hospital.id, "service-two-history-order");
    const programA = await openPatientProgram(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
    });
    const goalA1 = await createGoalPlanForProgram(
      owner.actor,
      goalProgramInput(programA.patientProgramId),
      { now: () => new Date("2026-08-20T01:00:00.000Z") },
    );
    const goalA2 = await createGoalPlanForProgram(
      owner.actor,
      goalProgramInput(programA.patientProgramId),
      { now: () => new Date("2026-08-20T02:00:00.000Z") },
    );
    const followupA1 = await createFollowupForProgram(
      owner.actor,
      followupProgramInput(programA.patientProgramId),
      { now: () => new Date("2026-08-20T03:00:00.000Z") },
    );
    const followupA2 = await createFollowupForProgram(
      owner.actor,
      followupProgramInput(programA.patientProgramId),
      { now: () => new Date("2026-08-20T04:00:00.000Z") },
    );
    await completePatientProgram(owner.actor, { patientProgramId: programA.patientProgramId });
    const programB = await openPatientProgram(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
    });
    const goalB1 = await createGoalPlanForProgram(
      owner.actor,
      goalProgramInput(programB.patientProgramId),
      { now: () => new Date("2026-08-21T01:00:00.000Z") },
    );
    const followupB1 = await createFollowupForProgram(
      owner.actor,
      followupProgramInput(programB.patientProgramId),
      { now: () => new Date("2026-08-21T02:00:00.000Z") },
    );

    const relationshipGoals = await getGoalPlanOverview(owner.actor, patient.relationshipId);
    const programAGoals = await getGoalPlanOverviewForProgram(owner.actor, programA.patientProgramId);
    const relationshipFollowups = await getFollowupHistory(owner.actor, patient.relationshipId);
    const programAFollowups = await getFollowupHistoryForProgram(owner.actor, programA.patientProgramId);

    expect(relationshipGoals.latest?.goalPlanId).toBe(goalB1.goalPlanId);
    expect(relationshipGoals.items.map((item) => item.goalPlanId)).toEqual([
      goalB1.goalPlanId,
      goalA2.goalPlanId,
      goalA1.goalPlanId,
    ]);
    expect(programAGoals.items.map((item) => item.goalPlanId)).toEqual([
      goalA2.goalPlanId,
      goalA1.goalPlanId,
    ]);
    expect(relationshipFollowups.items.map((item) => item.followupId)).toEqual([
      followupB1.followupId,
      followupA2.followupId,
      followupA1.followupId,
    ]);
    expect(programAFollowups.items.map((item) => item.followupId)).toEqual([
      followupA2.followupId,
      followupA1.followupId,
    ]);
  });

  it("keeps completed Program history readable and rejects cross-Program, completed, and nonce-reused writes", async () => {
    const hospital = await createHospital("SERVICE-TWO-GUARDS");
    const owner = await createHospitalActor({ hospitalId: hospital.id });
    const patient = await createPatient(owner.actor, hospital.id, "service-two-guards");
    const programA = await openPatientProgram(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
    });
    const goalNonce = randomUUID();
    const followupNonce = randomUUID();
    const goalA = await createGoalPlanForProgram(
      owner.actor,
      goalProgramInput(programA.patientProgramId, { submissionNonce: goalNonce }),
    );
    const followupA = await createFollowupForProgram(
      owner.actor,
      followupProgramInput(programA.patientProgramId, { submissionNonce: followupNonce }),
    );

    await completePatientProgram(owner.actor, { patientProgramId: programA.patientProgramId });
    await expect(
      createGoalPlanForProgram(owner.actor, goalProgramInput(programA.patientProgramId)),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      createFollowupForProgram(owner.actor, followupProgramInput(programA.patientProgramId)),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      getGoalPlanOverviewForProgram(owner.actor, programA.patientProgramId),
    ).resolves.toMatchObject({ latest: { goalPlanId: goalA.goalPlanId } });
    await expect(
      getFollowupHistoryForProgram(owner.actor, programA.patientProgramId),
    ).resolves.toMatchObject({ items: [{ followupId: followupA.followupId }], canRecord: false });

    const programB = await openPatientProgram(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
    });
    await expect(
      createGoalPlanForProgram(
        owner.actor,
        goalProgramInput(programB.patientProgramId, { submissionNonce: goalNonce }),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      createFollowupForProgram(
        owner.actor,
        followupProgramInput(programB.patientProgramId, { submissionNonce: followupNonce }),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      createFollowupForProgram(
        owner.actor,
        followupProgramInput(programB.patientProgramId, { sourceGoalPlanId: goalA.goalPlanId }),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("enforces Program and relationship ownership with database backstops", async () => {
    const hospital = await createHospital("SERVICE-TWO-FK");
    const owner = await createHospitalActor({ hospitalId: hospital.id });
    const firstPatient = await createPatient(owner.actor, hospital.id, "service-two-fk-first");
    const secondPatient = await createPatient(owner.actor, hospital.id, "service-two-fk-second");
    const firstProgram = await openPatientProgram(owner.actor, {
      patientHospitalRelationshipId: firstPatient.relationshipId,
    });
    const now = new Date();

    await expect(
      prisma.patientGoalPlan.create({
        data: {
          patientHospitalRelationshipId: secondPatient.relationshipId,
          patientProgramId: firstProgram.patientProgramId,
          createdByUserId: owner.userId,
          sourceScreeningAssessmentId: null,
          submissionNonce: randomUUID(),
          templateKey: GOAL_TEMPLATE_KEY,
          templateVersion: GOAL_TEMPLATE_VERSION,
          roundNumber: 1,
          primaryGoalCode: "weight",
          primaryGoalNote: null,
          weeklyNote: null,
          createdAt: now,
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });

    await expect(
      prisma.patientFollowup.create({
        data: {
          patientHospitalRelationshipId: secondPatient.relationshipId,
          patientProgramId: firstProgram.patientProgramId,
          appointmentId: null,
          sourceGoalPlanId: null,
          createdByUserId: owner.userId,
          roundNumber: 1,
          submissionNonce: randomUUID(),
          submissionRequestHash: "f".repeat(64),
          recordedAt: now,
          weight: null,
          waistCircumference: null,
          systolicBloodPressure: null,
          diastolicBloodPressure: null,
          bloodSugar: null,
          confidenceScore: null,
          reflectionNote: null,
          confidencePlan: null,
          generalNote: null,
          createdAt: now,
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });

    const legacyGoal = await createGoalPlan(owner.actor, {
      patientHospitalRelationshipId: secondPatient.relationshipId,
      submissionNonce: randomUUID(),
      sourceScreeningAssessmentId: null,
      primaryGoalCode: "weight",
      primaryGoalNote: null,
      weeklyNote: null,
      items: [{ activityCode: "stop_sweet", targetDays: 1 }],
    });
    await expect(
      prisma.patientGoalPlan.create({
        data: {
          patientHospitalRelationshipId: secondPatient.relationshipId,
          patientProgramId: null,
          createdByUserId: owner.userId,
          sourceScreeningAssessmentId: null,
          submissionNonce: randomUUID(),
          templateKey: GOAL_TEMPLATE_KEY,
          templateVersion: GOAL_TEMPLATE_VERSION,
          roundNumber: legacyGoal.roundNumber,
          primaryGoalCode: "weight",
          primaryGoalNote: null,
          weeklyNote: null,
          createdAt: now,
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });

    const legacyFollowup = await createFollowup(owner.actor, {
      patientHospitalRelationshipId: secondPatient.relationshipId,
      submissionNonce: randomUUID(),
      appointmentId: null,
      sourceGoalPlanId: null,
      weight: null,
      waistCircumference: null,
      systolicBloodPressure: null,
      diastolicBloodPressure: null,
      bloodSugar: null,
      confidenceScore: null,
      reflectionNote: null,
      confidencePlan: null,
      generalNote: null,
      activityProgress: [],
    });
    await expect(
      prisma.patientFollowup.create({
        data: {
          patientHospitalRelationshipId: secondPatient.relationshipId,
          patientProgramId: null,
          appointmentId: null,
          sourceGoalPlanId: null,
          createdByUserId: owner.userId,
          roundNumber: legacyFollowup.roundNumber,
          submissionNonce: randomUUID(),
          submissionRequestHash: "d".repeat(64),
          recordedAt: now,
          weight: null,
          waistCircumference: null,
          systolicBloodPressure: null,
          diastolicBloodPressure: null,
          bloodSugar: null,
          confidenceScore: null,
          reflectionNote: null,
          confidencePlan: null,
          generalNote: null,
          createdAt: now,
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });

    const goalA = await createGoalPlanForProgram(
      owner.actor,
      goalProgramInput(firstProgram.patientProgramId),
    );
    await completePatientProgram(owner.actor, { patientProgramId: firstProgram.patientProgramId });
    const secondProgram = await openPatientProgram(owner.actor, {
      patientHospitalRelationshipId: firstPatient.relationshipId,
    });

    await expect(
      prisma.patientFollowup.create({
        data: {
          patientHospitalRelationshipId: firstPatient.relationshipId,
          patientProgramId: secondProgram.patientProgramId,
          appointmentId: null,
          sourceGoalPlanId: goalA.goalPlanId,
          createdByUserId: owner.userId,
          roundNumber: 1,
          submissionNonce: randomUUID(),
          submissionRequestHash: "e".repeat(64),
          recordedAt: new Date(),
          weight: null,
          waistCircumference: null,
          systolicBloodPressure: null,
          diastolicBloodPressure: null,
          bloodSugar: null,
          confidenceScore: null,
          reflectionNote: null,
          confidencePlan: null,
          generalNote: null,
          createdAt: new Date(),
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });

  it("allocates linked rounds independently under concurrent Goal Plan and Follow-up writes", async () => {
    const hospital = await createHospital("S2-CONCURRENCY");
    const owner = await createHospitalActor({ hospitalId: hospital.id });
    const patient = await createPatient(owner.actor, hospital.id, "service-two-concurrency");
    const program = await openPatientProgram(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
    });

    const goalOutcomes = await Promise.allSettled([
      createGoalPlanForProgram(owner.actor, goalProgramInput(program.patientProgramId)),
      createGoalPlanForProgram(owner.actor, goalProgramInput(program.patientProgramId)),
    ]);
    const goalRounds = goalOutcomes.flatMap((outcome) =>
      outcome.status === "fulfilled" ? [outcome.value.roundNumber] : [],
    );
    expect(goalOutcomes.every((outcome) => outcome.status === "fulfilled")).toBe(true);
    expect(goalRounds.sort((left, right) => left - right)).toEqual([1, 2]);
    expect(await prisma.patientGoalPlan.count({
      where: { patientProgramId: program.patientProgramId },
    })).toBe(2);

    const followupOutcomes = await Promise.allSettled([
      createFollowupForProgram(owner.actor, followupProgramInput(program.patientProgramId)),
      createFollowupForProgram(owner.actor, followupProgramInput(program.patientProgramId)),
    ]);
    const followupRounds = followupOutcomes.flatMap((outcome) =>
      outcome.status === "fulfilled" ? [outcome.value.roundNumber] : [],
    );
    expect(followupOutcomes.every((outcome) => outcome.status === "fulfilled")).toBe(true);
    expect(followupRounds.sort((left, right) => left - right)).toEqual([1, 2]);
    expect(await prisma.patientFollowup.count({
      where: { patientProgramId: program.patientProgramId },
    })).toBe(2);
  });

  it("serializes linked Goal Plan and Follow-up writes against Program completion", async () => {
    const hospital = await createHospital("S2-COMP-RACE");
    const owner = await createHospitalActor({ hospitalId: hospital.id });
    const patient = await createPatient(owner.actor, hospital.id, "service-two-completion-race");
    const goalProgram = await openPatientProgram(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
    });
    const goalOutcomes = await Promise.allSettled([
      createGoalPlanForProgram(owner.actor, goalProgramInput(goalProgram.patientProgramId)),
      completePatientProgram(owner.actor, { patientProgramId: goalProgram.patientProgramId }),
    ]);
    const completedGoalProgram = await prisma.patientProgram.findUniqueOrThrow({
      where: { id: goalProgram.patientProgramId },
      select: { status: true, completedAt: true },
    });
    const storedGoal = await prisma.patientGoalPlan.findFirst({
      where: { patientProgramId: goalProgram.patientProgramId },
      select: { createdAt: true },
    });
    expect(completedGoalProgram.status).toBe(PatientProgramStatus.COMPLETED);
    expect(completedGoalProgram.completedAt).not.toBeNull();
    if (storedGoal) {
      expect(storedGoal.createdAt.getTime()).toBeLessThanOrEqual(
        completedGoalProgram.completedAt?.getTime() ?? 0,
      );
      expect(goalOutcomes[0]?.status).toBe("fulfilled");
    } else {
      expect(goalOutcomes[0]?.status).toBe("rejected");
      expect((goalOutcomes[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);
    }

    const followupProgram = await openPatientProgram(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
    });
    const followupOutcomes = await Promise.allSettled([
      createFollowupForProgram(owner.actor, followupProgramInput(followupProgram.patientProgramId)),
      completePatientProgram(owner.actor, { patientProgramId: followupProgram.patientProgramId }),
    ]);
    const completedFollowupProgram = await prisma.patientProgram.findUniqueOrThrow({
      where: { id: followupProgram.patientProgramId },
      select: { status: true, completedAt: true },
    });
    const storedFollowup = await prisma.patientFollowup.findFirst({
      where: { patientProgramId: followupProgram.patientProgramId },
      select: { recordedAt: true },
    });
    expect(completedFollowupProgram.status).toBe(PatientProgramStatus.COMPLETED);
    expect(completedFollowupProgram.completedAt).not.toBeNull();
    if (storedFollowup) {
      expect(storedFollowup.recordedAt.getTime()).toBeLessThanOrEqual(
        completedFollowupProgram.completedAt?.getTime() ?? 0,
      );
      expect(followupOutcomes[0]?.status).toBe("fulfilled");
    } else {
      expect(followupOutcomes[0]?.status).toBe("rejected");
      expect((followupOutcomes[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);
    }
  });

  it("retains explicit nullable historical uniqueness and ownership constraints in PostgreSQL", async () => {
    const indexes = await prisma.$queryRaw<Array<{ indexname: string; indexdef: string }>>`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename IN ('PatientGoalPlan', 'PatientFollowup')
        AND indexname IN (
          'PatientGoalPlan_patientProgramId_roundNumber_key',
          'PatientFollowup_patientProgramId_roundNumber_key',
          'PatientGoalPlan_legacy_relationship_round_key',
          'PatientFollowup_legacy_relationship_round_key'
        )
      ORDER BY indexname
    `;
    const indexNames = indexes.map((index) => index.indexname);
    expect(indexNames).toEqual([
      "PatientFollowup_legacy_relationship_round_key",
      "PatientFollowup_patientProgramId_roundNumber_key",
      "PatientGoalPlan_legacy_relationship_round_key",
      "PatientGoalPlan_patientProgramId_roundNumber_key",
    ].sort());
    expect(
      indexes.find((index) => index.indexname.startsWith("PatientGoalPlan_legacy"))?.indexdef,
    ).toMatch(/where.*patientprogramid.*is null/i);
    expect(
      indexes.find((index) => index.indexname.startsWith("PatientFollowup_legacy"))?.indexdef,
    ).toMatch(/where.*patientprogramid.*is null/i);

    const constraints = await prisma.$queryRaw<
      Array<{ constraintName: string; constraintType: string; definition: string }>
    >`
      SELECT conname AS "constraintName", contype AS "constraintType", pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conname IN (
        'PatientGoalPlan_patientProgramId_patientHospitalRelationshipId_fkey',
        'PatientFollowup_patientProgramId_patientHospitalRelationshipId_fkey',
        'PatientFollowup_sourceGoalPlanId_patientProgramId_patientHospitalRelationshipId_fkey'
      )
      ORDER BY conname
    `;
    expect(constraints).toHaveLength(3);
    expect(constraints.every((constraint) => constraint.constraintType === "f")).toBe(true);
    expect(constraints.every((constraint) => constraint.definition.includes("ON DELETE RESTRICT"))).toBe(true);
  });
});
