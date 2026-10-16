// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type SupportResult =
  | { status: "IDLE" }
  | { status: "SUCCESS"; reportId: string }
  | { status: "ERROR"; code: "VALIDATION" | "RATE_LIMIT" | "CONFLICT" | "FORBIDDEN" | "UNAVAILABLE"; message: string };

const mocks = vi.hoisted(() => ({
  create: vi.fn<(input: { hospitalId: string; category: string; message: string }) => Promise<SupportResult>>(),
  notify: {
    success: vi.fn<(message: string) => void>(),
    error: vi.fn<(message: string) => void>(),
    warning: vi.fn<(message: string) => void>(),
    info: vi.fn<(message: string) => void>(),
  },
}));

vi.mock("@/modules/support/transport/server-actions", () => ({
  createSupportReportAction: mocks.create,
}));
vi.mock("@/components/ui/notify", () => ({ notify: mocks.notify }));

import { SupportReportForm } from "./support-report-form";

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.clearAllMocks();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function mount(hospitals: readonly { id: string; name: string; hospitalCode: string }[] = [
  { id: "hospital-1", name: "โรงพยาบาลทดสอบ", hospitalCode: "TEST-001" },
]): void {
  act(() => root.render(createElement(SupportReportForm, {
    hospitals,
  })));
}

function query<T extends Element>(selector: string): T {
  const element = container.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

function statusTextContaining(text: string): string | null {
  return Array.from(container.querySelectorAll<HTMLElement>('[role="status"]'))
    .find((element) => element.textContent?.includes(text))?.textContent ?? null;
}

function changeMessage(value: string): void {
  const textarea = query<HTMLTextAreaElement>("#support-message");
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  valueSetter?.call(textarea, value);
  act(() => textarea.dispatchEvent(new Event("input", { bubbles: true })));
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

describe("SupportReportForm notifications", () => {
  it("notifies once after confirmed success, preserves inline feedback, resets the message, and allows a new submission", async () => {
    mocks.create
      .mockResolvedValueOnce({ status: "SUCCESS", reportId: "report-1" })
      .mockResolvedValueOnce({ status: "SUCCESS", reportId: "report-2" });
    mount();
    changeMessage("ปุ่มบันทึกไม่ทำงาน");

    await submit();

    expect(mocks.create).toHaveBeenCalledWith({ hospitalId: "hospital-1", category: "BUG", message: "ปุ่มบันทึกไม่ทำงาน" });
    expect(mocks.notify.success).toHaveBeenCalledTimes(1);
    expect(mocks.notify.success).toHaveBeenCalledWith("ส่งรายงานแล้ว");
    expect(query<HTMLTextAreaElement>("#support-message").value).toBe("");
    expect(statusTextContaining("ส่งรายงานแล้ว เจ้าของโรงพยาบาลจะตรวจสอบ")).toContain("ส่งรายงานแล้ว เจ้าของโรงพยาบาลจะตรวจสอบ");

    act(() => root.render(createElement(SupportReportForm, {
      hospitals: [{ id: "hospital-1", name: "โรงพยาบาลทดสอบ", hospitalCode: "TEST-001" }],
    })));
    expect(mocks.notify.success).toHaveBeenCalledTimes(1);

    changeMessage("รายงานครั้งที่สอง");
    await submit();
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(mocks.notify.success).toHaveBeenCalledTimes(2);
  });

  it("prevents a second request and toast while one submission is pending", async () => {
    let resolveAction: ((result: SupportResult) => void) | undefined;
    mocks.create.mockImplementation(() => new Promise((resolve) => {
      resolveAction = resolve;
    }));
    mount();
    changeMessage("รายงานที่ส่งครั้งเดียว");

    await act(async () => {
      dispatchSubmit();
      dispatchSubmit();
    });

    expect(mocks.create).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveAction?.({ status: "SUCCESS", reportId: "report-1" });
      await Promise.resolve();
    });

    expect(mocks.notify.success).toHaveBeenCalledTimes(1);
  });

  it("suppresses a stale toast after the selected hospital context changes", async () => {
    let resolveAction: ((result: SupportResult) => void) | undefined;
    mocks.create.mockImplementation(() => new Promise((resolve) => {
      resolveAction = resolve;
    }));
    mount([
      { id: "hospital-1", name: "โรงพยาบาลหนึ่ง", hospitalCode: "TEST-001" },
      { id: "hospital-2", name: "โรงพยาบาลสอง", hospitalCode: "TEST-002" },
    ]);
    changeMessage("รายงานของโรงพยาบาลหนึ่ง");

    await act(async () => {
      dispatchSubmit();
    });
    expect(mocks.create).toHaveBeenCalledWith({ hospitalId: "hospital-1", category: "BUG", message: "รายงานของโรงพยาบาลหนึ่ง" });

    const hospitalSelect = query<HTMLSelectElement>("#support-hospital");
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    valueSetter?.call(hospitalSelect, "hospital-2");
    act(() => hospitalSelect.dispatchEvent(new Event("change", { bubbles: true })));

    await act(async () => {
      resolveAction?.({ status: "SUCCESS", reportId: "report-1" });
      await Promise.resolve();
    });

    expect(mocks.notify.success).not.toHaveBeenCalled();
  });

  it.each([
    ["VALIDATION", "none"],
    ["RATE_LIMIT", "warning"],
    ["CONFLICT", "warning"],
    ["FORBIDDEN", "error"],
    ["UNAVAILABLE", "error"],
  ] as const)("maps confirmed %s results to %s toast feedback", async (code, expectedToast) => {
    mocks.create.mockResolvedValue({ status: "ERROR", code, message: "รายละเอียดจาก Server Action" });
    mount();
    changeMessage("ข้อมูลที่ผู้ใช้กรอก");

    await submit();

    expect(statusTextContaining("รายละเอียดจาก Server Action")).toContain("รายละเอียดจาก Server Action");
    expect(query<HTMLTextAreaElement>("#support-message").value).toBe("ข้อมูลที่ผู้ใช้กรอก");
    expect(mocks.notify.success).not.toHaveBeenCalled();
    if (expectedToast === "warning") expect(mocks.notify.warning).toHaveBeenCalledTimes(1);
    else expect(mocks.notify.warning).not.toHaveBeenCalled();
    if (expectedToast === "error") expect(mocks.notify.error).toHaveBeenCalledTimes(1);
    else expect(mocks.notify.error).not.toHaveBeenCalled();
    expect(mocks.notify.error.mock.calls.flat().join(" ")).not.toContain("ข้อมูลที่ผู้ใช้กรอก");
  });

  it("keeps an unconfirmed result in the recovery alert without claiming success or failure", async () => {
    mocks.create.mockRejectedValue(new TypeError("raw internal error"));
    mount();
    changeMessage("รายงานที่ยังไม่ทราบผล");

    await submit();

    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("ระบบยังยืนยันไม่ได้ว่าบันทึกแล้วหรือไม่");
    expect(query<HTMLTextAreaElement>("#support-message").value).toBe("รายงานที่ยังไม่ทราบผล");
    expect(mocks.notify.success).not.toHaveBeenCalled();
    expect(mocks.notify.error).not.toHaveBeenCalled();
    expect(mocks.notify.warning).not.toHaveBeenCalled();
  });
});
