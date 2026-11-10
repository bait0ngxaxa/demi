// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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
let originalShowModal: PropertyDescriptor | undefined;
let originalClose: PropertyDescriptor | undefined;
beforeAll(() => {
  originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
  originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value(this: HTMLDialogElement): void { this.setAttribute("open", ""); } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value(this: HTMLDialogElement): void { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); } });
});
afterAll(() => {
  if (originalShowModal) Object.defineProperty(HTMLDialogElement.prototype, "showModal", originalShowModal); else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, "close", originalClose); else Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
});
beforeEach(() => { vi.resetAllMocks(); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(() => root.unmount()); host.remove(); });
describe.each(["meal", "exercise"] as const)("%s create recovery", (kind) => {
  async function mount(withRecord = false): Promise<{ authority: ReturnType<typeof createWellnessPrivateAuthority>; lock: ReturnType<typeof vi.fn> }> {
    const authority = createWellnessPrivateAuthority(vi.fn());
    const lock = vi.fn();
    const props = { initialPage: { items: withRecord ? [persisted, { ...persisted, id: "22222222-2222-4222-8222-222222222222" }] : [], nextCursor: null }, today: date, initialNonce: nonce, authority, date, onLockChange: lock };
    await act(() => root.render(kind === "meal" ? <PersonalMealWorkspace {...props} /> : <PersonalExerciseWorkspace {...props} />));
    if (!host.querySelector("details")?.open) await act(() => host.querySelector("summary")?.click());
    await act(() => kind === "meal" ? host.querySelector<HTMLInputElement>('[value="SNACK"]')?.click() : button("เดิน").click());
    return { authority, lock };
  }
  const save = kind === "meal" ? "บันทึกมื้ออาหาร" : "บันทึกการออกกำลังกาย";
  function disclosure(): HTMLDetailsElement {
    const element = host.querySelector("details");
    if (!element) throw new Error("Missing create disclosure");
    return element;
  }
  async function toggle(): Promise<void> {
    await act(() => disclosure().querySelector("summary")?.click());
  }
  it("starts empty days open and existing days collapsed, with the saved list immediately available", async () => {
    const authority = createWellnessPrivateAuthority(vi.fn());
    const props = { initialPage: { items: [persisted], nextCursor: null }, today: date, initialNonce: nonce, authority, date };
    await act(() => root.render(kind === "meal" ? <PersonalMealWorkspace {...props} /> : <PersonalExerciseWorkspace {...props} />));
    expect(disclosure().open).toBe(false);
    expect(disclosure().querySelector("summary")?.textContent).toContain(kind === "meal" ? "บันทึกมื้ออาหารเพิ่ม" : "เพิ่มกิจกรรม");
    const records = host.querySelector('ul[aria-label$="ที่บันทึกแล้ว"]');
    expect(records?.closest("details")).toBeNull();
    expect(records?.querySelectorAll("li")).toHaveLength(1);
    expect(disclosure().querySelector("form")).not.toBeNull();
    await toggle(); expect(disclosure().open).toBe(true);
    await toggle(); expect(disclosure().open).toBe(false);
  });
  it("preserves a dirty draft, form identity and nonce across close/reopen without submitting", async () => {
    await mount(); expect(disclosure().open).toBe(true);
    const form = disclosure().querySelector("form");
    const field = form?.querySelector<HTMLTextAreaElement>("textarea");
    if (!field) throw new Error("Missing draft field");
    await act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(field, "ร่างที่ยังไม่บันทึก");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const summary = disclosure().querySelector("summary"); summary?.focus();
    await toggle(); expect(disclosure().open).toBe(false);
    expect(document.activeElement).toBe(summary);
    await toggle(); expect(disclosure().querySelector("form")).toBe(form);
    expect(field.value).toBe("ร่างที่ยังไม่บันทึก");
    expect(form?.querySelector<HTMLInputElement>('[name="submissionNonce"]')?.value).toBe(nonce);
    expect(mock[kind]).not.toHaveBeenCalled();
  });
  it.each(["UNCONFIRMED", "CONFLICT"])("keeps pending and %s recovery visible, retries the same nonce, then permits collapse", async (status) => {
    const { lock } = await mount();
    let resolve: (value: unknown) => void = () => undefined;
    mock[kind].mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    await act(async () => button(save).click());
    await toggle(); expect(disclosure().open).toBe(true);
    expect(disclosure().querySelector("summary")?.getAttribute("aria-disabled")).toBe("true");
    await act(() => resolve({ status, message: "ต้องลองคำขอเดิม" }));
    await toggle(); expect(disclosure().open).toBe(true);
    expect(disclosure().querySelector('[data-navigation-guard="unknown-outcome"]')).not.toBeNull();
    expect(lock.mock.lastCall).toEqual([true]);
    const original = [...mock[kind].mock.calls[0][1].entries()];
    mock[kind].mockResolvedValueOnce({ status: "ERROR", message: "ยังลองใหม่ไม่ได้" });
    await act(async () => button("ตรวจสอบผลการบันทึก").click());
    await toggle(); expect(disclosure().open).toBe(true);
    mock[kind].mockResolvedValueOnce({ status: "SUCCESS", result: { outcome: "REPLAY", item: persisted } });
    (kind === "meal" ? mock.meals : mock.exercises).mockResolvedValueOnce({ status: "SUCCESS", page: { items: [persisted], nextCursor: null } });
    await act(async () => button("ตรวจสอบผลการบันทึก").click());
    expect(mock[kind].mock.calls.map((args) => [...args[1].entries()])).toEqual([original, original, original]);
    expect(host.querySelector('[aria-label="ข้อมูลที่บันทึกแล้ว"]')?.textContent).toContain("บันทึกแล้ว");
    expect(host.querySelector('ul[aria-label$="ที่บันทึกแล้ว"]')?.querySelectorAll("li")).toHaveLength(1);
    expect(disclosure().querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("");
    expect(document.activeElement).toBe(disclosure().querySelector("h3"));
    expect(disclosure().open).toBe(true);
    await toggle(); expect(disclosure().open).toBe(false);
    expect(lock.mock.lastCall).toEqual([false]);
  });
  it("allows recoverable validation collapse but keeps consumed intent visible until explicit renewal", async () => {
    await mount();
    mock[kind].mockResolvedValueOnce({ status: "ERROR", message: "ตรวจสอบข้อมูล", fieldErrors: { occurredOn: "ตรวจสอบวันที่" } });
    await act(async () => button(save).click());
    await toggle(); expect(disclosure().open).toBe(false); await toggle();
    if (kind === "meal") await act(() => host.querySelector<HTMLInputElement>('[value="SNACK"]')?.click());
    mock[kind].mockResolvedValueOnce({ status: "CREATE_CONSUMED", message: "คำขอนี้ถูกใช้แล้ว" });
    await act(async () => button(save).click());
    expect(mock[kind]).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain("คำขอนี้ถูกใช้แล้ว");
    await toggle(); expect(disclosure().open).toBe(true);
    expect(host.querySelector<HTMLInputElement>('[name="submissionNonce"]')?.value).toBe(nonce);
    await act(async () => button("เริ่มบันทึกใหม่").click());
    expect(host.querySelector<HTMLInputElement>('[name="submissionNonce"]')?.value).not.toBe(nonce);
    await toggle(); expect(disclosure().open).toBe(false);
    expect(mock[kind]).toHaveBeenCalledTimes(2);
  });
  it.each([
    ["edit", "UNCONFIRMED"], ["edit", "CONFLICT"],
    ["delete", "UNCONFIRMED"], ["delete", "CONFLICT"],
  ] as const)("prevents new intent and other record selection after %s %s until a successful review read", async (operation, status) => {
    const { lock } = await mount(true);
    await act(() => button(operation === "delete" ? "ลบ" : "แก้ไข").click());
    mock[kind].mockResolvedValue({ status, message: "ต้องทบทวนรายการเดิม" });
    if (operation === "delete") await act(() => button("ยืนยันลบ").click());
    else await act(() => button("บันทึกการแก้ไข").click());
    // The review requirement keeps its dialog open; it cannot be dismissed into a new intent.
    await act(() => { host.querySelector("dialog")?.dispatchEvent(new Event("cancel", { cancelable: true })); });
    expect(host.querySelector("dialog")?.hasAttribute("open")).toBe(true);
    const originalVersion = host.querySelector<HTMLInputElement>('[name="expectedUpdatedAt"]')?.value;
    expect(button("เริ่มบันทึกใหม่").disabled).toBe(true);
    const recordButtons = [...host.querySelectorAll<HTMLButtonElement>("button")].filter((item) => item.textContent === "แก้ไข" || item.textContent === "ลบ");
    expect(recordButtons).toHaveLength(4);
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
    expect(button("แก้ไข").disabled).toBe(false);
    expect(host.querySelector("dialog")).toBeNull();
  });
  it("requires refreshed versions after an edit conflict, rather than retrying stale edits", async () => {
    const { lock } = await mount(true);
    await act(() => button("แก้ไข").click());
    mock[kind].mockResolvedValue({ status: "CONFLICT", message: "รายการเปลี่ยนแล้ว" });
    await act(() => button("บันทึกการแก้ไข").click());
    expect(button("บันทึกการแก้ไข").disabled).toBe(true);
    expect(lock.mock.lastCall).toEqual([true]);
    const current = { ...persisted, updatedAt: `${date}T00:01:00.000Z` };
    (kind === "meal" ? mock.meals : mock.exercises).mockResolvedValue({ status: "SUCCESS", page: { items: [current], nextCursor: null } });
    await act(() => button("โหลดรายการล่าสุด").click());
    expect(lock.mock.lastCall).toEqual([false]);
    await act(() => button("แก้ไข").click());
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
    await act(() => button("ตรวจสอบผลการบันทึก").click());
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
    await act(() => button("ตรวจสอบผลการบันทึก").click());
    expect(button("เริ่มบันทึกใหม่").disabled).toBe(true);
    expect(lock.mock.lastCall).toEqual([true]);
    expect(host.querySelector('[data-navigation-guard="unknown-outcome"]')).not.toBeNull();
    const item = { id: nonce, occurredOn: date, createdAt: `${date}T00:00:00Z`, updatedAt: `${date}T00:00:00Z`, category: "SNACK", description: null, activityName: "เดิน", durationMinutes: null, note: null };
    mock[kind].mockResolvedValue({ status: "SUCCESS", message: "ดำเนินการแล้ว", result: { outcome: "REPLAY", item } });
    (kind === "meal" ? mock.meals : mock.exercises).mockResolvedValue({ status: "SUCCESS", page: { items: [item], nextCursor: null } });
    await act(() => button("ตรวจสอบผลการบันทึก").click());
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
    await act(() => button("ตรวจสอบผลการบันทึก").click());
    expect([...mock[kind].mock.calls[1][1].entries()]).toEqual(original);
    expect(button("เริ่มบันทึกใหม่").disabled).toBe(false);
    await act(() => button("เริ่มบันทึกใหม่").click());
    expect(host.querySelector<HTMLInputElement>('[name="submissionNonce"]')?.value).not.toBe(nonce);
  });
  it("shows the saved readback only for a server-confirmed create; pending, unconfirmed and failed results stay in the form", async () => {
    await mount();
    const saved = (): Element | null => host.querySelector('[aria-label="ข้อมูลที่บันทึกแล้ว"]');
    let resolve: (value: unknown) => void = () => undefined;
    mock[kind].mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    await act(() => button(save).click());
    expect(saved()).toBeNull();
    await act(() => resolve({ status: "UNCONFIRMED", message: "ผลยังไม่แน่นอน" }));
    expect(saved()).toBeNull();
    const recoveryAlert = host.querySelector('[data-navigation-guard="unknown-outcome"]');
    expect(recoveryAlert).not.toBeNull();
    expect(recoveryAlert?.getAttribute("role")).toBe("status");
    expect(recoveryAlert?.parentElement?.closest('[role="status"]')).toBeNull();
    expect(host.textContent.match(/ยังยืนยันผลการบันทึกไม่ได้/gu)).toHaveLength(1);
    expect(host.textContent).toContain("การตรวจสอบจะส่งข้อมูลเดิมอีกครั้ง");
    mock[kind].mockResolvedValueOnce({ status: "ERROR", message: "ลองใหม่" });
    await act(() => button("ตรวจสอบผลการบันทึก").click());
    expect(saved()).toBeNull();
    const item = { id: nonce, occurredOn: date, createdAt: `${date}T00:00:00Z`, updatedAt: `${date}T00:00:00Z`, category: "SNACK", description: null, activityName: "เดิน", durationMinutes: null, note: null };
    mock[kind].mockResolvedValue({ status: "SUCCESS", message: "ดำเนินการแล้ว", result: { outcome: "REPLAY", item } });
    (kind === "meal" ? mock.meals : mock.exercises).mockResolvedValue({ status: "SUCCESS", page: { items: [item], nextCursor: null } });
    await act(() => button("ตรวจสอบผลการบันทึก").click());
    expect(saved()?.textContent).toContain("บันทึกแล้ว");
    expect(saved()?.querySelector("form, input, textarea")).toBeNull();
    const records = host.querySelector(kind === "meal" ? '[aria-label="รายการมื้ออาหารที่บันทึกแล้ว"]' : '[aria-label="รายการกิจกรรมที่บันทึกแล้ว"]');
    expect(records?.querySelectorAll("li")).toHaveLength(1);
    expect(records?.querySelector("form, input, textarea")).toBeNull();
    expect(records?.querySelector(`time[datetime="${date}"]`)).not.toBeNull();
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
