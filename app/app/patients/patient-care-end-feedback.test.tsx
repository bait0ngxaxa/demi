// @vitest-environment jsdom

import { Component, act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { redirect } from "next/navigation";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  end: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  verify: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  notifyError: vi.fn<(message: string) => void>(),
  notifySuccess: vi.fn<(message: string) => void>(),
  notifyWarning: vi.fn<(message: string) => void>(),
}));

vi.mock("@/modules/patient-hospital-relationship/transport/server-actions", () => ({
  endPatientHospitalRelationshipAction: mocks.end,
  verifyPatientHospitalRelationshipEndAction: mocks.verify,
}));
vi.mock("@/components/ui/notify", () => ({
  notify: {
    error: mocks.notifyError,
    info: vi.fn(),
    success: mocks.notifySuccess,
    warning: mocks.notifyWarning,
  },
}));

import { PatientCareEndForm } from "./patient-care-end-form";

const relationshipId = "11111111-1111-4111-8111-111111111111";
const hospitalId = "22222222-2222-4222-8222-222222222222";

class Boundary extends Component<{ children?: ReactNode; onError: (error: unknown) => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  componentDidCatch(error: unknown): void {
    this.props.onError(error);
  }
  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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

function render(onError: (error: unknown) => void = () => undefined): void {
  act(() =>
    root.render(
      createElement(
        Boundary,
        { onError },
        createElement(PatientCareEndForm, { relationshipId, hospitalId, hospitalName: "โรงพยาบาลทดสอบ" }),
      ),
    ),
  );
}

function buttonByText(text: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes(text));
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
}

async function submitEnd(reason = "ย้ายออกจากพื้นที่"): Promise<void> {
  container.querySelector<HTMLTextAreaElement>('textarea[name="endReason"]')!.value = reason;
  container.querySelector<HTMLInputElement>('input[name="confirmRetention"]')!.checked = true;
  await act(async () => {
    container.querySelector("form")!.requestSubmit();
  });
}

function allToasts(): string {
  return JSON.stringify([mocks.notifySuccess.mock.calls, mocks.notifyWarning.mock.calls, mocks.notifyError.mock.calls]);
}

