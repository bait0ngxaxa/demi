import { HospitalStatus, MembershipStatus, MembershipType, PatientProgramStatus, Role } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, NotFoundError } from "@/shared/errors/application-error";

const mockedAccess = vi.hoisted(() => vi.fn());

vi.mock("@/modules/patient-program/services/patient-program-access-service", () => ({
  resolvePatientProgramAccessContext: mockedAccess,
}));

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
const patient = { displayName: "สมชาย ผู้ป่วย", occupation: "เกษตรกร" };

function ledger(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000001",
    roundNumber: 1,
    toolCode: "ROUTINE",
    source: "PLANNED",
    mode: "RECORDED",
    linkedRecordType: "SERVICE_ONE_ROUTINE",
    linkedRecordId: "bbbbbbbb-bbbb-4bbb-8bbb-000000000001",
    performedAt: new Date("2026-10-01T03:00:00.000Z"),
    recordedByUser: recorder,
    ...overrides,
  };
}

function program(overrides: Record<string, unknown> = {}): ProgramRoundRecord {
  return {
    id: programId,
    patientHospitalRelationshipId: relationshipId,
    status: PatientProgramStatus.ACTIVE,
    initialBaseline: { heightCm: 160 },
    roundVitals: [],
    roundActivities: [],
    screeningAssessment: null,
    serviceOneRoutine: null,
    serviceOneFloatingChart: null,
    serviceOneDreamCard: null,
    serviceOneConfidence: null,
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
    weight: 64,
    heightCm: null,
    waistCircumference: 80,
    systolicBloodPressure: 120,
    diastolicBloodPressure: 80,
    bloodSugar: 100,
    recordedByUser: recorder,
    ...overrides,
  };
}

function goalPlan(
  roundNumber: number,
  id: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    roundNumber,
    createdAt: new Date("2026-10-02T03:00:00.000Z"),
    templateKey: "demi-goals",
    templateVersion: "legacy-prototype-v1",
    sourceFollowup: null,
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
    sourceGoalPlanId: "eeeeeeee-eeee-4eee-8eee-000000000001",
    planAdjusted: null,
    weight: 62,
    waistCircumference: null,
    systolicBloodPressure: null,
    diastolicBloodPressure: null,
    bloodSugar: 95,
    createdByUser: recorder,
    activityProgress: [{ goalActivityCode: "exercise_walk", status: "DONE", achievedDays: 3 }],
    ...overrides,
  };
}

