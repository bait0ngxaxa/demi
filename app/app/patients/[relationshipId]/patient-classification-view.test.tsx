// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  set: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  refresh: vi.fn(),
  notifyError: vi.fn<(message: string) => void>(),
  notifySuccess: vi.fn<(message: string) => void>(),
  notifyWarning: vi.fn<(message: string) => void>(),
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  // A new router object on every render, to prove refresh does not depend on router identity.
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@/modules/patient-classification/transport/server-actions", () => ({
  setPatientClassificationAction: mocks.set,
}));
vi.mock("@/components/ui/notify", () => ({
  notify: {
    error: mocks.notifyError,
    info: vi.fn(),
    success: mocks.notifySuccess,
    warning: mocks.notifyWarning,
  },
}));

import type { PatientClassificationPageContext } from "@/modules/patient-classification/services/patient-classification-query-service";
import { PatientClassificationView } from "./patient-classification-view";

function contextFor(
  current: "RISK" | "DIABETES" | null,
  relationshipId = "relationship-1",
): PatientClassificationPageContext {
  return {
    patient: { patientHospitalRelationshipId: relationshipId, displayName: "สมชาย ใจดี", hospitalName: "โรงพยาบาลทดสอบ" },
    current: current ? { classification: current, updatedAt: new Date("2026-10-01T00:00:00Z"), updatedByDisplayName: "เจ้าหน้าที่" } : null,
    history: [],
    canManage: true,
  };
}

let container: HTMLDivElement;
let root: Root;
const originals = new Map<string, PropertyDescriptor | undefined>();

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  for (const [prototype, key, value] of [
    [HTMLDialogElement.prototype, "showModal", function (this: HTMLDialogElement) { this.setAttribute("open", ""); }],
    [HTMLDialogElement.prototype, "close", function (this: HTMLDialogElement) { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); }],
    [HTMLElement.prototype, "scrollTo", function () {}],
    [HTMLFormElement.prototype, "requestSubmit", function (this: HTMLFormElement, submitter?: HTMLButtonElement) {
      this.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true, submitter: submitter ?? null }));
    }],
  ] as const) {
    originals.set(`${prototype.constructor.name}.${key}`, Object.getOwnPropertyDescriptor(prototype, key));
    Object.defineProperty(prototype, key, { configurable: true, value });
  }
});

afterAll(() => {
  for (const [prototype, key] of [
    [HTMLDialogElement.prototype, "showModal"],
    [HTMLDialogElement.prototype, "close"],
    [HTMLElement.prototype, "scrollTo"],
    [HTMLFormElement.prototype, "requestSubmit"],
  ] as const) {
    const descriptor = originals.get(`${prototype.constructor.name}.${key}`);
    if (descriptor) Object.defineProperty(prototype, key, descriptor);
    else Reflect.deleteProperty(prototype, key);
  }
});

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(context: PatientClassificationPageContext): void {
  act(() => root.render(createElement(PatientClassificationView, { context })));
}

function select(): HTMLSelectElement {
  return container.querySelector<HTMLSelectElement>("#patient-classification")!;
}

function choose(value: string): void {
  act(() => {
    const element = select();
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

/** Live regions (status, alert, aria-live) whose text includes `text`; a Toasted success must not be one of them. */
function liveRegionsContaining(root: ParentNode, text: string): Element[] {
  return Array.from(root.querySelectorAll('[role="status"], [role="alert"], [aria-live]:not([aria-live="off"])')).filter(
    (element) => element.textContent?.includes(text),
  );
}

function submit(): void {
  const form = container.querySelector("form")!;
  const button = Array.from(form.querySelectorAll<HTMLButtonElement>("button[type=submit]"))[0];
  act(() => {
    form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true, submitter: button }));
  });
}

async function confirm(): Promise<void> {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>("dialog button")).find((item) =>
    item.textContent?.includes("เปลี่ยนสถานะ"),
  )!;
  await act(async () => {
    button.click();
  });
}

