// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PersonalMedicationDetailDto } from "@/modules/medications/domain/personal-medication-definitions";

const mocks = vi.hoisted(() => ({
  update: vi.fn<(previous: unknown, formData: FormData) => Promise<unknown>>(),
  stop: vi.fn<(previous: unknown, formData: FormData) => Promise<unknown>>(),
  schedules: vi.fn<(previous: unknown, formData: FormData) => Promise<unknown>>(),
}));

vi.mock("@/modules/medications/transport/server-actions", () => ({
  createPersonalMedicationAction: vi.fn(),
  updatePersonalMedicationAction: mocks.update,
  stopPersonalMedicationAction: mocks.stop,
  replacePersonalMedicationSchedulesAction: mocks.schedules,
}));

import { PersonalMedicationWorkspace } from "./personal-medication-workspace";

const item: PersonalMedicationDetailDto = {
  id: "11111111-1111-4111-8111-111111111111",
  medicationName: "ยาความดัน",
  instructionText: "หลังอาหารเช้า",
  status: "ACTIVE",
  stoppedAt: null,
  createdAt: "2026-10-03T00:00:00.000Z",
  updatedAt: "2026-10-03T00:00:00.000Z",
  schedules: [{ localTime: "08:00" }, { localTime: "20:00" }],
};
const empty = { items: [], nextCursor: null };

let container: HTMLDivElement;
let root: Root;
let originalShowModal: PropertyDescriptor | undefined;
let originalClose: PropertyDescriptor | undefined;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
  originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement): void { this.setAttribute("open", ""); },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement): void { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); },
  });
});

afterAll(() => {
  if (originalShowModal) Object.defineProperty(HTMLDialogElement.prototype, "showModal", originalShowModal);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, "close", originalClose);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
});

beforeEach(async () => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => { callback(); return 1; });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<PersonalMedicationWorkspace active={empty} stopped={empty} selected={item} />);
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function dialog(): HTMLDialogElement | null {
  return container.querySelector("dialog");
}

function button(text: string, scope: ParentNode = container): HTMLButtonElement {
  const found = Array.from(scope.querySelectorAll("button")).find((element) => element.textContent?.trim() === text);
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
}

async function click(target: HTMLElement): Promise<void> {
  await act(async () => target.click());
}

