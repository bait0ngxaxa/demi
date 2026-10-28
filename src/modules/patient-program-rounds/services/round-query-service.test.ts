import { HospitalStatus, MembershipStatus, MembershipType, PatientProgramStatus, Role } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, NotFoundError } from "@/shared/errors/application-error";

const mockedAccess = vi.hoisted(() => vi.fn());

vi.mock("@/modules/patient-program/services/patient-program-access-service", () => ({
  resolvePatientProgramAccessContext: mockedAccess,
}));

import { roundGuideline } from "../domain/round-steps";
import {
  buildProgramRoundDetail,
  buildProgramRoundsOverview,
  getProgramRoundDetail,
  getProgramRoundsOverview,
  type PatientProgramRoundQueryDatabase,
  type ProgramRoundRecord,
} from "./round-query-service";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const relationshipId = "22222222-2222-4222-8222-222222222222";
const programId = "33333333-3333-4333-8333-333333333333";
const actorUserId = "44444444-4444-4444-8444-444444444444";
const personId = "55555555-5555-4555-8555-555555555555";
const planId = "eeeeeeee-eeee-4eee-8eee-000000000001";

const actor: ActorContext = {
  userId: actorUserId,
  personId,
  roles: [Role.HOSPITAL],
  hospitalMemberships: [
    {
      hospitalId,
      membershipType: MembershipType.MEMBER,
      profession: null,
      status: MembershipStatus.ACTIVE,
      hospitalStatus: HospitalStatus.ACTIVE,
    },
  ],
  osmHospitalRelationships: [],
};

const recorder = { person: { givenName: "สมศรี", familyName: "อสม." } };
const patient = { displayName: "สมชาย ผู้ป่วย" };
const staff = { canManage: true };
const at = new Date("2026-10-01T03:00:00.000Z");

/** ADR-0022: round 1 and each guideline round after a completed one are opened with their guideline plan. */
function openedRounds(completions: readonly { roundNumber: number }[]): Record<string, unknown>[] {
  const numbers = new Set([1, ...completions.map((completed) => completed.roundNumber + 1).filter((round) => round <= 6)]);

  return [...numbers].sort((left, right) => left - right).map((roundNumber) => ({
    roundNumber,
    planItems: roundGuideline(roundNumber).map((definition, index) => ({
      id: `plan-${roundNumber}-${definition.code}`,
      stepCode: definition.code,
      customTitle: null,
      position: index + 1,
      removedAt: null,
      doneAt: null,
      doneByUser: null,
    })),
  }));
}

function program(overrides: Record<string, unknown> = {}): ProgramRoundRecord {
  return {
    id: programId,
    patientHospitalRelationshipId: relationshipId,
    status: PatientProgramStatus.ACTIVE,
    patientHospitalRelationship: { hospitalProfile: { occupation: "เกษตรกร", preferredName: null, version: 3 } },
    initialBaseline: { heightCm: 160 },
    rounds: openedRounds((overrides.roundCompletions ?? []) as { roundNumber: number }[]),
    roundVitals: [],
    roundActivities: [],
    roundCompletions: [],
    roundStepSkips: [],
    screeningAssessments: [],
    serviceOneRoutines: [],
    serviceOneFloatingCharts: [],
    serviceOneDreamCards: [],
    serviceOneConfidences: [],
    goalPlans: [],
    followups: [],
    finalAssessment: null,
    ...overrides,
  } as unknown as ProgramRoundRecord;
}

function vitals(roundNumber: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: `cccccccc-cccc-4ccc-8ccc-00000000000${roundNumber}`,
    roundNumber,
    serviceDate: new Date(`2026-10-0${roundNumber}T00:00:00.000Z`),
    recordedAt: at,
    weight: 64,
    heightCm: 160,
    waistCircumference: 80,
    systolicBloodPressure: 120,
    diastolicBloodPressure: 80,
    bloodSugar: 100,
    recordedByUser: recorder,
    ...overrides,
  };
}