describe("round overview read model (WB-DF-01/02)", () => {
  it("lists rounds 1-6 as not recorded and After as not recorded for an empty Program", () => {
    const overview = buildProgramRoundsOverview(program());

    expect(overview.rounds.map((round) => round.roundNumber)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(overview.rounds.every((round) => round.status === "NOT_RECORDED" && round.date === null)).toBe(true);
    expect(overview.after.status).toBe("NOT_RECORDED");
  });

  it("counts a round as recorded with vitals alone or with one activity alone", () => {
    const overview = buildProgramRoundsOverview(
      program({
        roundVitals: [vitals(1)],
        roundActivities: [ledger({ roundNumber: 3, toolCode: "DREAM_CARD", mode: "REVIEWED" })],
        serviceOneDreamCard: { id: "bbbbbbbb-bbbb-4bbb-8bbb-000000000001", recordedAt: new Date(), recordedByUser: recorder },
      }),
    );

    expect(overview.rounds[0]).toMatchObject({
      status: "RECORDED",
      hasVitals: true,
      recordedByDisplayName: "สมศรี อสม.",
    });
    expect(overview.rounds[0]?.date?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(overview.rounds[2]).toMatchObject({ status: "RECORDED", hasVitals: false, activityCount: 1 });
    expect(overview.rounds[1]?.status).toBe("NOT_RECORDED");
  });

  it("maps the first Goal Plan to round 2 and Follow-up rounds 1-4 to rounds 3-6", () => {
    const overview = buildProgramRoundsOverview(
      program({
        goalPlans: [goalPlan(1, "eeeeeeee-eeee-4eee-8eee-000000000001")],
        followups: [followup(1), followup(2)],
      }),
    );

    expect(overview.rounds.map((round) => round.status)).toEqual([
      "NOT_RECORDED",
      "RECORDED",
      "RECORDED",
      "RECORDED",
      "NOT_RECORDED",
      "NOT_RECORDED",
    ]);
  });

  it("treats Service 1 records made before the ledger existed as round 1 activity", () => {
    const overview = buildProgramRoundsOverview(
      program({
        serviceOneRoutine: { id: "bbbbbbbb-bbbb-4bbb-8bbb-000000000009", recordedAt: new Date("2026-09-01T03:00:00.000Z"), recordedByUser: recorder },
      }),
    );

    expect(overview.rounds[0]).toMatchObject({ status: "RECORDED", activityCount: 1 });
  });

  it("reports the Final Assessment as the After row", () => {
    const overview = buildProgramRoundsOverview(
      program({
        finalAssessment: {
          serviceDate: new Date("2026-11-01T00:00:00.000Z"),
          recordedAt: new Date("2026-11-01T04:00:00.000Z"),
          recordedBy: recorder,
        },
      }),
    );

    expect(overview.after).toMatchObject({ status: "RECORDED", recordedByDisplayName: "สมศรี อสม." });
  });
});

describe("round detail read model", () => {
  it("computes BMI from the round's weight and the latest recorded height (WB-DF-04/05)", () => {
    const record = program({
      roundVitals: [vitals(1, { heightCm: 162, weight: 74 }), vitals(2, { heightCm: null, weight: 70 })],
    });

    const round1 = buildProgramRoundDetail(record, 1, patient);
    const round2 = buildProgramRoundDetail(record, 2, patient);
    const round3 = buildProgramRoundDetail(
      program({ roundVitals: record.roundVitals, followups: [followup(1)] }),
      3,
      patient,
    );

    expect(round1.vitals).toMatchObject({ source: "ROUND_VITALS", heightCm: 162, bmi: 28.2 });
    // Round 2 recorded no height of its own, so round 1's height is the latest recorded one.
    expect(round2.vitals).toMatchObject({ heightCm: 162, bmi: 26.7 });
    expect(round3.vitals).toMatchObject({ source: "FOLLOWUP", heightCm: 162, weight: 62, bmi: 23.6 });
    expect(round1.vitalsForm).toMatchObject({ canRecord: false, heightEditable: true });
    expect(round3.vitalsForm).toMatchObject({ canRecord: false, heightEditable: false, latestHeightCm: 162 });
  });

  it("prefills the height from the Baseline, offers the form only for open rounds 1-2 and shows no BMI without a weight", () => {
    const empty = program();

    expect(buildProgramRoundDetail(empty, 1, patient).vitalsForm).toEqual({
      canRecord: true,
      heightEditable: true,
      latestHeightCm: 160,
    });
    expect(buildProgramRoundDetail(empty, 3, patient).vitalsForm.canRecord).toBe(false);
    expect(
      buildProgramRoundDetail(program({ status: PatientProgramStatus.COMPLETED }), 1, patient).vitalsForm.canRecord,
    ).toBe(false);
    expect(buildProgramRoundDetail(program({ roundVitals: [vitals(1, { weight: null, heightCm: 160 })] }), 1, patient).vitals?.bmi)
      .toBeNull();
  });

  it("shows the recommended list, pending forms as awaiting, and review options for existing results", () => {
    const detail = buildProgramRoundDetail(
      program({
        serviceOneDreamCard: { id: "bbbbbbbb-bbbb-4bbb-8bbb-000000000002", recordedAt: new Date(), recordedByUser: recorder },
      }),
      3,
      patient,
    );

    expect(detail.activities.map((row) => row.toolCode)).toEqual([
      "HEALTH_PLAN_REVIEW",
      "CONFIDENCE_RULER",
      "DREAM_CARD",
    ]);
    expect(detail.activities.find((row) => row.toolCode === "DREAM_CARD")).toMatchObject({
      status: "NOT_DONE",
      resultExists: true,
      canReview: true,
    });
    expect(detail.addOptions.find((row) => row.toolCode === "FLOATING_CHART")).toMatchObject({
      recommended: false,
      resultExists: false,
      canReview: false,
    });
    expect(detail.addOptions.map((row) => row.toolCode)).toEqual(
      expect.arrayContaining(["PAM", "PROMS", "ROUTINE", "HEALTH_PATH", "HEALTHY_PLAN"]),
    );
    // D1/D2: retired tools are no longer offered.
    expect(detail.addOptions.some((row) => row.toolCode === "KNOW_SELF" || row.toolCode === "LIFE_TABLE")).toBe(false);
    // Pending forms stay unavailable wherever they appear, never completed.
    expect(detail.addOptions.find((row) => row.toolCode === "HEALTH_PATH")?.status).toBe("AWAITING_FORM");
    expect(detail.addOptions.some((row) => row.toolCode === "DREAM_CARD")).toBe(false);
  });

  it("shows a ledgered EXTRA activity in the round list instead of the Add list", () => {
    const detail = buildProgramRoundDetail(
      program({
        roundActivities: [ledger({ roundNumber: 2, toolCode: "DREAM_CARD", source: "EXTRA", mode: "REVIEWED" })],
        serviceOneDreamCard: { id: "bbbbbbbb-bbbb-4bbb-8bbb-000000000001", recordedAt: new Date(), recordedByUser: recorder },
      }),
      2,
      patient,
    );

    expect(detail.activities.map((row) => row.toolCode)).toEqual([
      "HEALTHY_PLAN",
      "CONFIDENCE_RULER",
      "ROUTINE",
      "DREAM_CARD",
    ]);
    expect(detail.activities[3]).toMatchObject({
      status: "DONE",
      source: "EXTRA",
      mode: "REVIEWED",
      recordedByDisplayName: "สมศรี อสม.",
    });
    expect(detail.addOptions.some((row) => row.toolCode === "DREAM_CARD")).toBe(false);
  });

  it("lists round 1 as รู้จักตัวเอง with the customer's tools and no retired tool (D1-D3)", () => {
    const routine = { id: "bbbbbbbb-bbbb-4bbb-8bbb-000000000009", recordedAt: new Date(), recordedByUser: recorder };
    const round1 = buildProgramRoundDetail(program({ serviceOneRoutine: routine }), 1, patient);

    expect(round1.title).toBe("ครั้งที่ 1 · รู้จักตัวเอง");
    expect(round1.activities.map((row) => row.label)).toEqual([
      "แบบประเมิน PAM",
      "แบบประเมิน PROMs",
      "กราฟวัดลอยจม",
      "การ์ดความฝัน",
      "ตารางชีวิตของฉัน (ตารางกิจวัตร)",
      "ไม้บรรทัดวัดใจ",
      "เส้นทางสุขภาพ",
    ]);
    expect(round1.activities.find((row) => row.toolCode === "ROUTINE")).toMatchObject({ status: "DONE", source: "PLANNED" });
    expect(round1.activities.find((row) => row.toolCode === "HEALTH_PATH")?.status).toBe("AWAITING_FORM");
    expect(
      [...round1.activities, ...round1.addOptions].some((row) => row.toolCode === "KNOW_SELF" || row.toolCode === "LIFE_TABLE"),
    ).toBe(false);

    // Rounds 2/4/5 review the round 1 routine; round 3 reviews the dream card.
    for (const round of [2, 4, 5] as const) {
      expect(
        buildProgramRoundDetail(program({ serviceOneRoutine: routine }), round, patient).activities.find(
          (row) => row.toolCode === "ROUTINE",
        ),
      ).toMatchObject({ label: "ตารางชีวิตของฉัน (ตารางกิจวัตร)", recommended: true, canReview: true, status: "NOT_DONE" });
    }
    expect(
      buildProgramRoundDetail(
        program({ serviceOneDreamCard: { ...routine, id: "bbbbbbbb-bbbb-4bbb-8bbb-000000000002" } }),
        3,
        patient,
      ).activities.find((row) => row.toolCode === "DREAM_CARD"),
    ).toMatchObject({ label: "ความฝันของฉัน (การ์ดความฝัน)", canReview: true });
  });

  it("derives ทำแผนสุขภาพ in round 2 and แผนสุขภาพดีของฉัน in round 4 from the Goal Plans (D4)", () => {
    const firstPlanId = "eeeeeeee-eeee-4eee-8eee-000000000001";
    const adjustedPlanId = "eeeeeeee-eeee-4eee-8eee-000000000002";
    const row = (plans: Record<string, unknown>[], round: 2 | 4) =>
      buildProgramRoundDetail(program({ goalPlans: plans }), round, patient).activities.find(
        (entry) => entry.toolCode === "HEALTHY_PLAN",
      );

    expect(row([], 2)).toMatchObject({ label: "ทำแผนสุขภาพ", status: "NOT_DONE", linkedRecord: null });
    expect(row([goalPlan(1, firstPlanId)], 2)).toMatchObject({
      status: "DONE",
      source: "PLANNED",
      linkedRecord: { type: "GOAL_PLAN", id: firstPlanId },
    });
    // The first plan is not the round 4 adjustment; the row links to the current plan.
    expect(row([goalPlan(1, firstPlanId)], 4)).toMatchObject({
      label: "แผนสุขภาพดีของฉัน",
      status: "NOT_DONE",
      linkedRecord: { type: "GOAL_PLAN", id: firstPlanId },
    });
    // Adjusted from the round 3 Follow-up (Follow-up 1): before round 4, so not counted.
    expect(row([goalPlan(1, firstPlanId), goalPlan(2, adjustedPlanId, { sourceFollowup: { roundNumber: 1 } })], 4))
      .toMatchObject({ status: "NOT_DONE", linkedRecord: { type: "GOAL_PLAN", id: adjustedPlanId } });
    // Adjusted from round 4's own Follow-up (Follow-up 2).
    expect(row([goalPlan(1, firstPlanId), goalPlan(2, adjustedPlanId, { sourceFollowup: { roundNumber: 2 } })], 4))
      .toMatchObject({ status: "DONE", source: "PLANNED", linkedRecord: { type: "GOAL_PLAN", id: adjustedPlanId }, laterAdjustedPlan: null });
    // Adjusted only in round 5 (Follow-up 3): round 4's history stays not done; the later plan is current information.
    expect(row([goalPlan(1, firstPlanId), goalPlan(2, adjustedPlanId, { sourceFollowup: { roundNumber: 3 } })], 4))
      .toMatchObject({
        status: "NOT_DONE",
        source: null,
        performedAt: null,
        linkedRecord: { type: "GOAL_PLAN", id: adjustedPlanId },
        laterAdjustedPlan: { goalPlanId: adjustedPlanId, adjustedInRound: 5 },
      });
    // Round 2 never reports a later adjustment.
    expect(row([goalPlan(1, firstPlanId), goalPlan(2, adjustedPlanId, { sourceFollowup: { roundNumber: 3 } })], 2))
      .toMatchObject({ status: "DONE", linkedRecord: { type: "GOAL_PLAN", id: firstPlanId }, laterAdjustedPlan: null });
  });

  it("gates starting a Follow-up on earlier rounds and projects no plan follow-up outside rounds 3-6", () => {
    const record = program({ goalPlans: [goalPlan(1, "eeeeeeee-eeee-4eee-8eee-000000000001")] });
    const withFollowup = buildProgramRoundDetail(
      program({ goalPlans: record.goalPlans, followups: [followup(1)] }),
      3,
      patient,
    );

    expect(buildProgramRoundDetail(record, 3, patient).canStartFollowup).toBe(true);
    expect(buildProgramRoundDetail(record, 4, patient).canStartFollowup).toBe(false);
    expect(buildProgramRoundDetail(record, 1, patient).planFollowUp).toBeNull();
    expect(buildProgramRoundDetail(record, 2, patient).planFollowUp).toBeNull();
    expect(withFollowup.followupId).toBe("dddddddd-dddd-4ddd-8ddd-000000000001");
    expect(withFollowup.canStartFollowup).toBe(false);
  });

  it("lists unmet plan items as due and met items separately (D6)", () => {
    const planId = "eeeeeeee-eeee-4eee-8eee-000000000001";
    const plans = [goalPlan(1, planId)];
    const codes = (items: readonly { activityCode: string }[] | undefined) => items?.map((item) => item.activityCode);

    // No progress recorded yet: every plan item is due.
    const before = buildProgramRoundDetail(program({ goalPlans: plans }), 3, patient).planFollowUp;
    expect(before).toMatchObject({ goalPlanId: planId, metItems: [] });
    expect(codes(before?.dueItems)).toEqual(["stop_sweet", "exercise_walk"]);
    expect(before?.dueItems.every((item) => item.achievedDays === null && item.progressRound === null)).toBe(true);

    // Mixed progress: exercise met its 3-day target, stop_sweet is below its 4-day target.
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
    ).planFollowUp;
    expect(codes(mixed?.dueItems)).toEqual(["stop_sweet"]);
    expect(mixed?.metItems).toEqual([
      expect.objectContaining({ activityCode: "exercise_walk", achievedDays: 3, progressRound: 3 }),
    ]);

    // Missing progress (no row, or a row without achieved days) stays due.
    const missing = buildProgramRoundDetail(
      program({
        goalPlans: plans,
        followups: [
          followup(1, { activityProgress: [{ goalActivityCode: "exercise_walk", status: "DONE", achievedDays: null }] }),
        ],
      }),
      3,
      patient,
    ).planFollowUp;
    expect(codes(missing?.dueItems)).toEqual(["stop_sweet", "exercise_walk"]);
  });

  it("uses the latest recorded progress of the same source plan up to the round (D6)", () => {
    const planId = "eeeeeeee-eeee-4eee-8eee-000000000001";
    const record = program({
      goalPlans: [goalPlan(1, planId)],
      followups: [
        followup(1, { activityProgress: [{ goalActivityCode: "stop_sweet", status: "DONE", achievedDays: 4 }] }),
        followup(2, { activityProgress: [{ goalActivityCode: "stop_sweet", status: "PARTIAL", achievedDays: 1 }] }),
      ],
    });

    // Round 4: Follow-up 2 is the latest and is below target again.
    expect(buildProgramRoundDetail(record, 4, patient).planFollowUp?.dueItems.find((item) => item.activityCode === "stop_sweet"))
      .toMatchObject({ achievedDays: 1, progressRound: 4 });
    // Round 3 ignores later Follow-ups.
    expect(buildProgramRoundDetail(record, 3, patient).planFollowUp?.metItems).toEqual([
      expect.objectContaining({ activityCode: "stop_sweet", achievedDays: 4, progressRound: 3 }),
    ]);
    // Round 5 (no Follow-up yet) carries the latest recorded progress of the current plan.
    expect(buildProgramRoundDetail(record, 5, patient).planFollowUp?.dueItems.find((item) => item.activityCode === "stop_sweet"))
      .toMatchObject({ achievedDays: 1, progressRound: 4 });
  });

  it("projects no plan follow-up for a Follow-up without a source Goal Plan", () => {
    const record = program({
      goalPlans: [goalPlan(1, "eeeeeeee-eeee-4eee-8eee-000000000001")],
      followups: [followup(1, { sourceGoalPlanId: null, activityProgress: [] })],
    });

    expect(buildProgramRoundDetail(record, 3, patient).planFollowUp).toBeNull();
  });

  it("counts ทบทวนแผนสุขภาพ as DONE exactly when the Follow-up is linked to a plan and answered planAdjusted (D5)", () => {
    const review = (record: ProgramRoundRecord, round: 3 | 4 | 5 | 6 = 3) =>
      buildProgramRoundDetail(record, round, patient).activities.find((row) => row.toolCode === "HEALTH_PLAN_REVIEW");
    const plans = [goalPlan(1, "eeeeeeee-eeee-4eee-8eee-000000000001")];

    for (const planAdjusted of [true, false]) {
      expect(review(program({ goalPlans: plans, followups: [followup(1, { planAdjusted })] }))).toMatchObject({
        status: "DONE",
        mode: "REVIEWED",
        source: "PLANNED",
        recordedByDisplayName: "สมศรี อสม.",
        linkedRecord: { type: "FOLLOWUP", id: "dddddddd-dddd-4ddd-8ddd-000000000001" },
        followupEvidence: null,
      });
    }
    // Linked to the plan but planAdjusted not answered (historical records).
    expect(review(program({ goalPlans: plans, followups: [followup(1, { planAdjusted: null })] }))).toMatchObject({
      status: "NOT_DONE",
      mode: null,
      followupEvidence: { goalPlanLinked: true, planAdjustedAnswered: false, progressCount: 1 },
    });
    // Answered but not linked to a Goal Plan.
    expect(
      review(program({ followups: [followup(1, { sourceGoalPlanId: null, planAdjusted: false, activityProgress: [] })] })),
    ).toMatchObject({
      status: "NOT_DONE",
      followupEvidence: { goalPlanLinked: false, planAdjustedAnswered: true, progressCount: 0 },
    });
    // No Follow-up at all.
    expect(review(program({ goalPlans: plans }))).toMatchObject({ status: "NOT_DONE", followupEvidence: null });
    // Same rule in round 6 (Follow-up 4).
    expect(
      review(
        program({
          goalPlans: plans,
          followups: [followup(1), followup(2), followup(3), followup(4, { planAdjusted: false })],
        }),
        6,
      ),
    ).toMatchObject({ status: "DONE", linkedRecord: { type: "FOLLOWUP", id: "dddddddd-dddd-4ddd-8ddd-000000000004" } });
  });

  it("prefers an explicit ledger row for the review, and still counts the Follow-up round as recorded", () => {
    const row = buildProgramRoundDetail(
      program({
        followups: [followup(1)],
        roundActivities: [ledger({ roundNumber: 3, toolCode: "HEALTH_PLAN_REVIEW", mode: "REVIEWED", linkedRecordType: null, linkedRecordId: null })],
      }),
      3,
      patient,
    ).activities.find((entry) => entry.toolCode === "HEALTH_PLAN_REVIEW");

    expect(row).toMatchObject({ status: "DONE", mode: "REVIEWED", followupEvidence: null });
    expect(
      buildProgramRoundsOverview(program({ followups: [followup(1, { weight: null, bloodSugar: null })] })).rounds[2],
    ).toMatchObject({ status: "RECORDED", activityCount: 0 });
  });

  it("keeps planned versus extra classification when reading back extra activities next to a Follow-up", () => {
    const detail = buildProgramRoundDetail(
      program({
        followups: [followup(1)],
        roundActivities: [ledger({ roundNumber: 3, toolCode: "FLOATING_CHART", source: "EXTRA", mode: "REVIEWED", linkedRecordType: "SERVICE_ONE_FLOATING_CHART" })],
        serviceOneFloatingChart: { id: "bbbbbbbb-bbbb-4bbb-8bbb-000000000001", recordedAt: new Date(), recordedByUser: recorder },
      }),
      3,
      patient,
    );

    expect(detail.activities.find((row) => row.toolCode === "FLOATING_CHART")).toMatchObject({
      status: "DONE",
      source: "EXTRA",
    });
    expect(detail.activities.find((row) => row.toolCode === "HEALTH_PLAN_REVIEW")).toMatchObject({ status: "NOT_DONE" });
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
          hospitalProfile: { occupation: "เกษตรกร" },
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
      occupation: "เกษตรกร",
      // D10: read with the occupation in one query; the view renders the age.
      patientDateOfBirth: new Date("1960-10-16T00:00:00.000Z"),
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
});
