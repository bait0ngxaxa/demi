import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { getCurrentGoalTemplate } from "@/modules/goals/domain/goal-templates";
import type { GoalPlanDetail } from "@/modules/goals/services/goal-query-service";

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/modules/goals/transport/server-actions", () => ({
  submitGoalPlanAction: vi.fn(),
  submitGoalPlanForProgramAction: vi.fn(),
}));

const { GoalPlanForm } = await import("./new/goal-plan-form");
const { GoalPlanBookletView } = await import("./goal-plan-booklet-view");

const relationshipId = "22222222-2222-4222-8222-222222222222";
const patient = {
  patientHospitalRelationshipId: relationshipId,
  displayName: "ทดสอบ ผู้ป่วย",
  hospitalNumber: null,
  hospital: { id: "11111111-1111-4111-8111-111111111111", name: "โรงพยาบาลทดสอบ" },
};

/** R2-E: booklet texts, verbatim. */
const BOOKLET_TEXTS = [
  "เป้าหมาย “สุขภาพดี” ของฉัน คือ (เลือกอย่างน้อย 1 ข้อ)",
  "ฉันจะลดน้ำหนัก",
  "กก. ใน 3 เดือน",
  "ฉันจะลดรอบเอว ให้เหลือ",
  "ซม. ใน 3 เดือน",
  "ฉันจะลดน้ำตาล ให้ไม่เกิน",
  "มก/ดล.",
  "ฉันจะลดน้ำตาลสะสม ให้เหลือ",
  "แผน “สุขภาพดี” ของฉัน ใน 3 เดือนนี้ คือ:",
  "ฉันจะคุมอาหาร",
  "ฉันจะออกกำลังกาย / เพิ่มกิจกรรมทางกาย",
  "โดย ฉันจะ",
  "เริ่มตั้งแต่",
  "ไม่ได้ตั้งเป้า",
  "หลังลองทำไปแล้ว 1 เดือน ฉันพบปัญหา",
  "(ฉัน)",
  "(พยาน)",
];

describe("แผน “สุขภาพดี” ของฉัน (R2-E)", () => {
  it("shows the booklet form texts verbatim", () => {
    const markup = renderToStaticMarkup(
      createElement(GoalPlanForm, {
        latestScreening: null,
        patient,
        scope: { kind: "program", patientProgramId: "33333333-3333-4333-8333-333333333333", relationshipId },
        submissionNonce: "44444444-4444-4444-8444-444444444444",
        template: getCurrentGoalTemplate(),
      }),
    );

    for (const text of BOOKLET_TEXTS) {
      expect(markup).toContain(text);
    }
    expect(markup).toContain("แผน “สุขภาพดี” ของฉัน");
  });

  it("renders a saved plan with its sections, HbA1c in % and the witness name", () => {
    const booklet: NonNullable<GoalPlanDetail["booklet"]> = {
      goals: { weightLossKg: 3, waistCm: null, bloodSugarMgDl: null, hba1cPercent: 7, customText: "เดินเล่นกับหลาน" },
      food: { notSet: false, planText: "งดน้ำหวาน", startDate: "2026-10-22" },
      exercise: { notSet: true, planText: null, startDate: null },
      problemsAfterOneMonth: null,
      patientSignatureName: "สมชาย ผู้ป่วย",
      witnessSignatureName: "สมหญิง พยาน",
    };
    const markup = renderToStaticMarkup(
      createElement(GoalPlanBookletView, {
        booklet,
        items: [
          {
            goalPlanItemId: "i1",
            activityCode: "stop_sweet",
            activityLabel: "ลดหวาน",
            activityCategory: "FOOD",
            targetDays: 4,
            targetValue: null,
            targetUnit: null,
            sortOrder: 0,
          },
        ],
      }),
    );

    expect(markup).toContain("ฉันจะลดน้ำหนัก 3 กก. ใน 3 เดือน");
    expect(markup).toContain("ฉันจะลดน้ำตาลสะสม ให้เหลือ 7 %");
    expect(markup).toContain("ฉันจะ เดินเล่นกับหลาน");
    expect(markup).toContain("โดย ฉันจะ งดน้ำหวาน");
    expect(markup).toContain("ลดหวาน");
    expect(markup).toContain("ไม่ได้ตั้งเป้า");
    expect(markup).toContain("สมหญิง พยาน");
  });
});
