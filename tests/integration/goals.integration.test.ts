import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Profession,
  Role,
  UserStatus,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { assignOsmToPatient } from "@/modules/patient-assignment/services/patient-osm-assignment-service";
import { provisionPatient } from "@/modules/patient-provisioning/services/patient-provisioning-service";
import {
  getGoalPlanDetail,
  getGoalPlanOverview,
} from "@/modules/goals/services/goal-query-service";
import { createGoalPlan } from "@/modules/goals/services/goal-service";
import { submitScreening } from "@/modules/screening/services/screening-service";
import { ConflictError, ForbiddenError, NotFoundError } from "@/shared/errors/application-error";

const prisma = getPrisma();
let sequence = 0;

async function clearDatabase(): Promise<void> {
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
  return prisma.hospital.create({
    data: { hospitalCode: code, name: `โรงพยาบาล ${code}`, status: HospitalStatus.ACTIVE },
    select: { id: true },
  });
}

async function createHospitalActor(input: {
  hospitalId: string;
  membershipType?: MembershipType;
  membershipStatus?: MembershipStatus;
  profession?: Profession | null;
}): Promise<{ actor: ActorContext; userId: string }> {
  sequence += 1;
  const person = await prisma.person.create({
    data: { identityKeyHash: `goals-hospital-${sequence}` },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: { personId: person.id, status: UserStatus.ACTIVE },
    select: { id: true },
  });
  const membershipType = input.membershipType ?? MembershipType.MEMBER;
  const membershipStatus = input.membershipStatus ?? MembershipStatus.ACTIVE;
  await prisma.userRole.create({ data: { userId: user.id, role: Role.HOSPITAL } });
  await prisma.hospitalMembership.create({
    data: {
      userId: user.id,
      hospitalId: input.hospitalId,
      membershipType,
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
          membershipType,
          profession: input.profession ?? null,
          status: membershipStatus,
          hospitalStatus: HospitalStatus.ACTIVE,
        },
      ],
      osmHospitalRelationships: [],
    },
  };
}

async function createOsmActor(hospitalId: string): Promise<{ actor: ActorContext; userId: string }> {
  sequence += 1;
  const person = await prisma.person.create({
    data: { identityKeyHash: `goals-osm-${sequence}` },
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
        {
          hospitalId,
          status: MembershipStatus.ACTIVE,
          hospitalStatus: HospitalStatus.ACTIVE,
        },
      ],
    },
  };
}

