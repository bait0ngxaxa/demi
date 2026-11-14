import { PatientProgramStatus } from "@prisma/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// Client children with Server Actions are out of this view test's scope.
vi.mock("./round-plan-editor", () => ({ RoundPlanEditor: () => null, PlanItemControl: () => null }));
vi.mock("./round-step-controls", () => ({
  CompleteRoundControl: () => null,
  RoundProfileForm: () => null,
  SkipStepControl: () => null,
  UnskipStepControl: () => null,
}));
vi.mock("./round-vitals-form", () => ({ RoundVitalsForm: () => null }));
vi.mock("./round-review-button", () => ({ RoundReviewButton: () => null }));
vi.mock("./round-achieve-score-form", () => ({ RoundAchieveScoreForm: () => null }));
vi.mock("../../service-one-workspace", () => ({ ServiceOneToolStep: () => null }));

import { roundGuideline } from "@/modules/patient-program-rounds/domain/round-steps";
import {
  buildProgramRoundDetail,
  type ProgramRoundRecord,
} from "@/modules/patient-program-rounds/services/round-query-service";

import { ProgramRoundDetailView } from "./program-round-detail-view";

const relationshipId = "22222222-2222-4222-8222-222222222222";
const programId = "33333333-3333-4333-8333-333333333333";
const planId = "eeeeeeee-eeee-4eee-8eee-000000000001";
const followupId = "dddddddd-dddd-4ddd-8ddd-000000000001";
const recorder = { person: { givenName: "สมศรี", familyName: "อสม." } };
const at = new Date("2026-10-01T03:00:00.000Z");
const nonces = { vitals: "n1", completion: "n2", achieveScore: "n3", review: { PAM: "n4", PROMS: "n5", HEALTH_PATH: "n6" } };

function program(completedRounds: readonly number[], overrides: Record<string, unknown> = {}, removed: readonly string[] = []): ProgramRoundRecord {
  const opened = new Set([1, ...completedRounds.map((round) => round + 1)]);

  return {
    id: programId,
    patientHospitalRelationshipId: relationshipId,
    status: PatientProgramStatus.ACTIVE,
    patientHospitalRelationship: { hospitalProfile: { occupation: null, preferredName: null, version: 1 } },
    initialBaseline: { heightCm: 160 },
    rounds: [...opened].map((roundNumber) => ({
      roundNumber,
      planItems: roundGuideline(roundNumber).map((definition, index) => ({
        id: `plan-${roundNumber}-${definition.code}`,
        stepCode: definition.code,
        customTitle: null,
        origin: "GUIDELINE",
        doneNote: null,
        position: index + 1,
        removedAt: removed.includes(definition.code) ? at : null,
        doneAt: null,
        doneByUser: null,
      })),
    })),
    roundVitals: [],
    roundActivities: [],
    roundCompletions: completedRounds.map((roundNumber) => ({ roundNumber, completedAt: at, completedByUser: recorder })),
    roundStepSkips: [],
    screeningAssessments: [],
    serviceOneRoutines: [],
    serviceOneFloatingCharts: [],
    serviceOneDreamCards: [],
    serviceOneConfidences: [],
    goalPlans: [{
      id: planId,
      roundNumber: 1,
      createdAt: at,
      templateKey: "demi-goals",
      templateVersion: "legacy-prototype-v1",
      sourceFollowupId: null,
      createdByUser: recorder,
      items: [
        { activityCode: "stop_sweet", targetDays: 4, targetValue: null, targetUnit: null },
        { activityCode: "exercise_walk", targetDays: 3, targetValue: 15, targetUnit: "minutes" },
      ],
    }],
    followups: [],
    finalAssessment: null,
    ...overrides,
  } as unknown as ProgramRoundRecord;
}

const recordedFollowup = {
  id: followupId,
  roundNumber: 1,
  serviceDate: new Date("2026-10-20T00:00:00.000Z"),
  recordedAt: at,
  sourceGoalPlanId: planId,
  planAdjusted: false,
  hasObstacle: true,
  followedPlan: true,
  reflectionNote: "เดินได้",
  expertAdvice: null,
  weight: 62,
  heightCm: null,
  waistCircumference: null,
  systolicBloodPressure: null,
  diastolicBloodPressure: null,
  bloodSugar: null,
  createdByUser: recorder,
  activityProgress: [
    { goalActivityCode: "stop_sweet", status: "DONE", achievedDays: 4 },
    { goalActivityCode: "exercise_walk", status: "PARTIAL", achievedDays: 2 },
  ],
};

function render(record: ProgramRoundRecord, roundNumber: number, canManage = true): string {
  const detail = buildProgramRoundDetail(record, roundNumber, { displayName: "สมชาย ผู้ป่วย" }, { canManage });

  return renderToStaticMarkup(
    <ProgramRoundDetailView currentStep="SUMMARY" detail={detail} nonces={nonces} todayServiceDate="2026-10-21" />,
  );
}

const CARD_HEADING = ">การติดตาม</h2>";
const START_LABEL = "บันทึกการติดตามผลของครั้งนี้";

describe("round page follow-up card (rounds 3+)", () => {
  it("explains the round's follow-up and offers the existing start button before one is recorded", () => {
    const html = render(program([1, 2]), 3);

    expect(html).toContain(CARD_HEADING);
    expect(html.indexOf(CARD_HEADING)).toBeLessThan(html.indexOf("รายการในแผน"));
    expect(html).toContain("ครั้งนี้บันทึกการติดตามการฝึกซ้อมพฤติกรรม");
    expect(html).toContain(START_LABEL);
    expect(html).toContain(
      `/app/patients/${relationshipId}/programs/${programId}/followups/new?sourceGoalPlanId=${planId}&amp;returnTo=${encodeURIComponent(`/app/patients/${relationshipId}/programs/${programId}/rounds/3`)}`,
    );
  });

  it("keeps the start button gated by canStartFollowup and by write access", () => {
    const withoutSteps = render(program([1, 2], {}, ["VITALS", "HEALTH_PLAN_REVIEW"]), 3);
    expect(withoutSteps).toContain(CARD_HEADING);
    expect(withoutSteps).toContain("ครั้งนี้ต้องมีรายการสัญญาณชีพหรือทบทวนแผนสุขภาพในแผนที่เปิดอยู่");
    expect(withoutSteps).not.toContain("/followups/new");

    const readOnly = render(program([1, 2]), 3, false);
    expect(readOnly).toContain("ยังไม่มีการบันทึกการติดตามผลของครั้งนี้");
    expect(readOnly).not.toContain("/followups/new");
  });

  it("shows the five recorded values and a link to the Follow-up", () => {
    const html = render(program([1, 2], { followups: [recordedFollowup] }), 3);

    expect(html).toContain("วันที่ติดตาม");
    expect(html).toContain("20 ต.ค. 2569");
    // (4 + 2) / (4 + 3) = 86%.
    expect(html).toContain("6 จาก 7 วัน");
    expect(html).toContain("86%");
    expect(html).toContain("เกิน 70%");
    expect(html).toContain("ไม่ปรับแผน");
    expect(html).toContain("มีอุปสรรค");
    expect(html).toContain(`href="/app/patients/${relationshipId}/programs/${programId}/followups/${followupId}"`);
    expect(html).toContain("ดูแบบบันทึกการติดตามผล");
  });

  it("leaves rounds 1 and 2 without the card", () => {
    expect(render(program([]), 1)).not.toContain(CARD_HEADING);
    expect(render(program([1]), 2)).not.toContain(CARD_HEADING);
  });
});
