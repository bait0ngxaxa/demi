// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type ContactInput = { email: string; expectedVersion: number };
type ContactResult =
  | { status: "IDLE" }
  | { status: "SUCCESS"; email: string | null; version: number }
  | { status: "ERROR"; code: "VALIDATION" | "CONFLICT" | "FORBIDDEN" | "UNAVAILABLE"; message: string };

const mocks = vi.hoisted(() => ({
  save: vi.fn<(input: ContactInput) => Promise<ContactResult>>(),
  notify: {
    success: vi.fn<(message: string) => void>(),
    error: vi.fn<(message: string) => void>(),
    warning: vi.fn<(message: string) => void>(),
    info: vi.fn<(message: string) => void>(),
  },
}));

vi.mock("@/modules/account-settings/transport/server-actions", () => ({
  saveOwnContactEmailAction: mocks.save,
}));
vi.mock("@/components/ui/notify", () => ({ notify: mocks.notify }));

import { ContactSettingsForm } from "./contact-settings-form";

let container: HTMLDivElement;
let root: Root;
let rootUnmounted: boolean;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  rootUnmounted = false;
  vi.clearAllMocks();
});

afterEach(() => {
  if (!rootUnmounted) act(() => root.unmount());
  container.remove();
});

function mount(): void {
  act(() => root.render(createElement(ContactSettingsForm, {
    initial: { email: "old@example.test", version: 3 },
    patient: null,
  })));
}

