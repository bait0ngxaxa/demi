import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Role,
  UserStatus,
  type Prisma,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { createFollowupForProgram } from "@/modules/followups/services/followup-service";
import { createGoalPlanForProgram } from "@/modules/goals/services/goal-service";
import {
  assignOsmToPatient,
  unassignOsmFromPatient,
} from "@/modules/patient-assignment/services/patient-osm-assignment-service";
import { createPatientFinalAssessment } from "@/modules/patient-final-assessment/services/patient-final-assessment-service";
import {
  getProgramRoundDetail,
  getProgramRoundsOverview,
} from "@/modules/patient-program-rounds/services/round-query-service";
import {
  completePatientProgramRound,
  recordPatientProgramRoundProfile,
  recordPatientProgramRoundReview,
  recordPatientProgramRoundVitals,
  skipPatientProgramRoundStep as skipPlanItem,
  unskipPatientProgramRoundStep as unskipPlanItem,
} from "@/modules/patient-program-rounds/services/round-service";
import { addRoundPlanItem, removeRoundPlanItem, markCustomItemDone, unmarkCustomItemDone, addProgramRound } from "@/modules/patient-program-rounds/services/round-plan-write-service";
import { openPatientProgram } from "@/modules/patient-program/services/patient-program-service";
import {
  associatePatientProgramServiceOneArtifact,
  recordPatientProgramServiceOneConfidence,
  recordPatientProgramServiceOneDreamCard,
  recordPatientProgramServiceOneFloatingChart,
  recordPatientProgramServiceOneRoutine,
} from "@/modules/patient-program/services/patient-program-service-one-service";
import { provisionPatientFixture as provisionPatient } from "./support/patient-provisioning";
import { getHospitalReportingDatasetForExport } from "@/modules/reporting/services/hospital-report-query-service";
import { submitScreening } from "@/modules/screening/services/screening-service";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/application-error";

import { bookletGoalPayload, dreamCard, routineTable } from "./support/booklet-forms";
import { RoundConflictError } from "@/modules/patient-program-rounds/domain/round-conflict-error";
import { roundGuideline, type RoundStepCode } from "@/modules/patient-program-rounds/domain/round-steps";

import { clearProgramRoundCompletions, openProgramRound } from "./support/program-rounds";

const prisma = getPrisma();
let sequence = 0;
const previousCursorSecret = process.env.DEMI_HOSPITAL_REPORTING_CURSOR_SECRET;
const floatingChartScores = {
  familyScore: -5,
  eatingScore: -4,
  workScore: -3,
  healthScore: -2,
  financeScore: -1,
  travelScore: 0,
  exerciseScore: 1,
  wellbeingScore: 5,
};

async function clearDatabase(): Promise<void> {
  await clearProgramRoundCompletions();
  await prisma.patientProgramRoundActivity.deleteMany();
  await prisma.patientProgramRoundVitals.deleteMany();
  await prisma.patientProgramServiceOneArtifactAssociation.deleteMany();
  await prisma.patientProgramServiceOneConfidence.deleteMany();
  await prisma.patientProgramServiceOneDreamCard.deleteMany();
  await prisma.patientProgramServiceOneFloatingChart.deleteMany();
  await prisma.patientProgramServiceOneRoutineEntry.deleteMany();
  await prisma.patientProgramServiceOneRoutine.deleteMany();
  await prisma.patientFollowupActivityProgress.deleteMany();
  await prisma.patientGoalPlan.updateMany({ where: { sourceFollowupId: { not: null } }, data: { sourceFollowupId: null } });
  await prisma.patientFollowup.deleteMany();
  await prisma.patientFinalAssessment.deleteMany();
  await prisma.patientAppointmentAssigneeAcceptance.deleteMany();
  await prisma.patientAppointment.deleteMany();
  await prisma.patientGoalItem.deleteMany();
  await prisma.patientGoalPlan.deleteMany();
  // Program-linked screenings reference the Program, so they are removed first.
  await prisma.screeningAssessment.deleteMany();
  await prisma.patientProgram.deleteMany();
  await prisma.patientBaseline.deleteMany();
  await prisma.patientEvidenceArtifact.deleteMany();
  await prisma.auditEvent.deleteMany();
  await prisma.patientOsmAssignment.deleteMany();
  await prisma.patientActivation.deleteMany();
  await prisma.patientHospitalHealthHistory.deleteMany();
  await prisma.patientHospitalRelationship.deleteMany();
  await prisma.personalExerciseEntry.deleteMany();
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
      hospitalCode: `ROUND-${code}-${sequence}`,
      name: `โรงพยาบาล Round ${code}`,
      status: HospitalStatus.ACTIVE,
    },
    select: { id: true },
  });
}

async function createUser(label: string): Promise<{ userId: string; personId: string }> {
  sequence += 1;
  const person = await prisma.person.create({
    data: { identityKeyHash: `round-${label}-${sequence}` },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: { personId: person.id, status: UserStatus.ACTIVE },
    select: { id: true },
  });

  return { userId: user.id, personId: person.id };
}

async function createOwner(hospitalId: string): Promise<{ actor: ActorContext; userId: string }> {
  const { userId, personId } = await createUser("owner");

  await prisma.userRole.create({ data: { userId, role: Role.HOSPITAL } });
  await prisma.hospitalMembership.create({
    data: { userId, hospitalId, membershipType: MembershipType.OWNER, status: MembershipStatus.ACTIVE },
  });

  return {
    userId,
    actor: {
      userId,
      personId,
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

async function createOsm(hospitalId: string): Promise<{ actor: ActorContext; userId: string }> {
  const { userId, personId } = await createUser("osm");

  await prisma.userRole.create({ data: { userId, role: Role.OSM } });
  await prisma.osmHospitalRelationship.create({
    data: { userId, hospitalId, status: MembershipStatus.ACTIVE },
  });

  return {
    userId,
    actor: {
      userId,
      personId,
      roles: [Role.OSM],
      hospitalMemberships: [],
      osmHospitalRelationships: [
        { hospitalId, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE },
      ],
    },
  };
}

async function createPatient(actor: ActorContext, hospitalId: string, value: string): Promise<string> {
  const result = await provisionPatient(actor, {
    identity: { namespace: "round-integration", value },
    targetHospitalId: hospitalId,
    givenName: "สมชาย",
    familyName: "รอบบริการ",
    hospitalNumber: `HN-ROUND-${value}`,
  });

  return result.relationshipId;
}

type Fixture = {
  hospitalId: string;
  owner: Awaited<ReturnType<typeof createOwner>>;
  osm: Awaited<ReturnType<typeof createOsm>>;
  relationshipId: string;
  programId: string;
};

async function createFixture(label: string): Promise<Fixture> {
  const hospital = await createHospital(label);
  const owner = await createOwner(hospital.id);
  const osm = await createOsm(hospital.id);
  const relationshipId = await createPatient(owner.actor, hospital.id, label);

  await assignOsmToPatient(owner.actor, {
    patientHospitalRelationshipId: relationshipId,
    osmUserId: osm.userId,
  });
  const program = await openPatientProgram(owner.actor, { patientHospitalRelationshipId: relationshipId });

  return { hospitalId: hospital.id, owner, osm, relationshipId, programId: program.patientProgramId };
}

function vitalsInput(programId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    patientProgramId: programId,
    roundNumber: 1,
    submissionNonce: randomUUID(),
    serviceDate: "2026-08-17",
    weight: 74,
    heightCm: 162,
    waistCircumference: 92,
    systolicBloodPressure: 130,
    diastolicBloodPressure: 85,
    bloodSugar: 118,
    ...overrides,
  };
}

function reviewInput(
  programId: string,
  roundNumber: number,
  toolCode: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return { patientProgramId: programId, roundNumber, toolCode, submissionNonce: randomUUID(), ...overrides };
}

function screeningInput(
  relationshipId: string,
  programId?: string,
  instrument: "PAM" | "PROMS" = "PAM",
): Record<string, unknown> {
  return {
    patientHospitalRelationshipId: relationshipId,
    ...(programId ? { patientProgramId: programId } : {}),
    submissionNonce: randomUUID(),
    instrument,
    responses: {
      answers: instrument === "PAM"
        ? { "pam-1": 2, "pam-2": 2, "pam-3": 2, "pam-4": 2, "pam-5": 2 }
        : { "proms-1": 3, "proms-2": 3, "proms-3": 3, "proms-4": 3 },
    },
  };
}

async function expectDenied(promise: Promise<unknown>): Promise<void> {
  await expect(promise).rejects.toSatisfy(
    (error: unknown) => error instanceof ForbiddenError || error instanceof NotFoundError,
  );
}

function followupInput(programId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    patientProgramId: programId,
    submissionNonce: randomUUID(),
    appointmentId: null,
    sourceGoalPlanId: null,
    weight: 72,
    waistCircumference: null,
    systolicBloodPressure: null,
    diastolicBloodPressure: null,
    bloodSugar: 105,
    // R2-F: ทบทวนแผนสุขภาพ answered.
    followedPlan: true,
    reflectionNote: "ทำตามแผนได้ต่อเนื่อง",
    generalNote: null,
    serviceDate: "2026-08-20",
    planAdjusted: false,
    hasObstacle: false,
    activityProgress: [],
    ...overrides,
  };
}

function goalInput(programId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    patientProgramId: programId,
    submissionNonce: randomUUID(),
    sourceScreeningAssessmentId: null,
    ...bookletGoalPayload(),
    ...overrides,
  };
}

/**
 * FR-1b: skip requests name the plan item. These tests address a round's single item of a step by its step
 * code; a step the round's active plan does not list gets an unknown item id.
 */
async function withPlanItem(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!("stepCode" in input)) {
    return input;
  }

  const { stepCode, ...request } = input;
  const item = await prisma.patientProgramRoundPlanItem.findFirst({
    where: {
      patientProgramId: String(input.patientProgramId).toLowerCase(),
      roundNumber: Number(input.roundNumber),
      stepCode: stepCode as RoundStepCode,
      removedAt: null,
    },
    select: { id: true },
  });

  return { ...request, planItemId: item?.id ?? randomUUID() };
}

async function skipPatientProgramRoundStep(actor: ActorContext, input: Record<string, unknown>) {
  return skipPlanItem(actor, await withPlanItem(input));
}

async function unskipPatientProgramRoundStep(actor: ActorContext, input: Record<string, unknown>) {
  return unskipPlanItem(actor, await withPlanItem(input));
}

function completion(programId: string, roundNumber: number, submissionNonce = randomUUID()): Record<string, unknown> {
  return { patientProgramId: programId, roundNumber, submissionNonce };
}

/** Ensures one DONE fixture activity, then closes the round through FR-D1 (remaining TODOs are system-skipped). */
async function skipRestAndComplete(fixture: Fixture, roundNumber: number): Promise<void> {
  const detail = await getProgramRoundDetail(fixture.osm.actor, fixture.relationshipId, fixture.programId, String(roundNumber));

  if (!detail.status.steps.some((step) => step.status === "DONE")) {
    const added = await addRoundPlanItem(fixture.osm.actor, { patientProgramId: fixture.programId, roundNumber, stepCode: "CUSTOM", customTitle: "กิจกรรมบริการสำหรับ fixture", submissionNonce: randomUUID() });
    await markCustomItemDone(fixture.osm.actor, { patientProgramId: fixture.programId, roundNumber, planItemId: added.planItemId, submissionNonce: randomUUID() });
  }
  await completePatientProgramRound(fixture.osm.actor, completion(fixture.programId, roundNumber));
}

async function stepStatus(fixture: Fixture, roundNumber: number, stepCode: string): Promise<string | undefined> {
  const detail = await getProgramRoundDetail(fixture.owner.actor, fixture.relationshipId, fixture.programId, String(roundNumber));
  return detail.status.steps.find((step) => step.code === stepCode)?.status;
}

async function expectSequenced(promise: Promise<unknown>, message?: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({ name: "RoundConflictError", ...(message ? { message } : {}) });
}