function tool(roundNumber: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    roundNumber,
    recordedAt: at,
    recordedByUser: recorder,
    serviceOneArtifactAssociation: null,
    summary: null,
    description: null,
    dream: null,
    obstacle: null,
    weeklyGoal: null,
    // A routine recorded before R2 (no date) stays done as recorded.
    routineDate: null,
    entries: [],
    score: 6,
    improvementPlan: null,
    ...overrides,
  };
}

function completion(roundNumber: number): Record<string, unknown> {
  return { roundNumber, completedAt: at, completedByUser: recorder };
}

function goalPlan(roundNumber: number, id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    roundNumber,
    createdAt: new Date("2026-10-02T03:00:00.000Z"),
    templateKey: "demi-goals",
    templateVersion: "legacy-prototype-v1",
    sourceFollowupId: null,
    createdByUser: recorder,
    items: [
      { activityCode: "stop_sweet", targetDays: 4, targetValue: null, targetUnit: null },
      { activityCode: "exercise_walk", targetDays: 3, targetValue: 15, targetUnit: "minutes" },
    ],
    ...overrides,
  };
}

function followup(roundNumber: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: `dddddddd-dddd-4ddd-8ddd-00000000000${roundNumber}`,
    roundNumber,
    serviceDate: new Date("2026-10-20T00:00:00.000Z"),
    recordedAt: new Date("2026-10-20T04:00:00.000Z"),
    sourceGoalPlanId: planId,
    planAdjusted: false,
    // Recorded before R2 unless a test sets the plan review answers.
    followedPlan: null,
    reflectionNote: null,
    expertAdvice: null,
    weight: 62,
    heightCm: null,
    waistCircumference: 79,
    systolicBloodPressure: 118,
    diastolicBloodPressure: 78,
    bloodSugar: 95,
    createdByUser: recorder,
    activityProgress: [{ goalActivityCode: "exercise_walk", status: "DONE", achievedDays: 3 }],
    ...overrides,
  };
}

const roundsOneToFiveCompleted = [1, 2, 3, 4, 5].map(completion);

function stepStatuses(record: ProgramRoundRecord, roundNumber: 1 | 2 | 3 | 4 | 5 | 6): Record<string, string> {
  const detail = buildProgramRoundDetail(record, roundNumber, patient, staff);
  return Object.fromEntries(detail.status.steps.map((step) => [step.code, step.status]));
}

