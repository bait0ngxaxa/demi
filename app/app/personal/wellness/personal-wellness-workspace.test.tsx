import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/modules/meals/transport/server-actions", () => ({ createPersonalMealAction: vi.fn(), updatePersonalMealAction: vi.fn(), deletePersonalMealAction: vi.fn(), listPersonalMealsAction: vi.fn() }));
vi.mock("@/modules/exercises/transport/server-actions", () => ({ createPersonalExerciseAction: vi.fn(), updatePersonalExerciseAction: vi.fn(), deletePersonalExerciseAction: vi.fn(), listPersonalExercisesAction: vi.fn() }));
vi.mock("@/modules/weight-goals/transport/server-actions", () => ({ createPersonalWeightGoalAction: vi.fn(), updatePersonalWeightGoalAction: vi.fn(), removePersonalWeightGoalAction: vi.fn(), readPersonalWeightGoalAction: vi.fn() }));
import { PersonalWellnessWorkspace } from "./personal-wellness-workspace";
describe("Wellness composition", () => {
  it("has one neutral header, three independent sections, local anchors and one empty target-only Weight state", () => {
    const html = renderToStaticMarkup(<PersonalWellnessWorkspace mealPage={{ items: [], nextCursor: null }} exercisePage={{ items: [], nextCursor: null }} weightGoal={null} today="2026-10-04" mealNonce="11111111-1111-4111-8111-111111111111" exerciseNonce="22222222-2222-4222-8222-222222222222" weightGoalNonce="33333333-3333-4333-8333-333333333333" />);
    expect(html.match(/<h1\b/gu)).toHaveLength(1); expect(html).toMatch(/<h1[^>]*>สุขภาพ<\/h1>/u);
    expect(html).toContain('href="#meal"'); expect(html).toContain('href="#exercise"'); expect(html).toContain('href="#weight-goal"'); expect(html).toContain('id="meal"'); expect(html).toContain('id="exercise"'); expect(html).toContain('id="weight-goal"');
    expect(html).toContain("ยังไม่มีบันทึกมื้ออาหาร"); expect(html).toContain("ยังไม่มีบันทึกการออกกำลังกาย");
    expect(html).toContain('name="submissionNonce" value="11111111-1111-4111-8111-111111111111"'); expect(html).toContain('name="submissionNonce" value="22222222-2222-4222-8222-222222222222"');
    expect(html).toContain("ยังไม่ได้ตั้งเป้าหมายน้ำหนักส่วนตัว"); expect(html).toContain("ตั้งเป้าหมายน้ำหนัก");
    for (const text of ["คะแนน", "แคลอรี", "Goal", "patientProfileId", "personId", "userId", "33333333-3333-4333-8333-333333333333"]) expect(html).not.toContain(text);
    expect(html).not.toMatch(/type="date"[^>]*\smax=/u);
  });
});
