// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type MutationState =
  | { status: "IDLE" }
  | {
      status: "SUCCESS";
      result: { hospitalId: string; status: "ACTIVE" | "SUSPENDED"; updatedAt: string };
    }
  | { status: "ERROR"; code: "INVALID_INPUT" | "FORBIDDEN" | "CONFLICT" | "UNAVAILABLE"; message: string };

type GovernanceAction = (previousState: MutationState, formData: FormData) => Promise<MutationState>;

const mocks = vi.hoisted(() => ({
  suspend: vi.fn<GovernanceAction>(),
  restore: vi.fn<GovernanceAction>(),
  router: { refresh: vi.fn() },
  notify: {
    success: vi.fn<(message: string) => void>(),
    warning: vi.fn<(message: string) => void>(),
    error: vi.fn<(message: string) => void>(),
    info: vi.fn<(message: string) => void>(),
  },
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => mocks.router,
}));

vi.mock("@/modules/hospital-governance/transport/server-actions", () => ({
  suspendHospitalAction: mocks.suspend,
  restoreHospitalAction: mocks.restore,
}));

vi.mock("@/components/ui/notify", () => ({ notify: mocks.notify }));

import { HospitalGovernanceControls } from "./hospital-governance-controls";

const HOSPITAL_ID = "hospital-1";
const ORIGINAL_VERSION = "2026-10-01T00:00:00.000Z";
const UPDATED_VERSION = "2026-10-02T00:00:00.000Z";
const initialState: MutationState = { status: "IDLE" };

let container: HTMLDivElement;
let root: Root;
let rootUnmounted: boolean;
let originalActEnvironment: boolean | undefined;
let originalShowModal: PropertyDescriptor | undefined;
let originalClose: PropertyDescriptor | undefined;
let originalRequestSubmit: PropertyDescriptor | undefined;
let originalScrollTo: PropertyDescriptor | undefined;

beforeAll(() => {
  const globalWithActFlag = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  originalActEnvironment = globalWithActFlag.IS_REACT_ACT_ENVIRONMENT;
  globalWithActFlag.IS_REACT_ACT_ENVIRONMENT = true;
  originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
  originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
  originalRequestSubmit = Object.getOwnPropertyDescriptor(HTMLFormElement.prototype, "requestSubmit");
  originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTo");
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value(): void {} });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement): void {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement): void {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    },
  });
  Object.defineProperty(HTMLFormElement.prototype, "requestSubmit", {
    configurable: true,
    value(this: HTMLFormElement, submitter?: HTMLButtonElement | HTMLInputElement): void {
      this.dispatchEvent(new SubmitEvent("submit", {
        bubbles: true,
        cancelable: true,
        submitter: submitter ?? null,
      }));
    },
  });
});

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  rootUnmounted = false;
  mocks.suspend.mockReset().mockResolvedValue(initialState);
  mocks.restore.mockReset().mockResolvedValue(initialState);
  mocks.router.refresh.mockReset();
  mocks.notify.success.mockReset();
  mocks.notify.warning.mockReset();
  mocks.notify.error.mockReset();
  mocks.notify.info.mockReset();
});

afterEach(() => {
  if (!rootUnmounted) act(() => root.unmount());
  container.remove();
});

afterAll(() => {
  const globalWithActFlag = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  if (originalActEnvironment === undefined) {
    Reflect.deleteProperty(globalWithActFlag, "IS_REACT_ACT_ENVIRONMENT");
  } else {
    globalWithActFlag.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  }

  for (const [prototype, key, descriptor] of [
    [HTMLDialogElement.prototype, "showModal", originalShowModal],
    [HTMLDialogElement.prototype, "close", originalClose],
    [HTMLFormElement.prototype, "requestSubmit", originalRequestSubmit],
    [HTMLElement.prototype, "scrollTo", originalScrollTo],
  ] as const) {
    if (descriptor) Object.defineProperty(prototype, key, descriptor);
    else Reflect.deleteProperty(prototype, key);
  }
});