describe("round overview read model (SR-D1)", () => {
  it("shows round 1 not started and rounds 2-6 plus After locked for an empty Program", () => {
    const overview = buildProgramRoundsOverview(program());

    expect(overview.rounds.map((round) => [round.roundNumber, round.state, round.totalItems])).toEqual([
      [1, "NOT_STARTED", 14],
      [2, "LOCKED", 10],
      [3, "LOCKED", 10],
      [4, "LOCKED", 12],
      [5, "LOCKED", 9],
      [6, "LOCKED", 10],
    ]);
    expect(overview.rounds[0]?.title).toBe("ครั้งที่ 1 · รู้จักตัวเอง");
    expect(overview.rounds[1]?.title).toBe("ครั้งที่ 2 · ทำแผนสุขภาพ เป้าหมายเล็กๆที่ตั้งไว้");
    expect(overview.rounds[2]?.title).toBe("ครั้งที่ 3 · ติดตามการฝึกซ้อมพฤติกรรม");
    expect(overview.after.state).toBe("LOCKED");
  });

  it("shows one recorded item as กำลังทำ 1/y, never complete", () => {
    const overview = buildProgramRoundsOverview(program({ serviceOneConfidences: [tool(1)] }));

    expect(overview.rounds[0]).toMatchObject({ state: "IN_PROGRESS", resolvedItems: 1, totalItems: 14, completedAt: null });
  });

  it("counts the vitals step as items 1-7 and a skip as resolved", () => {
    const overview = buildProgramRoundsOverview(
      program({
        roundVitals: [vitals(1)],
        roundStepSkips: [
          { roundNumber: 1, stepCode: "PAM", reasonCode: "PATIENT_DECLINED", note: null, createdAt: at, skippedByUser: recorder },
        ],
      }),
    );

    // Vitals (7) + derived เส้นทางสุขภาพ (1) + skipped PAM (1).
    expect(overview.rounds[0]).toMatchObject({ state: "IN_PROGRESS", resolvedItems: 9 });
  });

  it("is complete only with a completion row, and opens the next round", () => {
    const overview = buildProgramRoundsOverview(program({ roundCompletions: [completion(1)] }));

    expect(overview.rounds[0]).toMatchObject({ state: "COMPLETED", completedAt: at, completedByDisplayName: "สมศรี อสม." });
    expect(overview.rounds[1]?.state).toBe("NOT_STARTED");
    expect(overview.rounds[2]?.state).toBe("LOCKED");
  });

  it("unlocks After once round 6 is completed and reports the Final Assessment", () => {
    const completedAll = [1, 2, 3, 4, 5, 6].map(completion);
    expect(buildProgramRoundsOverview(program({ roundCompletions: completedAll })).after.state).toBe("NOT_RECORDED");

    const recorded = buildProgramRoundsOverview(
      program({
        roundCompletions: completedAll,
        finalAssessment: { serviceDate: new Date("2026-12-01T00:00:00.000Z"), recordedAt: at, recordedBy: recorder },
      }),
    );
    expect(recorded.after).toMatchObject({ state: "RECORDED", recordedByDisplayName: "สมศรี อสม." });
  });

  it("hides recorder names for the Patient SELF view", () => {
    const overview = buildProgramRoundsOverview(program({ roundCompletions: [completion(1)] }), { recorderNames: false });

    expect(overview.rounds[0]?.completedByDisplayName).toBeNull();
  });
});