async function type(element: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<void> {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function escape(): Promise<void> {
  await act(async () => {
    dialog()?.dispatchEvent(new Event("cancel", { cancelable: true }));
  });
}

function nameField(): HTMLInputElement {
  const field = dialog()?.querySelector<HTMLInputElement>('input[name="medicationName"]');
  if (!field) throw new Error("Missing medication name field");
  return field;
}

function deferred(): { promise: Promise<unknown>; resolve: (value: unknown) => void } {
  let resolve: (value: unknown) => void = () => undefined;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

describe("personal medication focused dialogs", () => {
  it("opens text editing in a dialog with saved values while the detail stays visible", async () => {
    await click(button("แก้ไขชื่อยาและข้อความประกอบ"));

    expect(dialog()?.hasAttribute("open")).toBe(true);
    expect(nameField().value).toBe("ยาความดัน");
    expect(dialog()?.querySelector<HTMLTextAreaElement>('textarea[name="instructionText"]')?.value).toBe("หลังอาหารเช้า");
    expect(dialog()?.querySelector<HTMLInputElement>('input[name="medicationId"]')?.value).toBe(item.id);
    expect(dialog()?.querySelector<HTMLInputElement>('input[name="expectedUpdatedAt"]')?.value).toBe(item.updatedAt);
    expect(container.querySelector("#medication-detail-heading")?.closest("dialog")).toBeNull();
    expect(container.textContent).toContain("กำลังติดตาม");

    await click(button("ยกเลิก", dialog() ?? container));
    expect(dialog()).toBeNull();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button("แก้ไขชื่อยาและข้อความประกอบ"));
  });

  it("keeps an unsaved draft for the same medication version and sends it with the original version", async () => {
    await click(button("แก้ไขชื่อยาและข้อความประกอบ"));
    await type(nameField(), "ยาความดัน 5 มก.");
    await escape();
    expect(dialog()).toBeNull();

    await click(button("แก้ไขชื่อยาและข้อความประกอบ"));
    expect(nameField().value).toBe("ยาความดัน 5 มก.");

    mocks.update.mockResolvedValue({ status: "SUCCESS", message: "บันทึกการแก้ไขแล้ว", item: { ...item, medicationName: "ยาความดัน 5 มก." } });
    await click(button("บันทึกการแก้ไข", dialog() ?? container));

    expect(mocks.update).toHaveBeenCalledTimes(1);
    const payload = mocks.update.mock.calls[0][1];
    expect(payload.get("medicationId")).toBe(item.id);
    expect(payload.get("expectedUpdatedAt")).toBe(item.updatedAt);
    expect(payload.get("medicationName")).toBe("ยาความดัน 5 มก.");
    expect(payload.has("times")).toBe(false);
    expect(dialog()).toBeNull();
    expect(container.querySelector('[role="status"]')?.textContent).toContain("บันทึกการแก้ไขแล้ว");
  });

  it("keeps the dialog, draft and field error after a confirmed validation error", async () => {
    mocks.update.mockResolvedValue({ status: "ERROR", message: "ตรวจสอบข้อมูล", fieldErrors: { medicationName: "ชื่อยาวเกินไป" } });
    await click(button("แก้ไขชื่อยาและข้อความประกอบ"));
    await type(nameField(), "ชื่อใหม่");
    await click(button("บันทึกการแก้ไข", dialog() ?? container));

    expect(dialog()?.hasAttribute("open")).toBe(true);
    expect(nameField().value).toBe("ชื่อใหม่");
    expect(nameField().getAttribute("aria-invalid")).toBe("true");
    expect(dialog()?.textContent).toContain("ชื่อยาวเกินไป");
    expect(button("แก้ไขเวลา").disabled).toBe(false);
  });

  it("cannot be dismissed while saving and locks schedule and stop meanwhile", async () => {
    const request = deferred();
    mocks.update.mockReturnValue(request.promise);
    await click(button("แก้ไขชื่อยาและข้อความประกอบ"));
    await click(button("บันทึกการแก้ไข", dialog() ?? container));

    await escape();
    expect(dialog()?.hasAttribute("open")).toBe(true);
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="ปิดหน้าต่าง"]')?.disabled).toBe(true);
    expect(button("แก้ไขเวลา").disabled).toBe(true);
    expect(button("หยุดติดตามรายการนี้ใน DEMI").disabled).toBe(true);

    await act(async () => request.resolve({ status: "ERROR", message: "ตรวจสอบข้อมูล" }));
    expect(button("แก้ไขเวลา").disabled).toBe(false);
  });

  it.each([
    ["conflict", { status: "CONFLICT", message: "รายการนี้มีการเปลี่ยนแปลง" }],
    ["unknown outcome", undefined],
  ])("keeps reload guidance after a %s and locks every medication action", async (_label, result) => {
    if (result) mocks.update.mockResolvedValue(result);
    else mocks.update.mockRejectedValue(new TypeError("Failed to fetch"));
    await click(button("แก้ไขชื่อยาและข้อความประกอบ"));
    await click(button("บันทึกการแก้ไข", dialog() ?? container));

    expect(dialog()?.textContent).toContain("โหลดรายการล่าสุด");
    expect(button("บันทึกการแก้ไข", dialog() ?? container).disabled).toBe(true);
    await escape();

    expect(dialog()).toBeNull();
    expect(container.querySelector('[role="status"]')?.textContent).toContain("โหลดรายการล่าสุด");
    for (const label of ["แก้ไขชื่อยาและข้อความประกอบ", "แก้ไขเวลา", "หยุดติดตามรายการนี้ใน DEMI"]) {
      expect(button(label).disabled).toBe(true);
    }
    expect(document.activeElement?.id).toBe("medication-detail-heading");
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });

  it("keeps the session expiry sign-in path after the dialog closes", async () => {
    mocks.update.mockResolvedValue({ status: "ERROR", message: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง", loginHref: "/login?next=%2Fapp%2Fpersonal%2Fmedications" });
    await click(button("แก้ไขชื่อยาและข้อความประกอบ"));
    await click(button("บันทึกการแก้ไข", dialog() ?? container));
    await escape();

    const link = container.querySelector<HTMLAnchorElement>('a[href^="/login"]');
    expect(link?.textContent).toContain("เข้าสู่ระบบ DEMI");
  });

  it("edits daily times in a dialog with exact HH:mm JSON and rejects duplicates locally", async () => {
    await click(button("แก้ไขเวลา"));
    const times = (): HTMLInputElement[] => [...(dialog()?.querySelectorAll<HTMLInputElement>('input[type="time"]') ?? [])];
    expect(times().map((input) => input.value)).toEqual(["08:00", "20:00"]);

    await click(button("เพิ่มเวลา", dialog() ?? container));
    await type(times()[2], "08:00");
    await click(button("บันทึกเวลา", dialog() ?? container));
    expect(mocks.schedules).not.toHaveBeenCalled();
    expect(dialog()?.textContent).toContain("เวลาซ้ำกัน");

    await type(times()[2], "13:30");
    mocks.schedules.mockResolvedValue({ status: "SUCCESS", message: "บันทึกเวลาแล้ว", item });
    await click(button("บันทึกเวลา", dialog() ?? container));

    expect(mocks.schedules).toHaveBeenCalledTimes(1);
    const payload = mocks.schedules.mock.calls[0][1];
    expect(payload.get("times")).toBe(JSON.stringify(["08:00", "20:00", "13:30"]));
    expect(payload.get("expectedUpdatedAt")).toBe(item.updatedAt);
    expect(payload.get("medicationId")).toBe(item.id);
    expect(dialog()).toBeNull();
  });

  it("restores saved times on request and keeps a closed schedule draft for the same version", async () => {
    await click(button("แก้ไขเวลา"));
    const removeFirst = dialog()?.querySelector<HTMLButtonElement>('button[aria-label="ลบเวลา 1"]');
    if (!removeFirst) throw new Error("Missing remove time button");
    await click(removeFirst);
    await click(button("ยกเลิก", dialog() ?? container));
    expect(document.activeElement).toBe(button("แก้ไขเวลา"));

    await click(button("แก้ไขเวลา"));
    const values = (): string[] => [...(dialog()?.querySelectorAll<HTMLInputElement>('input[type="time"]') ?? [])].map((input) => input.value);
    expect(values()).toEqual(["20:00"]);
    await click(button("คืนค่าที่บันทึกไว้", dialog() ?? container));
    expect(values()).toEqual(["08:00", "20:00"]);
    expect(mocks.schedules).not.toHaveBeenCalled();
  });

  it("confirms stop tracking in a destructive dialog with the original wording, and cancel sends nothing", async () => {
    await click(button("หยุดติดตามรายการนี้ใน DEMI"));

    const stopDialog = dialog();
    expect(stopDialog?.textContent).toContain("สิ้นสุดการติดตามใน DEMI เท่านั้น ไม่เปลี่ยนการใช้ยาของคุณ");
    expect(stopDialog?.textContent).toContain("รายการจะอยู่ในประวัติและแก้ไขต่อไม่ได้");
    expect(stopDialog?.textContent).toContain("ยาความดัน");
    expect(stopDialog?.textContent).not.toMatch(/หยุดยา|หยุดรับประทาน/u);
    expect(document.activeElement).toBe(button("ยกเลิก", stopDialog ?? container));

    await click(button("ยกเลิก", stopDialog ?? container));
    expect(dialog()).toBeNull();
    expect(mocks.stop).not.toHaveBeenCalled();
  });

  it("stops tracking once with the original version and keeps the editors locked", async () => {
    const request = deferred();
    mocks.stop.mockReturnValue(request.promise);
    await click(button("หยุดติดตามรายการนี้ใน DEMI"));
    await act(async () => {
      const confirmButton = button("ยืนยันหยุดติดตาม", dialog() ?? container);
      confirmButton.click();
      confirmButton.click();
    });

    expect(mocks.stop).toHaveBeenCalledTimes(1);
    const payload = mocks.stop.mock.calls[0][1];
    expect(payload.get("medicationId")).toBe(item.id);
    expect(payload.get("expectedUpdatedAt")).toBe(item.updatedAt);
    expect(dialog()?.textContent).toContain("กำลังหยุดติดตาม...");
    expect(button("แก้ไขชื่อยาและข้อความประกอบ").disabled).toBe(true);

    await act(async () => request.resolve({ status: "SUCCESS", message: "หยุดติดตามแล้ว", item: { ...item, status: "STOPPED" } }));
    expect(dialog()).toBeNull();
    expect(container.textContent).toContain("หยุดติดตามแล้ว");
  });

  it("keeps an unconfirmed stop in its dialog with reload guidance and no replay", async () => {
    mocks.stop.mockRejectedValue(new TypeError("Failed to fetch"));
    await click(button("หยุดติดตามรายการนี้ใน DEMI"));
    await click(button("ยืนยันหยุดติดตาม", dialog() ?? container));

    expect(dialog()?.hasAttribute("open")).toBe(true);
    expect(dialog()?.textContent).toContain("ระบบยังยืนยันผลการดำเนินการไม่ได้");
    expect(button("ยืนยันหยุดติดตาม", dialog() ?? container).disabled).toBe(true);
    expect(container.querySelector('[data-navigation-guard="unknown-outcome"]')).not.toBeNull();
    expect(mocks.stop).toHaveBeenCalledTimes(1);
  });

  it("blocks text and stop after a schedule conflict until the latest list is loaded", async () => {
    mocks.schedules.mockResolvedValue({ status: "CONFLICT", message: "รายการนี้มีการเปลี่ยนแปลง" });
    await click(button("แก้ไขเวลา"));
    await click(button("บันทึกเวลา", dialog() ?? container));
    await escape();

    expect(button("แก้ไขชื่อยาและข้อความประกอบ").disabled).toBe(true);
    expect(button("หยุดติดตามรายการนี้ใน DEMI").disabled).toBe(true);
    expect(container.querySelector<HTMLAnchorElement>('a[href="/app/personal/medications"]')).not.toBeNull();
  });

  it("drops a retained draft when fresh detail arrives with a new version", async () => {
    await click(button("แก้ไขชื่อยาและข้อความประกอบ"));
    await type(nameField(), "ร่างเก่า");
    await escape();

    await act(async () => {
      root.render(<PersonalMedicationWorkspace active={empty} stopped={empty} selected={{ ...item, medicationName: "ชื่อจากเซิร์ฟเวอร์", updatedAt: "2026-10-03T00:00:01.000Z" }} />);
    });
    await click(button("แก้ไขชื่อยาและข้อความประกอบ"));
    expect(nameField().value).toBe("ชื่อจากเซิร์ฟเวอร์");
    expect(dialog()?.querySelector<HTMLInputElement>('input[name="expectedUpdatedAt"]')?.value).toBe("2026-10-03T00:00:01.000Z");
  });
});