function query<T extends Element>(selector: string): T {
  const element = container.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

function changeEmail(value: string): void {
  const input = query<HTMLInputElement>("#contact-email");
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  valueSetter?.call(input, value);
  act(() => input.dispatchEvent(new Event("input", { bubbles: true })));
}

function dispatchSubmit(): void {
  query<HTMLFormElement>("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

async function submit(): Promise<void> {
  await act(async () => {
    dispatchSubmit();
    await Promise.resolve();
  });
}

describe("ContactSettingsForm email notifications", () => {
  it("notifies after confirmed saves, synchronizes the returned email/version, and allows separate submissions", async () => {
    mocks.save
      .mockResolvedValueOnce({ status: "SUCCESS", email: "saved@example.test", version: 4 })
      .mockResolvedValueOnce({ status: "SUCCESS", email: "second-saved@example.test", version: 5 });
    mount();
    changeEmail("first-draft@example.test");

    await submit();

    expect(mocks.save).toHaveBeenNthCalledWith(1, { email: "first-draft@example.test", expectedVersion: 3 });
    expect(query<HTMLInputElement>("#contact-email").value).toBe("saved@example.test");
    expect(container.textContent).toContain("บันทึกอีเมลติดต่อแล้ว");
    expect(mocks.notify.success).toHaveBeenCalledTimes(1);
    expect(mocks.notify.success).toHaveBeenCalledWith("บันทึกอีเมลแล้ว");
    expect(mocks.notify.success.mock.calls.flat().join(" ")).not.toContain("saved@example.test");

    act(() => root.render(createElement(ContactSettingsForm, {
      initial: { email: "old@example.test", version: 3 },
      patient: null,
    })));
    expect(mocks.notify.success).toHaveBeenCalledTimes(1);

    changeEmail("second-draft@example.test");
    await submit();
    expect(mocks.save).toHaveBeenNthCalledWith(2, { email: "second-draft@example.test", expectedVersion: 4 });
    expect(mocks.notify.success).toHaveBeenCalledTimes(2);
  });

  it("preserves an entered email and the old version on conflict, then submits with that unchanged version", async () => {
    mocks.save
      .mockResolvedValueOnce({ status: "ERROR", code: "CONFLICT", message: "ข้อมูลติดต่อเปลี่ยนแปลงแล้ว กรุณาโหลดการตั้งค่าล่าสุด" })
      .mockResolvedValueOnce({ status: "SUCCESS", email: "confirmed@example.test", version: 4 });
    mount();
    changeEmail("draft@example.test");

    await submit();

    expect(query<HTMLInputElement>("#contact-email").value).toBe("draft@example.test");
    expect(container.textContent).toContain("ข้อมูลติดต่อเปลี่ยนแปลงแล้ว กรุณาโหลดการตั้งค่าล่าสุด");
    expect(mocks.notify.warning).toHaveBeenCalledTimes(1);

    changeEmail("reviewed-draft@example.test");
    await submit();

    expect(mocks.save).toHaveBeenNthCalledWith(2, { email: "reviewed-draft@example.test", expectedVersion: 3 });
    expect(query<HTMLInputElement>("#contact-email").value).toBe("confirmed@example.test");
    expect(container.textContent).toContain("บันทึกอีเมลติดต่อแล้ว");
    expect(mocks.notify.success).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["VALIDATION", "none"],
    ["CONFLICT", "warning"],
    ["FORBIDDEN", "error"],
  ] as const)("maps confirmed %s results to %s toast feedback", async (code, expectedToast) => {
    mocks.save.mockResolvedValue({ status: "ERROR", code, message: "ตรวจสอบข้อมูลและโหลดการตั้งค่าล่าสุด" });
    mount();
    changeEmail("private@example.test");

    await submit();

    expect(container.textContent).toContain("ตรวจสอบข้อมูลและโหลดการตั้งค่าล่าสุด");
    expect(query<HTMLInputElement>("#contact-email").value).toBe("private@example.test");
    expect(mocks.notify.success).not.toHaveBeenCalled();
    if (expectedToast === "warning") expect(mocks.notify.warning).toHaveBeenCalledTimes(1);
    else expect(mocks.notify.warning).not.toHaveBeenCalled();
    if (expectedToast === "error") expect(mocks.notify.error).toHaveBeenCalledTimes(1);
    else expect(mocks.notify.error).not.toHaveBeenCalled();
    expect(mocks.notify.error.mock.calls.flat().join(" ")).not.toContain("private@example.test");
  });

  it.each([
    ["UNAVAILABLE", { status: "ERROR", code: "UNAVAILABLE", message: "บันทึกข้อมูลติดต่อไม่สำเร็จ กรุณาลองใหม่" }],
    ["IDLE", { status: "IDLE" }],
  ] as const)("keeps %s unconfirmed without changing the email/version or inviting a retry", async (_name, result) => {
    mocks.save.mockResolvedValue(result);
    mount();
    changeEmail("private@example.test");

    await submit();

    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(query<HTMLInputElement>("#contact-email").value).toBe("private@example.test");
    expect(container.textContent).toContain("ระบบยังยืนยันผลการบันทึกไม่ได้");
    expect(container.textContent).not.toContain("บันทึกข้อมูลติดต่อไม่สำเร็จ");
    expect(query<HTMLButtonElement>('button[type="submit"]').disabled).toBe(true);
    expect(mocks.notify.success).not.toHaveBeenCalled();
    expect(mocks.notify.error).not.toHaveBeenCalled();
    expect(mocks.notify.warning).not.toHaveBeenCalled();

    await submit();
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });

  it("keeps a thrown request unconfirmed without toast, state sync, or automatic retry", async () => {
    mocks.save.mockRejectedValue(new TypeError("raw internal error"));
    mount();
    changeEmail("private@example.test");

    await submit();

    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(query<HTMLInputElement>("#contact-email").value).toBe("private@example.test");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("ระบบยังยืนยันผลการบันทึกไม่ได้");
    expect(mocks.notify.success).not.toHaveBeenCalled();
    expect(mocks.notify.error).not.toHaveBeenCalled();
    expect(mocks.notify.warning).not.toHaveBeenCalled();
  });

  it("prevents duplicate saves and toasts while the save is pending", async () => {
    let resolveAction: ((result: ContactResult) => void) | undefined;
    mocks.save.mockImplementation(() => new Promise((resolve) => {
      resolveAction = resolve;
    }));
    mount();
    changeEmail("once@example.test");

    await act(async () => {
      dispatchSubmit();
      dispatchSubmit();
    });

    expect(mocks.save).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveAction?.({ status: "SUCCESS", email: "once@example.test", version: 4 });
      await Promise.resolve();
    });

    expect(mocks.notify.success).toHaveBeenCalledTimes(1);
  });

  it("does not show a stale toast when the settings page unmounts before a result", async () => {
    let resolveAction: ((result: ContactResult) => void) | undefined;
    mocks.save.mockImplementation(() => new Promise((resolve) => {
      resolveAction = resolve;
    }));
    mount();
    changeEmail("before-navigation@example.test");

    await act(async () => {
      dispatchSubmit();
    });
    act(() => {
      root.unmount();
      rootUnmounted = true;
    });

    await act(async () => {
      resolveAction?.({ status: "SUCCESS", email: "before-navigation@example.test", version: 4 });
      await Promise.resolve();
    });

    expect(mocks.notify.success).not.toHaveBeenCalled();
  });
});