describe("round detail read model", () => {
  it("lists round 1 steps in checklist order; เส้นทางสุขภาพ is derived from round 1 vitals (SR-D9)", () => {
    const empty = buildProgramRoundDetail(program(), 1, patient, staff);
    expect(empty.status.steps.map((step) => step.code)).toEqual([
      "VITALS",
      "KNOW_SELF",
      "PAM",
      "PROMS",
      "FLOATING_CHART",
      "CONFIDENCE_RULER",
      "ROUTINE",
      "HEALTH_PATH",
    ]);
    expect(empty.status.steps.find((step) => step.code === "HEALTH_PATH")?.status).toBe("TODO");

    expect(stepStatuses(program({ roundVitals: [vitals(1)] }), 1)).toMatchObject({ VITALS: "DONE", HEALTH_PATH: "DONE" });
  });

  it("loads which vitals measurements each round recorded into the shared facts", () => {
    const partial = buildProgramRoundDetail(
      program({ roundVitals: [vitals(1, { waistCircumference: null, systolicBloodPressure: null })] }),
      1,
      patient,
      staff,
    );
    expect(partial.status.steps.find((step) => step.code === "VITALS")).toMatchObject({
      status: "TODO",
      missingMeasurements: ["waistCircumference", "systolicBloodPressure"],
    });

    const bare = followup(1, { weight: null, waistCircumference: null, systolicBloodPressure: null, diastolicBloodPressure: null, bloodSugar: null });
    const round3 = program({ roundCompletions: [completion(1), completion(2)], goalPlans: [goalPlan(1, planId)], followups: [bare] });
    expect(stepStatuses(round3, 3)).toMatchObject({ VITALS: "TODO", HEALTH_PLAN_REVIEW: "DONE" });
  });

  it("marks รู้จักตัวฉันเอง done once the preferred name is recorded (SR-D12)", () => {
    const record = program({
      patientHospitalRelationship: { hospitalProfile: { occupation: null, preferredName: "ป้าใจ", version: 4 } },
    });
    const detail = buildProgramRoundDetail(record, 1, patient, staff);

    expect(stepStatuses(record, 1).KNOW_SELF).toBe("DONE");
    expect(detail.patient).toMatchObject({ preferredName: "ป้าใจ", occupation: null, profileVersion: 4 });
  });

  it("allows completion only when every step is DONE or SKIPPED", () => {
    const skip = (stepCode: string) => ({
      roundNumber: 1, stepCode, reasonCode: "OTHER", note: "เหตุผล", createdAt: at, skippedByUser: recorder,
    });
    const almost = program({
      roundVitals: [vitals(1)],
      patientHospitalRelationship: { hospitalProfile: { occupation: "ครู", preferredName: "ป้าใจ", version: 2 } },
      screeningAssessments: [
        { id: "ffffffff-ffff-4fff-8fff-000000000001", instrument: "COMBINED", submittedAt: at, conductedByUser: recorder },
      ],
      serviceOneFloatingCharts: [tool(1)],
      serviceOneConfidences: [tool(1)],
    });
    expect(buildProgramRoundDetail(almost, 1, patient, staff).status.canComplete).toBe(false);

    const ready = program({ ...almost, roundStepSkips: [skip("ROUTINE")] } as Record<string, unknown>);
    const status = buildProgramRoundDetail(ready, 1, patient, staff).status;
    expect(status.canComplete).toBe(true);
    expect(status.steps.find((step) => step.code === "ROUTINE")).toMatchObject({
      status: "SKIPPED",
      skip: { reasonCode: "OTHER", note: "เหตุผล" },
    });
    // Read-only views never offer completion.
    expect(buildProgramRoundDetail(ready, 1, patient, { canManage: false }).canManage).toBe(false);
  });

  it("lets a recorded result replace a skip (SR-D3)", () => {
    const record = program({
      serviceOneConfidences: [tool(1)],
      roundStepSkips: [
        { roundNumber: 1, stepCode: "CONFIDENCE_RULER", reasonCode: "PATIENT_UNABLE", note: null, createdAt: at, skippedByUser: recorder },
      ],
    });

    expect(stepStatuses(record, 1).CONFIDENCE_RULER).toBe("DONE");
  });

  it("keeps per-round results apart: a round 2 ruler is not the round 1 ruler (SR-D8)", () => {
    const record = program({ roundCompletions: [completion(1)], serviceOneConfidences: [tool(1, { score: 4 })] });
    const roundTwo = buildProgramRoundDetail(record, 2, patient, staff);

    expect(stepStatuses(record, 2).CONFIDENCE_RULER).toBe("TODO");
    expect(roundTwo.serviceOne.confidence.recorded).toBe(false);
    expect(buildProgramRoundDetail(record, 1, patient, staff).serviceOne.confidence.score).toBe(4);
  });

  it("puts ความฝันของฉัน in round 3 only (SR-D11)", () => {
    const record = program({ roundCompletions: [completion(1), completion(2)], serviceOneDreamCards: [tool(3)] });

    expect(Object.keys(stepStatuses(record, 1))).not.toContain("DREAM_CARD");
    expect(stepStatuses(record, 3).DREAM_CARD).toBe("DONE");
  });

  it("is read-only and not writable for locked and completed rounds", () => {
    const record = program({ roundCompletions: [completion(1)] });

    expect(buildProgramRoundDetail(record, 1, patient, staff).status).toMatchObject({ state: "COMPLETED", writable: false });
    expect(buildProgramRoundDetail(record, 2, patient, staff).status).toMatchObject({ state: "NOT_STARTED", writable: true });
    expect(buildProgramRoundDetail(record, 3, patient, staff).status).toMatchObject({ state: "LOCKED", writable: false });
    expect(stepStatuses(record, 3).VITALS).toBe("LOCKED");
    expect(
      buildProgramRoundDetail(program({ status: PatientProgramStatus.COMPLETED }), 1, patient, staff).status.writable,
    ).toBe(false);
  });

  it("derives round 2 ทบทวนแผนสุขภาพ from the first Goal Plan and rounds 3-6 from the Follow-up (D4/D5)", () => {
    const base = { roundCompletions: [completion(1), completion(2)], goalPlans: [goalPlan(1, planId)] };

    expect(stepStatuses(program(base), 2).HEALTH_PLAN_REVIEW).toBe("DONE");
    expect(stepStatuses(program({ ...base, followups: [followup(1)] }), 3)).toMatchObject({
      VITALS: "DONE",
      HEALTH_PLAN_REVIEW: "DONE",
    });
    expect(stepStatuses(program({ ...base, followups: [followup(1, { sourceGoalPlanId: null })] }), 3)).toMatchObject({
      VITALS: "DONE",
      HEALTH_PLAN_REVIEW: "TODO",
    });
  });

  it("completes round 4 แผนสุขภาพดีของฉัน for both a kept and an adjusted plan (interim rule)", () => {
    const base = { roundCompletions: [1, 2, 3].map(completion), goalPlans: [goalPlan(1, planId)] };
    const kept = program({ ...base, followups: [followup(1), followup(2, { planAdjusted: false })] });
    expect(stepStatuses(kept, 4).HEALTHY_PLAN).toBe("DONE");

    const adjustedFollowup = followup(2, { planAdjusted: true });
    const pending = program({ ...base, followups: [followup(1), adjustedFollowup] });
    expect(stepStatuses(pending, 4).HEALTHY_PLAN).toBe("TODO");

    const adjusted = program({
      ...base,
      followups: [followup(1), adjustedFollowup],
      goalPlans: [goalPlan(1, planId), goalPlan(2, "eeeeeeee-eeee-4eee-8eee-000000000002", { sourceFollowupId: adjustedFollowup.id })],
    });
    expect(stepStatuses(adjusted, 4).HEALTHY_PLAN).toBe("DONE");
    expect(buildProgramRoundDetail(adjusted, 4, patient, staff).goalPlan).toMatchObject({
      roundPlanAdjusted: true,
      adjustedGoalPlanId: "eeeeeeee-eeee-4eee-8eee-000000000002",
    });
  });

  it("requires a confirmed review for ทบทวนเส้นทางสุขภาพ and shows rounds 1-6 (SR-D9)", () => {
    const base = {
      roundCompletions: roundsOneToFiveCompleted,
      roundVitals: [vitals(1), vitals(2)],
      followups: [1, 2, 3, 4].map((round) => followup(round)),
    };
    const record = program(base);
    const detail = buildProgramRoundDetail(record, 6, patient, staff);

    expect(stepStatuses(record, 6).HEALTH_PATH_REVIEW).toBe("TODO");
    expect(detail.healthPath.map((row) => [row.roundNumber, row.vitals !== null])).toEqual([
      [1, true], [2, true], [3, true], [4, true], [5, true], [6, true],
    ]);

    const reviewed = program({
      ...base,
      roundActivities: [{
        id: "a", roundNumber: 6, toolCode: "HEALTH_PATH", source: "PLANNED", mode: "REVIEWED", performedAt: at, recordedByUser: recorder,
      }],
    });
    expect(stepStatuses(reviewed, 6).HEALTH_PATH_REVIEW).toBe("DONE");
  });

  it("computes BMI from the round's weight and the latest recorded height (WB-DF-04/05)", () => {
    const detail = buildProgramRoundDetail(
      program({ roundVitals: [vitals(1, { heightCm: 160 }), vitals(2, { weight: 70, heightCm: null })] }),
      2,
      patient,
      staff,
    );

    expect(detail.vitals).toMatchObject({ source: "ROUND_VITALS", weight: 70, heightCm: 160, bmi: 27.3 });
    expect(detail.vitalsForm).toMatchObject({ heightEditable: true, latestHeightCm: 160 });
  });

  it("gates starting a Follow-up on the round being writable and earlier Follow-ups recorded", () => {
    const record = program({ roundCompletions: [completion(1), completion(2)], goalPlans: [goalPlan(1, planId)] });

    expect(buildProgramRoundDetail(record, 3, patient, staff).canStartFollowup).toBe(true);
    expect(buildProgramRoundDetail(record, 4, patient, staff).canStartFollowup).toBe(false);
    expect(buildProgramRoundDetail(program(), 3, patient, staff).canStartFollowup).toBe(false);
  });

  it("offers extra PAM/PROMs reviews in later rounds only when the screening exists (CARE-13)", () => {
    const screening = { id: "ffffffff-ffff-4fff-8fff-000000000001", instrument: "COMBINED", submittedAt: at, conductedByUser: recorder };
    const record = program({
      screeningAssessments: [screening],
      roundActivities: [{
        id: "a", roundNumber: 5, toolCode: "PAM", source: "EXTRA", mode: "REVIEWED", performedAt: at, recordedByUser: recorder,
      }],
    });

    expect(buildProgramRoundDetail(record, 1, patient, staff).extraOptions).toEqual([]);
    expect(buildProgramRoundDetail(record, 5, patient, staff)).toMatchObject({
      extraActivities: [{ toolCode: "PAM", recordedByDisplayName: "สมศรี อสม." }],
      extraOptions: ["PROMS"],
    });
  });
});