describe("Patient Care End outcomes", () => {
  it("sends the reason and acknowledgment to the bound relationship once", async () => {
    mocks.end.mockResolvedValue({ status: "ERROR", code: "INVALID_INPUT", message: "กรุณาระบุเหตุผล" });
    render();

    await submitEnd();

    expect(mocks.end).toHaveBeenCalledTimes(1);
    expect(mocks.end.mock.calls[0][0]).toBe(relationshipId);
    const formData = mocks.end.mock.calls[0][2] as FormData;
    expect(formData.get("endReason")).toBe("ย้ายออกจากพื้นที่");
    expect(formData.get("confirmRetention")).toBe("true");
  });

  it("keeps validation inline without a Toast and keeps the draft", async () => {
    mocks.end.mockResolvedValue({ status: "ERROR", code: "INVALID_INPUT", message: "กรุณาระบุเหตุผล" });
    render();

    await submitEnd();

    expect(container.textContent).toContain("กรุณาระบุเหตุผล");
    expect(allToasts()).toBe("[[],[],[]]");
    expect(container.querySelector<HTMLTextAreaElement>('textarea[name="endReason"]')!.value).toBe("ย้ายออกจากพื้นที่");
  });

  it("warns on CONFLICT and errors on FORBIDDEN without leaking the reason", async () => {
    mocks.end.mockResolvedValue({ status: "ERROR", code: "CONFLICT", message: "สถานะเปลี่ยนแปลงแล้ว" });
    render();
    await submitEnd();
    expect(mocks.notifyWarning).toHaveBeenCalledTimes(1);

    mocks.end.mockResolvedValue({ status: "ERROR", code: "FORBIDDEN", message: "เฉพาะเจ้าของ" });
    await submitEnd();
    expect(mocks.notifyError).toHaveBeenCalledTimes(1);
    expect(allToasts()).not.toContain("ย้ายออก");
    expect(mocks.notifySuccess).not.toHaveBeenCalled();
  });

  it.each([
    ["returned UNAVAILABLE", () => mocks.end.mockResolvedValue({ status: "ERROR", code: "UNAVAILABLE", message: "ลองใหม่" })],
    ["returned IDLE", () => mocks.end.mockResolvedValue({ status: "IDLE", message: "" })],
    ["a thrown request", () => mocks.end.mockRejectedValue(new TypeError("Failed to fetch"))],
  ])("treats %s as unknown: no Toast, no resend, read-only verification offered", async (_label, arrange) => {
    arrange();
    render();

    await submitEnd();

    expect(allToasts()).toBe("[[],[],[]]");
    expect(container.textContent).toContain("ระบบยังยืนยันผลไม่ได้");
    expect(container.textContent).not.toContain("บันทึกไม่ได้ กรุณาลองใหม่");
    expect(buttonByText("สิ้นสุดการดูแลผู้ป่วยรายนี้").disabled).toBe(true);
    expect(mocks.end).toHaveBeenCalledTimes(1);

    mocks.verify.mockResolvedValue("ENDED");
    await act(async () => {
      buttonByText("ตรวจสอบสถานะการสิ้นสุดการดูแล").click();
    });
    expect(mocks.verify).toHaveBeenCalledWith(relationshipId);
    expect(mocks.end).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("ยืนยันแล้วว่าการดูแลสิ้นสุดแล้ว");
    expect(container.querySelector("a")?.getAttribute("href")).toBe(`/app/patients?hospitalId=${hospitalId}`);
    expect(allToasts()).toBe("[[],[],[]]");
  });

  it("allows an explicit new request only after verification finds the care still active", async () => {
    mocks.end.mockResolvedValue({ status: "ERROR", code: "UNAVAILABLE", message: "ลองใหม่" });
    render();
    await submitEnd();

    mocks.verify.mockResolvedValue("ACTIVE");
    await act(async () => {
      buttonByText("ตรวจสอบสถานะการสิ้นสุดการดูแล").click();
    });
    expect(mocks.end).toHaveBeenCalledTimes(1);
    expect(buttonByText("สิ้นสุดการดูแลผู้ป่วยรายนี้").disabled).toBe(false);

    mocks.end.mockResolvedValue({ status: "ERROR", code: "INVALID_INPUT", message: "กรุณาระบุเหตุผล" });
    await submitEnd();
    expect(mocks.end).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["a failed verification request", () => mocks.verify.mockRejectedValue(new TypeError("Failed to fetch"))],
    ["an UNRESOLVED verification", () => mocks.verify.mockResolvedValue("UNRESOLVED")],
  ])("does not claim success or failure after %s, and allows verifying again", async (_label, arrange) => {
    mocks.end.mockResolvedValue({ status: "ERROR", code: "UNAVAILABLE", message: "ลองใหม่" });
    render();
    await submitEnd();
    arrange();

    await act(async () => {
      buttonByText("ตรวจสอบสถานะการสิ้นสุดการดูแล").click();
    });

    expect(container.textContent).toContain("ยังยืนยันสถานะไม่ได้");
    expect(container.textContent).not.toContain("ยืนยันแล้วว่าการดูแลสิ้นสุดแล้ว");
    expect(buttonByText("สิ้นสุดการดูแลผู้ป่วยรายนี้").disabled).toBe(true);
    expect(mocks.end).toHaveBeenCalledTimes(1);
    expect(allToasts()).toBe("[[],[],[]]");

    mocks.verify.mockResolvedValue("ENDED");
    await act(async () => {
      buttonByText("ตรวจสอบสถานะการสิ้นสุดการดูแล").click();
    });
    expect(container.textContent).toContain("ยืนยันแล้วว่าการดูแลสิ้นสุดแล้ว");
  });

  it("sends one end request for two synchronous submits", async () => {
    let resolve: (value: unknown) => void = () => undefined;
    mocks.end.mockReturnValue(new Promise((done) => { resolve = done; }));
    render();
    container.querySelector<HTMLTextAreaElement>('textarea[name="endReason"]')!.value = "เหตุผล";
    container.querySelector<HTMLInputElement>('input[name="confirmRetention"]')!.checked = true;

    await act(async () => {
      const form = container.querySelector("form")!;
      form.requestSubmit();
      form.requestSubmit();
    });
    expect(mocks.end).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve({ status: "ERROR", code: "INVALID_INPUT", message: "กรุณาระบุเหตุผล" });
    });
  });

  it("lets the success redirect propagate instead of turning it into an unknown outcome", async () => {
    const redirectError = (() => {
      try {
        redirect(`/app/patients?hospitalId=${hospitalId}`);
      } catch (error: unknown) {
        return error;
      }
      throw new Error("redirect did not throw");
    })();
    mocks.end.mockRejectedValue(redirectError);
    const caught = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(caught);

    await submitEnd();

    consoleError.mockRestore();
    expect(caught).toHaveBeenCalledWith(redirectError);
    expect(container.textContent).not.toContain("ระบบยังยืนยันผลไม่ได้");
    expect(allToasts()).toBe("[[],[],[]]");
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.end).toHaveBeenCalledTimes(1);
  });
});