async function createAdminActor(): Promise<ActorContext> {
  sequence += 1;
  const person = await prisma.person.create({
    data: { identityKeyHash: `goals-admin-${sequence}` },
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

function screeningInput(relationshipId: string) {
  return {
    patientHospitalRelationshipId: relationshipId,
    submissionNonce: randomUUID(),
    responses: {
      pam: {
        "pam-1": 2,
        "pam-2": 2,
        "pam-3": 2,
        "pam-4": 2,
        "pam-5": 2,
      },
      proms: {
        "proms-1": 3,
        "proms-2": 3,
        "proms-3": 3,
        "proms-4": 3,
      },
      confidenceScore: 7,
      confidenceImprovementPlan: null,
    },
  };
}

function goalInput(relationshipId: string, overrides: Record<string, unknown> = {}) {
  return {
    patientHospitalRelationshipId: relationshipId,
    submissionNonce: randomUUID(),
    sourceScreeningAssessmentId: null,
    primaryGoalCode: "weight",
    primaryGoalNote: "เป้าหมายต้นแบบ",
    weeklyNote: "บันทึกรอบต้นแบบ",
    items: [
      { activityCode: "stop_sweet", targetDays: 4 },
      { activityCode: "exercise_walk", targetDays: 3, targetValue: 15, targetUnit: "minutes" },
    ],
    ...overrides,
  };
}

describe("Phase 8B.0 Goals and Activity Plan PostgreSQL workflow", () => {
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

  it("keeps Screening separate, persists immutable rounds, deduplicates retries, and reads history", async () => {
    const hospital = await createHospital("GOALS-WORKFLOW");
    const owner = await createHospitalActor({
      hospitalId: hospital.id,
      membershipType: MembershipType.OWNER,
      profession: Profession.DOCTOR,
    });
    const member = await createHospitalActor({
      hospitalId: hospital.id,
      membershipType: MembershipType.MEMBER,
      profession: Profession.NURSE,
    });
    const patient = await provisionPatient(owner.actor, {
      identity: { namespace: "goals-integration", value: "patient-1" },
      targetHospitalId: hospital.id,
      givenName: "สมชาย",
      familyName: "Goals",
      hospitalNumber: "HN-GOALS",
    });

    const screening = await submitScreening(owner.actor, screeningInput(patient.relationshipId));
    expect(await prisma.patientGoalPlan.count()).toBe(0);

    const firstInput = goalInput(patient.relationshipId, {
      sourceScreeningAssessmentId: screening.screeningAssessmentId,
    });
    const first = await createGoalPlan(owner.actor, firstInput);
    const retry = await createGoalPlan(owner.actor, firstInput);

    expect(retry.goalPlanId).toBe(first.goalPlanId);
    expect(retry.roundNumber).toBe(1);
    expect(await prisma.patientGoalPlan.count({ where: { patientHospitalRelationshipId: patient.relationshipId } })).toBe(1);
    expect(await prisma.patientGoalItem.count({ where: { goalPlanId: first.goalPlanId } })).toBe(2);
    expect(await prisma.auditEvent.count({ where: { action: "goal_plan.created" } })).toBe(1);

    await expect(
      createGoalPlan(owner.actor, {
        ...firstInput,
        primaryGoalNote: "payload เปลี่ยนแปลง",
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    const second = await createGoalPlan(
      member.actor,
      goalInput(patient.relationshipId, { primaryGoalCode: "glucose" }),
    );
    expect(second.roundNumber).toBe(2);

    const firstDetail = await getGoalPlanDetail(owner.actor, patient.relationshipId, first.goalPlanId);
    expect(firstDetail).toMatchObject({ roundNumber: 1, primaryGoalCode: "weight", primaryGoalNote: "เป้าหมายต้นแบบ" });

    const overview = await getGoalPlanOverview(owner.actor, patient.relationshipId);
    expect(overview.items.map((item) => item.roundNumber)).toEqual([2, 1]);
    expect(overview.latest?.roundNumber).toBe(2);
    expect(overview.latestScreening).toMatchObject({ result: { level: "L3", zone: "YELLOW" } });
    expect(JSON.stringify(overview)).not.toContain("เป้าหมายต้นแบบ");
    expect(JSON.stringify(firstDetail)).not.toContain("identityKeyHash");
  });

  it("requires exact active OSM assignment and denies other Hospital, Patient, and ADMIN scopes", async () => {
    const hospital = await createHospital("GOALS-SCOPE");
    const otherHospital = await createHospital("GOALS-OTHER");
    const owner = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.OWNER });
    const otherOwner = await createHospitalActor({
      hospitalId: otherHospital.id,
      membershipType: MembershipType.OWNER,
    });
    const osm = await createOsmActor(hospital.id);
    const unassignedOsm = await createOsmActor(hospital.id);
    const admin = await createAdminActor();
    const patient = await provisionPatient(owner.actor, {
      identity: { namespace: "goals-integration", value: "patient-scope" },
      targetHospitalId: hospital.id,
      givenName: "สมหญิง",
      familyName: "ขอบเขต",
    });
    const patientActor: ActorContext = {
      userId: patient.userId,
      personId: patient.personId,
      roles: [Role.PATIENT],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    };

    await expect(createGoalPlan(otherOwner.actor, goalInput(patient.relationshipId))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(createGoalPlan(unassignedOsm.actor, goalInput(patient.relationshipId))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(createGoalPlan(patientActor, goalInput(patient.relationshipId))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(createGoalPlan(admin, goalInput(patient.relationshipId))).rejects.toBeInstanceOf(ForbiddenError);

    await assignOsmToPatient(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
      osmUserId: osm.userId,
    });
    const osmPlan = await createGoalPlan(osm.actor, goalInput(patient.relationshipId));
    expect(osmPlan.roundNumber).toBe(1);
    await expect(getGoalPlanOverview(unassignedOsm.actor, patient.relationshipId)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("serializes concurrent deliberate rounds without duplicate round numbers", async () => {
    const hospital = await createHospital("GOALS-CONCURRENCY");
    const owner = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.OWNER });
    const patient = await provisionPatient(owner.actor, {
      identity: { namespace: "goals-integration", value: "patient-concurrent" },
      targetHospitalId: hospital.id,
      givenName: "สมชาย",
      familyName: "พร้อมกัน",
    });

    const outcomes = await Promise.allSettled([
      createGoalPlan(owner.actor, goalInput(patient.relationshipId)),
      createGoalPlan(owner.actor, goalInput(patient.relationshipId)),
    ]);

    expect(outcomes.every((outcome) => outcome.status === "fulfilled")).toBe(true);
    const rounds = await prisma.patientGoalPlan.findMany({
      where: { patientHospitalRelationshipId: patient.relationshipId },
      orderBy: { roundNumber: "asc" },
      select: { roundNumber: true },
    });
    expect(rounds.map((round) => round.roundNumber)).toEqual([1, 2]);
  });

  it("does not leave a Goal Plan when a transaction is rejected before persistence", async () => {
    const hospital = await createHospital("GOALS-ATOMIC");
    const owner = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.OWNER });
    const patient = await provisionPatient(owner.actor, {
      identity: { namespace: "goals-integration", value: "patient-atomic" },
      targetHospitalId: hospital.id,
      givenName: "สมหญิง",
      familyName: "ธุรกรรม",
    });

    await expect(
      createGoalPlan(
        owner.actor,
        goalInput(patient.relationshipId, {
          sourceScreeningAssessmentId: randomUUID(),
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await prisma.patientGoalPlan.count({ where: { patientHospitalRelationshipId: patient.relationshipId } })).toBe(0);
  });
});