describe("plan follow-up (D6)", () => {
  it("lists unmet plan items as due and met items separately", () => {
    const plans = [goalPlan(1, planId)];
    const codes = (items: readonly { activityCode: string }[] | undefined) => items?.map((item) => item.activityCode);

    const before = buildProgramRoundDetail(program({ goalPlans: plans }), 3, patient, staff).planFollowUp;
    expect(before).toMatchObject({ goalPlanId: planId, metItems: [] });
    expect(codes(before?.dueItems)).toEqual(["stop_sweet", "exercise_walk"]);

    const mixed = buildProgramRoundDetail(
      program({
        goalPlans: plans,
        followups: [
          followup(1, {
            activityProgress: [
              { goalActivityCode: "exercise_walk", status: "DONE", achievedDays: 3 },
              { goalActivityCode: "stop_sweet", status: "PARTIAL", achievedDays: 2 },
            ],
          }),
        ],
      }),
      3,
      patient,
      staff,
    ).planFollowUp;
    expect(codes(mixed?.dueItems)).toEqual(["stop_sweet"]);
    expect(mixed?.metItems).toEqual([
      expect.objectContaining({ activityCode: "exercise_walk", achievedDays: 3, progressRound: 3 }),
    ]);
  });

  it("projects no plan follow-up outside rounds 3-6 or without a source Goal Plan", () => {
    expect(buildProgramRoundDetail(program({ goalPlans: [goalPlan(1, planId)] }), 2, patient, staff).planFollowUp).toBeNull();
    expect(
      buildProgramRoundDetail(
        program({ goalPlans: [goalPlan(1, planId)], followups: [followup(1, { sourceGoalPlanId: null })] }),
        3,
        patient,
        staff,
      ).planFollowUp,
    ).toBeNull();
  });
});