function render(
  status: "ACTIVE" | "SUSPENDED" = "ACTIVE",
  expectedUpdatedAt = ORIGINAL_VERSION,
  hospitalId = HOSPITAL_ID,
): void {
  act(() => root.render(createElement(HospitalGovernanceControls, { status, expectedUpdatedAt, hospitalId })));
}

function query<T extends Element>(selector: string): T {
  const element = container.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

function findButton(label: string, scope: ParentNode = container): HTMLButtonElement {
  const button = Array.from(scope.querySelectorAll<HTMLButtonElement>("button"))
    .find((candidate) => candidate.textContent?.includes(label));
  if (!button) throw new Error(`Missing button: ${label}`);
  return button;
}

function openSuspendConfirmation(): HTMLDialogElement {
  act(() => findButton("ระงับโรงพยาบาล").click());
  return query<HTMLDialogElement>("dialog");
}

function submitSuspendConfirmation(): HTMLDialogElement {
  const dialog = openSuspendConfirmation();
  act(() => findButton("ระงับโรงพยาบาล", dialog).click());
  return dialog;
}

function dispatchRestoreSubmit(): void {
  const form = query<HTMLFormElement>("form");
  const submitter = findButton("คืนสถานะโรงพยาบาล", form);
  act(() => form.dispatchEvent(new SubmitEvent("submit", {
    bubbles: true,
    cancelable: true,
    submitter,
  })));
}

async function settleAction(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

function success(status: "ACTIVE" | "SUSPENDED"): MutationState {
  return { status: "SUCCESS", result: { hospitalId: HOSPITAL_ID, status, updatedAt: UPDATED_VERSION } };
}

function error(code: "INVALID_INPUT" | "FORBIDDEN" | "CONFLICT" | "UNAVAILABLE"): MutationState {
  return { status: "ERROR", code, message: `ผลลัพธ์ ${code} จากระบบ` };
}

function expectNoToast(): void {
  expect(mocks.notify.success).not.toHaveBeenCalled();
  expect(mocks.notify.warning).not.toHaveBeenCalled();
  expect(mocks.notify.error).not.toHaveBeenCalled();
}

describe("HospitalGovernanceControls notifications", () => {
  it("requires suspension confirmation and emits one toast only after confirmed success", async () => {
    mocks.suspend.mockResolvedValue(success("SUSPENDED"));
    render();

    const dialog = openSuspendConfirmation();
    expect(mocks.suspend).not.toHaveBeenCalled();
    expectNoToast();

    act(() => findButton("ระงับโรงพยาบาล", dialog).click());
    expect(mocks.notify.success).not.toHaveBeenCalled();
    await settleAction();

    expect(mocks.suspend).toHaveBeenCalledTimes(1);
    const submittedFormData = mocks.suspend.mock.calls[0]?.[1];
    expect(submittedFormData?.get("hospitalId")).toBe(HOSPITAL_ID);
    expect(submittedFormData?.get("expectedUpdatedAt")).toBe(ORIGINAL_VERSION);
    expect(mocks.notify.success).toHaveBeenCalledExactlyOnceWith("ระงับโรงพยาบาลแล้ว");
    expect(mocks.notify.warning).not.toHaveBeenCalled();
    expect(mocks.notify.error).not.toHaveBeenCalled();
    expect(container.textContent).toContain("บันทึกสถานะโรงพยาบาลเรียบร้อยแล้ว");
    expect(mocks.router.refresh).toHaveBeenCalledTimes(1);
  });

  it("does not submit or notify when suspension confirmation is canceled", () => {
    render();
    const dialog = openSuspendConfirmation();

    act(() => findButton("ยกเลิก", dialog).click());

    expect(mocks.suspend).not.toHaveBeenCalled();
    expectNoToast();
    expect(container.querySelector("dialog")).toBeNull();
  });

  it.each([
    ["CONFLICT", "warning"],
    ["FORBIDDEN", "error"],
    ["INVALID_INPUT", "none"],
  ] as const)("keeps suspension %s inline and maps only confirmed outcomes to %s toast", async (code, toast) => {
    mocks.suspend.mockResolvedValue(error(code));
    render();
    submitSuspendConfirmation();
    await settleAction();

    expect(container.textContent).toContain(`ผลลัพธ์ ${code} จากระบบ`);
    expect(mocks.notify.success).not.toHaveBeenCalled();
    expect(mocks.notify.warning).toHaveBeenCalledTimes(toast === "warning" ? 1 : 0);
    expect(mocks.notify.error).toHaveBeenCalledTimes(toast === "error" ? 1 : 0);
    if (toast === "warning") {
      expect(mocks.notify.warning).toHaveBeenCalledWith("สถานะโรงพยาบาลเปลี่ยนแปลงแล้ว โปรดโหลดข้อมูลล่าสุด");
    }
    if (toast === "error") {
      expect(mocks.notify.error).toHaveBeenCalledWith("ไม่มีสิทธิ์จัดการสถานะโรงพยาบาล");
    }
  });

  it("treats a returned suspension UNAVAILABLE as unknown and exposes reload recovery", async () => {
    mocks.suspend.mockResolvedValue(error("UNAVAILABLE"));
    render();
    const dialog = submitSuspendConfirmation();
    await settleAction();

    expect(mocks.suspend).toHaveBeenCalledTimes(1);
    expect(dialog.querySelector("[role='alert']")?.textContent).toContain("ระบบยังยืนยันผลการดำเนินการไม่ได้");
    expect(findButton("ปิดหน้าต่าง", dialog)).toBeTruthy();
    expect(findButton("ระงับโรงพยาบาล", dialog).disabled).toBe(true);
    expect(container.textContent).toContain("โหลดข้อมูลล่าสุดเพื่อตรวจสอบสถานะ");
    expect(container.textContent).not.toContain("ผลลัพธ์ UNAVAILABLE จากระบบ");
    expectNoToast();

    act(() => findButton("ปิดหน้าต่าง", dialog).click());
    expect(findButton("โหลดและตรวจสอบสถานะล่าสุด")).toBeTruthy();
    const form = query<HTMLFormElement>("form");
    act(() => form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true })));
    await settleAction();
    expect(mocks.suspend).toHaveBeenCalledTimes(1);
    expectNoToast();
  });

  it("keeps a thrown suspension request unknown without retrying or claiming failure", async () => {
    mocks.suspend.mockRejectedValue(new TypeError("private server failure"));
    render();
    const dialog = submitSuspendConfirmation();
    await settleAction();

    expect(mocks.suspend).toHaveBeenCalledTimes(1);
    expect(dialog.querySelector("[role='alert']")?.textContent).toContain("ระบบยังยืนยันผลการดำเนินการไม่ได้");
    expect(container.textContent).toContain("โหลดข้อมูลล่าสุดเพื่อตรวจสอบสถานะ");
    expect(container.textContent).not.toContain("private server failure");
    expectNoToast();

    act(() => findButton("ปิดหน้าต่าง", dialog).click());
    expect(findButton("โหลดและตรวจสอบสถานะล่าสุด")).toBeTruthy();
    expect(mocks.suspend).toHaveBeenCalledTimes(1);
  });

  it("emits one restoration success toast and keeps the existing inline feedback", async () => {
    mocks.restore.mockResolvedValue(success("ACTIVE"));
    render("SUSPENDED");

    dispatchRestoreSubmit();
    expect(mocks.notify.success).not.toHaveBeenCalled();
    await settleAction();

    expect(mocks.restore).toHaveBeenCalledTimes(1);
    const submittedFormData = mocks.restore.mock.calls[0]?.[1];
    expect(submittedFormData?.get("hospitalId")).toBe(HOSPITAL_ID);
    expect(submittedFormData?.get("expectedUpdatedAt")).toBe(ORIGINAL_VERSION);
    expect(mocks.notify.success).toHaveBeenCalledExactlyOnceWith("คืนสถานะโรงพยาบาลแล้ว");
    expect(container.textContent).toContain("บันทึกสถานะโรงพยาบาลเรียบร้อยแล้ว");
    expect(mocks.router.refresh).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["CONFLICT", "warning"],
    ["FORBIDDEN", "error"],
    ["INVALID_INPUT", "none"],
  ] as const)("keeps restoration %s inline and maps only confirmed outcomes to %s toast", async (code, toast) => {
    mocks.restore.mockResolvedValue(error(code));
    render("SUSPENDED");
    dispatchRestoreSubmit();
    await settleAction();

    expect(container.textContent).toContain(`ผลลัพธ์ ${code} จากระบบ`);
    expect(mocks.notify.success).not.toHaveBeenCalled();
    expect(mocks.notify.warning).toHaveBeenCalledTimes(toast === "warning" ? 1 : 0);
    expect(mocks.notify.error).toHaveBeenCalledTimes(toast === "error" ? 1 : 0);
    if (toast === "warning") {
      expect(mocks.notify.warning).toHaveBeenCalledWith("สถานะโรงพยาบาลเปลี่ยนแปลงแล้ว โปรดโหลดข้อมูลล่าสุด");
    }
    if (toast === "error") {
      expect(mocks.notify.error).toHaveBeenCalledWith("ไม่มีสิทธิ์จัดการสถานะโรงพยาบาล");
    }
  });

  it("treats a returned restoration UNAVAILABLE as unknown, locks resubmission, and offers reload recovery", async () => {
    mocks.restore.mockResolvedValue(error("UNAVAILABLE"));
    render("SUSPENDED");

    dispatchRestoreSubmit();
    await settleAction();

    expect(mocks.restore).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("ระบบยังยืนยันผลการคืนสถานะโรงพยาบาลไม่ได้");
    expect(container.textContent).not.toContain("ผลลัพธ์ UNAVAILABLE จากระบบ");
    expect(findButton("โหลดและตรวจสอบสถานะล่าสุด")).toBeTruthy();
    expect(findButton("คืนสถานะโรงพยาบาล").disabled).toBe(true);
    expectNoToast();

    dispatchRestoreSubmit();
    expect(mocks.restore).toHaveBeenCalledTimes(1);
    expectNoToast();
  });

  it("keeps a thrown restoration request unknown without retrying or claiming failure", async () => {
    mocks.restore.mockRejectedValue(new TypeError("private server failure"));
    render("SUSPENDED");

    dispatchRestoreSubmit();
    await settleAction();

    expect(mocks.restore).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("ระบบยังยืนยันผลการคืนสถานะโรงพยาบาลไม่ได้");
    expect(container.textContent).toContain("ก่อนดำเนินการต่อ");
    expect(container.textContent).not.toContain("private server failure");
    expect(findButton("คืนสถานะโรงพยาบาล").disabled).toBe(true);
    expectNoToast();

    dispatchRestoreSubmit();
    expect(mocks.restore).toHaveBeenCalledTimes(1);
  });

  it("does not replay a success toast when refreshed Hospital props and action state rerender", async () => {
    mocks.suspend.mockResolvedValue(success("SUSPENDED"));
    render();
    submitSuspendConfirmation();
    await settleAction();

    render("SUSPENDED", UPDATED_VERSION);
    expect(mocks.notify.success).toHaveBeenCalledTimes(1);
    expect(mocks.router.refresh).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("คืนสถานะโรงพยาบาลเพื่อให้กลับมาดำเนินงานได้");

    render("SUSPENDED", UPDATED_VERSION);
    expect(mocks.notify.success).toHaveBeenCalledTimes(1);
    expect(mocks.router.refresh).toHaveBeenCalledTimes(1);
  });

  it("blocks duplicate restoration submissions while the action is pending", async () => {
    let resolveAction: ((state: MutationState) => void) | undefined;
    mocks.restore.mockImplementation(() => new Promise((resolve) => {
      resolveAction = resolve;
    }));
    render("SUSPENDED");
    const form = query<HTMLFormElement>("form");
    const submitter = findButton("คืนสถานะโรงพยาบาล", form);

    act(() => {
      const event = () => form.dispatchEvent(new SubmitEvent("submit", {
        bubbles: true,
        cancelable: true,
        submitter,
      }));
      event();
      event();
    });

    expect(mocks.restore).toHaveBeenCalledTimes(1);
    expect(submitter.disabled).toBe(true);
    await act(async () => {
      resolveAction?.(success("ACTIVE"));
      await Promise.resolve();
    });
    expect(mocks.notify.success).toHaveBeenCalledTimes(1);
  });

  it("blocks duplicate suspension confirmations while the action is pending", async () => {
    let resolveAction: ((state: MutationState) => void) | undefined;
    mocks.suspend.mockImplementation(() => new Promise((resolve) => {
      resolveAction = resolve;
    }));
    render();
    const dialog = openSuspendConfirmation();
    const confirmButton = findButton("ระงับโรงพยาบาล", dialog);

    act(() => {
      confirmButton.click();
      confirmButton.click();
    });

    expect(mocks.suspend).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveAction?.(success("SUSPENDED"));
      await Promise.resolve();
    });
    expect(mocks.notify.success).toHaveBeenCalledTimes(1);
  });

  it("does not notify from a successful result that arrives after unmount", async () => {
    let resolveAction: ((state: MutationState) => void) | undefined;
    mocks.restore.mockImplementation(() => new Promise((resolve) => {
      resolveAction = resolve;
    }));
    render("SUSPENDED");
    dispatchRestoreSubmit();
    expect(mocks.restore).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
    rootUnmounted = true;
    await act(async () => {
      resolveAction?.(success("ACTIVE"));
      await Promise.resolve();
    });

    expectNoToast();
    expect(mocks.router.refresh).not.toHaveBeenCalled();
  });

  it("suppresses a confirmed result from an earlier Hospital context", async () => {
    let resolveAction: ((state: MutationState) => void) | undefined;
    mocks.restore.mockImplementation(() => new Promise((resolve) => {
      resolveAction = resolve;
    }));
    render("SUSPENDED");
    dispatchRestoreSubmit();
    expect(mocks.restore).toHaveBeenCalledTimes(1);

    render("SUSPENDED", ORIGINAL_VERSION, "hospital-2");
    await act(async () => {
      resolveAction?.(success("ACTIVE"));
      await Promise.resolve();
    });

    expectNoToast();
    expect(container.textContent).not.toContain("บันทึกสถานะโรงพยาบาลเรียบร้อยแล้ว");
  });

  it("allows a new user submission to receive its own confirmed feedback", async () => {
    mocks.restore
      .mockResolvedValueOnce(error("CONFLICT"))
      .mockResolvedValueOnce(success("ACTIVE"));
    render("SUSPENDED");

    dispatchRestoreSubmit();
    await settleAction();
    expect(mocks.notify.warning).toHaveBeenCalledTimes(1);

    dispatchRestoreSubmit();
    await settleAction();
    expect(mocks.restore).toHaveBeenCalledTimes(2);
    expect(mocks.notify.success).toHaveBeenCalledExactlyOnceWith("คืนสถานะโรงพยาบาลแล้ว");
    expect(mocks.router.refresh).toHaveBeenCalledTimes(1);
  });

  it("treats a returned IDLE result as unconfirmed and keeps recovery available", async () => {
    mocks.restore.mockResolvedValue(initialState);
    render("SUSPENDED");

    dispatchRestoreSubmit();
    await settleAction();

    expect(mocks.restore).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("ระบบยังยืนยันผลการคืนสถานะโรงพยาบาลไม่ได้");
    expect(findButton("โหลดและตรวจสอบสถานะล่าสุด")).toBeTruthy();
    expect(findButton("คืนสถานะโรงพยาบาล").disabled).toBe(true);
    expectNoToast();
  });
});
