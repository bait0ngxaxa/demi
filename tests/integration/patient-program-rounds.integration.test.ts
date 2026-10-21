import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Role,
  UserStatus,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
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
  skipPatientProgramRoundStep,
  unskipPatientProgramRoundStep,
} from "@/modules/patient-program-rounds/services/round-service";
import { openPatientProgram } from "@/modules/patient-program/services/patient-program-service";
import {
  recordPatientProgramServiceOneConfidence,
  recordPatientProgramServiceOneDreamCard,
  recordPatientProgramServiceOneFloatingChart,
  recordPatientProgramServiceOneRoutine,
} from "@/modules/patient-program/services/patient-program-service-one-service";
import { provisionPatientFixture as provisionPatient } from "./support/patient-provisioning";
import { getHospitalReportingDatasetForExport } from "@/modules/reporting/services/hospital-report-query-service";
import { submitScreening } from "@/modules/screening/services/screening-service";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/application-error";

import { clearProgramRoundCompletions } from "./support/program-rounds";

const prisma = getPrisma();
let sequence = 0;
const previousCursorSecret = process.env.DEMI_HOSPITAL_REPORTING_CURSOR_SECRET;

async function clearDatabase(): Promise<void> {
  await clearProgramRoundCompletions();
  await prisma.patientProgramRoundActivity.deleteMany();
  await prisma.patientProgramRoundVitals.deleteMany();
  await prisma.patientProgramServiceOneArtifactAssociation.deleteMany();
  await prisma.patientProgramServiceOneConfidence.deleteMany();
  await prisma.patientProgramServiceOneDreamCard.deleteMany();
  await prisma.patientProgramServiceOneFloatingChart.deleteMany();
  await prisma.patientProgramServiceOneRoutine.deleteMany();
  await prisma.patientFollowupActivityProgress.deleteMany();
  await prisma.patientGoalPlan.updateMany({ where: { sourceFollowupId: { not: null } }, data: { sourceFollowupId: null } });
  await prisma.patientFollowup.deleteMany();
  await prisma.patientFinalAssessment.deleteMany();
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
  await prisma.patientHospitalRelationship.deleteMany();
  await prisma.personalExerciseEntry.deleteMany();
  await prisma.patientProfile.deleteMany();
  await prisma.workforceActivation.deleteMany();
  await prisma.osmHospitalRelationship.deleteMany();
  await prisma.hospitalOnboardingApplication.deleteMany();
  await prisma.hospitalMembership.deleteMany();
  await prisma.userRole.deleteMany();
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
): Record<string, unknown> {
  return {
    patientHospitalRelationshipId: relationshipId,
    ...(programId ? { patientProgramId: programId } : {}),
    submissionNonce: randomUUID(),
    responses: {
      pam: { "pam-1": 2, "pam-2": 2, "pam-3": 2, "pam-4": 2, "pam-5": 2 },
      proms: { "proms-1": 3, "proms-2": 3, "proms-3": 3, "proms-4": 3 },
      confidenceScore: 7,
      confidenceImprovementPlan: null,
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
    reflectionNote: null,
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
    primaryGoalCode: "weight",
    primaryGoalNote: null,
    weeklyNote: null,
    items: [
      { activityCode: "stop_sweet", targetDays: 4 },
      { activityCode: "exercise_walk", targetDays: 3, targetValue: 15, targetUnit: "minutes" },
    ],
    ...overrides,
  };
}

function completion(programId: string, roundNumber: number, submissionNonce = randomUUID()): Record<string, unknown> {
  return { patientProgramId: programId, roundNumber, submissionNonce };
}

/** Resolves every open step of a round by a reasoned skip, then completes it through the real services. */
async function skipRestAndComplete(fixture: Fixture, roundNumber: number): Promise<void> {
  const detail = await getProgramRoundDetail(fixture.osm.actor, fixture.relationshipId, fixture.programId, String(roundNumber));

  for (const step of detail.status.steps.filter((candidate) => candidate.status === "TODO")) {
    await skipPatientProgramRoundStep(fixture.osm.actor, {
      patientProgramId: fixture.programId,
      roundNumber,
      stepCode: step.code,
      reasonCode: "PATIENT_UNABLE",
    });
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

    // SR-D1: one recorded item is progress, never completion.
    await recordPatientProgramServiceOneConfidence(fixture.osm.actor, { patientProgramId: programId, roundNumber: 1, score: 6 });
    const started = await getProgramRoundsOverview(fixture.osm.actor, fixture.relationshipId, programId);
    expect(started.rounds[0]).toMatchObject({ state: "IN_PROGRESS", resolvedItems: 1, totalItems: 14 });
    await expect(completePatientProgramRound(fixture.osm.actor, completion(programId, 1))).rejects.toBeInstanceOf(ConflictError);

    const profile = await prisma.patientHospitalProfile.findUnique({
      where: { patientHospitalRelationshipId: fixture.relationshipId },
      select: { version: true },
    });
    await recordPatientProgramRoundVitals(
      fixture.osm.actor,
      vitalsInput(programId, { preferredName: " ลุงชาย ", occupation: "ชาวนา", profileVersion: profile?.version ?? null }),
    );
    await submitScreening(fixture.osm.actor, screeningInput(fixture.relationshipId, programId));
    await recordPatientProgramServiceOneFloatingChart(fixture.osm.actor, { patientProgramId: programId, roundNumber: 1, summary: "ลอยจม" });
    await recordPatientProgramServiceOneRoutine(fixture.osm.actor, { patientProgramId: programId, roundNumber: 1 });

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
      recordPatientProgramServiceOneRoutine(fixture.owner.actor, { patientProgramId: programId, roundNumber: 1 }),
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
    await expectSequenced(recordPatientProgramServiceOneRoutine(actor, { patientProgramId: programId, roundNumber: 2 }));
    await expectSequenced(recordPatientProgramServiceOneDreamCard(actor, { patientProgramId: programId, roundNumber: 3, description: null }));
    await expectSequenced(createGoalPlanForProgram(actor, goalInput(programId)));
    await expectSequenced(createFollowupForProgram(actor, followupInput(programId)), "ต้องจบบริการครั้งที่ 2 ก่อน จึงจะบันทึกครั้งที่ 3 ได้");
    await expectSequenced(
      createPatientFinalAssessment(actor, {
        patientProgramId: programId,
        patientHospitalRelationshipId: fixture.relationshipId,
        serviceDate: "2026-08-21",
        weight: 69,
      }),
      "ต้องจบบริการครั้งที่ 6 ก่อน จึงจะบันทึกการประเมินหลังจบโปรแกรมได้",
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
    await expectSequenced(createFollowupForProgram(actor, followupInput(programId)), "ต้องจบบริการครั้งที่ 3 ก่อน จึงจะบันทึกครั้งที่ 4 ได้");
  });

  it("stores ruler, chart, routine and dream results per round (SR-D8/SR-D11)", async () => {
    const fixture = await createFixture("per-round");
    const programId = fixture.programId;

    const first = await recordPatientProgramServiceOneConfidence(fixture.osm.actor, { patientProgramId: programId, roundNumber: 1, score: 3 });
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

    // Tools a round does not list are rejected by the service and by the database.
    await expect(
      recordPatientProgramServiceOneFloatingChart(fixture.osm.actor, { patientProgramId: programId, roundNumber: 2, summary: null }),
    ).rejects.toBeInstanceOf(ValidationError);
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
    await recordPatientProgramServiceOneDreamCard(fixture.osm.actor, { patientProgramId: programId, roundNumber: 3, description: "อยากเดินได้ไกล" });
    expect(await stepStatus(fixture, 3, "DREAM_CARD")).toBe("DONE");
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
  });

  it("completes round 6 only after the health path review is confirmed, then opens the After assessment (SR-D9)", async () => {
    const fixture = await createFixture("round6");
    const programId = fixture.programId;

    await skipRestAndComplete(fixture, 1);
    const plan = await createGoalPlanForProgram(fixture.osm.actor, goalInput(programId));
    await skipRestAndComplete(fixture, 2);
    for (const round of [3, 4, 5]) {
      await createFollowupForProgram(fixture.osm.actor, followupInput(programId, { sourceGoalPlanId: plan.goalPlanId }));
      await skipRestAndComplete(fixture, round);
    }

    // Before round 6 vitals exist the review cannot be confirmed.
    await expectSequenced(recordPatientProgramRoundReview(fixture.osm.actor, reviewInput(programId, 6, "HEALTH_PATH")));
    await createFollowupForProgram(
      fixture.osm.actor,
      followupInput(programId, { sourceGoalPlanId: plan.goalPlanId, waistCircumference: 90, systolicBloodPressure: 128, diastolicBloodPressure: 82 }),
    );
    const round6 = await getProgramRoundDetail(fixture.osm.actor, fixture.relationshipId, programId, "6");
    expect(round6.healthPath).toHaveLength(6);
    expect(round6.status.steps.find((step) => step.code === "HEALTH_PATH_REVIEW")?.status).toBe("TODO");

    await recordPatientProgramServiceOneConfidence(fixture.osm.actor, { patientProgramId: programId, roundNumber: 6, score: 9 });
    await expect(completePatientProgramRound(fixture.osm.actor, completion(programId, 6))).rejects.toBeInstanceOf(ConflictError);
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
    await expectSequenced(
      completePatientProgramRound(fixture.osm.actor, completion(programId, 1)),
      "ยังมีรายการที่ยังไม่ได้บันทึกหรือข้าม จึงยังจบบริการครั้งนี้ไม่ได้",
    );

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
  });

  it("reports the round 1 ruler as Before, a skipped tool as not done, and round 3 for the dream card (R1-E)", async () => {
    const fixture = await createFixture("report");
    const programId = fixture.programId;

    await recordPatientProgramRoundVitals(fixture.osm.actor, vitalsInput(programId));
    await recordPatientProgramServiceOneConfidence(fixture.osm.actor, { patientProgramId: programId, roundNumber: 1, score: 4 });
    // The floating chart is skipped with a reason, so it reports as not done.
    await skipPatientProgramRoundStep(fixture.osm.actor, { patientProgramId: programId, roundNumber: 1, stepCode: "FLOATING_CHART", reasonCode: "EQUIPMENT_UNAVAILABLE" });
    await recordPatientProgramServiceOneRoutine(fixture.osm.actor, { patientProgramId: programId, roundNumber: 1 });
    await skipRestAndComplete(fixture, 1);
    await recordPatientProgramRoundVitals(fixture.osm.actor, vitalsInput(programId, { roundNumber: 2, weight: 73, heightCm: 163, bloodSugar: 112 }));
    await skipRestAndComplete(fixture, 2);
    await recordPatientProgramServiceOneDreamCard(fixture.osm.actor, { patientProgramId: programId, roundNumber: 3, description: "ความฝัน" });

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

    await expect(
      prisma.patientProgramRoundVitals.create({
        data: { ...base, recordedByUserId: fixture.osm.userId, roundNumber: 3, serviceDate: new Date("2026-08-17"), weight: 70, submissionNonce: randomUUID() },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.patientProgramRoundCompletion.create({
        data: { ...base, completedByUserId: fixture.osm.userId, roundNumber: 7, submissionNonce: randomUUID() },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.patientProgramRoundStepSkip.create({
        data: { ...base, skippedByUserId: fixture.osm.userId, roundNumber: 1, stepCode: "PAM", reasonCode: "OTHER", note: null },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.patientHospitalProfile.update({
        where: { patientHospitalRelationshipId: fixture.relationshipId },
        data: { preferredName: " padded " },
      }),
    ).rejects.toThrow();
  });
});
