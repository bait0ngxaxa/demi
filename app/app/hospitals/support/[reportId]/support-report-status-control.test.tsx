// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  refresh: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  unstable_rethrow: vi.fn(),
  useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }),
}));
vi.mock("@/components/ui/notify", () => ({
  notify: { success: mocks.success, warning: mocks.warning, error: mocks.error, info: mocks.info },
}));
vi.mock("@/modules/support/transport/server-actions", () => ({
  updateSupportReportStatusAction: mocks.update,
}));

import type { SupportReportActionState } from "@/modules/support/transport/server-actions";
import { SupportReportStatusControl } from "./support-report-status-control";

const REPORT_ID = "report-private-1";
const OTHER_REPORT_ID = "report-private-2";
const V1 = "2026-10-01T00:00:00.000Z";
const V2 = "2026-10-02T00:00:00.000Z";

type Props = Parameters<typeof SupportReportStatusControl>[0];

let container: HTMLDivElement;
let root: Root;
let props: Props;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  props = { reportId: REPORT_ID, updatedAt: V1, status: "NEW" };
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(overrides: Partial<Props> = {}): void {
  props = { ...props, ...overrides };
  act(() => root.render(createElement(SupportReportStatusControl, props)));
}

function button(): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((candidate) =>
    /รับทราบรายงาน|ทำเครื่องหมายว่าแก้ไขแล้ว/.test(candidate.textContent ?? ""),
  );
  if (!found) throw new Error("Missing status button");
  return found;
}