describe("Flexible service round writes (FR-2)", () => {
  beforeAll(async () => { await prisma.$connect(); await clearDatabase(); });
  afterEach(clearDatabase);
  afterAll(async () => { await prisma.$disconnect(); });

  function request(fixture: Fixture, roundNumber = 1): { patientProgramId: string; roundNumber: number; submissionNonce: string } {
    return { patientProgramId: fixture.programId, roundNumber, submissionNonce: randomUUID() };
  }

  async function activeItem(fixture: Fixture, stepCode: RoundStepCode, roundNumber = 1): Promise<string> {
    const item = await prisma.patientProgramRoundPlanItem.findFirstOrThrow({ where: { patientProgramId: fixture.programId, roundNumber, stepCode, removedAt: null }, select: { id: true } });
    return item.id;
  }

  it("removes and re-adds a guideline item, rejects duplicates, DONE removal and skipped removal", async () => {
    const fixture = await createFixture("fr2-edit");
    const planItemId = await activeItem(fixture, "PAM");
    const remove = { ...request(fixture), planItemId };
    await removeRoundPlanItem(fixture.osm.actor, remove);
    await expect(removeRoundPlanItem(fixture.osm.actor, remove)).resolves.toMatchObject({ operation: "ALREADY_RECORDED" });
    await addRoundPlanItem(fixture.osm.actor, { ...request(fixture), stepCode: "PAM" });
    expect(await activeItem(fixture, "PAM")).not.toBe(planItemId);
    await expect(addRoundPlanItem(fixture.osm.actor, { ...request(fixture), stepCode: "PAM" })).rejects.toBeInstanceOf(RoundConflictError);
    const ruler = await activeItem(fixture, "CONFIDENCE_RULER");
    await skipPlanItem(fixture.osm.actor, { patientProgramId: fixture.programId, roundNumber: 1, planItemId: ruler, reasonCode: "PATIENT_UNABLE" });
    await expect(removeRoundPlanItem(fixture.osm.actor, { ...request(fixture), planItemId: ruler })).rejects.toBeInstanceOf(RoundConflictError);
    await unskipPlanItem(fixture.osm.actor, { patientProgramId: fixture.programId, roundNumber: 1, planItemId: ruler });
    await recordPatientProgramServiceOneConfidence(fixture.osm.actor, { patientProgramId: fixture.programId, roundNumber: 1, score: 5 });
    await expect(removeRoundPlanItem(fixture.osm.actor, { ...request(fixture), planItemId: ruler })).rejects.toBeInstanceOf(RoundConflictError);
    await expect(addRoundPlanItem(fixture.osm.actor, { ...request(fixture), stepCode: "HEALTHY_PLAN" })).rejects.toBeInstanceOf(RoundConflictError);
    await expect(addRoundPlanItem(fixture.osm.actor, { ...request(fixture), stepCode: "HEALTH_PATH_REVIEW" })).rejects.toBeInstanceOf(RoundConflictError);
  });

  it("CUSTOM done/undone is nonce-idempotent; one DONE closes all TODOs including two CUSTOM items atomically", async () => {
    const fixture = await createFixture("fr2-close");
    for (const title of ["รายการแรก", "รายการที่สอง"]) await addRoundPlanItem(fixture.osm.actor, { ...request(fixture), stepCode: "CUSTOM", customTitle: title });
    const custom = await activeItem(fixture, "CUSTOM");
    const mark = { ...request(fixture), planItemId: custom, note: "ทำแล้ว" };
    await markCustomItemDone(fixture.osm.actor, mark);
    await unmarkCustomItemDone(fixture.osm.actor, { ...request(fixture), planItemId: custom });
    await expect(markCustomItemDone(fixture.osm.actor, mark)).resolves.toMatchObject({ operation: "ALREADY_RECORDED" });
    expect((await prisma.patientProgramRoundPlanItem.findUniqueOrThrow({ where: { id: custom } })).doneAt).toBeNull();
    await expect(completePatientProgramRound(fixture.osm.actor, request(fixture))).rejects.toBeInstanceOf(RoundConflictError);
    await recordPatientProgramServiceOneConfidence(fixture.osm.actor, { patientProgramId: fixture.programId, roundNumber: 1, score: 5 });
    const close = request(fixture);
    const first = await completePatientProgramRound(fixture.osm.actor, close);
    expect(first).toMatchObject({ done: 1, skipped: 0, notDone: 9 });
    expect(await completePatientProgramRound(fixture.osm.actor, close)).toMatchObject({ done: 1, skipped: 0, notDone: 9, operation: "ALREADY_RECORDED" });
    expect(await prisma.patientProgramRoundStepSkip.count({ where: { patientProgramId: fixture.programId, stepCode: "CUSTOM", reasonCode: "NOT_DONE_AT_CLOSE" } })).toBe(2);
    expect(await prisma.patientProgramRound.count({ where: { patientProgramId: fixture.programId, roundNumber: 2 } })).toBe(1);
  });

  it("opens empty rounds 7..12, never 13, and rejects an open round or a Final Assessment", async () => {
    const fixture = await createFixture("fr2-extra");
    await expect(addProgramRound(fixture.osm.actor, { patientProgramId: fixture.programId, submissionNonce: randomUUID() })).rejects.toBeInstanceOf(RoundConflictError);
    await openProgramRound(fixture.programId, 7);
    for (let round = 7; round <= 12; round += 1) {
      const add = { patientProgramId: fixture.programId, submissionNonce: randomUUID() };
      await expect(addProgramRound(fixture.osm.actor, add)).resolves.toMatchObject({ roundNumber: round });
      await expect(addProgramRound(fixture.osm.actor, add)).resolves.toMatchObject({ roundNumber: round, operation: "ALREADY_RECORDED" });
      await expect(completePatientProgramRound(fixture.osm.actor, request(fixture, round))).rejects.toBeInstanceOf(RoundConflictError);
      await expect(addProgramRound(fixture.osm.actor, { ...add, submissionNonce: randomUUID() })).rejects.toBeInstanceOf(RoundConflictError);
      const added = await addRoundPlanItem(fixture.osm.actor, { ...request(fixture, round), stepCode: "CUSTOM", customTitle: "กิจกรรมบริการ" });
      await markCustomItemDone(fixture.osm.actor, { ...request(fixture, round), planItemId: added.planItemId });
      await completePatientProgramRound(fixture.osm.actor, request(fixture, round));
    }
    await expect(addProgramRound(fixture.osm.actor, { patientProgramId: fixture.programId, submissionNonce: randomUUID() })).rejects.toBeInstanceOf(RoundConflictError);
    await createPatientFinalAssessment(fixture.osm.actor, { patientProgramId: fixture.programId, patientHospitalRelationshipId: fixture.relationshipId, serviceDate: "2026-08-21", weight: 70 });
  }, 20_000);

  it("derives Follow-up from the current round despite an earlier missing Follow-up and refuses duplicates", async () => {
    const fixture = await createFixture("fr2-followup");
    await expect(createFollowupForProgram(fixture.osm.actor, followupInput(fixture.programId))).rejects.toBeInstanceOf(RoundConflictError);
    await openProgramRound(fixture.programId, 2);
    await expect(createFollowupForProgram(fixture.osm.actor, followupInput(fixture.programId))).rejects.toBeInstanceOf(RoundConflictError);
    await openProgramRound(fixture.programId, 4);
    await createFollowupForProgram(fixture.osm.actor, followupInput(fixture.programId));
    expect(await prisma.patientFollowup.findFirst({ where: { patientProgramId: fixture.programId }, select: { roundNumber: true } })).toEqual({ roundNumber: 2 });
    await expect(createFollowupForProgram(fixture.osm.actor, followupInput(fixture.programId))).rejects.toBeInstanceOf(RoundConflictError);
    await skipRestAndComplete(fixture, 4);
    for (const stepCode of ["VITALS", "HEALTH_PLAN_REVIEW"] as const) {
      await removeRoundPlanItem(fixture.osm.actor, { ...request(fixture, 5), planItemId: await activeItem(fixture, stepCode, 5) });
    }
    await expect(createFollowupForProgram(fixture.osm.actor, followupInput(fixture.programId))).rejects.toBeInstanceOf(RoundConflictError);
  }, 15_000);

  it("allows Final Assessment after round 7 and prevents adding round 8 afterward", async () => {
    const fixture = await createFixture("fr2-after7");
    await openProgramRound(fixture.programId, 7);
    await addProgramRound(fixture.osm.actor, { patientProgramId: fixture.programId, submissionNonce: randomUUID() });
    await expect(createPatientFinalAssessment(fixture.osm.actor, { patientProgramId: fixture.programId, patientHospitalRelationshipId: fixture.relationshipId, serviceDate: "2026-08-21", weight: 70 })).rejects.toBeInstanceOf(RoundConflictError);
    const item = await addRoundPlanItem(fixture.osm.actor, { ...request(fixture, 7), stepCode: "CUSTOM", customTitle: "ครั้งเพิ่มเติม" });
    await markCustomItemDone(fixture.osm.actor, { ...request(fixture, 7), planItemId: item.planItemId });
    await completePatientProgramRound(fixture.osm.actor, request(fixture, 7));
    await createPatientFinalAssessment(fixture.osm.actor, { patientProgramId: fixture.programId, patientHospitalRelationshipId: fixture.relationshipId, serviceDate: "2026-08-21", weight: 70 });
    await expect(addProgramRound(fixture.osm.actor, { patientProgramId: fixture.programId, submissionNonce: randomUUID() })).rejects.toBeInstanceOf(RoundConflictError);
  });

  it("refuses once-per-program additions already DONE elsewhere and requires a Goal Plan", async () => {
    const fixture = await createFixture("fr2-once");
    await submitScreening(fixture.osm.actor, screeningInput(fixture.relationshipId, fixture.programId));
    await completePatientProgramRound(fixture.osm.actor, request(fixture));
    await expect(addRoundPlanItem(fixture.osm.actor, { ...request(fixture, 2), stepCode: "PAM" })).rejects.toBeInstanceOf(RoundConflictError);
    await expect(addRoundPlanItem(fixture.osm.actor, { ...request(fixture, 2), stepCode: "HEALTHY_PLAN" })).rejects.toBeInstanceOf(RoundConflictError);
    await createGoalPlanForProgram(fixture.osm.actor, goalInput(fixture.programId));
    await expect(addRoundPlanItem(fixture.osm.actor, { ...request(fixture, 2), stepCode: "HEALTHY_PLAN" })).resolves.toMatchObject({ operation: "RECORDED" });
  });

  it("denies every new staff write to patients, caregivers, unassigned OSM and other or Parent hospitals", async () => {
    const fixture = await createFixture("fr2-denied");
    const parent = await createHospital("fr2-parent");
    const parentOwner = await createOwner(parent.id);
    await prisma.hospitalServiceAreaEligibility.createMany({ data: [
      { hospitalId: parent.id, kind: "PARENT", verifiedAt: new Date() },
      { hospitalId: fixture.hospitalId, kind: "CHILD", verifiedAt: new Date() },
    ] });
    await prisma.hospitalServiceArea.create({ data: { parentHospitalId: parent.id, childHospitalId: fixture.hospitalId, createdByUserId: parentOwner.userId } });
    const outsider = await createHospital("fr2-outside");
    const outsideOwner = await createOwner(outsider.id);
    const unassigned = await createOsm(fixture.hospitalId);
    const identities: ActorContext[] = [parentOwner.actor, outsideOwner.actor, unassigned.actor];
    for (const role of [Role.PATIENT, Role.CAREGIVER]) {
      const user = await createUser(`fr2-${role}`);
      await prisma.userRole.create({ data: { userId: user.userId, role } });
      identities.push({ ...user, roles: [role], hospitalMemberships: [], osmHospitalRelationships: [] });
    }
    const item = await addRoundPlanItem(fixture.osm.actor, { ...request(fixture), stepCode: "CUSTOM", customTitle: "สำหรับทดสอบสิทธิ์" });
    for (const denied of identities) {
      await expectDenied(addRoundPlanItem(denied, { ...request(fixture), stepCode: "CUSTOM", customTitle: "ไม่ได้รับอนุญาต" }));
      for (const write of [removeRoundPlanItem, markCustomItemDone, unmarkCustomItemDone]) await expectDenied(write(denied, { ...request(fixture), planItemId: item.planItemId }));
      await expectDenied(addProgramRound(denied, { patientProgramId: fixture.programId, submissionNonce: randomUUID() }));
    }
  });

  it("serializes completion against a plan edit and never changes a frozen plan", async () => {
    const fixture = await createFixture("fr2-race");
    await recordPatientProgramServiceOneConfidence(fixture.osm.actor, { patientProgramId: fixture.programId, roundNumber: 1, score: 5 });
    const results = await Promise.allSettled([
      completePatientProgramRound(fixture.osm.actor, request(fixture)),
      addRoundPlanItem(fixture.owner.actor, { ...request(fixture), stepCode: "CUSTOM", customTitle: "รายการพร้อมจบ" }),
    ]);
    expect(results[0].status).toBe("fulfilled");
    const active = await prisma.patientProgramRoundPlanItem.findMany({ where: { patientProgramId: fixture.programId, roundNumber: 1, removedAt: null }, select: { id: true, stepCode: true } });
    const skips = await prisma.patientProgramRoundStepSkip.findMany({ where: { patientProgramId: fixture.programId, roundNumber: 1 }, select: { planItemId: true } });
    const resolved = new Set(skips.map((skip) => skip.planItemId));
    expect(active.every((item) => item.stepCode === "CONFIDENCE_RULER" || resolved.has(item.id))).toBe(true);
    await expect(addRoundPlanItem(fixture.osm.actor, { ...request(fixture), stepCode: "CUSTOM", customTitle: "หลังจบ" })).rejects.toBeInstanceOf(RoundConflictError);
  });
});

