import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { computeFollowupAchievement } from "@/modules/followups/domain/followup-achievement";
import type { FollowupProgramDetail } from "@/modules/followups/services/followup-query-service";
import { followupQueryInternals } from "@/modules/followups/services/followup-query-service";

import { FollowupDetailView } from "./followup-detail-view";

const relationshipId = "11111111-1111-4111-8111-111111111111";
const programId = "22222222-2222-4222-8222-222222222222";

const sourceGoalPlan = {
  goalPlanId: "33333333-3333-4333-8333-333333333333",
  patientProgramId: programId,
  roundNumber: 1,
  createdAt: new Date("2026-10-01T03:00:00.000Z"),
  primaryGoalCode: "healthy-plan",
  primaryGoalLabel: "แผนสุขภาพดีของฉัน",
  primaryGoalNote: null,
  weeklyNote: null,
  items: [
    { goalPlanItemId: "item-1", activityCode: "stop_sweet", activityLabel: "งดน้ำหวาน", activityCategory: "FOOD", targetDays: 4, targetValue: null, targetUnit: null, sortOrder: 0 },
    { goalPlanItemId: "item-2", activityCode: "cardio", activityLabel: "ออกกำลังกายแบบแอโรบิก", activityCategory: "EXERCISE", targetDays: 3, targetValue: 30, targetUnit: "minutes", sortOrder: 1 },
  ],
} as unknown as NonNullable<FollowupProgramDetail["sourceGoalPlan"]>;

const progress = [
  { progressId: "p-1", goalActivityCode: "stop_sweet", status: "DONE" as const, achievedDays: 4, note: null },
  { progressId: "p-2", goalActivityCode: "cardio", status: "PARTIAL" as const, achievedDays: 1, note: null },
];

function detail(overrides: Partial<FollowupProgramDetail> = {}): FollowupProgramDetail {
  return {
    patient: {
      patientHospitalRelationshipId: relationshipId,
      displayName: "สมชาย ผู้ป่วย",
      hospitalNumber: "HN-001",
      hospital: { id: "hospital", name: "โรงพยาบาล ก" },
    },
    followupId: "44444444-4444-4444-8444-444444444444",
    patientProgramId: programId,
    roundNumber: 1,
    recordedAt: new Date("2026-10-19T03:00:00.000Z"),
    createdAt: new Date("2026-10-19T03:00:00.000Z"),
    serviceDate: new Date("2026-10-18T00:00:00.000Z"),
    planAdjusted: true,
    adjustedGoalPlan: null,
    hasObstacle: true,
    obstacleNote: "ฝนตก",
    createdByDisplayName: "อสม. ทดสอบ",
    appointment: null,
    sourceGoalPlan,
    weight: null,
    waistCircumference: null,
    systolicBloodPressure: null,
    diastolicBloodPressure: null,
    bloodSugar: null,
    heightCm: null,
    confidenceScore: null,
    reflectionNote: "ทำได้บางวัน",
    followedPlan: false,
    expertAdvice: null,
    confidencePlan: null,
    generalNote: null,
    activityProgress: progress,
    achievement: computeFollowupAchievement(progress, sourceGoalPlan.items),
    ...overrides,
  };
}

function render(value: FollowupProgramDetail): string {
  return renderToStaticMarkup(
    <FollowupDetailView
      detail={value}
      scope={{ kind: "program", relationshipId, patientProgramId: programId, canManage: false, programStatus: "ACTIVE" }}
    />,
  );
}

describe("Program Follow-up detail", () => {
  it("shows วันที่ติดตาม, achieved/target days per activity, the total, rate, threshold, plan adjustment and obstacle", () => {
    const html = render(detail());

    expect(html).toContain("วันที่ติดตาม");
    expect(html).not.toContain("วันที่ให้บริการ");
    expect(html).toContain("4 จาก 4 วัน");
    expect(html).toContain("1 จาก 3 วัน");
    expect(html).toContain("อัตราความสำเร็จตามเป้า");
    // (4 + 1) / (4 + 3) = 71%.
    expect(html).toContain("ทำได้ 5 จาก 7 วัน · อัตราความสำเร็จ 71%");
    expect(html).toContain("เกิน 70%");
    expect(html).toContain("ปรับแผน");
    expect(html).toContain("มีอุปสรรค");
  });

  it("shows nothing for the rate when the Follow-up cannot be scored", () => {
    const html = render(detail({ achievement: null }));

    expect(html).not.toContain("อัตราความสำเร็จ");
    expect(html).not.toContain("70%");
  });

  it("computes the detail's rate from the source plan's targets, and none without a plan", () => {
    const record = {
      id: "44444444-4444-4444-8444-444444444444",
      patientProgramId: programId,
      sourceGoalPlanId: sourceGoalPlan.goalPlanId,
      roundNumber: 1,
      recordedAt: new Date(),
      createdAt: new Date(),
      serviceDate: null,
      planAdjusted: false,
      adjustedGoalPlans: [],
      hasObstacle: false,
      obstacleNote: null,
      weight: null,
      waistCircumference: null,
      systolicBloodPressure: null,
      diastolicBloodPressure: null,
      bloodSugar: null,
      heightCm: null,
      confidenceScore: null,
      reflectionNote: null,
      followedPlan: true,
      expertAdvice: null,
      confidencePlan: null,
      generalNote: null,
      createdByUser: { person: { givenName: "อสม.", familyName: "ทดสอบ" } },
      appointment: null,
      activityProgress: progress.map(({ progressId, ...row }) => ({ id: progressId, ...row })),
    } as unknown as Parameters<typeof followupQueryInternals.toDetail>[0];
    const patient = detail().patient;

    expect(followupQueryInternals.toDetail(record, patient, sourceGoalPlan).achievement).toEqual({
      achievedDays: 5,
      targetDays: 7,
      ratePercent: 71,
      aboveThreshold: true,
    });
    expect(followupQueryInternals.toDetail(record, patient, null).achievement).toBeNull();
  });
});