async function click(): Promise<void> {
  await act(async () => button().click());
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

function toastCalls(): unknown[][] {
  return [...mocks.success.mock.calls, ...mocks.warning.mock.calls, ...mocks.error.mock.calls];
}

function ok(reportId = REPORT_ID): SupportReportActionState {
  return { status: "SUCCESS", reportId };
}

function failure(code: "VALIDATION" | "CONFLICT" | "FORBIDDEN" | "UNAVAILABLE"): SupportReportActionState {
  return { status: "ERROR", code, message: `ผลลัพธ์ ${code} จากระบบ` };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolvePromise: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

describe("SupportReportStatusControl Toasts", () => {
  it.each([
    ["NEW", "รับทราบรายงาน", "ACKNOWLEDGED", "รับทราบรายงานแล้ว"],
    ["ACKNOWLEDGED", "ทำเครื่องหมายว่าแก้ไขแล้ว", "RESOLVED", "บันทึกสถานะว่าแก้ไขแล้ว"],
  ] as const)("%s: announces the confirmed transition once and refreshes without a full reload", async (status, label, next, toast) => {
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    mocks.update.mockResolvedValueOnce(ok());
    render({ status });
    expect(button().textContent).toContain(label);

    await click();

    expect(mocks.update).toHaveBeenCalledExactlyOnceWith({ reportId: REPORT_ID, expectedUpdatedAt: V1, status: next });
    expect(mocks.success).toHaveBeenCalledExactlyOnceWith(toast);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("shows nothing before the response and no fabricated status afterwards", async () => {
    const pending = deferred<SupportReportActionState>();
    mocks.update.mockReturnValueOnce(pending.promise);
    render();

    await act(async () => {
      button().click();
      await Promise.resolve();
    });
    expect(mocks.success).not.toHaveBeenCalled();
    expect(button().disabled).toBe(true);

    await act(async () => {
      pending.resolve(ok());
      await pending.promise;
    });
    expect(mocks.success).toHaveBeenCalledOnce();
    expect(button().textContent).toContain("รับทราบรายงาน");
  });

  it("stays locked until the refreshed report arrives, then offers the next transition", async () => {
    mocks.update.mockResolvedValueOnce(ok());
    render();
    await click();
    expect(button().disabled).toBe(true);
    await click();
    expect(mocks.update).toHaveBeenCalledOnce();

    render({ status: "ACKNOWLEDGED", updatedAt: V2 });

    expect(button().disabled).toBe(false);
    expect(button().textContent).toContain("ทำเครื่องหมายว่าแก้ไขแล้ว");
    mocks.update.mockResolvedValueOnce(ok());
    await click();
    expect(mocks.update).toHaveBeenLastCalledWith({ reportId: REPORT_ID, expectedUpdatedAt: V2, status: "RESOLVED" });
    expect(mocks.success).toHaveBeenCalledTimes(2);
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
  });

  it("does not replay the Toast or refresh on rerender", async () => {
    mocks.update.mockResolvedValueOnce(ok());
    render();
    await click();

    render();
    render({ status: "ACKNOWLEDGED", updatedAt: V2 });

    expect(mocks.success).toHaveBeenCalledOnce();
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("warns for a confirmed conflict, keeps the server text inline, and does not refresh", async () => {
    mocks.update.mockResolvedValueOnce(failure("CONFLICT"));
    render();

    await click();

    expect(mocks.warning).toHaveBeenCalledExactlyOnceWith("สถานะรายงานเปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลล่าสุด");
    expect(container.textContent).toContain("ผลลัพธ์ CONFLICT จากระบบ");
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("reports a confirmed forbidden response as an error", async () => {
    mocks.update.mockResolvedValueOnce(failure("FORBIDDEN"));
    render();

    await click();

    expect(mocks.error).toHaveBeenCalledExactlyOnceWith("ไม่มีสิทธิ์จัดการรายงานนี้");
    expect(container.textContent).toContain("ผลลัพธ์ FORBIDDEN จากระบบ");
  });

  it("keeps validation inline with no Toast", async () => {
    mocks.update.mockResolvedValueOnce(failure("VALIDATION"));
    render();

    await click();

    expect(toastCalls()).toHaveLength(0);
    expect(container.textContent).toContain("ผลลัพธ์ VALIDATION จากระบบ");
  });

  it("treats UNAVAILABLE as unknown: no Toast, reload guidance, locked button, version preserved", async () => {
    mocks.update.mockResolvedValueOnce(failure("UNAVAILABLE"));
    render();

    await click();

    expect(toastCalls()).toHaveLength(0);
    expect(container.textContent).toContain("ระบบยังยืนยันผลการดำเนินการไม่ได้");
    expect(container.textContent).not.toContain("ผลลัพธ์ UNAVAILABLE จากระบบ");
    expect(button().disabled).toBe(true);
    expect(mocks.refresh).not.toHaveBeenCalled();
    await click();
    expect(mocks.update).toHaveBeenCalledOnce();
  });

  it("treats an unexpected IDLE result as unknown", async () => {
    mocks.update.mockResolvedValueOnce({ status: "IDLE" });
    render();

    await click();

    expect(toastCalls()).toHaveLength(0);
    expect(container.textContent).toContain("ระบบยังยืนยันผลการดำเนินการไม่ได้");
  });

  it("treats a thrown request as unknown with no Toast and no retry", async () => {
    mocks.update.mockRejectedValueOnce(new TypeError("private server failure"));
    render();

    await click();
    await click();

    expect(toastCalls()).toHaveLength(0);
    expect(container.textContent).toContain("ระบบยังยืนยันผลการดำเนินการไม่ได้");
    expect(container.textContent).not.toContain("private server failure");
    expect(mocks.update).toHaveBeenCalledOnce();
  });

  it("does not treat a success for another report as confirmation", async () => {
    mocks.update.mockResolvedValueOnce(ok(OTHER_REPORT_ID));
    render();

    await click();

    expect(toastCalls()).toHaveLength(0);
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(container.textContent).toContain("ระบบยังยืนยันผลการดำเนินการไม่ได้");
  });

  it("drops a rapid duplicate click before it reaches the Server Action", async () => {
    const pending = deferred<SupportReportActionState>();
    mocks.update.mockReturnValueOnce(pending.promise);
    render();

    await act(async () => {
      button().click();
      button().click();
      await Promise.resolve();
    });
    await act(async () => {
      pending.resolve(ok());
      await pending.promise;
    });

    expect(mocks.update).toHaveBeenCalledOnce();
    expect(mocks.success).toHaveBeenCalledOnce();
  });

  it("gives another report no Toast or refresh from a pending request", async () => {
    const pending = deferred<SupportReportActionState>();
    mocks.update.mockReturnValueOnce(pending.promise);
    render();
    await act(async () => {
      button().click();
      await Promise.resolve();
    });

    render({ reportId: OTHER_REPORT_ID, updatedAt: V2 });
    await act(async () => {
      pending.resolve(ok());
      await pending.promise;
    });

    expect(toastCalls()).toHaveLength(0);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("shows no Toast for a response that arrives after unmount", async () => {
    const pending = deferred<SupportReportActionState>();
    mocks.update.mockReturnValueOnce(pending.promise);
    render();
    await act(async () => {
      button().click();
      await Promise.resolve();
    });

    act(() => root.unmount());
    await act(async () => {
      pending.resolve(ok());
      await pending.promise;
    });

    expect(toastCalls()).toHaveLength(0);
    expect(mocks.refresh).not.toHaveBeenCalled();
    root = createRoot(container);
  });

  it("renders nothing for a resolved report", () => {
    render({ status: "RESOLVED" });
    expect(container.querySelector("button")).toBeNull();
  });

  it("keeps identifiers out of Toasts", async () => {
    mocks.update.mockResolvedValueOnce(ok());
    render();
    await click();

    expect(JSON.stringify(toastCalls())).not.toContain(REPORT_ID);
    expect(JSON.stringify(toastCalls())).not.toContain(V1);
  });
});