describe("Program service rounds: must-complete flow (Phase R1)", () => {
  beforeAll(async () => {
    process.env.DEMI_HOSPITAL_REPORTING_CURSOR_SECRET = "synthetic-round-navigator-integration-secret";
    await prisma.$connect();
    await clearDatabase();
  });

  afterEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    if (previousCursorSecret === undefined) delete process.env.DEMI_HOSPITAL_REPORTING_CURSOR_SECRET;
    else process.env.DEMI_HOSPITAL_REPORTING_CURSOR_SECRET = previousCursorSecret;
    await prisma.$disconnect();
  });

  it("walks an assigned OSM through round 1 to an explicit, audited, read-only completion", async () => {
    const fixture = await createFixture("walk");
    const programId = fixture.programId;

    const initial = await getProgramRoundsOverview(fixture.osm.actor, fixture.relationshipId, programId);
    expect(initial.rounds.map((round) => round.state)).toEqual(["NOT_STARTED", "LOCKED", "LOCKED", "LOCKED", "LOCKED", "LOCKED"]);
    expect(initial.after.state).toBe("LOCKED");

    // FR-D1: one recorded item permits staff to end the round.
    await recordPatientProgramServiceOneConfidence(fixture.osm.actor, { patientProgramId: programId, roundNumber: 1, score: 6 });
    const started = await getProgramRoundsOverview(fixture.osm.actor, fixture.relationshipId, programId);
    expect(started.rounds[0]).toMatchObject({ state: "IN_PROGRESS", resolvedItems: 1, totalItems: 14 });
    expect((await getProgramRoundDetail(fixture.osm.actor, fixture.relationshipId, programId, "1")).status.canComplete).toBe(true);

    const profile = await prisma.patientHospitalProfile.findUnique({
      where: { patientHospitalRelationshipId: fixture.relationshipId },
      select: { version: true },
    });
    await recordPatientProgramRoundVitals(
      fixture.osm.actor,
      vitalsInput(programId, { preferredName: " ลุงชาย ", occupation: "ชาวนา", profileVersion: profile?.version ?? null }),
    );
    await submitScreening(fixture.osm.actor, screeningInput(fixture.relationshipId, programId));
    await submitScreening(fixture.osm.actor, screeningInput(fixture.relationshipId, programId, "PROMS"));
    await recordPatientProgramServiceOneFloatingChart(fixture.osm.actor, {
      patientProgramId: programId,
      roundNumber: 1,
      ...floatingChartScores,
      summary: "ลอยจม",
    });
    await recordPatientProgramServiceOneRoutine(fixture.osm.actor, { patientProgramId: programId, roundNumber: 1, ...routineTable() });

    const ready = await getProgramRoundDetail(fixture.osm.actor, fixture.relationshipId, programId, "1");
    // SR-D9/SR-D12: เส้นทางสุขภาพ is derived from round 1 vitals; รู้จักตัวฉันเอง from the preferred name.
    expect(ready.status.steps.map((step) => [step.code, step.status])).toEqual([
      ["VITALS", "DONE"],
      ["KNOW_SELF", "DONE"],
      ["PAM", "DONE"],
      ["PROMS", "DONE"],
      ["FLOATING_CHART", "DONE"],
      ["CONFIDENCE_RULER", "DONE"],
      ["ROUTINE", "DONE"],
      ["HEALTH_PATH", "DONE"],
    ]);
    expect(ready.patient).toMatchObject({ preferredName: "ลุงชาย", occupation: "ชาวนา" });
    expect(ready.status.canComplete).toBe(true);

    const nonce = randomUUID();
    const first = await completePatientProgramRound(fixture.osm.actor, completion(programId, 1, nonce));
    const replay = await completePatientProgramRound(fixture.osm.actor, completion(programId, 1, nonce));
    expect([first.operation, replay.operation]).toEqual(["RECORDED", "ALREADY_RECORDED"]);

    const stored = await prisma.patientProgramRoundCompletion.findMany({ where: { patientProgramId: programId } });
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ roundNumber: 1, completedByUserId: fixture.osm.userId, submissionNonce: nonce });
    const audit = await prisma.auditEvent.findFirstOrThrow({ where: { action: "patient_program_round.completed" } });
    expect(audit.metadata).toMatchObject({ roundNumber: 1, doneSteps: 8, skippedSteps: 0 });

    const after = await getProgramRoundsOverview(fixture.osm.actor, fixture.relationshipId, programId);
    expect(after.rounds.slice(0, 3).map((round) => round.state)).toEqual(["COMPLETED", "NOT_STARTED", "LOCKED"]);

    // SR-D4: a completed round is read-only (an identical retry stays an idempotent no-op).
    await expect(
      recordPatientProgramServiceOneRoutine(fixture.owner.actor, { patientProgramId: programId, roundNumber: 1, ...routineTable() }),
    ).resolves.toMatchObject({ operation: "ALREADY_RECORDED" });
    const currentVersion = (await prisma.patientHospitalProfile.findUniqueOrThrow({
      where: { patientHospitalRelationshipId: fixture.relationshipId },
      select: { version: true },
    })).version;
    await expectSequenced(
      recordPatientProgramRoundProfile(fixture.owner.actor, {
        patientProgramId: programId,
        roundNumber: 1,
        preferredName: "ชื่อใหม่",
        profileVersion: currentVersion,
      }),
      "ครั้งที่ 1 จบบริการแล้ว ข้อมูลของครั้งนี้เป็นแบบอ่านอย่างเดียว",
    );
    await expectSequenced(
      skipPatientProgramRoundStep(fixture.owner.actor, { patientProgramId: programId, roundNumber: 1, stepCode: "PAM", reasonCode: "PATIENT_DECLINED" }),
    );
  });

  it("refuses every round-scoped write path until the previous round is completed (SR-D5)", async () => {
    const fixture = await createFixture("sequence");
    const programId = fixture.programId;
    const actor = fixture.osm.actor;

    await expectSequenced(
      recordPatientProgramRoundVitals(actor, vitalsInput(programId, { roundNumber: 2 })),
      "ต้องจบบริการครั้งที่ 1 ก่อน จึงจะบันทึกครั้งที่ 2 ได้",
    );
    await expectSequenced(recordPatientProgramServiceOneConfidence(actor, { patientProgramId: programId, roundNumber: 2, score: 5 }));
    await expectSequenced(recordPatientProgramServiceOneRoutine(actor, { patientProgramId: programId, roundNumber: 2, ...routineTable() }));
    await expectSequenced(recordPatientProgramServiceOneDreamCard(actor, { patientProgramId: programId, roundNumber: 3, ...dreamCard() }));
    // ADR-0022: a round not opened yet refuses every tool before its plan is consulted.
    for (const roundNumber of [2, 3, 5, 6]) {
      await expectSequenced(
        recordPatientProgramServiceOneFloatingChart(actor, {
          patientProgramId: programId,
          roundNumber,
          ...floatingChartScores,
        }),
      );
    }
    await expectSequenced(createGoalPlanForProgram(actor, goalInput(programId)));
    await expectSequenced(createFollowupForProgram(actor, followupInput(programId)), "บันทึกติดตามผลได้เฉพาะครั้งบริการปัจจุบัน ตั้งแต่ครั้งที่ 3");
    await expectSequenced(
      createPatientFinalAssessment(actor, {
        patientProgramId: programId,
        patientHospitalRelationshipId: fixture.relationshipId,
        serviceDate: "2026-08-21",
        weight: 69,
      }),
      "ต้องจบบริการทุกครั้งที่เปิดไว้ (อย่างน้อย 6 ครั้ง) ก่อนบันทึกการประเมินหลังจบโปรแกรม",
    );
    await expectSequenced(
      skipPatientProgramRoundStep(actor, { patientProgramId: programId, roundNumber: 2, stepCode: "ROUTINE", reasonCode: "PATIENT_DECLINED" }),
    );
    await expectSequenced(completePatientProgramRound(actor, completion(programId, 2)));
    expect(await prisma.patientGoalPlan.count({ where: { patientProgramId: programId } })).toBe(0);
    expect(await prisma.patientFollowup.count({ where: { patientProgramId: programId } })).toBe(0);
    expect(await prisma.patientProgramServiceOneConfidence.count({ where: { patientProgramId: programId } })).toBe(0);

    // After round 1 the plan opens; after round 2 the plan is closed and Follow-up 1 (round 3) opens.
    await skipRestAndComplete(fixture, 1);
    await createGoalPlanForProgram(actor, goalInput(programId));
    await expectSequenced(createFollowupForProgram(actor, followupInput(programId)));
    // The Program screening belongs to round 1, which is now completed.
    await expectSequenced(submitScreening(actor, screeningInput(fixture.relationshipId, programId)));
    await skipRestAndComplete(fixture, 2);
    await expectSequenced(createGoalPlanForProgram(actor, goalInput(programId)), "ครั้งที่ 2 จบบริการแล้ว ข้อมูลของครั้งนี้เป็นแบบอ่านอย่างเดียว");
    await expect(createFollowupForProgram(actor, followupInput(programId))).resolves.toMatchObject({ roundNumber: 1 });
    await expectSequenced(createFollowupForProgram(actor, followupInput(programId)), "ครั้งนี้บันทึกติดตามผลแล้ว");
  });

  it("stores ruler, chart, routine and dream results per round (SR-D8/SR-D11)", async () => {
    const fixture = await createFixture("per-round");
    const programId = fixture.programId;

    const first = await recordPatientProgramServiceOneConfidence(fixture.osm.actor, { patientProgramId: programId, roundNumber: 1, score: 3 });
    const roundOneChart = await recordPatientProgramServiceOneFloatingChart(fixture.osm.actor, {
      patientProgramId: programId,
      roundNumber: 1,
      ...floatingChartScores,
    });
    await skipRestAndComplete(fixture, 1);
    const second = await recordPatientProgramServiceOneConfidence(fixture.osm.actor, { patientProgramId: programId, roundNumber: 2, score: 8 });

    expect(second.recordId).not.toBe(first.recordId);
    expect(
      await prisma.patientProgramServiceOneConfidence.findMany({
        where: { patientProgramId: programId },
        orderBy: { roundNumber: "asc" },
        select: { roundNumber: true, score: true },
      }),
    ).toEqual([{ roundNumber: 1, score: 3 }, { roundNumber: 2, score: 8 }]);
    expect(await prisma.patientProgramRoundActivity.count({ where: { patientProgramId: programId, toolCode: "CONFIDENCE_RULER" } })).toBe(2);

    // Tools a round's plan does not list are rejected by the service and by the database (ADR-0022).
    await expect(
      recordPatientProgramServiceOneFloatingChart(fixture.osm.actor, {
        patientProgramId: programId,
        roundNumber: 2,
        ...floatingChartScores,
        summary: null,
      }),
    ).rejects.toThrow(new RoundConflictError("รายการนี้ไม่อยู่ในแผนของครั้งที่ 2"));
    await expect(
      prisma.patientProgramServiceOneDreamCard.create({ data: { patientProgramId: programId, roundNumber: 1, recordedByUserId: fixture.osm.userId } }),
    ).rejects.toThrow();
    await expect(
      prisma.patientProgramServiceOneRoutine.create({ data: { patientProgramId: programId, roundNumber: 3, recordedByUserId: fixture.osm.userId } }),
    ).rejects.toThrow();
    await expect(
      prisma.patientProgramServiceOneConfidence.create({ data: { patientProgramId: programId, roundNumber: 2, recordedByUserId: fixture.osm.userId, score: 1 } }),
    ).rejects.toMatchObject({ code: "P2002" });

    // Round 3 needs its own ความฝันของฉัน.
    await skipRestAndComplete(fixture, 2);
    expect(await stepStatus(fixture, 3, "DREAM_CARD")).toBe("TODO");
    await expect(
      recordPatientProgramServiceOneDreamCard(fixture.osm.actor, { patientProgramId: programId, roundNumber: 3, dream: "อยากเดินได้ไกล" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await recordPatientProgramServiceOneDreamCard(fixture.osm.actor, { patientProgramId: programId, roundNumber: 3, ...dreamCard("อยากเดินได้ไกล") });
    expect(await stepStatus(fixture, 3, "DREAM_CARD")).toBe("DONE");
    expect(
      await prisma.patientProgramServiceOneDreamCard.findFirstOrThrow({
        where: { patientProgramId: programId, roundNumber: 3 },
        select: { dream: true, obstacle: true, weeklyGoal: true, description: true },
      }),
    ).toEqual({ dream: "อยากเดินได้ไกล", obstacle: null, weeklyGoal: "เดินเล่นกับหลานวันละ 10 นาที", description: null });
    // The database refuses a booklet card without this week's small goal.
    await expect(
      prisma.patientProgramServiceOneDreamCard.update({
        where: { patientProgramId_roundNumber: { patientProgramId: programId, roundNumber: 3 } },
        data: { weeklyGoal: null },
      }),
    ).rejects.toThrow();

    await skipRestAndComplete(fixture, 3);
    const roundFourScores = { ...floatingChartScores, familyScore: 5, wellbeingScore: -5 };
    const roundFourChart = await recordPatientProgramServiceOneFloatingChart(fixture.osm.actor, {
      patientProgramId: programId,
      roundNumber: 4,
      ...roundFourScores,
    });
    expect(roundFourChart.recordId).not.toBe(roundOneChart.recordId);
    const roundFour = await getProgramRoundDetail(fixture.osm.actor, fixture.relationshipId, programId, "4");
    expect(roundFour.serviceOne.floatingChart).toMatchObject({
      recorded: true,
      scores: roundFourScores,
      roundOneScores: floatingChartScores,
    });
  });

  it("requires a reason to skip, shows it, lets a recording replace it and freezes it after completion (SR-D3)", async () => {
    const fixture = await createFixture("skip");
    const programId = fixture.programId;
    const skip = { patientProgramId: programId, roundNumber: 1, stepCode: "PAM" };

    await expect(skipPatientProgramRoundStep(fixture.osm.actor, { ...skip, reasonCode: "OTHER" })).rejects.toBeInstanceOf(ValidationError);
    await skipPatientProgramRoundStep(fixture.osm.actor, { ...skip, reasonCode: "OTHER", note: "ผู้ป่วยไม่สะดวก" });
    expect(await stepStatus(fixture, 1, "PAM")).toBe("SKIPPED");
    const round = await getProgramRoundDetail(fixture.owner.actor, fixture.relationshipId, programId, "1");
    expect(round.status.steps.find((step) => step.code === "PAM")?.skip).toMatchObject({ reasonCode: "OTHER", note: "ผู้ป่วยไม่สะดวก" });
    const skipAudit = await prisma.auditEvent.findFirstOrThrow({ where: { action: "patient_program_round.step_skipped" } });
    expect(JSON.stringify(skipAudit.metadata)).not.toContain("ผู้ป่วยไม่สะดวก");

    // Recording the step replaces the skip; an explicit unskip reopens a step.
    await submitScreening(fixture.osm.actor, screeningInput(fixture.relationshipId, programId));
    expect(await stepStatus(fixture, 1, "PAM")).toBe("DONE");
    await skipPatientProgramRoundStep(fixture.osm.actor, { ...skip, stepCode: "ROUTINE", reasonCode: "EQUIPMENT_UNAVAILABLE" });
    await unskipPatientProgramRoundStep(fixture.osm.actor, { ...skip, stepCode: "ROUTINE" });
    expect(await stepStatus(fixture, 1, "ROUTINE")).toBe("TODO");

    await skipRestAndComplete(fixture, 1);
    // The database freezes skips of a completed round even outside the service.
    await expect(
      prisma.patientProgramRoundStepSkip.deleteMany({ where: { patientProgramId: programId, roundNumber: 1 } }),
    ).rejects.toThrow();
    await expect(
      prisma.patientProgramRoundCompletion.updateMany({ where: { patientProgramId: programId }, data: { roundNumber: 2 } }),
    ).rejects.toThrow();
    await expect(prisma.patientProgramRoundCompletion.deleteMany({ where: { patientProgramId: programId } })).rejects.toThrow();

    // The Patient SELF view uses the same progress, read-only.
    expect((await getProgramRoundsOverview(fixture.owner.actor, fixture.relationshipId, programId)).rounds[0]?.state).toBe("COMPLETED");
  });

  it("completes round 4 for a kept plan and for an adjusted plan (interim rule)", async () => {
    for (const planAdjusted of [false, true]) {
      const fixture = await createFixture(`round4-${planAdjusted}`);
      const programId = fixture.programId;

      await skipRestAndComplete(fixture, 1);
      const plan = await createGoalPlanForProgram(fixture.osm.actor, goalInput(programId));
      await skipRestAndComplete(fixture, 2);
      await createFollowupForProgram(fixture.osm.actor, followupInput(programId, { sourceGoalPlanId: plan.goalPlanId }));
      await skipRestAndComplete(fixture, 3);
      const followup = await createFollowupForProgram(
        fixture.osm.actor,
        followupInput(programId, { sourceGoalPlanId: plan.goalPlanId, planAdjusted }),
      );

      expect(await stepStatus(fixture, 4, "HEALTH_PLAN_REVIEW")).toBe("DONE");
      expect(await stepStatus(fixture, 4, "HEALTHY_PLAN")).toBe(planAdjusted ? "TODO" : "DONE");

      if (planAdjusted) {
        await createGoalPlanForProgram(fixture.osm.actor, goalInput(programId, { sourceFollowupId: followup.followupId }));
        expect(await stepStatus(fixture, 4, "HEALTHY_PLAN")).toBe("DONE");
      }

      await skipRestAndComplete(fixture, 4);
      const overview = await getProgramRoundsOverview(fixture.osm.actor, fixture.relationshipId, programId);
      expect(overview.rounds[3]?.state).toBe("COMPLETED");
    }
    // Two Programs walked through four rounds of serializable writes each.
  }, 15_000);

  it("reviews the health path in round 6 and opens the After assessment when all rounds are completed", async () => {
    const fixture = await createFixture("round6");
    const programId = fixture.programId;
    await recordPatientProgramRoundVitals(fixture.osm.actor, vitalsInput(programId));

    await skipRestAndComplete(fixture, 1);
    const plan = await createGoalPlanForProgram(fixture.osm.actor, goalInput(programId));
    await skipRestAndComplete(fixture, 2);
    for (const round of [3, 4, 5]) {
      await createFollowupForProgram(fixture.osm.actor, followupInput(programId, { sourceGoalPlanId: plan.goalPlanId }));
      await skipRestAndComplete(fixture, round);
    }

    // The review target now spans rounds 1..6 and requires the round-1 baseline.
    await createFollowupForProgram(
      fixture.osm.actor,
      followupInput(programId, { sourceGoalPlanId: plan.goalPlanId, waistCircumference: 90, systolicBloodPressure: 128, diastolicBloodPressure: 82 }),
    );
    const round6 = await getProgramRoundDetail(fixture.osm.actor, fixture.relationshipId, programId, "6");
    expect(round6.healthPath).toHaveLength(6);
    expect(round6.status.steps.find((step) => step.code === "HEALTH_PATH_REVIEW")?.status).toBe("TODO");

    await recordPatientProgramServiceOneConfidence(fixture.osm.actor, { patientProgramId: programId, roundNumber: 6, score: 9 });
    expect((await getProgramRoundDetail(fixture.osm.actor, fixture.relationshipId, programId, "6")).status.canComplete).toBe(true);
    await recordPatientProgramRoundReview(fixture.osm.actor, reviewInput(programId, 6, "HEALTH_PATH"));
    await completePatientProgramRound(fixture.osm.actor, completion(programId, 6));

    const overview = await getProgramRoundsOverview(fixture.osm.actor, fixture.relationshipId, programId);
    expect(overview.rounds.every((round) => round.state === "COMPLETED")).toBe(true);
    expect(overview.after.state).toBe("NOT_RECORDED");
    await expect(
      createPatientFinalAssessment(fixture.owner.actor, {
        patientProgramId: programId,
        patientHospitalRelationshipId: fixture.relationshipId,
        serviceDate: "2026-08-21",
        weight: 69,
      }),
    ).resolves.toMatchObject({ patientProgramId: programId });
  });

  it("counts the vitals step done only with every measurement; missing values are added or skipped", async () => {
    const fixture = await createFixture("vitals-complete");
    const programId = fixture.programId;
    const vitalsStep = async (roundNumber: number) =>
      (await getProgramRoundDetail(fixture.osm.actor, fixture.relationshipId, programId, String(roundNumber))).status.steps.find(
        (step) => step.code === "VITALS",
      );

    await recordPatientProgramRoundVitals(
      fixture.osm.actor,
      vitalsInput(programId, { waistCircumference: null, systolicBloodPressure: null, diastolicBloodPressure: null, bloodSugar: null }),
    );
    expect(await vitalsStep(1)).toMatchObject({
      status: "TODO",
      missingMeasurements: ["waistCircumference", "bloodSugar", "systolicBloodPressure", "diastolicBloodPressure"],
    });

    // Every other step resolved: completion is still refused while the vitals step is open.
    const detail = await getProgramRoundDetail(fixture.osm.actor, fixture.relationshipId, programId, "1");
    for (const step of detail.status.steps.filter((candidate) => candidate.status === "TODO" && candidate.code !== "VITALS")) {
      await skipPatientProgramRoundStep(fixture.osm.actor, { patientProgramId: programId, roundNumber: 1, stepCode: step.code, reasonCode: "PATIENT_UNABLE" });
    }
    expect((await getProgramRoundDetail(fixture.osm.actor, fixture.relationshipId, programId, "1")).status.canComplete).toBe(true);

    // Recorded values cannot be changed; the missing ones are added to the same record.
    await expectSequenced(
      recordPatientProgramRoundVitals(fixture.osm.actor, vitalsInput(programId, { weight: 75 })),
      "ค่าที่บันทึกไว้แล้วแก้ไขไม่ได้ เพิ่มได้เฉพาะค่าที่ยังขาด",
    );
    await expect(
      recordPatientProgramRoundVitals(fixture.osm.actor, vitalsInput(programId, { weight: null, heightCm: null })),
    ).resolves.toMatchObject({ operation: "RECORDED" });
    expect(await prisma.patientProgramRoundVitals.findMany({ where: { patientProgramId: programId } })).toEqual([
      expect.objectContaining({ weight: 74, heightCm: 162, waistCircumference: 92, systolicBloodPressure: 130, diastolicBloodPressure: 85, bloodSugar: 118 }),
    ]);
    expect(await prisma.auditEvent.count({ where: { action: "patient_program_round.vitals_supplemented" } })).toBe(1);
    expect(await vitalsStep(1)).toMatchObject({ status: "DONE", missingMeasurements: [] });
    await completePatientProgramRound(fixture.osm.actor, completion(programId, 1));

    // Rounds 3-6: a Follow-up without vitals leaves the vitals step open, the plan review is still done.
    const plan = await createGoalPlanForProgram(fixture.osm.actor, goalInput(programId));
    await skipRestAndComplete(fixture, 2);
    await createFollowupForProgram(
      fixture.osm.actor,
      followupInput(programId, { sourceGoalPlanId: plan.goalPlanId, weight: null, bloodSugar: null }),
    );
    expect(await vitalsStep(3)).toMatchObject({
      status: "TODO",
      missingMeasurements: ["weight", "waistCircumference", "bloodSugar", "systolicBloodPressure", "diastolicBloodPressure"],
    });
    expect(await stepStatus(fixture, 3, "HEALTH_PLAN_REVIEW")).toBe("DONE");
    await skipPatientProgramRoundStep(fixture.osm.actor, { patientProgramId: programId, roundNumber: 3, stepCode: "VITALS", reasonCode: "EQUIPMENT_UNAVAILABLE" });
    expect(await stepStatus(fixture, 3, "VITALS")).toBe("SKIPPED");
  });

  it("keeps one completion row under concurrent completes and one vitals row under concurrent saves", async () => {
    const fixture = await createFixture("concurrent");
    const programId = fixture.programId;

    const saves = await Promise.allSettled([
      recordPatientProgramRoundVitals(fixture.osm.actor, vitalsInput(programId)),
      recordPatientProgramRoundVitals(fixture.osm.actor, vitalsInput(programId, { weight: 80 })),
      recordPatientProgramRoundVitals(fixture.owner.actor, vitalsInput(programId, { weight: 81 })),
    ]);
    expect(saves.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.patientProgramRoundVitals.count({ where: { patientProgramId: programId } })).toBe(1);

    const detail = await getProgramRoundDetail(fixture.osm.actor, fixture.relationshipId, programId, "1");
    for (const step of detail.status.steps.filter((candidate) => candidate.status === "TODO")) {
      await skipPatientProgramRoundStep(fixture.osm.actor, { patientProgramId: programId, roundNumber: 1, stepCode: step.code, reasonCode: "PATIENT_DECLINED" });
    }

    const completes = await Promise.allSettled([
      completePatientProgramRound(fixture.osm.actor, completion(programId, 1)),
      completePatientProgramRound(fixture.owner.actor, completion(programId, 1)),
    ]);
    for (const result of completes) {
      if (result.status === "rejected") expect(result.reason).toBeInstanceOf(ConflictError);
    }
    expect(completes.some((result) => result.status === "fulfilled")).toBe(true);
    expect(await prisma.patientProgramRoundCompletion.count({ where: { patientProgramId: programId } })).toBe(1);
  });

  it("denies unassigned, other-hospital and network-only readers every round write", async () => {
    const fixture = await createFixture("authz");
    const otherOsm = await createOsm(fixture.hospitalId);
    const otherHospital = await createHospital("other");
    const outsideOwner = await createOwner(otherHospital.id);
    const outsideOsm = await createOsm(otherHospital.id);

    for (const actor of [otherOsm.actor, outsideOwner.actor, outsideOsm.actor]) {
      await expectDenied(getProgramRoundsOverview(actor, fixture.relationshipId, fixture.programId));
      await expectDenied(recordPatientProgramRoundVitals(actor, vitalsInput(fixture.programId)));
      await expectDenied(recordPatientProgramRoundReview(actor, reviewInput(fixture.programId, 2, "PAM")));
      await expectDenied(
        skipPatientProgramRoundStep(actor, { patientProgramId: fixture.programId, roundNumber: 1, stepCode: "PAM", reasonCode: "PATIENT_DECLINED" }),
      );
      await expectDenied(completePatientProgramRound(actor, completion(fixture.programId, 1)));
      await expectDenied(
        recordPatientProgramRoundProfile(actor, { patientProgramId: fixture.programId, roundNumber: 1, preferredName: "ไม่ควรได้", profileVersion: null }),
      );
    }
    expect(await prisma.patientProgramRoundVitals.count()).toBe(0);
    expect(await prisma.patientProgramRoundStepSkip.count()).toBe(0);
    expect(await prisma.patientProgramRoundCompletion.count()).toBe(0);

    // Ending the assignment removes the OSM's access; hospital staff of the exact hospital still write.
    await unassignOsmFromPatient(fixture.owner.actor, { patientHospitalRelationshipId: fixture.relationshipId });
    await expectDenied(recordPatientProgramRoundVitals(fixture.osm.actor, vitalsInput(fixture.programId)));
    await expect(recordPatientProgramRoundVitals(fixture.owner.actor, vitalsInput(fixture.programId))).resolves.toMatchObject({
      operation: "RECORDED",
    });
  });

  it("links the screening to one Program only and rejects a Program of another relationship", async () => {
    const fixture = await createFixture("screening");
    const otherRelationshipId = await createPatient(fixture.owner.actor, fixture.hospitalId, "screening-other");

    await submitScreening(fixture.osm.actor, screeningInput(fixture.relationshipId, fixture.programId));
    await expect(
      submitScreening(fixture.osm.actor, screeningInput(fixture.relationshipId, fixture.programId)),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      submitScreening(fixture.owner.actor, screeningInput(otherRelationshipId, fixture.programId)),
    ).rejects.toBeInstanceOf(NotFoundError);
    await submitScreening(fixture.owner.actor, screeningInput(fixture.relationshipId));

    expect(await prisma.screeningAssessment.count({ where: { patientProgramId: fixture.programId } })).toBe(1);
    expect(await prisma.screeningAssessment.count({ where: { patientHospitalRelationshipId: fixture.relationshipId } })).toBe(2);
    expect(await prisma.patientProgramRoundActivity.count({ where: { toolCode: "PAM" } })).toBe(1);
    expect(await prisma.patientProgramRoundActivity.count({ where: { toolCode: "PROMS" } })).toBe(0);
  });

  it("records and skips PAM and PROMs independently; a legacy combined screening answers both (R2-C)", async () => {
    const fixture = await createFixture("instruments");

    await skipPatientProgramRoundStep(fixture.osm.actor, {
      patientProgramId: fixture.programId,
      roundNumber: 1,
      stepCode: "PAM",
      reasonCode: "PATIENT_DECLINED",
    });
    await submitScreening(fixture.osm.actor, screeningInput(fixture.relationshipId, fixture.programId, "PROMS"));
    expect(await stepStatus(fixture, 1, "PAM")).toBe("SKIPPED");
    expect(await stepStatus(fixture, 1, "PROMS")).toBe("DONE");
    await expect(
      submitScreening(fixture.osm.actor, screeningInput(fixture.relationshipId, fixture.programId, "PROMS")),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(
      await prisma.patientProgramRoundActivity.findMany({
        where: { patientProgramId: fixture.programId },
        select: { toolCode: true, roundNumber: true },
      }),
    ).toEqual([{ toolCode: "PROMS", roundNumber: 1 }]);

    // A legacy combined screening (recorded before R2) answers both steps and blocks new results.
    const legacy = await createFixture("instruments-legacy");
    await prisma.screeningAssessment.create({
      data: {
        patientHospitalRelationshipId: legacy.relationshipId,
        patientProgramId: legacy.programId,
        conductedByUserId: legacy.osm.userId,
        submissionNonce: randomUUID(),
        instrument: "COMBINED",
        questionSetKey: "demi-screening",
        questionSetVersion: "legacy-prototype-v1",
        scoringVersion: "legacy-prototype-v1",
        responses: {
          pam: { "pam-1": 2, "pam-2": 2, "pam-3": 2, "pam-4": 2, "pam-5": 2 },
          proms: { "proms-1": 3, "proms-2": 3, "proms-3": 3, "proms-4": 3 },
          confidenceScore: 7,
          confidenceImprovementPlan: null,
        },
        result: { pamTotal: 10, promsTotal: 12, promsMin: 3, combinedTotal: 22, percentage: 50, level: "L3", zone: "YELLOW" },
      },
    });
    expect(await stepStatus(legacy, 1, "PAM")).toBe("DONE");
    expect(await stepStatus(legacy, 1, "PROMS")).toBe("DONE");
    for (const instrument of ["PAM", "PROMS"] as const) {
      await expect(
        submitScreening(legacy.osm.actor, screeningInput(legacy.relationshipId, legacy.programId, instrument)),
      ).rejects.toBeInstanceOf(ConflictError);
    }
    const dataset = await getHospitalReportingDatasetForExport(legacy.owner.actor, { hospitalId: legacy.hospitalId });
    expect(dataset.programs.find((program) => program.patientProgramId === legacy.programId)?.screening).toMatchObject({
      pam: { state: "PRESENT", value: { score: 10 } },
      proms: { state: "PRESENT", value: { legacyTotal: 12 } },
    });
  });

  it("derives ทบทวนแผนสุขภาพ from the R2 answers and stores height and expert advice (R2-D/R2-F)", async () => {
    const fixture = await createFixture("plan-review");
    const programId = fixture.programId;

    await recordPatientProgramRoundVitals(fixture.osm.actor, vitalsInput(programId));
    await skipRestAndComplete(fixture, 1);
    const plan = await createGoalPlanForProgram(fixture.osm.actor, goalInput(programId));
    await skipRestAndComplete(fixture, 2);
    await expect(
      createFollowupForProgram(fixture.osm.actor, followupInput(programId, { sourceGoalPlanId: plan.goalPlanId, followedPlan: undefined })),
    ).rejects.toBeInstanceOf(ValidationError);
    // "เกิดอะไรขึ้นบ้าง?" is required: a blank answer would leave the step TODO on an immutable Follow-up.
    for (const reflectionNote of [null, "   "]) {
      await expect(
        createFollowupForProgram(fixture.osm.actor, followupInput(programId, { sourceGoalPlanId: plan.goalPlanId, reflectionNote })),
      ).rejects.toBeInstanceOf(ValidationError);
    }
    const round3Followup = await createFollowupForProgram(
      fixture.osm.actor,
      followupInput(programId, { sourceGoalPlanId: plan.goalPlanId, followedPlan: false, reflectionNote: "ลืมเดิน", heightCm: 158 }),
    );
    expect(await stepStatus(fixture, 3, "HEALTH_PLAN_REVIEW")).toBe("DONE");
    const round3 = await getProgramRoundDetail(fixture.osm.actor, fixture.relationshipId, programId, "3");
    expect(round3.vitals).toMatchObject({ heightCm: 158 });
    expect(round3.planReview).toEqual({ followedPlan: false, reflectionNote: "ลืมเดิน", expertAdvice: null });
    // A row without the answer (written before the rule) stays TODO under R2-F.
    await prisma.patientFollowup.update({ where: { id: round3Followup.followupId }, data: { reflectionNote: null } });
    expect(await stepStatus(fixture, 3, "HEALTH_PLAN_REVIEW")).toBe("TODO");

    await skipRestAndComplete(fixture, 3);
    await createFollowupForProgram(
      fixture.osm.actor,
      followupInput(programId, {
        sourceGoalPlanId: plan.goalPlanId,
        followedPlan: false,
        reflectionNote: "ฝนตกเดินไม่ได้",
        expertAdvice: "  เดินในบ้านแทน  ",
      }),
    );
    expect(await stepStatus(fixture, 4, "HEALTH_PLAN_REVIEW")).toBe("DONE");
    // Round 4 keeps the latest height from round 3's Follow-up when it records none.
    expect((await getProgramRoundDetail(fixture.osm.actor, fixture.relationshipId, programId, "4")).vitals).toMatchObject({ heightCm: 158 });
    expect(
      await prisma.patientFollowup.findFirstOrThrow({
        where: { patientProgramId: programId, roundNumber: 2 },
        select: { followedPlan: true, reflectionNote: true, expertAdvice: true },
      }),
    ).toEqual({ followedPlan: false, reflectionNote: "ฝนตกเดินไม่ได้", expertAdvice: "เดินในบ้านแทน" });

    // A Follow-up recorded before R2 (no followedPlan) keeps the D5 rule.
    await prisma.patientFollowup.update({ where: { id: round3Followup.followupId }, data: { followedPlan: null } });
    expect(await stepStatus(fixture, 3, "HEALTH_PLAN_REVIEW")).toBe("DONE");
  });

  it("needs a life table row or a photo of the paper page, and attaches the signed plan page (R2-E/R2-G)", async () => {
    const fixture = await createFixture("life-table");
    const programId = fixture.programId;

    await recordPatientProgramServiceOneRoutine(fixture.osm.actor, { patientProgramId: programId, roundNumber: 1, routineDate: "2026-10-20", entries: [] });
    expect(await stepStatus(fixture, 1, "ROUTINE")).toBe("TODO");
    const photo = await prisma.patientEvidenceArtifact.create({
      data: {
        patientHospitalRelationshipId: fixture.relationshipId,
        storageObjectKey: `r2/${randomUUID()}.jpg`,
        mediaType: "image/jpeg",
        byteSize: 1024,
        contentSha256: "a".repeat(64),
        createdByUserId: fixture.osm.userId,
      },
      select: { id: true },
    });
    await associatePatientProgramServiceOneArtifact(fixture.osm.actor, {
      patientProgramId: programId,
      roundNumber: 1,
      activity: "ROUTINE",
      patientEvidenceArtifactId: photo.id,
    });
    expect(await stepStatus(fixture, 1, "ROUTINE")).toBe("DONE");

    await skipRestAndComplete(fixture, 1);
    const plan = await createGoalPlanForProgram(fixture.osm.actor, goalInput(programId));
    const signed = await prisma.patientEvidenceArtifact.create({
      data: {
        patientHospitalRelationshipId: fixture.relationshipId,
        storageObjectKey: `r2/${randomUUID()}.jpg`,
        mediaType: "image/jpeg",
        byteSize: 2048,
        contentSha256: "b".repeat(64),
        createdByUserId: fixture.osm.userId,
      },
      select: { id: true },
    });
    await associatePatientProgramServiceOneArtifact(fixture.osm.actor, {
      patientProgramId: programId,
      roundNumber: 2,
      activity: "GOAL_PLAN",
      patientEvidenceArtifactId: signed.id,
    });
    expect(
      await prisma.patientProgramServiceOneArtifactAssociation.findFirstOrThrow({
        where: { patientEvidenceArtifactId: signed.id },
        select: { goalPlanId: true },
      }),
    ).toEqual({ goalPlanId: plan.goalPlanId });
  });

  it("reports the round 1 ruler as Before, a skipped tool as not done, and round 3 for the dream card (R1-E)", async () => {
    const fixture = await createFixture("report");
    const programId = fixture.programId;

    await recordPatientProgramRoundVitals(fixture.osm.actor, vitalsInput(programId));
    await recordPatientProgramServiceOneConfidence(fixture.osm.actor, { patientProgramId: programId, roundNumber: 1, score: 4 });
    // The floating chart is skipped with a reason, so it reports as not done.
    await skipPatientProgramRoundStep(fixture.osm.actor, { patientProgramId: programId, roundNumber: 1, stepCode: "FLOATING_CHART", reasonCode: "EQUIPMENT_UNAVAILABLE" });
    await recordPatientProgramServiceOneRoutine(fixture.osm.actor, { patientProgramId: programId, roundNumber: 1, ...routineTable() });
    await skipRestAndComplete(fixture, 1);
    await recordPatientProgramRoundVitals(fixture.osm.actor, vitalsInput(programId, { roundNumber: 2, weight: 73, heightCm: 163, bloodSugar: 112 }));
    await skipRestAndComplete(fixture, 2);
    await recordPatientProgramServiceOneDreamCard(fixture.osm.actor, { patientProgramId: programId, roundNumber: 3, ...dreamCard("ความฝัน") });

    const dataset = await getHospitalReportingDatasetForExport(fixture.owner.actor, { hospitalId: fixture.hospitalId });
    const row = dataset.programs.find((program) => program.patientProgramId === programId);

    expect(row?.serviceOne).toMatchObject({
      routine: { state: "PRESENT" },
      floatingChart: { state: "MISSING" },
      dreamCard: { state: "PRESENT" },
      confidence: { state: "PRESENT", value: { score: 4 } },
    });
    expect(row?.roundVitals.round2).toMatchObject({
      state: "PRESENT",
      value: { measurements: { bloodSugar: { value: 112 }, weight: { value: 73 } } },
    });
    expect(row?.latestHeightCm).toEqual({ state: "RECORDED", value: 163 });
  });

  it("enforces round shape in the database", async () => {
    const fixture = await createFixture("constraints");
    const base = {
      patientProgramId: fixture.programId,
      patientHospitalRelationshipId: fixture.relationshipId,
    };

    // ADR-0022: rounds are numbered 1-12, and every round fact needs its round opened.
    await expect(
      prisma.patientProgramRoundVitals.create({
        data: { ...base, recordedByUserId: fixture.osm.userId, roundNumber: 13, serviceDate: new Date("2026-08-17"), weight: 70, submissionNonce: randomUUID() },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.patientProgramRoundVitals.create({
        data: { ...base, recordedByUserId: fixture.osm.userId, roundNumber: 3, serviceDate: new Date("2026-08-17"), weight: 70, submissionNonce: randomUUID() },
      }),
    ).rejects.toThrow(/has not been opened/u);
    await expect(
      prisma.patientProgramRoundCompletion.create({
        data: { ...base, completedByUserId: fixture.osm.userId, roundNumber: 13, submissionNonce: randomUUID() },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.patientProgramRoundCompletion.create({
        data: { ...base, completedByUserId: fixture.osm.userId, roundNumber: 7, submissionNonce: randomUUID() },
      }),
    ).rejects.toThrow(/has not been opened/u);
    await expect(
      prisma.patientProgramRoundStepSkip.create({
        data: { ...base, skippedByUserId: fixture.osm.userId, roundNumber: 1, planItemId: randomUUID(), stepCode: "PAM", reasonCode: "OTHER", note: null },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.patientHospitalProfile.update({
        where: { patientHospitalRelationshipId: fixture.relationshipId },
        data: { preferredName: " padded " },
      }),
    ).rejects.toThrow();

    await prisma.patientProgramServiceOneFloatingChart.create({
      data: {
        patientProgramId: fixture.programId,
        roundNumber: 1,
        recordedByUserId: fixture.osm.userId,
        summary: "สรุป legacy",
      },
    });
    expect(await stepStatus(fixture, 1, "FLOATING_CHART")).toBe("DONE");
    // Round 4's plan lists the floating chart once the round is opened.
    await openProgramRound(fixture.programId, 4);
    await expect(
      prisma.patientProgramServiceOneFloatingChart.create({
        data: {
          patientProgramId: fixture.programId,
          roundNumber: 4,
          recordedByUserId: fixture.osm.userId,
          familyScore: 0,
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.patientProgramServiceOneFloatingChart.create({
        data: {
          patientProgramId: fixture.programId,
          roundNumber: 4,
          recordedByUserId: fixture.osm.userId,
          familyScore: 6,
          eatingScore: 0,
          workScore: 0,
          healthScore: 0,
          financeScore: 0,
          travelScore: 0,
          exerciseScore: 0,
          wellbeingScore: 0,
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.patientProgramServiceOneFloatingChart.create({
        data: {
          patientProgramId: fixture.programId,
          roundNumber: 4,
          recordedByUserId: fixture.osm.userId,
          familyScore: -5,
          eatingScore: -5,
          workScore: 0,
          healthScore: 0,
          financeScore: 0,
          travelScore: 0,
          exerciseScore: 5,
          wellbeingScore: 5,
        },
      }),
    ).resolves.toMatchObject({ familyScore: -5, wellbeingScore: 5 });
  });
});

describe("Plan-driven service rounds foundation (ADR-0022, FR-1)", () => {
  const migrationSql = readFileSync(
    resolve(process.cwd(), "prisma/migrations/20261124100000_plan_driven_service_rounds/migration.sql"),
    "utf8",
  );
  const dataStepStatements = migrationSql
    .slice(migrationSql.indexOf("-- BEGIN FR-1 data step"), migrationSql.indexOf("-- END FR-1 data step"))
    .split(";")
    .map((statement) => statement.replace(/^\s*--.*$/gmu, "").trim())
    .filter(Boolean);
  const guidelineCodes = (roundNumber: number) => roundGuideline(roundNumber).map((step) => step.code);

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

  async function activePlan(programId: string, roundNumber: number) {
    return prisma.patientProgramRoundPlanItem.findMany({
      where: { patientProgramId: programId, roundNumber, removedAt: null },
      orderBy: { position: "asc" },
      select: { id: true, stepCode: true, position: true, origin: true, addedByUserId: true },
    });
  }

  function planItem(fixture: Fixture, roundNumber: number, data: Record<string, unknown>) {
    return prisma.patientProgramRoundPlanItem.create({
      data: {
        patientProgramId: fixture.programId,
        patientHospitalRelationshipId: fixture.relationshipId,
        roundNumber,
        position: 20,
        origin: "ADDED",
        addedByUserId: fixture.osm.userId,
        stepCode: "CUSTOM",
        customTitle: "เดินรอบหมู่บ้าน",
        ...data,
      } as unknown as Prisma.PatientProgramRoundPlanItemUncheckedCreateInput,
      select: { id: true },
    });
  }

  it("opens round 1 with the Program and round n + 1 on completing round n, each with the guideline plan", async () => {
    const fixture = await createFixture("plan-open");

    const opened = await prisma.patientProgramRound.findMany({
      where: { patientProgramId: fixture.programId },
      select: { roundNumber: true, origin: true, openedByUserId: true },
    });
    expect(opened).toEqual([{ roundNumber: 1, origin: "GUIDELINE", openedByUserId: fixture.owner.userId }]);
    const roundOne = await activePlan(fixture.programId, 1);
    expect(roundOne.map((item) => item.stepCode)).toEqual(guidelineCodes(1));
    expect(roundOne.map((item) => item.position)).toEqual(guidelineCodes(1).map((_, index) => index + 1));
    expect(roundOne.every((item) => item.origin === "GUIDELINE" && item.addedByUserId === null)).toBe(true);

    await skipRestAndComplete(fixture, 1);

    const roundTwo = await prisma.patientProgramRound.findUnique({
      where: { patientProgramId_roundNumber: { patientProgramId: fixture.programId, roundNumber: 2 } },
      select: { origin: true, openedByUserId: true },
    });
    expect(roundTwo).toEqual({ origin: "GUIDELINE", openedByUserId: fixture.osm.userId });
    expect((await activePlan(fixture.programId, 2)).map((item) => item.stepCode)).toEqual(guidelineCodes(2));
    expect(await prisma.patientProgramRound.count({ where: { patientProgramId: fixture.programId } })).toBe(2);
  });

  it("rejects a tool result without an active plan item, also after a soft removal, and accepts it once re-added", async () => {
    const fixture = await createFixture("plan-tool");
    const routine = { patientProgramId: fixture.programId, roundNumber: 1, recordedByUserId: fixture.osm.userId };
    const [routineItem] = (await activePlan(fixture.programId, 1)).filter((item) => item.stepCode === "ROUTINE");
    expect(routineItem).toBeDefined();

    // Round 2 is not opened: no plan item, so the database refuses the tool (service path: sequencing).
    await expect(
      prisma.patientProgramServiceOneRoutine.create({ data: { ...routine, roundNumber: 2 } }),
    ).rejects.toThrow(/does not list this tool/u);

    await prisma.patientProgramRoundPlanItem.update({
      where: { id: routineItem?.id },
      data: { removedAt: new Date(), removedByUserId: fixture.osm.userId },
    });
    await expect(prisma.patientProgramServiceOneRoutine.create({ data: routine })).rejects.toThrow(/does not list this tool/u);
    await expect(
      recordPatientProgramServiceOneRoutine(fixture.osm.actor, { patientProgramId: fixture.programId, roundNumber: 1, ...routineTable() }),
    ).rejects.toThrow(new RoundConflictError("รายการนี้ไม่อยู่ในแผนของครั้งที่ 1"));
    expect(await stepStatus(fixture, 1, "ROUTINE")).toBeUndefined();

    // A removal is final; re-adding the step creates a new item (the partial unique key allows it).
    await expect(
      prisma.patientProgramRoundPlanItem.update({ where: { id: routineItem?.id }, data: { removedAt: null, removedByUserId: null } }),
    ).rejects.toThrow(/identity and removal cannot be changed/u);
    await planItem(fixture, 1, { stepCode: "ROUTINE", customTitle: null });
    await expect(planItem(fixture, 1, { stepCode: "ROUTINE", customTitle: null })).rejects.toMatchObject({ code: "P2002" });

    await recordPatientProgramServiceOneRoutine(fixture.osm.actor, { patientProgramId: fixture.programId, roundNumber: 1, ...routineTable() });
    expect(await stepStatus(fixture, 1, "ROUTINE")).toBe("DONE");
    expect(
      await prisma.patientProgramRoundPlanItem.count({ where: { patientProgramId: fixture.programId, roundNumber: 1, stepCode: "ROUTINE" } }),
    ).toBe(2);
  });

  it("allows several CUSTOM items and enforces their title, done and origin shape", async () => {
    const fixture = await createFixture("plan-custom");
    const now = new Date();

    await planItem(fixture, 1, { customTitle: "เดินรอบหมู่บ้าน" });
    await planItem(fixture, 1, { customTitle: "ลดน้ำหวาน", position: 21 });
    const done = await planItem(fixture, 1, {
      customTitle: "นัดตรวจตา",
      position: 22,
      doneAt: now,
      doneByUserId: fixture.osm.userId,
      doneNote: "ไปตรวจแล้ว",
    });
    const detail = await getProgramRoundDetail(fixture.owner.actor, fixture.relationshipId, fixture.programId, "1");
    expect(detail.status.steps.filter((step) => step.code === "CUSTOM").map((step) => [step.label, step.status])).toEqual([
      ["เดินรอบหมู่บ้าน", "TODO"],
      ["ลดน้ำหวาน", "TODO"],
      ["นัดตรวจตา", "DONE"],
    ]);
    expect(detail.status.steps.find((step) => step.planItemId === done.id)?.status).toBe("DONE");

    const rejected: Record<string, unknown>[] = [
      { customTitle: null },
      { customTitle: "  " },
      { customTitle: " เว้นวรรค " },
      { customTitle: "ก".repeat(121) },
      { stepCode: "ROUTINE", customTitle: "ตาราง" },
      { stepCode: "HEALTHY_PLAN", customTitle: null, doneAt: now, doneByUserId: fixture.osm.userId },
      { doneAt: now },
      { doneByUserId: fixture.osm.userId },
      { doneNote: "ยังไม่ได้ทำ" },
      { doneAt: now, doneByUserId: fixture.osm.userId, doneNote: " " },
      { removedAt: now },
      { origin: "GUIDELINE" },
      { addedByUserId: null },
      { position: 0 },
    ];
    for (const data of rejected) {
      await expect(planItem(fixture, 1, data)).rejects.toThrow();
    }
  });

  it("freezes the plan and the round row of a completed round and never deletes a round or plan item", async () => {
    const fixture = await createFixture("plan-frozen");
    await skipRestAndComplete(fixture, 1);
    const [roundOneItem] = await activePlan(fixture.programId, 1);
    const [roundTwoItem] = await activePlan(fixture.programId, 2);

    await expect(planItem(fixture, 1, {})).rejects.toThrow(/plan of a completed program round/u);
    await expect(
      prisma.patientProgramRoundPlanItem.update({ where: { id: roundOneItem?.id }, data: { position: 30 } }),
    ).rejects.toThrow(/plan of a completed program round/u);
    await expect(
      prisma.patientProgramRoundPlanItem.update({
        where: { id: roundOneItem?.id },
        data: { removedAt: new Date(), removedByUserId: fixture.osm.userId },
      }),
    ).rejects.toThrow(/plan of a completed program round/u);
    await expect(
      prisma.patientProgramRound.update({
        where: { patientProgramId_roundNumber: { patientProgramId: fixture.programId, roundNumber: 1 } },
        data: { openedAt: new Date() },
      }),
    ).rejects.toThrow(/completed program round cannot be changed/u);

    // The open round 2 plan is editable (FR-2), but nothing is ever hard-deleted outside the reset switch.
    await expect(
      prisma.patientProgramRoundPlanItem.update({ where: { id: roundTwoItem?.id }, data: { position: 30 } }),
    ).resolves.toMatchObject({ position: 30 });
    await expect(prisma.patientProgramRoundPlanItem.delete({ where: { id: roundTwoItem?.id } })).rejects.toThrow(
      /removed by marking them removed/u,
    );
    await expect(
      prisma.patientProgramRound.delete({
        where: { patientProgramId_roundNumber: { patientProgramId: fixture.programId, roundNumber: 2 } },
      }),
    ).rejects.toThrow(/cannot be removed/u);
  });

  it("numbers rounds 1-12 with GUIDELINE exactly for rounds 1-6 and requires an opened round for every round fact", async () => {
    const fixture = await createFixture("plan-range");
    const round = (roundNumber: number, origin: "GUIDELINE" | "EXTRA") =>
      prisma.patientProgramRound.create({
        data: {
          patientProgramId: fixture.programId,
          patientHospitalRelationshipId: fixture.relationshipId,
          roundNumber,
          origin,
          openedAt: new Date(),
          openedByUserId: fixture.osm.userId,
          submissionNonce: randomUUID(),
        },
        select: { roundNumber: true },
      });

    await expect(round(13, "EXTRA")).rejects.toThrow();
    await expect(round(0, "GUIDELINE")).rejects.toThrow();
    await expect(round(3, "EXTRA")).rejects.toThrow();
    await expect(round(7, "GUIDELINE")).rejects.toThrow();
    await expect(round(1, "GUIDELINE")).rejects.toMatchObject({ code: "P2002" });
    // FR-1b: round 7 opens only once round 6 is completed.
    await expect(round(7, "EXTRA")).rejects.toThrow(/previous round is completed/u);
    await openProgramRound(fixture.programId, 7);
    await expect(round(7, "EXTRA")).resolves.toEqual({ roundNumber: 7 });

    // Rounds 7-12 open with an empty plan; a tool there needs a plan item first.
    const tool = { patientProgramId: fixture.programId, roundNumber: 7, recordedByUserId: fixture.osm.userId };
    await expect(prisma.patientProgramServiceOneDreamCard.create({ data: tool })).rejects.toThrow(/does not list this tool/u);
    await planItem(fixture, 7, { stepCode: "DREAM_CARD", customTitle: null, position: 1 });
    await expect(prisma.patientProgramServiceOneDreamCard.create({ data: tool, select: { roundNumber: true } })).resolves.toEqual({
      roundNumber: 7,
    });

    const scope = { patientProgramId: fixture.programId, patientHospitalRelationshipId: fixture.relationshipId };
    await expect(
      prisma.patientProgramRoundStepSkip.create({
        data: { ...scope, roundNumber: 8, planItemId: randomUUID(), stepCode: "VITALS", reasonCode: "PATIENT_DECLINED", skippedByUserId: fixture.osm.userId },
      }),
    ).rejects.toThrow(/needs an active plan item/u);
    await expect(
      prisma.patientProgramRoundVitals.create({
        data: { ...scope, roundNumber: 7, serviceDate: new Date("2026-08-17"), weight: 70, recordedByUserId: fixture.osm.userId, submissionNonce: randomUUID() },
        select: { roundNumber: true },
      }),
    ).resolves.toEqual({ roundNumber: 7 });
  });

  it("seeds round 1 and each round after a completed one from the guideline for 0, 3 and 6 completions", async () => {
    const programs = [
      { id: randomUUID(), relationshipId: randomUUID(), creatorId: randomUUID(), completions: 0 },
      { id: randomUUID(), relationshipId: randomUUID(), creatorId: randomUUID(), completions: 3 },
      { id: randomUUID(), relationshipId: randomUUID(), creatorId: randomUUID(), completions: 6 },
    ];
    const startedAt = new Date("2026-08-01T03:00:00.000Z");
    const completedAt = (roundNumber: number) => new Date(Date.UTC(2026, 7, 1 + roundNumber * 7, 3));
    const completerId = randomUUID();
    const rollback = new Error("roll back the data step rehearsal");

    // Temporary tables shadow the real ones for this transaction only (as in the R2b migration test).
    await expect(
      prisma.$transaction(async (transaction) => {
        await transaction.$executeRaw`
          CREATE TEMPORARY TABLE "PatientProgram" (
            "id" UUID PRIMARY KEY, "patientHospitalRelationshipId" UUID NOT NULL,
            "startedAt" TIMESTAMPTZ(3) NOT NULL, "createdByUserId" UUID NOT NULL
          ) ON COMMIT DROP`;
        await transaction.$executeRaw`
          CREATE TEMPORARY TABLE "PatientProgramRoundCompletion" (
            "patientProgramId" UUID NOT NULL, "patientHospitalRelationshipId" UUID NOT NULL, "roundNumber" INTEGER NOT NULL,
            "completedAt" TIMESTAMPTZ(3) NOT NULL, "completedByUserId" UUID NOT NULL
          ) ON COMMIT DROP`;
        await transaction.$executeRaw`
          CREATE TEMPORARY TABLE "PatientProgramRound" (
            "id" UUID PRIMARY KEY, "patientProgramId" UUID NOT NULL, "patientHospitalRelationshipId" UUID NOT NULL,
            "roundNumber" INTEGER NOT NULL, "origin" "PatientProgramRoundOrigin" NOT NULL, "openedAt" TIMESTAMPTZ(3) NOT NULL,
            "openedByUserId" UUID NOT NULL, "submissionNonce" UUID NOT NULL UNIQUE, UNIQUE ("patientProgramId", "roundNumber")
          ) ON COMMIT DROP`;
        await transaction.$executeRaw`
          CREATE TEMPORARY TABLE "PatientProgramRoundPlanItem" (
            "id" UUID PRIMARY KEY, "patientProgramId" UUID NOT NULL, "patientHospitalRelationshipId" UUID NOT NULL,
            "roundNumber" INTEGER NOT NULL, "stepCode" "PatientProgramRoundStepCode" NOT NULL, "position" INTEGER NOT NULL,
            "origin" "PatientProgramRoundPlanItemOrigin" NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL
          ) ON COMMIT DROP`;

        for (const program of programs) {
          await transaction.$executeRaw`
            INSERT INTO "PatientProgram" ("id", "patientHospitalRelationshipId", "startedAt", "createdByUserId")
            VALUES (${program.id}::uuid, ${program.relationshipId}::uuid, ${startedAt}, ${program.creatorId}::uuid)`;
          for (let roundNumber = 1; roundNumber <= program.completions; roundNumber += 1) {
            await transaction.$executeRaw`
              INSERT INTO "PatientProgramRoundCompletion" ("patientProgramId", "patientHospitalRelationshipId", "roundNumber", "completedAt", "completedByUserId")
              VALUES (${program.id}::uuid, ${program.relationshipId}::uuid, ${roundNumber}, ${completedAt(roundNumber)}, ${completerId}::uuid)`;
          }
        }

        for (const statement of dataStepStatements) {
          await transaction.$executeRawUnsafe(statement);
        }

        const rounds = await transaction.$queryRaw<Array<{
          patientProgramId: string; roundNumber: number; origin: string; openedAt: Date; openedByUserId: string;
        }>>`
          SELECT "patientProgramId"::text AS "patientProgramId", "roundNumber", "origin"::text AS "origin", "openedAt", "openedByUserId"::text AS "openedByUserId"
          FROM "PatientProgramRound" ORDER BY "patientProgramId", "roundNumber"`;
        const items = await transaction.$queryRaw<Array<{
          patientProgramId: string; roundNumber: number; stepCode: string; position: number; origin: string; createdAt: Date;
        }>>`
          SELECT "patientProgramId"::text AS "patientProgramId", "roundNumber", "stepCode"::text AS "stepCode", "position", "origin"::text AS "origin", "createdAt"
          FROM "PatientProgramRoundPlanItem" ORDER BY "patientProgramId", "roundNumber", "position"`;

        for (const program of programs) {
          const expectedRounds = Array.from({ length: Math.min(program.completions + 1, 6) }, (_, index) => index + 1);
          const programRounds = rounds.filter((row) => row.patientProgramId === program.id);

          expect(programRounds.map((row) => row.roundNumber)).toEqual(expectedRounds);
          expect(programRounds.every((row) => row.origin === "GUIDELINE")).toBe(true);
          expect(programRounds[0]).toMatchObject({ openedAt: startedAt, openedByUserId: program.creatorId });
          for (const row of programRounds.slice(1)) {
            expect(row).toMatchObject({ openedAt: completedAt(row.roundNumber - 1), openedByUserId: completerId });
          }

          for (const roundNumber of expectedRounds) {
            const plan = items.filter((row) => row.patientProgramId === program.id && row.roundNumber === roundNumber);
            const openedAt = programRounds.find((row) => row.roundNumber === roundNumber)?.openedAt;

            expect(plan.map((row) => [row.stepCode, row.position])).toEqual(
              guidelineCodes(roundNumber).map((code, index) => [code, index + 1]),
            );
            expect(plan.every((row) => row.origin === "GUIDELINE" && row.createdAt.getTime() === openedAt?.getTime())).toBe(true);
          }
        }

        throw rollback;
      }),
    ).rejects.toBe(rollback);
    expect(await prisma.patientProgramRound.count({ where: { patientProgramId: { in: programs.map((program) => program.id) } } })).toBe(0);
  });
});

describe("Round skips keyed by plan item, ledger range and round opening order (ADR-0022, FR-1b)", () => {
  const migrationSql = readFileSync(
    resolve(process.cwd(), "prisma/migrations/20261125100000_round_skips_by_plan_item/migration.sql"),
    "utf8",
  );
  const dataStep = migrationSql.slice(
    migrationSql.indexOf("-- BEGIN FR-1b data step"),
    migrationSql.indexOf("-- END FR-1b data step"),
  );
  // The trigger toggles around the UPDATE do not apply to the temporary tables of the rehearsal.
  const backfillStatements = [
    /DO \$\$[\s\S]*?\$\$;/u.exec(dataStep)?.[0] ?? "",
    /UPDATE "PatientProgramRoundStepSkip"[\s\S]*?;/u.exec(dataStep)?.[0] ?? "",
  ];

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

  function addPlanItem(fixture: Fixture, roundNumber: number, data: Record<string, unknown>) {
    return prisma.patientProgramRoundPlanItem.create({
      data: {
        patientProgramId: fixture.programId,
        patientHospitalRelationshipId: fixture.relationshipId,
        roundNumber,
        origin: "ADDED",
        addedByUserId: fixture.osm.userId,
        ...data,
      } as unknown as Prisma.PatientProgramRoundPlanItemUncheckedCreateInput,
      select: { id: true },
    });
  }

  function rawSkip(fixture: Fixture, data: { planItemId: string; roundNumber: number; stepCode: RoundStepCode }) {
    return prisma.patientProgramRoundStepSkip.create({
      data: {
        patientProgramId: fixture.programId,
        patientHospitalRelationshipId: fixture.relationshipId,
        reasonCode: "PATIENT_DECLINED",
        skippedByUserId: fixture.osm.userId,
        ...data,
      },
      select: { id: true },
    });
  }

  async function guidelineItemId(fixture: Fixture, roundNumber: number, stepCode: RoundStepCode): Promise<string> {
    const item = await prisma.patientProgramRoundPlanItem.findFirstOrThrow({
      where: { patientProgramId: fixture.programId, roundNumber, stepCode, removedAt: null },
      select: { id: true },
    });

    return item.id;
  }

  function removeItem(fixture: Fixture, id: string) {
    return prisma.patientProgramRoundPlanItem.update({
      where: { id },
      data: { removedAt: new Date(), removedByUserId: fixture.osm.userId },
      select: { id: true },
    });
  }

  it("links every existing skip to its round's item of the step and fails loudly without exactly one", async () => {
    expect(backfillStatements.every((statement) => statement.length > 0)).toBe(true);
    const programId = randomUUID();
    const rollback = new Error("roll back the backfill rehearsal");

    const rehearse = (items: readonly (readonly [number, string, boolean])[], skips: readonly (readonly [number, string])[]) =>
      prisma.$transaction(async (transaction) => {
        // Temporary tables shadow the real ones for this transaction only (as in the FR-1 data step test).
        await transaction.$executeRaw`
          CREATE TEMPORARY TABLE "PatientProgramRoundPlanItem" (
            "id" UUID PRIMARY KEY, "patientProgramId" UUID NOT NULL, "roundNumber" INTEGER NOT NULL,
            "stepCode" "PatientProgramRoundStepCode" NOT NULL, "removedAt" TIMESTAMPTZ(3)
          ) ON COMMIT DROP`;
        await transaction.$executeRaw`
          CREATE TEMPORARY TABLE "PatientProgramRoundStepSkip" (
            "id" UUID PRIMARY KEY, "patientProgramId" UUID NOT NULL, "roundNumber" INTEGER NOT NULL,
            "stepCode" "PatientProgramRoundStepCode" NOT NULL, "planItemId" UUID
          ) ON COMMIT DROP`;
        for (const [roundNumber, stepCode, removed] of items) {
          await transaction.$executeRaw`
            INSERT INTO "PatientProgramRoundPlanItem" ("id", "patientProgramId", "roundNumber", "stepCode", "removedAt")
            VALUES (gen_random_uuid(), ${programId}::uuid, ${roundNumber}, ${stepCode}::"PatientProgramRoundStepCode", ${removed ? new Date() : null})`;
        }
        for (const [roundNumber, stepCode] of skips) {
          await transaction.$executeRaw`
            INSERT INTO "PatientProgramRoundStepSkip" ("id", "patientProgramId", "roundNumber", "stepCode")
            VALUES (gen_random_uuid(), ${programId}::uuid, ${roundNumber}, ${stepCode}::"PatientProgramRoundStepCode")`;
        }

        for (const statement of backfillStatements) {
          await transaction.$executeRawUnsafe(statement);
        }

        const linked = await transaction.$queryRaw<Array<{ roundNumber: number; stepCode: string; itemRound: number | null; itemStep: string | null }>>`
          SELECT "skip"."roundNumber", "skip"."stepCode"::text AS "stepCode",
                 "item"."roundNumber" AS "itemRound", "item"."stepCode"::text AS "itemStep"
          FROM "PatientProgramRoundStepSkip" AS "skip"
          LEFT JOIN "PatientProgramRoundPlanItem" AS "item" ON "item"."id" = "skip"."planItemId"
          ORDER BY "skip"."roundNumber", "skip"."stepCode"::text`;
        expect(linked).toEqual(
          [...skips]
            .sort((left, right) => left[0] - right[0] || left[1].localeCompare(right[1]))
            .map(([roundNumber, stepCode]) => ({ roundNumber, stepCode, itemRound: roundNumber, itemStep: stepCode })),
        );

        throw rollback;
      });

    await expect(
      rehearse(
        [[1, "VITALS", false], [1, "PAM", false], [1, "PROMS", false], [2, "ROUTINE", false], [2, "VITALS", false]],
        [[1, "PAM"], [1, "PROMS"], [2, "ROUTINE"]],
      ),
    ).rejects.toBe(rollback);
    await expect(rehearse([[1, "VITALS", false]], [[1, "PAM"]])).rejects.toThrow(/do not match exactly one plan item/u);
    await expect(rehearse([[1, "PAM", true], [1, "PAM", false]], [[1, "PAM"]])).rejects.toThrow(
      /do not match exactly one plan item/u,
    );
  });

  it("lets two CUSTOM items of one round each hold their own skip through the skip service", async () => {
    const fixture = await createFixture("skip-custom");
    const walk = await addPlanItem(fixture, 1, { stepCode: "CUSTOM", customTitle: "เดินรอบหมู่บ้าน", position: 20 });
    const garden = await addPlanItem(fixture, 1, { stepCode: "CUSTOM", customTitle: "ทำสวน", position: 21 });
    const target = { patientProgramId: fixture.programId, roundNumber: 1 };
    const customStatuses = async () => {
      const detail = await getProgramRoundDetail(fixture.owner.actor, fixture.relationshipId, fixture.programId, "1");
      return detail.status.steps.filter((step) => step.code === "CUSTOM").map((step) => [step.planItemId, step.status]);
    };

    await expect(
      skipPlanItem(fixture.osm.actor, { ...target, planItemId: walk.id, reasonCode: "PATIENT_DECLINED" }),
    ).resolves.toMatchObject({ operation: "RECORDED" });
    expect(await customStatuses()).toEqual([[walk.id, "SKIPPED"], [garden.id, "TODO"]]);

    await expect(
      skipPlanItem(fixture.osm.actor, { ...target, planItemId: garden.id, reasonCode: "PATIENT_UNABLE" }),
    ).resolves.toMatchObject({ operation: "RECORDED" });
    expect(await customStatuses()).toEqual([[walk.id, "SKIPPED"], [garden.id, "SKIPPED"]]);

    await expect(unskipPlanItem(fixture.osm.actor, { ...target, planItemId: walk.id })).resolves.toMatchObject({
      operation: "RECORDED",
    });
    expect(await customStatuses()).toEqual([[walk.id, "TODO"], [garden.id, "SKIPPED"]]);

    // An item outside the round's plan is refused before anything is written.
    await expect(
      skipPlanItem(fixture.osm.actor, { ...target, planItemId: randomUUID(), reasonCode: "PATIENT_DECLINED" }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await prisma.patientProgramRoundStepSkip.count({ where: { patientProgramId: fixture.programId } })).toBe(1);
  });

  it("rejects a skip of a removed item and the removal of a skipped item", async () => {
    const fixture = await createFixture("skip-removed");
    const routine = await guidelineItemId(fixture, 1, "ROUTINE");
    const ruler = await guidelineItemId(fixture, 1, "CONFIDENCE_RULER");

    await removeItem(fixture, routine);
    await expect(rawSkip(fixture, { planItemId: routine, roundNumber: 1, stepCode: "ROUTINE" })).rejects.toThrow(
      /needs an active plan item/u,
    );
    await expect(
      skipPlanItem(fixture.osm.actor, {
        patientProgramId: fixture.programId,
        roundNumber: 1,
        planItemId: routine,
        reasonCode: "PATIENT_DECLINED",
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    // The step added again starts without a skip and takes its own.
    const readded = await addPlanItem(fixture, 1, { stepCode: "ROUTINE", position: 20 });
    expect(await stepStatus(fixture, 1, "ROUTINE")).toBe("TODO");
    await rawSkip(fixture, { planItemId: readded.id, roundNumber: 1, stepCode: "ROUTINE" });
    expect(await stepStatus(fixture, 1, "ROUTINE")).toBe("SKIPPED");

    await rawSkip(fixture, { planItemId: ruler, roundNumber: 1, stepCode: "CONFIDENCE_RULER" });
    await expect(removeItem(fixture, ruler)).rejects.toThrow(/unskipped before it is removed/u);
    await unskipPlanItem(fixture.osm.actor, { patientProgramId: fixture.programId, roundNumber: 1, planItemId: ruler });
    await expect(removeItem(fixture, ruler)).resolves.toEqual({ id: ruler });
  });

  it("keeps a skip's step and round equal to its item's (composite foreign key)", async () => {
    const fixture = await createFixture("skip-fk");
    const routine = await guidelineItemId(fixture, 1, "ROUTINE");

    await expect(rawSkip(fixture, { planItemId: routine, roundNumber: 1, stepCode: "PAM" })).rejects.toMatchObject({ code: "P2003" });
    await openProgramRound(fixture.programId, 2);
    const roundTwoRoutine = await guidelineItemId(fixture, 2, "ROUTINE");
    // Round 1 is completed now; its item cannot carry a skip of the open round 2, nor another step's skip.
    await expect(rawSkip(fixture, { planItemId: routine, roundNumber: 2, stepCode: "ROUTINE" })).rejects.toMatchObject({
      code: "P2003",
    });
    await expect(rawSkip(fixture, { planItemId: roundTwoRoutine, roundNumber: 2, stepCode: "VITALS" })).rejects.toMatchObject({
      code: "P2003",
    });
    await expect(rawSkip(fixture, { planItemId: roundTwoRoutine, roundNumber: 2, stepCode: "ROUTINE" })).resolves.toEqual({
      id: expect.any(String),
    });
    await expect(rawSkip(fixture, { planItemId: roundTwoRoutine, roundNumber: 2, stepCode: "ROUTINE" })).rejects.toMatchObject({
      code: "P2002",
    });
  });

  it("accepts ledger rows in round 7 once it is opened and opens a round only after the one before it", async () => {
    const fixture = await createFixture("ledger-order");
    const scope = { patientProgramId: fixture.programId, patientHospitalRelationshipId: fixture.relationshipId };
    const round = (roundNumber: number) =>
      prisma.patientProgramRound.create({
        data: {
          ...scope,
          roundNumber,
          origin: roundNumber <= 6 ? "GUIDELINE" : "EXTRA",
          openedAt: new Date(),
          openedByUserId: fixture.osm.userId,
          submissionNonce: randomUUID(),
        },
        select: { roundNumber: true },
      });
    const ledger = (roundNumber: number) =>
      prisma.patientProgramRoundActivity.create({
        data: {
          ...scope,
          roundNumber,
          toolCode: "CONFIDENCE_RULER",
          source: "EXTRA",
          mode: "RECORDED",
          performedAt: new Date(),
          recordedByUserId: fixture.osm.userId,
          submissionNonce: randomUUID(),
        },
        select: { roundNumber: true },
      });

    // Round 1 always opens; a later round only once the round before it is completed.
    await clearProgramRoundCompletions([fixture.programId]);
    await expect(round(3)).rejects.toThrow(/previous round is completed/u);
    await expect(round(1)).resolves.toEqual({ roundNumber: 1 });
    await expect(round(2)).rejects.toThrow(/previous round is completed/u);

    await openProgramRound(fixture.programId, 7);
    await expect(round(8)).rejects.toThrow(/previous round is completed/u);
    await expect(round(7)).resolves.toEqual({ roundNumber: 7 });
    await expect(ledger(7)).resolves.toEqual({ roundNumber: 7 });
    await expect(ledger(13)).rejects.toThrow();
  });
});
