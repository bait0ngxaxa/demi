// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ meal: vi.fn(), exercise: vi.fn(), meals: vi.fn(), exercises: vi.fn() }));
vi.mock("@/modules/meals/transport/server-actions", () => ({ createPersonalMealAction: mock.meal, updatePersonalMealAction: mock.meal, deletePersonalMealAction: mock.meal, listPersonalMealsAction: mock.meals }));
vi.mock("@/modules/exercises/transport/server-actions", () => ({ createPersonalExerciseAction: mock.exercise, updatePersonalExerciseAction: mock.exercise, deletePersonalExerciseAction: mock.exercise, listPersonalExercisesAction: mock.exercises }));
import { PersonalMealWorkspace } from "./personal-meal-workspace";
import { PersonalExerciseWorkspace } from "./personal-exercise-workspace";
import { createWellnessPrivateAuthority } from "./wellness-private-authority";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let host: HTMLDivElement;
let root: Root;
const nonce = "11111111-1111-4111-8111-111111111111";
const date = "2026-10-29";
const persisted = { id: nonce, occurredOn: date, createdAt: `${date}T00:00:00.000Z`, updatedAt: `${date}T00:00:00.000Z`, category: "SNACK" as const, description: "เดิม", activityName: "เดิน", durationMinutes: 10, note: "เดิม" };
function button(label: string): HTMLButtonElement {
  const found = [...host.querySelectorAll("button")].find((element) => element.textContent === label);
  if (!found) throw new Error(`Missing ${label}`);
  return found;
}
beforeEach(() => { vi.resetAllMocks(); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(() => root.unmount()); host.remove(); });
describe.each(["meal", "exercise"] as const)("%s create recovery", (kind) => {
  async function mount(withRecord = false): Promise<{ authority: ReturnType<typeof createWellnessPrivateAuthority>; lock: ReturnType<typeof vi.fn> }> {
    const authority = createWellnessPrivateAuthority(vi.fn());
    const lock = vi.fn();
    const props = { initialPage: { items: withRecord ? [persisted, { ...persisted, id: "22222222-2222-4222-8222-222222222222" }] : [], nextCursor: null }, today: date, initialNonce: nonce, authority, date, onLockChange: lock };
    await act(() => root.render(kind === "meal" ? <PersonalMealWorkspace {...props} /> : <PersonalExerciseWorkspace {...props} />));
    await act(() => kind === "meal" ? host.querySelector<HTMLInputElement>('[value="SNACK"]')?.click() : button("เดิน").click());
    return { authority, lock };
  }
  const save = kind === "meal" ? "บันทึกมื้ออาหาร" : "บันทึกการออกกำลังกาย";
  it.each([
    ["edit", "UNCONFIRMED"], ["edit", "CONFLICT"],
    ["delete", "UNCONFIRMED"], ["delete", "CONFLICT"],
  ] as const)("prevents new intent and other record selection after %s %s until a successful review read", async (operation, status) => {
    const { lock } = await mount(true);
    await act(() => button("แก้ไข / ลบ").click());
    mock[kind].mockResolvedValue({ status, message: "ต้องทบทวนรายการเดิม" });
    if (operation === "delete") {
      await act(() => button("ลบบันทึกนี้").click());
      await act(() => button("ยืนยันลบ").click());
    } else await act(() => button("บันทึกการแก้ไข").click());
    const originalVersion = host.querySelector<HTMLInputElement>('[name="expectedUpdatedAt"]')?.value;
    expect(button("เริ่มบันทึกใหม่").disabled).toBe(true);
    const recordButtons = [...host.querySelectorAll<HTMLButtonElement>("button")].filter((item) => item.textContent === "แก้ไข / ลบ");
    expect(recordButtons).toHaveLength(2);
    expect(recordButtons.every((item) => item.disabled)).toBe(true);
    await act(() => { button("เริ่มบันทึกใหม่").click(); recordButtons[1].click(); });
    expect(host.querySelector<HTMLInputElement>('[name="entryId"]')?.value).toBe(persisted.id);
    expect(host.querySelector<HTMLInputElement>('[name="expectedUpdatedAt"]')?.value).toBe(originalVersion);
    expect(lock.mock.lastCall).toEqual([true]);
    const list = kind === "meal" ? mock.meals : mock.exercises;
    list.mockRejectedValueOnce(new Error("offline"));
    await act(() => button("โหลดรายการล่าสุด").click());
    expect(button("เริ่มบันทึกใหม่").disabled).toBe(true);
    expect(lock.mock.lastCall).toEqual([true]);
    list.mockResolvedValue({ status: "SUCCESS", page: { items: [persisted], nextCursor: null } });
    await act(() => button("โหลดรายการล่าสุด").click());
    expect(lock.mock.lastCall).toEqual([false]);
    expect(button("เริ่มบันทึกใหม่").disabled).toBe(false);
    expect(button("แก้ไข / ลบ").disabled).toBe(false);
  });
  it("requires refreshed versions after an edit conflict, rather than retrying stale edits", async () => {
    const { lock } = await mount(true);
    await act(() => button("แก้ไข / ลบ").click());
    mock[kind].mockResolvedValue({ status: "CONFLICT", message: "รายการเปลี่ยนแล้ว" });
    await act(() => button("บันทึกการแก้ไข").click());
    expect(button("บันทึกการแก้ไข").disabled).toBe(true);
    expect(lock.mock.lastCall).toEqual([true]);
    const current = { ...persisted, updatedAt: `${date}T00:01:00.000Z` };
    (kind === "meal" ? mock.meals : mock.exercises).mockResolvedValue({ status: "SUCCESS", page: { items: [current], nextCursor: null } });
    await act(() => button("โหลดรายการล่าสุด").click());
    expect(lock.mock.lastCall).toEqual([false]);
    await act(() => button("แก้ไข / ลบ").click());
    expect(host.querySelector<HTMLInputElement>('[name="expectedUpdatedAt"]')?.value).toBe(current.updatedAt);
    expect(button("บันทึกการแก้ไข").disabled).toBe(false);
  });
  it("a read failure during unresolved create preserves payload, retry and navigation protection", async () => {
    const { lock } = await mount();
    mock[kind].mockResolvedValue({ status: "UNCONFIRMED", message: "ผลยังไม่แน่นอน" });
    await act(() => button(save).click());
    const original = [...mock[kind].mock.calls[0][1].entries()];
    (kind === "meal" ? mock.meals : mock.exercises).mockRejectedValue(new Error("offline"));
    await act(() => button("โหลดรายการล่าสุด").click());
    expect(lock.mock.lastCall).toEqual([true]);
    expect(button("เริ่มบันทึกใหม่").disabled).toBe(true);
    // Even a synthetic changed value must not change the saved retry snapshot.
    const input = host.querySelector<HTMLInputElement>('[name="occurredOn"]');
    await act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "2026-10-01");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(() => button("ลองคำขอเดิมอีกครั้ง").click());
    expect([...mock[kind].mock.calls[1][1].entries()]).toEqual(original);
  });
  it("releases a pending read on unmount and ignores its late result", async () => {
    const { lock } = await mount();
    let resolve: (value: unknown) => void = () => undefined;
    (kind === "meal" ? mock.meals : mock.exercises).mockReturnValue(new Promise((done) => { resolve = done; }));
    await act(() => button("โหลดรายการล่าสุด").click());
    expect(lock.mock.lastCall).toEqual([true]);
    await act(() => root.render(null));
    expect(lock.mock.lastCall).toEqual([false]);
    await act(() => resolve({ status: "SUCCESS", page: { items: [persisted], nextCursor: null } }));
    expect(host.textContent).toBe("");
  });
  it.each(["error", "throw"])("releases a failed %s read without rewriting mutation feedback", async (failure) => {
    const { lock } = await mount();
    const list = kind === "meal" ? mock.meals : mock.exercises;
    if (failure === "throw") list.mockRejectedValue(new Error("offline"));
    else list.mockResolvedValue({ status: "ERROR", message: "read failed" });
    await act(() => button("โหลดรายการล่าสุด").click());
    expect(lock.mock.lastCall).toEqual([false]);
    expect(host.textContent).toContain("ยังโหลดรายการและข้อมูลสรุปล่าสุดไม่ได้");
    list.mockResolvedValue({ status: "SUCCESS", page: { items: [], nextCursor: null } });
    await act(() => button("โหลดรายการล่าสุด").click());
    expect(host.textContent).not.toContain("ยังโหลดรายการและข้อมูลสรุปล่าสุดไม่ได้");
    expect(lock.mock.lastCall).toEqual([false]);
  });
  it("keeps confirmed feedback and withholds aggregate when refresh fails; retry recovers", async () => {
    const { lock } = await mount();
    const item = { id: nonce, occurredOn: date, createdAt: `${date}T00:00:00Z`, updatedAt: `${date}T00:00:00Z`, category: "SNACK", description: null, activityName: "เดิน", durationMinutes: null, note: null };
    mock[kind].mockResolvedValue({ status: "SUCCESS", message: "confirmed write", result: { outcome: "CREATED", item } });
    const list = kind === "meal" ? mock.meals : mock.exercises;
    list.mockRejectedValue(new Error("offline"));
    await act(() => button(save).click());
    expect(host.textContent).toContain("confirmed write");
    expect(host.textContent).toContain("ยังโหลดรายการและข้อมูลสรุปล่าสุดไม่ได้");
    expect(lock.mock.lastCall).toEqual([false]);
    list.mockResolvedValue({ status: "SUCCESS", page: { items: [item], nextCursor: null } });
    await act(() => button("โหลดรายการล่าสุด").click());
    expect(host.textContent).toContain("confirmed write");
    expect(button("เริ่มบันทึกใหม่").disabled).toBe(false);
  });
  it("keeps recovery through a failed retry, then accepts replay as terminal", async () => {
    const { lock } = await mount();
    mock[kind].mockResolvedValueOnce({ status: "UNCONFIRMED" }).mockResolvedValueOnce({ status: "ERROR", message: "ลองใหม่" });
    await act(() => button(save).click());
    await act(() => button("ลองคำขอเดิมอีกครั้ง").click());
    expect(button("เริ่มบันทึกใหม่").disabled).toBe(true);
    expect(lock.mock.lastCall).toEqual([true]);
    expect(host.querySelector('[data-navigation-guard="unknown-outcome"]')).not.toBeNull();
    const item = { id: nonce, occurredOn: date, createdAt: `${date}T00:00:00Z`, updatedAt: `${date}T00:00:00Z`, category: "SNACK", description: null, activityName: "เดิน", durationMinutes: null, note: null };
    mock[kind].mockResolvedValue({ status: "SUCCESS", message: "ดำเนินการแล้ว", result: { outcome: "REPLAY", item } });
    (kind === "meal" ? mock.meals : mock.exercises).mockResolvedValue({ status: "SUCCESS", page: { items: [item], nextCursor: null } });
    await act(() => button("ลองคำขอเดิมอีกครั้ง").click());
    expect(mock[kind].mock.calls.map((args) => [...args[1].entries()])).toEqual(Array(3).fill([...mock[kind].mock.calls[0][1].entries()]));
    expect(button("เริ่มบันทึกใหม่").disabled).toBe(false);
    expect(host.textContent).toContain("ดำเนินการแล้ว");
  });
  it("retains an immutable intent after lost response; reads and new actions cannot discard it", async () => {
    const { lock } = await mount();
    mock[kind].mockRejectedValueOnce(new Error("response lost"));
    await act(() => button(save).click());
    const original = [...mock[kind].mock.calls[0][1].entries()];
    expect(button("เริ่มบันทึกใหม่").disabled).toBe(true);
    expect(host.querySelector("fieldset")?.disabled).toBe(true);
    const list = kind === "meal" ? mock.meals : mock.exercises;
    list.mockResolvedValue({ status: "SUCCESS", page: { items: [], nextCursor: null } });
    await act(() => button("โหลดรายการล่าสุด").click());
    expect(lock.mock.lastCall).toEqual([true]);
    expect(host.querySelector<HTMLInputElement>('[name="submissionNonce"]')?.value).toBe(nonce);
    mock[kind].mockResolvedValue({ status: "CREATE_CONSUMED", message: "คำขอนี้ถูกใช้แล้ว" });
    await act(() => button("ลองคำขอเดิมอีกครั้ง").click());
    expect([...mock[kind].mock.calls[1][1].entries()]).toEqual(original);
    expect(button("เริ่มบันทึกใหม่").disabled).toBe(false);
    await act(() => button("เริ่มบันทึกใหม่").click());
    expect(host.querySelector<HTMLInputElement>('[name="submissionNonce"]')?.value).not.toBe(nonce);
  });
  it("ignores a late create response after authority invalidation", async () => {
    const { authority } = await mount();
    let resolve: (value: unknown) => void = () => undefined;
    mock[kind].mockReturnValue(new Promise((done) => { resolve = done; }));
    await act(() => button(save).click());
    authority.invalidate();
    await act(() => resolve({ status: "SUCCESS", message: "late private result" }));
    expect(host.textContent).not.toContain("late private result");
  });
  it("ignores late completion after unmount", async () => {
    await mount();
    let resolve: (value: unknown) => void = () => undefined;
    mock[kind].mockReturnValue(new Promise((done) => { resolve = done; }));
    await act(() => button(save).click());
    await act(() => root.render(null));
    await act(() => resolve({ status: "UNCONFIRMED", message: "late" }));
    expect(host.textContent).toBe("");
  });
});
