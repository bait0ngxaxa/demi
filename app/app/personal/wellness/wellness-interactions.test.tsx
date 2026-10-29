// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/modules/meals/transport/server-actions", () => ({ createPersonalMealAction: vi.fn(), updatePersonalMealAction: vi.fn(), deletePersonalMealAction: vi.fn() }));
vi.mock("@/modules/exercises/transport/server-actions", () => ({ createPersonalExerciseAction: vi.fn(), updatePersonalExerciseAction: vi.fn(), deletePersonalExerciseAction: vi.fn() }));
vi.mock("@/modules/weight-goals/transport/server-actions", () => ({ createPersonalWeightGoalAction: vi.fn(), updatePersonalWeightGoalAction: vi.fn(), removePersonalWeightGoalAction: vi.fn() }));
import { MealEditor } from "./personal-meal-controls";
import { ExerciseEditor } from "./personal-exercise-controls";
import { PersonalWeightGoalEditor } from "./personal-weight-goal-controls";
import { createWellnessPrivateAuthority } from "./wellness-private-authority";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let host: HTMLDivElement;
let root: Root;
const nonce = "11111111-1111-4111-8111-111111111111";
function coordination(): { authority: ReturnType<typeof createWellnessPrivateAuthority>; isActive: () => boolean; onResult: () => void; onPending: () => void; blocked: boolean } {
  const authority = createWellnessPrivateAuthority(vi.fn());
  return { authority, isActive: () => authority.isActive(), onResult: vi.fn(), onPending: vi.fn(), blocked: false };
}
function input(selector: string, value: string): void {
  const element = host.querySelector<HTMLInputElement>(selector);
  if (!element) throw new Error(`Missing input ${selector}`);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}
function button(label: string): HTMLButtonElement {
  const found = [...host.querySelectorAll("button")].find((element) => element.textContent === label);
  if (!found) throw new Error(`Missing button ${label}`);
  return found;
}
beforeEach(() => { host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(() => root.unmount()); host.remove(); });
describe("Thai interactive journal editors", () => {
  it("retains an existing future weight goal date without a recording-date maximum", async () => {
    const goal = { id: nonce, targetWeightKg: "65", targetDate: "2030-12-31", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
    await act(() => root.render(<PersonalWeightGoalEditor goal={goal} nonce={nonce} coordination={coordination()} />));
    expect(host.querySelector<HTMLInputElement>('[name="targetDate"]')?.value).toBe(goal.targetDate);
    expect(host.querySelector<HTMLInputElement>('[name="targetDate"]')?.max).toBe("");
  });
  it("preserves a saved past target date until duration is explicitly applied; allows clearing", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-31T17:00:00Z"));
    try {
      const goal = { id: nonce, targetWeightKg: "65", targetDate: "2025-02-01", createdAt: "2025-01-01T00:00:00.000Z", updatedAt: "2025-01-01T00:00:00.000Z" };
      await act(() => root.render(<PersonalWeightGoalEditor goal={goal} nonce={nonce} coordination={coordination()} />));
      await act(() => input('[type="range"]', "1"));
      expect(host.querySelector<HTMLInputElement>('[name="targetDate"]')?.value).toBe("2025-02-01");
      await act(() => button("ใช้ระยะเวลานี้").click());
      expect(host.querySelector<HTMLInputElement>('[name="targetDate"]')?.value).toBe("2027-01-08");
      await act(() => input('[name="targetDate"]', ""));
      expect(new FormData(host.querySelector("form") ?? undefined).get("targetDate")).toBe("");
    } finally { vi.useRealTimers(); }
  });
  it("selects, searches and replaces an exercise with a custom activity without changing nonce", async () => {
    await act(() => root.render(<ExerciseEditor today="2026-10-29" nonce={nonce} coordination={coordination()} />));
    await act(() => button("เดิน").click());
    expect(host.querySelector<HTMLInputElement>('[name="activityName"]')?.value).toBe("เดิน");
    await act(() => input('[type="search"]', "จักรยาน"));
    expect(host.textContent).not.toContain("แบดมินตัน");
    await act(() => button("ปั่นจักรยาน").click());
    await act(() => button("อื่น ๆ / กรอกเอง").click());
    await act(() => input('[name="activityName"]', "โยคะในสวน"));
    expect(new FormData(host.querySelector("form") ?? undefined).get("activityName")).toBe("โยคะในสวน");
    expect(host.querySelector<HTMLInputElement>('[name="submissionNonce"]')?.value).toBe(nonce);
  });
  it("selects each meal category as the actual submitted value", async () => {
    await act(() => root.render(<MealEditor today="2026-10-29" nonce={nonce} coordination={coordination()} />));
    expect(host.querySelector("textarea")?.closest("[hidden]")).not.toBeNull();
    for (const category of ["BREAKFAST", "LUNCH", "DINNER", "SNACK"]) {
      await act(() => host.querySelector<HTMLInputElement>(`[value="${category}"]`)?.click());
      expect(new FormData(host.querySelector("form") ?? undefined).get("category")).toBe(category);
      expect(host.querySelector("textarea")?.closest("[hidden]")).toBeNull();
    }
    expect(host.querySelector("textarea[name=description]")).not.toBeNull();
  });
});
