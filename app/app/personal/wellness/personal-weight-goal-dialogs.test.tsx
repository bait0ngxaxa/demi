// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), remove: vi.fn(), read: vi.fn() }));
vi.mock("@/modules/weight-goals/transport/server-actions", () => ({ createPersonalWeightGoalAction: mock.create, updatePersonalWeightGoalAction: mock.update, removePersonalWeightGoalAction: mock.remove, readPersonalWeightGoalAction: mock.read }));
import { PersonalWeightGoalWorkspace } from "./personal-weight-goal-workspace";
import { createWellnessPrivateAuthority, type WellnessPrivateAuthority } from "./wellness-private-authority";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const nonce = "11111111-1111-4111-8111-111111111111";
const goal = { id: "22222222-2222-4222-8222-222222222222", targetWeightKg: "72.5", targetDate: "2025-02-01", createdAt: "2025-01-01T00:00:00.000Z", updatedAt: "2025-01-01T00:00:00.000Z" };

let host: HTMLDivElement;
let root: Root;
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
afterEach(async () => { await act(() => root.unmount()); host.remove(); vi.useRealTimers(); });

function dialog(): HTMLDialogElement | null {
  return host.querySelector("dialog");
}
function button(label: string, scope: ParentNode = host): HTMLButtonElement {
  const found = [...scope.querySelectorAll("button")].find((element) => element.textContent === label);
  if (!found) throw new Error(`Missing ${label}`);
  return found;
}
async function type(selector: string, value: string): Promise<void> {
  const element = dialog()?.querySelector<HTMLInputElement>(selector) ?? host.querySelector<HTMLInputElement>(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function escape(): Promise<void> {
  await act(() => { dialog()?.dispatchEvent(new Event("cancel", { cancelable: true })); });
}
function deferred(): { promise: Promise<unknown>; resolve: (value: unknown) => void } {
  let resolve: (value: unknown) => void = () => undefined;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
async function mount(initialGoal: typeof goal | null = goal, authority: WellnessPrivateAuthority = createWellnessPrivateAuthority(vi.fn()), onLockChange = vi.fn()): Promise<{ authority: WellnessPrivateAuthority; onLockChange: ReturnType<typeof vi.fn> }> {
  await act(() => root.render(<PersonalWeightGoalWorkspace initialGoal={initialGoal} initialNonce={nonce} authority={authority} onLockChange={onLockChange} />));
  return { authority, onLockChange };
}

describe("weight goal focused dialogs", () => {
  it("edits in a dialog while the saved goal stays visible, and opening keeps the saved date", async () => {
    await mount();
    await act(() => button("แก้ไข").click());

    expect(dialog()?.querySelector("h2")?.textContent).toBe("แก้ไขเป้าหมายน้ำหนัก");
    expect(dialog()?.querySelector<HTMLInputElement>('input[name="targetDate"]')?.value).toBe("2025-02-01");
    expect(dialog()?.querySelector<HTMLInputElement>('input[name="targetWeightKg"]')?.value).toBe("72.5");
    expect(dialog()?.querySelector<HTMLInputElement>('input[name="goalId"]')?.value).toBe(goal.id);
    expect(dialog()?.querySelector<HTMLInputElement>('input[name="expectedUpdatedAt"]')?.value).toBe(goal.updatedAt);
    expect(dialog()?.querySelector('input[name="submissionNonce"]')).toBeNull();
    const readback = [...host.querySelectorAll("p")].find((element) => element.textContent === "72.5 กก.");
    expect(readback?.closest("dialog")).toBeNull();

    await act(() => button("ยกเลิกการแก้ไข", dialog() ?? host).click());
    expect(dialog()).toBeNull();
    expect(mock.update).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button("แก้ไข"));
  });

  it("applies a duration only when asked, accepts a manual date and keeps the draft for the same version", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-31T17:00:00Z"));
    await mount();
    await act(() => button("แก้ไข").click());
    await type('input[type="range"]', "1");
    expect(dialog()?.querySelector<HTMLInputElement>('input[name="targetDate"]')?.value).toBe("2025-02-01");
    await act(() => button("ใช้ระยะเวลานี้", dialog() ?? host).click());
    expect(dialog()?.querySelector<HTMLInputElement>('input[name="targetDate"]')?.value).toBe("2027-01-08");
    await type('input[name="targetDate"]', "2027-03-01");
    await escape();

    await act(() => button("แก้ไข").click());
    expect(dialog()?.querySelector<HTMLInputElement>('input[name="targetDate"]')?.value).toBe("2027-03-01");
    mock.update.mockResolvedValue({ status: "SUCCESS", message: "บันทึกเป้าหมายแล้ว", result: { outcome: "UPDATED", goal: { ...goal, targetDate: "2027-03-01", updatedAt: "2026-12-31T17:00:00.000Z" } } });
    await act(() => button("บันทึกการแก้ไข", dialog() ?? host).click());

    const payload = mock.update.mock.calls[0][1] as FormData;
    expect(payload.get("targetDate")).toBe("2027-03-01");
    expect(payload.get("targetWeightKg")).toBe("72.5");
    expect(payload.get("expectedUpdatedAt")).toBe(goal.updatedAt);
    expect(dialog()).toBeNull();
    expect(host.textContent).toContain("2027-03-01");
    expect(host.textContent).toContain("บันทึกเป้าหมายแล้ว");
  });

  it("cannot be dismissed while saving and sends one request for a rapid double submit", async () => {
    const request = deferred();
    mock.update.mockReturnValue(request.promise);
    const { onLockChange } = await mount();
    await act(() => button("แก้ไข").click());
    await act(() => {
      const save = button("บันทึกการแก้ไข", dialog() ?? host);
      save.click();
      save.click();
    });

    await escape();
    expect(dialog()?.hasAttribute("open")).toBe(true);
    expect(host.querySelector<HTMLButtonElement>('button[aria-label="ปิดหน้าต่าง"]')?.disabled).toBe(true);
    expect(onLockChange).toHaveBeenLastCalledWith(true);

    await act(async () => request.resolve({ status: "ERROR", message: "ตรวจสอบข้อมูล", fieldErrors: { targetWeightKg: "น้ำหนักไม่ถูกต้อง" } }));
    expect(mock.update).toHaveBeenCalledTimes(1);
    expect(dialog()?.textContent).toContain("น้ำหนักไม่ถูกต้อง");
    expect(dialog()?.querySelector<HTMLInputElement>('input[name="targetWeightKg"]')?.value).toBe("72.5");
  });

  it.each(["CONFLICT", "UNCONFIRMED"] as const)("keeps a %s edit in its dialog until the current goal is reloaded", async (status) => {
    mock.update.mockResolvedValue({ status, message: "ต้องทบทวนเป้าหมาย" });
    await mount();
    await act(() => button("แก้ไข").click());
    await act(() => button("บันทึกการแก้ไข", dialog() ?? host).click());

    await escape();
    expect(dialog()?.hasAttribute("open")).toBe(true);
    expect(button("บันทึกการแก้ไข", dialog() ?? host).disabled).toBe(true);
    expect(button("ยกเลิกการแก้ไข", dialog() ?? host).disabled).toBe(true);

    const current = { ...goal, targetWeightKg: "70", updatedAt: "2025-01-02T00:00:00.000Z" };
    mock.read.mockResolvedValue({ status: "SUCCESS", currentGoal: current });
    await act(() => button("โหลดข้อมูลล่าสุด", dialog() ?? host).click());
    expect(dialog()).toBeNull();
    expect(host.textContent).toContain("70 กก.");
    expect(mock.update).toHaveBeenCalledTimes(1);
  });

  it("confirms removal in a destructive dialog that names the goal; cancel sends nothing", async () => {
    await mount();
    await act(() => button("ลบเป้าหมาย").click());

    expect(dialog()?.querySelector("h2")?.textContent).toBe("ยืนยันการลบเป้าหมาย");
    expect(dialog()?.textContent).toContain("72.5 กก.");
    expect(dialog()?.textContent).toContain("2025-02-01");
    expect(dialog()?.textContent).toContain("ไม่ลบบันทึกน้ำหนักที่คุณวัดเอง");
    expect(document.activeElement).toBe(button("ยกเลิก", dialog() ?? host));

    await act(() => button("ยกเลิก", dialog() ?? host).click());
    expect(dialog()).toBeNull();
    expect(mock.remove).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button("ลบเป้าหมาย"));
  });

  it("removes the goal once after confirmation and returns focus to the section", async () => {
    mock.remove.mockResolvedValue({ status: "SUCCESS", message: "ลบเป้าหมายแล้ว", result: { outcome: "DELETED" } });
    await mount();
    await act(() => button("ลบเป้าหมาย").click());
    await act(() => button("ยืนยันลบเป้าหมาย", dialog() ?? host).click());

    expect(mock.remove).toHaveBeenCalledTimes(1);
    const payload = mock.remove.mock.calls[0][1] as FormData;
    expect(payload.get("goalId")).toBe(goal.id);
    expect(payload.get("expectedUpdatedAt")).toBe(goal.updatedAt);
    expect(dialog()).toBeNull();
    expect(host.textContent).toContain("ยังไม่ได้ตั้งเป้าหมายน้ำหนักส่วนตัว");
    expect(document.activeElement?.textContent).toBe("เป้าหมายน้ำหนัก");
  });

  it("keeps creation inline and holds a consumed create for current-goal review", async () => {
    await mount(null);
    await act(() => button("ตั้งเป้าหมายน้ำหนัก").click());
    expect(dialog()).toBeNull();
    expect(host.querySelector<HTMLInputElement>('input[name="submissionNonce"]')?.value).toBe(nonce);
    await type('input[name="targetWeightKg"]', "68");
    mock.create.mockResolvedValue({ status: "CREATE_CONSUMED", message: "คำขอนี้ถูกใช้แล้ว" });
    await act(() => button("บันทึกเป้าหมาย").click());

    expect(host.textContent).toContain("โหลดข้อมูลล่าสุดเพื่อทบทวนเป้าหมายปัจจุบันก่อนเริ่มคำขอใหม่");
    expect([...host.querySelectorAll("button")].some((element) => element.textContent === "ตั้งเป้าหมายน้ำหนัก")).toBe(false);
    mock.read.mockResolvedValue({ status: "SUCCESS", currentGoal: goal });
    await act(() => button("โหลดข้อมูลล่าสุด").click());
    expect(button("แก้ไข").disabled).toBe(false);
    expect(dialog()).toBeNull();
  });

  it("closes an open dialog and clears the draft when the server denies access", async () => {
    const authority = createWellnessPrivateAuthority(vi.fn());
    await mount(goal, authority);
    await act(() => button("แก้ไข").click());
    await type('input[name="targetWeightKg"]', "60");
    mock.update.mockResolvedValue({ status: "DENIED", message: "ยืนยันสิทธิ์" });
    await act(() => button("บันทึกการแก้ไข", dialog() ?? host).click());

    expect(dialog()).toBeNull();
    expect(authority.isActive()).toBe(false);
    expect(host.textContent).not.toContain("72.5");
    expect(host.textContent).not.toContain("60");
  });

  it("ignores a late remove response after authority invalidation", async () => {
    const authority = createWellnessPrivateAuthority(vi.fn());
    const request = deferred();
    mock.remove.mockReturnValue(request.promise);
    await mount(goal, authority);
    await act(() => button("ลบเป้าหมาย").click());
    await act(() => button("ยืนยันลบเป้าหมาย", dialog() ?? host).click());
    authority.invalidate();
    await act(async () => request.resolve({ status: "SUCCESS", message: "late private result", result: { outcome: "DELETED" } }));

    expect(host.textContent).not.toContain("late private result");
  });
});