describe("round queries authorize through the Program read policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAccess.mockResolvedValue({
      actor,
      patient: {
        patientHospitalRelationshipId: relationshipId,
        displayName: patient.displayName,
        hospitalNumber: null,
        hospital: { id: hospitalId, name: "โรงพยาบาล" },
      },
      target: { hospitalId, hospitalStatus: HospitalStatus.ACTIVE, assignedOsmUserId: null },
    });
  });

  function databaseWith(record: ProgramRoundRecord | null): PatientProgramRoundQueryDatabase {
    return {
      patientProgram: { findFirst: vi.fn().mockResolvedValue(record) },
      patientHospitalRelationship: {
        findUnique: vi.fn().mockResolvedValue({
          patientProfile: { dateOfBirth: new Date("1960-10-16T00:00:00.000Z") },
        }),
      },
    } as unknown as PatientProgramRoundQueryDatabase;
  }

  it("returns the overview and detail for an authorized actor, scoped to the authorized relationship", async () => {
    const database = databaseWith(program({ roundVitals: [vitals(1)] }));

    await expect(getProgramRoundsOverview(actor, relationshipId, programId, { database })).resolves.toMatchObject({
      patientProgramId: programId,
      patientDisplayName: patient.displayName,
    });
    await expect(getProgramRoundDetail(actor, relationshipId, programId, "1", { database })).resolves.toMatchObject({
      roundNumber: 1,
      canManage: true,
      patient: { occupation: "เกษตรกร", dateOfBirth: new Date("1960-10-16T00:00:00.000Z") },
    });
    expect(
      (database as unknown as { patientProgram: { findFirst: ReturnType<typeof vi.fn> } }).patientProgram.findFirst,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: programId, patientHospitalRelationshipId: relationshipId } }),
    );
  });

  it("fails closed when access is denied and never reads the Program", async () => {
    mockedAccess.mockRejectedValue(new ForbiddenError());
    const database = databaseWith(program());

    await expect(getProgramRoundsOverview(actor, relationshipId, programId, { database })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(getProgramRoundDetail(actor, relationshipId, programId, "2", { database })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(
      (database as unknown as { patientProgram: { findFirst: ReturnType<typeof vi.fn> } }).patientProgram.findFirst,
    ).not.toHaveBeenCalled();
  });

  it("returns not found for a Program outside the authorized relationship and for bad identifiers", async () => {
    const database = databaseWith(null);

    await expect(getProgramRoundsOverview(actor, relationshipId, programId, { database })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(getProgramRoundDetail(actor, relationshipId, programId, "7", { database })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(getProgramRoundDetail(actor, relationshipId, programId, "abc", { database })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(getProgramRoundsOverview(actor, relationshipId, "not-a-uuid", { database })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("rejects round numbers outside 1-12 before reading, and rounds after the guideline until opened (ADR-0022)", async () => {
    const database = databaseWith(null);

    for (const roundNumber of ["0", "13", "1.5", "07"]) {
      await expect(getProgramRoundDetail(actor, relationshipId, programId, roundNumber, { database })).rejects.toBeInstanceOf(
        NotFoundError,
      );
    }
    expect(mockedAccess).not.toHaveBeenCalled();

    const completedAll = [1, 2, 3, 4, 5, 6].map(completion);
    expect(() => buildProgramRoundDetail(program({ roundCompletions: completedAll }), 7, patient, staff)).toThrow(NotFoundError);

    const added = program({
      roundCompletions: completedAll,
      rounds: [...openedRounds([1, 2, 3, 4, 5, 6].map((roundNumber) => ({ roundNumber }))), { roundNumber: 7, planItems: [] }],
    });
    const detail = buildProgramRoundDetail(added, 7, patient, staff);
    expect(detail).toMatchObject({ roundNumber: 7, title: "ครั้งที่ 7 · บริการเพิ่มเติม" });
    expect(detail.status).toMatchObject({ steps: [], writable: true, canComplete: false });
    expect(buildProgramRoundsOverview(added).rounds.map((round) => round.roundNumber)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe("Phase R2 round facts", () => {
  const screening = (instrument: string, id: string) => ({ id, instrument, submittedAt: at, conductedByUser: recorder });

  it("answers PAM and PROMs from their own screenings, and both from a legacy combined one (R2-C)", () => {
    const pamOnly = buildProgramRoundDetail(
      program({ screeningAssessments: [screening("PAM", "ffffffff-ffff-4fff-8fff-000000000002")] }),
      1,
      patient,
      staff,
    );
    expect(stepStatuses(program({ screeningAssessments: [screening("PAM", "ffffffff-ffff-4fff-8fff-000000000002")] }), 1)).toMatchObject({
      PAM: "DONE",
      PROMS: "TODO",
    });
    expect(pamOnly.screenings).toEqual({ PAM: { id: "ffffffff-ffff-4fff-8fff-000000000002", combined: false }, PROMS: null });

    const legacy = program({ screeningAssessments: [screening("COMBINED", "ffffffff-ffff-4fff-8fff-000000000001")] });
    expect(stepStatuses(legacy, 1)).toMatchObject({ PAM: "DONE", PROMS: "DONE" });
    expect(buildProgramRoundDetail(legacy, 1, patient, staff).screenings.PROMS).toEqual({
      id: "ffffffff-ffff-4fff-8fff-000000000001",
      combined: true,
    });
  });

  it("counts ตารางชีวิตของฉัน with at least one row or a photo of the paper page (R2-G)", () => {
    const opened = { roundCompletions: [completion(1), completion(2), completion(3), completion(4)] };
    const dated = { routineDate: new Date("2026-10-20T00:00:00.000Z") };
    const status = (routine: Record<string, unknown>) =>
      stepStatuses(program({ ...opened, serviceOneRoutines: [tool(5, routine)] }), 5).ROUTINE;

    expect(status({ ...dated, entries: [] })).toBe("TODO");
    expect(status({ ...dated, entries: [{ timeText: "06:00", activity: "ตื่นนอน", adjustment: null }] })).toBe("DONE");
    expect(
      status({
        ...dated,
        entries: [],
        serviceOneArtifactAssociation: {
          createdAt: at,
          patientEvidenceArtifact: { id: "ffffffff-ffff-4fff-8fff-000000000009", mediaType: "image/jpeg", byteSize: 1, createdAt: at },
        },
      }),
    ).toBe("DONE");
    // Recorded before R2 (no date): stays done as recorded.
    expect(status({})).toBe("DONE");
  });

  it("uses a Follow-up's own height for its round and later rounds, and the latest height otherwise (R2-D)", () => {
    const record = program({
      roundCompletions: [completion(1), completion(2), completion(3), completion(4)],
      roundVitals: [vitals(1, { heightCm: 160 }), vitals(2, { heightCm: 160 })],
      goalPlans: [goalPlan(1, planId)],
      followups: [followup(1), followup(2, { heightCm: 158, weight: 60 }), followup(3)],
    });

    expect(buildProgramRoundDetail(record, 3, patient, staff).vitals).toMatchObject({ heightCm: 160 });
    expect(buildProgramRoundDetail(record, 4, patient, staff).vitals).toMatchObject({ heightCm: 158, bmi: 24 });
    expect(buildProgramRoundDetail(record, 5, patient, staff).vitals).toMatchObject({ heightCm: 158 });
    // The vitals step of rounds 3-6 never needs the round's own height.
    expect(stepStatuses(record, 5).VITALS).toBe("DONE");
  });

  it("derives ทบทวนแผนสุขภาพ from the R2 answers and exposes them to the round view (R2-F)", () => {
    const opened = [completion(1), completion(2)];
    const answered = program({
      roundCompletions: opened,
      goalPlans: [goalPlan(1, planId)],
      followups: [followup(1, { followedPlan: false, reflectionNote: "ลืมเดินช่วงฝนตก", expertAdvice: "เดินในบ้านแทน" })],
    });

    expect(stepStatuses(answered, 3).HEALTH_PLAN_REVIEW).toBe("DONE");
    expect(buildProgramRoundDetail(answered, 3, patient, staff).planReview).toEqual({
      followedPlan: false,
      reflectionNote: "ลืมเดินช่วงฝนตก",
      expertAdvice: "เดินในบ้านแทน",
    });

    const blank = program({
      roundCompletions: opened,
      goalPlans: [goalPlan(1, planId)],
      followups: [followup(1, { followedPlan: true, reflectionNote: "   " })],
    });
    expect(stepStatuses(blank, 3).HEALTH_PLAN_REVIEW).toBe("TODO");
  });
});
