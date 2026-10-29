// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DailyWellnessRead } from "./daily-wellness-action";
const mock = vi.hoisted(() => ({ daily: vi.fn(), create: vi.fn(), list: vi.fn() }));
vi.mock("./daily-wellness-action", () => ({ readDailyWellnessAction: mock.daily }));
vi.mock("@/modules/meals/transport/server-actions", () => ({ createPersonalMealAction: mock.create, updatePersonalMealAction: vi.fn(), deletePersonalMealAction: vi.fn(), listPersonalMealsAction: mock.list }));
vi.mock("@/modules/exercises/transport/server-actions", () => ({ createPersonalExerciseAction: vi.fn(), updatePersonalExerciseAction: vi.fn(), deletePersonalExerciseAction: vi.fn(), listPersonalExercisesAction: vi.fn() }));
vi.mock("@/modules/weight-goals/transport/server-actions", () => ({ createPersonalWeightGoalAction: vi.fn(), updatePersonalWeightGoalAction: vi.fn(), removePersonalWeightGoalAction: vi.fn(), readPersonalWeightGoalAction: vi.fn() }));
import { PersonalWellnessWorkspace } from "./personal-wellness-workspace";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let host: HTMLDivElement;
let root: Root;
const date = "2026-10-29";
const nonce = "11111111-1111-4111-8111-111111111111";
const props = { today: date, mealNonce: nonce, exerciseNonce: "22222222-2222-4222-8222-222222222222", weightGoalNonce: "33333333-3333-4333-8333-333333333333", weightGoal: null,
  mealPage: { items: [], nextCursor: null, dailySummary: { occurredOn: date, count: 61 } },
  exercisePage: { items: [], nextCursor: null, dailySummary: { occurredOn: date, count: 3, recordedDurationCount: 2, durationMinutes: 25 } } };
function button(label: string): HTMLButtonElement {
  const element = [...host.querySelectorAll("button")].find((item) => item.textContent === label);
  if (!element) throw new Error(`Missing button ${label}`);
  return element;
}
async function chooseDate(value: string): Promise<void> {
  await act(() => {
    const input = host.querySelector<HTMLInputElement>("#wellness-date");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input?.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(() => button("ดูบันทึกตามวันที่").click());
}
beforeEach(async () => { vi.resetAllMocks(); host = document.createElement("div"); document.body.append(host); root = createRoot(host); await act(() => root.render(<PersonalWellnessWorkspace {...props} />)); });
afterEach(async () => { await act(() => root.unmount()); host.remove(); });
describe("Daily Wellness interactions", () => {
  it("uses server totals, shows partial duration and loads an older day into both editors", async () => {
    expect(host.textContent).toContain("61 รายการ"); expect(host.textContent).toContain("รวมเฉพาะเวลาที่ระบุ 25 นาที"); expect(host.textContent).toContain("ไม่ระบุเวลา 1 รายการ");
    mock.daily.mockResolvedValue({ status: "SUCCESS", mealPage: { items: [], nextCursor: null, dailySummary: { occurredOn: "2026-10-01", count: 0 } }, exercisePage: { items: [], nextCursor: null, dailySummary: { occurredOn: "2026-10-01", count: 0, recordedDurationCount: 0, durationMinutes: null } } });
    await chooseDate("2026-10-01");
    expect(mock.daily.mock.calls[0][0].get("occurredOn")).toBe("2026-10-01");
    expect([...host.querySelectorAll<HTMLInputElement>('[name="occurredOn"]')].map((item) => item.value)).toEqual(["2026-10-01", "2026-10-01"]);
    expect(host.textContent).not.toContain("61 รายการ");
  });
  it("refreshes the full date aggregate after a confirmed create", async () => {
    const item = { id: nonce, category: "SNACK", occurredOn: date, description: null, createdAt: `${date}T00:00:00.000Z`, updatedAt: `${date}T00:00:00.000Z` };
    mock.create.mockResolvedValue({ status: "SUCCESS", message: "บันทึกมื้ออาหารแล้ว", result: { outcome: "CREATED", item } });
    mock.list.mockResolvedValue({ status: "SUCCESS", page: { items: [item], nextCursor: null, dailySummary: { occurredOn: date, count: 62 } } });
    await act(() => host.querySelector<HTMLInputElement>('[name="category"][value="SNACK"]')?.click());
    await act(() => button("บันทึกมื้ออาหาร").click());
    expect(mock.create).toHaveBeenCalledOnce(); expect(mock.list.mock.calls[0][0].get("occurredOn")).toBe(date);
    expect(host.textContent).toContain("62 รายการ"); expect(host.textContent).toContain("บันทึกมื้ออาหารแล้ว");
  });
  it("clears all private data on denial and ignores a late date response after pagehide", async () => {
    let resolve: (result: DailyWellnessRead) => void = () => undefined;
    mock.daily.mockReturnValue(new Promise<DailyWellnessRead>((done) => { resolve = done; }));
    await chooseDate("2026-10-01");
    await act(() => window.dispatchEvent(new Event("pagehide")));
    await act(() => resolve({ status: "SUCCESS", mealPage: props.mealPage, exercisePage: props.exercisePage }));
    expect(host.textContent).toContain("ยืนยันสิทธิ์"); expect(host.textContent).not.toContain("61 รายการ"); expect(host.querySelector("form")).toBeNull();
  });
  it("fails closed for a denied daily response", async () => {
    mock.daily.mockResolvedValue({ status: "DENIED", message: "ยืนยันสิทธิ์" });
    await chooseDate("2026-10-01");
    expect(host.textContent).not.toContain("61 รายการ"); expect(host.querySelector("form")).toBeNull();
  });
  it("keeps an uncertain create on the same nonce and blocks changing date until reviewed", async () => {
    mock.create.mockResolvedValue({ status: "UNCONFIRMED", message: "ยังยืนยันผลไม่ได้" });
    await act(() => host.querySelector<HTMLInputElement>('[name="category"][value="SNACK"]')?.click());
    await act(() => button("บันทึกมื้ออาหาร").click());
    await chooseDate("2026-10-01");
    expect(mock.daily).not.toHaveBeenCalled(); expect(host.textContent).toContain("ทบทวนผลคำขอเดิมก่อนเปลี่ยนวัน");
    await act(() => button("ลองคำขอเดิมอีกครั้ง").click());
    expect(mock.create).toHaveBeenCalledTimes(2);
    expect(mock.create.mock.calls.map((args) => args[1].get("submissionNonce"))).toEqual([nonce, nonce]);
  });
});
