// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type SupportResult =
  | { status: "IDLE" }
  | { status: "SUCCESS"; reportId: string }
  | { status: "ERROR"; code: "VALIDATION" | "RATE_LIMIT" | "CONFLICT" | "FORBIDDEN" | "UNAVAILABLE"; message: string };

const mocks = vi.hoisted(() => ({
  create: vi.fn<(input: { hospitalId?: string; category: string; message: string }) => Promise<SupportResult>>(),
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

import { SUPPORT_REPORT_SUBMIT_FORBIDDEN_MESSAGE } from "@/modules/support/domain/support-report-messages";
import { SupportReportForm } from "./support-report-form";

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

/** Visible feedback that is not a live region because its Toast already announces it. */
function quietTextContaining(text: string): string | null {
  return Array.from(container.querySelectorAll<HTMLElement>('[role="none"]'))
    .find((element) => element.textContent?.includes(text))?.textContent ?? null;
}

function alertTextContaining(text: string): string | null {
  return Array.from(container.querySelectorAll<HTMLElement>('[role="alert"]'))
    .find((element) => element.textContent?.includes(text))?.textContent ?? null;
}

function changeMessage(value: string): void {
  const textarea = query<HTMLTextAreaElement>("#support-message");
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  valueSetter?.call(textarea, value);
  act(() => textarea.dispatchEvent(new Event("input", { bubbles: true })));
}

function changeHospital(value: string): void {
  const select = query<HTMLSelectElement>("#support-hospital");
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  valueSetter?.call(select, value);
  act(() => select.dispatchEvent(new Event("change", { bubbles: true })));
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
    expect(quietTextContaining("ส่งรายงานแล้ว ผู้ดูแลระบบ DEMI จะตรวจสอบ")).toContain("ส่งรายงานแล้ว ผู้ดูแลระบบ DEMI จะตรวจสอบ");
    expect(statusTextContaining("ส่งรายงานแล้ว")).toBeNull();

    act(() => root.render(createElement(SupportReportForm, {
      hospitals: [{ id: "hospital-1", name: "โรงพยาบาลทดสอบ", hospitalCode: "TEST-001" }],
    })));
    expect(mocks.notify.success).toHaveBeenCalledTimes(1);

    changeMessage("รายงานครั้งที่สอง");
    await submit();
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(mocks.notify.success).toHaveBeenCalledTimes(2);
  });

  // WB-DF-14 (Product Owner 2026-10-26): the Hospital is optional context; the platform ADMIN receives every report.
  it("submits without a Hospital when the reporter has no eligible Hospital", async () => {
    mocks.create.mockResolvedValue({ status: "SUCCESS", reportId: "report-1" });
    mount([]);
    changeMessage("ผู้ดูแลเปิดหน้าครอบครัวไม่ได้");

    expect(container.querySelector("#support-hospital")).toBeNull();
    expect(container.querySelector('input[name="hospitalId"]')).toBeNull();
    expect(query<HTMLButtonElement>('button[type="submit"]').disabled).toBe(false);
    await submit();

    expect(mocks.create).toHaveBeenCalledWith({ category: "BUG", message: "ผู้ดูแลเปิดหน้าครอบครัวไม่ได้" });
    expect(quietTextContaining("ผู้ดูแลระบบ DEMI จะตรวจสอบ")).toContain("ส่งรายงานแล้ว ผู้ดูแลระบบ DEMI จะตรวจสอบ");
    expect(container.textContent).not.toContain("เจ้าของโรงพยาบาล");
  });

  it("offers a not-specific choice when several Hospitals are eligible and then omits the Hospital", async () => {
    mocks.create.mockResolvedValue({ status: "SUCCESS", reportId: "report-1" });
    mount([
      { id: "hospital-1", name: "โรงพยาบาลหนึ่ง", hospitalCode: "TEST-001" },
      { id: "hospital-2", name: "โรงพยาบาลสอง", hospitalCode: "TEST-002" },
    ]);
    const options = Array.from(query<HTMLSelectElement>("#support-hospital").options, ({ value, textContent }) => [value, textContent]);
    expect(options).toEqual([["hospital-1", "โรงพยาบาลหนึ่ง"], ["hospital-2", "โรงพยาบาลสอง"], ["", "ไม่เจาะจงโรงพยาบาล"]]);
    expect(query<HTMLSelectElement>("#support-hospital").value).toBe("hospital-1");

    changeHospital("");
    changeMessage("ปัญหาทั่วไปของแอป");
    await submit();

    expect(mocks.create).toHaveBeenCalledWith({ category: "BUG", message: "ปัญหาทั่วไปของแอป" });
    expect(query<HTMLSelectElement>("#support-hospital").value).toBe("");
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

  it("locks Hospital selection during a pending request and preserves a newer draft", async () => {
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
    expect(query<HTMLSelectElement>("#support-hospital").disabled).toBe(true);

    changeHospital("hospital-2");
    changeMessage("ร่างใหม่ที่ยังไม่ได้ส่ง");

    await act(async () => {
      resolveAction?.({ status: "SUCCESS", reportId: "report-1" });
      await Promise.resolve();
    });

    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledWith({ hospitalId: "hospital-1", category: "BUG", message: "รายงานของโรงพยาบาลหนึ่ง" });
    expect(query<HTMLTextAreaElement>("#support-message").value).toBe("ร่างใหม่ที่ยังไม่ได้ส่ง");
    expect(query<HTMLSelectElement>("#support-hospital").value).toBe("hospital-1");
    expect(quietTextContaining("ส่งรายงานแล้ว ผู้ดูแลระบบ DEMI จะตรวจสอบ")).toContain("ส่งรายงานแล้ว ผู้ดูแลระบบ DEMI จะตรวจสอบ");
    expect(statusTextContaining("ส่งรายงานแล้ว")).toBeNull();
    expect(mocks.notify.success).toHaveBeenCalledTimes(1);
  });

  it("discards a confirmed result after authoritative Hospital context replacement without clearing the draft", async () => {
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
    act(() => root.render(createElement(SupportReportForm, {
      hospitals: [{ id: "hospital-2", name: "โรงพยาบาลสอง", hospitalCode: "TEST-002" }],
    })));

    await act(async () => {
      resolveAction?.({ status: "SUCCESS", reportId: "report-1" });
      await Promise.resolve();
    });

    expect(query<HTMLInputElement>('input[name="hospitalId"]').value).toBe("hospital-2");
    expect(query<HTMLTextAreaElement>("#support-message").value).toBe("รายงานของโรงพยาบาลหนึ่ง");
    expect(container.textContent).not.toContain("ส่งรายงานแล้ว");
    expect(mocks.notify.success).not.toHaveBeenCalled();
  });

  it("does not apply a resolved result after the form unmounts", async () => {
    let resolveAction: ((result: SupportResult) => void) | undefined;
    mocks.create.mockImplementation(() => new Promise((resolve) => {
      resolveAction = resolve;
    }));
    mount();
    changeMessage("รายงานก่อนออกจากหน้า");

    await act(async () => {
      dispatchSubmit();
    });
    act(() => {
      root.unmount();
      rootUnmounted = true;
    });

    await act(async () => {
      resolveAction?.({ status: "SUCCESS", reportId: "report-1" });
      await Promise.resolve();
    });

    expect(mocks.notify.success).not.toHaveBeenCalled();
    expect(container.textContent).toBe("");
  });

  it.each([
    ["VALIDATION", "none"],
    ["RATE_LIMIT", "warning"],
    ["CONFLICT", "warning"],
    ["FORBIDDEN", "error"],
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

  it("shows the Server Action FORBIDDEN refusal inline and keeps the toast short static copy", async () => {
    mocks.create.mockResolvedValue({ status: "ERROR", code: "FORBIDDEN", message: SUPPORT_REPORT_SUBMIT_FORBIDDEN_MESSAGE });
    mount();
    changeMessage("รายงานที่ถูกปฏิเสธ");

    await submit();

    expect(mocks.notify.error).toHaveBeenCalledExactlyOnceWith("ส่งรายงานไม่ได้");
    expect(statusTextContaining(SUPPORT_REPORT_SUBMIT_FORBIDDEN_MESSAGE)).toContain(SUPPORT_REPORT_SUBMIT_FORBIDDEN_MESSAGE);
  });

  it("treats UNAVAILABLE as unconfirmed and prevents another potentially duplicate report", async () => {
    mocks.create.mockResolvedValue({ status: "ERROR", code: "UNAVAILABLE", message: "ส่งรายงานไม่สำเร็จ กรุณาลองใหม่ภายหลัง" });
    mount();
    changeMessage("รายงานที่อาจบันทึกแล้ว");

    await submit();

    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(query<HTMLTextAreaElement>("#support-message").value).toBe("รายงานที่อาจบันทึกแล้ว");
    expect(alertTextContaining("ยังยืนยันผลการส่งรายงาน")).toContain("ยังยืนยันผลการส่งรายงาน");
    expect(container.textContent).not.toContain("ส่งรายงานไม่สำเร็จ");
    expect(query<HTMLButtonElement>('button[type="submit"]').disabled).toBe(true);
    expect(mocks.notify.success).not.toHaveBeenCalled();
    expect(mocks.notify.error).not.toHaveBeenCalled();
    expect(mocks.notify.warning).not.toHaveBeenCalled();

    await submit();
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it("keeps an unconfirmed result in the recovery alert without claiming success or failure", async () => {
    mocks.create.mockRejectedValue(new TypeError("raw internal error"));
    mount();
    changeMessage("รายงานที่ยังไม่ทราบผล");

    await submit();

    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(alertTextContaining("ระบบยังยืนยันผลการส่งรายงาน")).toContain("ระบบยังยืนยันผลการส่งรายงาน");
    expect(query<HTMLTextAreaElement>("#support-message").value).toBe("รายงานที่ยังไม่ทราบผล");
    expect(mocks.notify.success).not.toHaveBeenCalled();
    expect(mocks.notify.error).not.toHaveBeenCalled();
    expect(mocks.notify.warning).not.toHaveBeenCalled();
  });
});