function toastCalls(): string {
  return JSON.stringify([
    mocks.notifySuccess.mock.calls,
    mocks.notifyWarning.mock.calls,
    mocks.notifyError.mock.calls,
  ]);
}

describe("Patient classification feedback", () => {
  it("announces CREATED once, refreshes once, and never replays on rerender", async () => {
    mocks.set.mockResolvedValue({ status: "SUCCESS", result: { operation: "CREATED", classification: "RISK" } });
    render(contextFor(null));
    choose("RISK");

    await act(async () => {
      container.querySelector("form")!.requestSubmit();
    });

    expect(mocks.notifySuccess).toHaveBeenCalledTimes(1);
    expect(mocks.notifySuccess).toHaveBeenCalledWith("บันทึกสถานะผู้ป่วยแล้ว");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(toastCalls()).not.toContain("สมชาย");
    expect(container.textContent).toContain("บันทึกสถานะผู้ป่วยแล้ว");
    expect(liveRegionsContaining(container, "บันทึกสถานะผู้ป่วยแล้ว")).toHaveLength(0);

    render(contextFor("RISK"));
    render(contextFor("RISK"));
    expect(mocks.notifySuccess).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("requires the confirmation step for a change and announces CHANGED once", async () => {
    mocks.set.mockResolvedValue({ status: "SUCCESS", result: { operation: "CHANGED", classification: "DIABETES" } });
    render(contextFor("RISK"));
    choose("DIABETES");

    submit();
    expect(container.querySelector("dialog")).not.toBeNull();
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.notifySuccess).not.toHaveBeenCalled();

    await confirm();

    expect(mocks.set).toHaveBeenCalledTimes(1);
    expect(mocks.notifySuccess).toHaveBeenCalledTimes(1);
    expect(mocks.notifySuccess).toHaveBeenCalledWith("เปลี่ยนสถานะผู้ป่วยแล้ว");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("gives no Toast for an unchanged (NOOP) classification and keeps the inline explanation", async () => {
    mocks.set.mockResolvedValue({ status: "SUCCESS", result: { operation: "NOOP", classification: "RISK" } });
    render(contextFor("RISK"));

    await act(async () => {
      container.querySelector("form")!.requestSubmit();
    });

    expect(toastCalls()).toBe("[[],[],[]]");
    expect(container.textContent).toContain("สถานะผู้ป่วยเป็นค่าเดียวกับข้อมูลปัจจุบัน");
    expect(liveRegionsContaining(container, "สถานะผู้ป่วยเป็นค่าเดียวกับข้อมูลปัจจุบัน")).toHaveLength(1);
  });

  it("keeps invalid input inline without a Toast", async () => {
    mocks.set.mockResolvedValue({ status: "ERROR", code: "INVALID_INPUT", message: "กรุณาเลือกสถานะผู้ป่วยที่รองรับ" });
    render(contextFor(null));
    choose("RISK");

    await act(async () => {
      container.querySelector("form")!.requestSubmit();
    });

    expect(container.textContent).toContain("กรุณาเลือกสถานะผู้ป่วยที่รองรับ");
    expect(toastCalls()).toBe("[[],[],[]]");
  });

  it("warns on CONFLICT and reloads the current state once", async () => {
    mocks.set.mockResolvedValue({ status: "ERROR", code: "CONFLICT", message: "สถานะผู้ป่วยเปลี่ยนแปลงแล้ว กรุณาตรวจสอบข้อมูลล่าสุดก่อนลองใหม่" });
    render(contextFor(null));
    choose("RISK");

    await act(async () => {
      container.querySelector("form")!.requestSubmit();
    });

    expect(mocks.notifyWarning).toHaveBeenCalledTimes(1);
    expect(mocks.notifySuccess).not.toHaveBeenCalled();
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("สถานะผู้ป่วยเปลี่ยนแปลงแล้ว");
  });

  it("reports FORBIDDEN with a static error", async () => {
    mocks.set.mockResolvedValue({ status: "ERROR", code: "FORBIDDEN", message: "ไม่มีสิทธิ์" });
    render(contextFor(null));
    choose("RISK");

    await act(async () => {
      container.querySelector("form")!.requestSubmit();
    });

    expect(mocks.notifyError).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it.each([
    ["returned UNAVAILABLE", { status: "ERROR", code: "UNAVAILABLE", message: "ลองใหม่" }],
    ["returned IDLE", { status: "IDLE" }],
    ["a different classification than submitted", { status: "SUCCESS", result: { operation: "CHANGED", classification: "DIABETES" } }],
    ["an unknown operation", { status: "SUCCESS", result: { operation: "ARCHIVED", classification: "RISK" } }],
  ])("treats %s as unconfirmed: no Toast, no refresh, form locked", async (_label, response) => {
    mocks.set.mockResolvedValue(response);
    render(contextFor(null));
    choose("RISK");

    await act(async () => {
      container.querySelector("form")!.requestSubmit();
    });

    expect(toastCalls()).toBe("[[],[],[]]");
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(container.querySelectorAll('[role="alert"]')).toHaveLength(1);
    expect(container.textContent).toContain("ระบบยังยืนยันผลการดำเนินการไม่ได้");
    expect(select().disabled).toBe(true);
    expect(container.querySelector<HTMLButtonElement>("form button[type=submit]")!.disabled).toBe(true);
    expect(mocks.set).toHaveBeenCalledTimes(1);
  });

  it("shows one recovery message and locks the form when a confirmed change is unconfirmed", async () => {
    mocks.set.mockResolvedValue({ status: "ERROR", code: "UNAVAILABLE", message: "ลองใหม่" });
    render(contextFor("RISK"));
    choose("DIABETES");
    submit();

    await confirm();

    expect(toastCalls()).toBe("[[],[],[]]");
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(container.querySelector("fieldset")!.disabled).toBe(true);
    expect(container.textContent).toContain("ระบบยังยืนยันผลการดำเนินการไม่ได้");
    expect(container.querySelectorAll("form > [role=\"alert\"]")).toHaveLength(1);
    expect(mocks.set).toHaveBeenCalledTimes(1);
  });

  it("sends one request for two synchronous submits", async () => {
    let resolve: (value: unknown) => void = () => undefined;
    mocks.set.mockReturnValue(new Promise((done) => { resolve = done; }));
    render(contextFor(null));
    choose("RISK");

    await act(async () => {
      const form = container.querySelector("form")!;
      form.requestSubmit();
      form.requestSubmit();
    });

    expect(mocks.set).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve({ status: "SUCCESS", result: { operation: "CREATED", classification: "RISK" } });
    });
    expect(mocks.notifySuccess).toHaveBeenCalledTimes(1);
  });

  it("gives no Toast or refresh when the view moved to another patient before the response", async () => {
    let resolve: (value: unknown) => void = () => undefined;
    mocks.set.mockReturnValue(new Promise((done) => { resolve = done; }));
    render(contextFor(null, "relationship-1"));
    choose("RISK");
    await act(async () => {
      container.querySelector("form")!.requestSubmit();
    });

    render(contextFor("DIABETES", "relationship-2"));
    await act(async () => {
      resolve({ status: "SUCCESS", result: { operation: "CREATED", classification: "RISK" } });
    });

    expect(toastCalls()).toBe("[[],[],[]]");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("gives no Toast when the view unmounts before the response", async () => {
    let resolve: (value: unknown) => void = () => undefined;
    mocks.set.mockReturnValue(new Promise((done) => { resolve = done; }));
    render(contextFor(null));
    choose("RISK");
    await act(async () => {
      container.querySelector("form")!.requestSubmit();
    });

    act(() => root.unmount());
    root = createRoot(container);
    await act(async () => {
      resolve({ status: "SUCCESS", result: { operation: "CREATED", classification: "RISK" } });
    });

    expect(toastCalls()).toBe("[[],[],[]]");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
