// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { HospitalOnboardingReviewActionState } from "@/modules/hospital-onboarding/transport/action-state";

type ReviewActionMock = (
  applicationId: string,
  previousState: HospitalOnboardingReviewActionState,
  formData: FormData,
) => Promise<HospitalOnboardingReviewActionState>;

const mocks = vi.hoisted(() => ({
  approve: vi.fn<ReviewActionMock>(),
  reject: vi.fn<ReviewActionMock>(),
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

vi.mock("@/modules/hospital-onboarding/transport/server-actions", () => ({
  approveHospitalOnboardingAction: mocks.approve,
  rejectHospitalOnboardingAction: mocks.reject,
}));

vi.mock("@/components/ui/notify", () => ({ notify: mocks.notify }));

import { ReviewActions } from "./review-actions";

const initialState: HospitalOnboardingReviewActionState = { status: "IDLE" };
const APPLICATION_ID = "application-111";

let container: HTMLDivElement;
let root: Root;
let originalActEnvironment: boolean | undefined;

beforeAll(() => {
  const globalWithActFlag = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };
  originalActEnvironment = globalWithActFlag.IS_REACT_ACT_ENVIRONMENT;
  globalWithActFlag.IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  mocks.approve.mockReset().mockResolvedValue(initialState);
  mocks.reject.mockReset().mockResolvedValue(initialState);
  mocks.router.refresh.mockReset();
  mocks.notify.success.mockReset();
  mocks.notify.warning.mockReset();
  mocks.notify.error.mockReset();
  mocks.notify.info.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

afterAll(() => {
  const globalWithActFlag = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };
  if (originalActEnvironment === undefined) {
    Reflect.deleteProperty(globalWithActFlag, "IS_REACT_ACT_ENVIRONMENT");
  } else {
    globalWithActFlag.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  }
});

function render(applicationId = APPLICATION_ID): void {
  act(() => root.render(createElement(ReviewActions, { applicationId })));
}

function query<T extends Element>(selector: string): T {
  const element = container.querySelector<T>(selector);
  if (!element) {
    throw new Error("Missing element: " + selector);
  }
  return element;
}

function findButton(label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
    .find((candidate) => candidate.textContent?.includes(label));
  if (!button) {
    throw new Error("Missing button: " + label);
  }
  return button;
}

function submit(label: string): boolean {
  const button = findButton(label);
  return submitButton(button);
}

function submitFromForm(index: number): boolean {
  const form = container.querySelectorAll("form").item(index);
  const button = form?.querySelector("button");
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error("Missing review form button at index " + index);
  }
  return submitButton(button);
}

function submitButton(button: HTMLButtonElement): boolean {
  const form = button.closest("form");
  if (!form) {
    throw new Error("Missing review form");
  }

  const event = new SubmitEvent("submit", {
    bubbles: true,
    cancelable: true,
    submitter: button,
  });
  act(() => form.dispatchEvent(event));
  return event.defaultPrevented;
}

async function settleAction(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve(value): void {
      resolvePromise?.(value);
    },
  };
}

function success(decision: "APPROVED" | "REJECTED"): HospitalOnboardingReviewActionState {
  return { status: "SUCCESS", decision };
}

function error(
  code: "CONFLICT" | "FORBIDDEN" | "NOT_FOUND" | "INVALID_INPUT" | "UNAVAILABLE",
): HospitalOnboardingReviewActionState {
  return {
    status: "ERROR",
    code,
    message: "รายละเอียดประกอบ " + code,
  };
}

function expectNoToast(): void {
  expect(mocks.notify.success).not.toHaveBeenCalled();
  expect(mocks.notify.warning).not.toHaveBeenCalled();
  expect(mocks.notify.error).not.toHaveBeenCalled();
}

describe("ReviewActions approval feedback", () => {
  it("waits for a confirmed approval, shows one success toast, and refreshes the current detail route", async () => {
    const response = deferred<HospitalOnboardingReviewActionState>();
    mocks.approve.mockReturnValue(response.promise);
    render();

    expect(submit("อนุมัติคำขอ")).toBe(true);
    expect(mocks.approve).toHaveBeenCalledTimes(1);
    expect(mocks.approve.mock.calls[0]?.[0]).toBe(APPLICATION_ID);
    expect(mocks.approve.mock.calls[0]?.[2].get("__reviewResponseMode")).toBe("enhanced-client");
    expect(mocks.notify.success).not.toHaveBeenCalled();
    expect(mocks.router.refresh).not.toHaveBeenCalled();

    await act(async () => response.resolve(success("APPROVED")));
    await settleAction();

    expect(mocks.notify.success).toHaveBeenCalledExactlyOnceWith("อนุมัติคำขอโรงพยาบาลแล้ว");
    expect(mocks.notify.warning).not.toHaveBeenCalled();
    expect(mocks.notify.error).not.toHaveBeenCalled();
    expect(mocks.router.refresh).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["CONFLICT", "warning"],
    ["FORBIDDEN", "error"],
    ["NOT_FOUND", "warning"],
    ["INVALID_INPUT", "none"],
  ] as const)(
    "keeps approval %s inline and uses the matching confirmed notification",
    async (code, toastKind) => {
      mocks.approve.mockResolvedValue(error(code));
      render();

      submit("อนุมัติคำขอ");
      await settleAction();

      expect(container.textContent).toContain("รายละเอียดประกอบ " + code);
      expect(mocks.router.refresh).not.toHaveBeenCalled();
      expect(mocks.notify.success).not.toHaveBeenCalled();
      expect(mocks.notify.warning).toHaveBeenCalledTimes(toastKind === "warning" ? 1 : 0);
      expect(mocks.notify.error).toHaveBeenCalledTimes(toastKind === "error" ? 1 : 0);
      if (code === "CONFLICT") {
        expect(mocks.notify.warning).toHaveBeenCalledWith(
          "คำขอนี้ถูกดำเนินการแล้ว โปรดตรวจสอบสถานะล่าสุด",
        );
      }
      if (code === "FORBIDDEN") {
        expect(mocks.notify.error).toHaveBeenCalledWith(
          "ไม่มีสิทธิ์อนุมัติคำขอโรงพยาบาล",
        );
      }
      if (code === "NOT_FOUND") {
        expect(mocks.notify.warning).toHaveBeenCalledWith(
          "ไม่พบคำขอที่ต้องการตรวจสอบ",
        );
      }
    },
  );

  it("treats returned UNAVAILABLE as unknown and locks both decisions behind reload recovery", async () => {
    mocks.approve.mockResolvedValue(error("UNAVAILABLE"));
    render();

    submit("อนุมัติคำขอ");
    await settleAction();

    expect(container.textContent).toContain(
      "ระบบยังยืนยันผลการตรวจสอบคำขอไม่ได้ กรุณาโหลดสถานะล่าสุดก่อนดำเนินการต่อ",
    );
    expect(container.textContent).not.toContain("รายละเอียดประกอบ UNAVAILABLE");
    expect(findButton("โหลดข้อมูลล่าสุด")).toBeTruthy();
    expect(findButton("อนุมัติคำขอ").disabled).toBe(true);
    expect(findButton("ปฏิเสธคำขอ").disabled).toBe(true);
    expect(query<HTMLTextAreaElement>("#rejectionReason").disabled).toBe(true);
    expectNoToast();

    submit("ปฏิเสธคำขอ");
    expect(mocks.approve).toHaveBeenCalledTimes(1);
    expect(mocks.reject).not.toHaveBeenCalled();
  });

  it("keeps thrown approval requests unconfirmed and never retries automatically", async () => {
    mocks.approve.mockRejectedValue(new TypeError("private infrastructure detail"));
    render();

    submit("อนุมัติคำขอ");
    await settleAction();

    expect(container.textContent).toContain("โหลดสถานะล่าสุดก่อนดำเนินการต่อ");
    expect(container.textContent).not.toContain("private infrastructure detail");
    expect(findButton("โหลดข้อมูลล่าสุด")).toBeTruthy();
    expect(findButton("อนุมัติคำขอ").disabled).toBe(true);
    expect(findButton("ปฏิเสธคำขอ").disabled).toBe(true);
    expect(mocks.approve).toHaveBeenCalledTimes(1);
    expectNoToast();
  });

  it("treats a returned IDLE or a mismatched decision as unconfirmed", async () => {
    mocks.approve.mockResolvedValueOnce(initialState).mockResolvedValueOnce(success("REJECTED"));
    render();

    submit("อนุมัติคำขอ");
    await settleAction();
    expect(findButton("โหลดข้อมูลล่าสุด")).toBeTruthy();
    expectNoToast();
    expect(mocks.approve).toHaveBeenCalledTimes(1);

    act(() => root.render(createElement(ReviewActions, { applicationId: "application-222" })));
    mocks.approve.mockResolvedValue(success("REJECTED"));
    submit("อนุมัติคำขอ");
    await settleAction();

    expect(findButton("โหลดข้อมูลล่าสุด")).toBeTruthy();
    expectNoToast();
    expect(mocks.router.refresh).not.toHaveBeenCalled();
  });

  it("blocks rapid duplicate approval and allows a separate submission after a confirmed error", async () => {
    const response = deferred<HospitalOnboardingReviewActionState>();
    mocks.approve.mockReturnValueOnce(response.promise).mockResolvedValueOnce(success("APPROVED"));
    render();

    submit("อนุมัติคำขอ");
    submitFromForm(0);
    submitFromForm(1);
    expect(mocks.approve).toHaveBeenCalledTimes(1);
    expect(mocks.reject).not.toHaveBeenCalled();

    await act(async () => response.resolve(error("CONFLICT")));
    await settleAction();
    expect(mocks.notify.warning).toHaveBeenCalledTimes(1);
    expect(findButton("อนุมัติคำขอ").disabled).toBe(false);

    submit("อนุมัติคำขอ");
    await settleAction();
    expect(mocks.approve).toHaveBeenCalledTimes(2);
    expect(mocks.notify.success).toHaveBeenCalledExactlyOnceWith("อนุมัติคำขอโรงพยาบาลแล้ว");
    expect(mocks.router.refresh).toHaveBeenCalledTimes(1);
  });
});

describe("ReviewActions rejection feedback", () => {
  it("passes the exact rejection reason and shows one success toast after confirmation", async () => {
    const response = deferred<HospitalOnboardingReviewActionState>();
    mocks.reject.mockReturnValue(response.promise);
    render();
    const reason = query<HTMLTextAreaElement>("#rejectionReason");
    reason.value = "เอกสารประกอบยังไม่ครบ";

    submit("ปฏิเสธคำขอ");
    const submitted = mocks.reject.mock.calls[0]?.[2];
    expect(submitted?.get("rejectionReason")).toBe("เอกสารประกอบยังไม่ครบ");
    expect(submitted?.get("__reviewResponseMode")).toBe("enhanced-client");
    expect(mocks.approve).not.toHaveBeenCalled();
    expectNoToast();

    await act(async () => response.resolve(success("REJECTED")));
    await settleAction();

    expect(mocks.notify.success).toHaveBeenCalledExactlyOnceWith("ปฏิเสธคำขอโรงพยาบาลแล้ว");
    expect(mocks.router.refresh).toHaveBeenCalledTimes(1);
  });

  it("preserves the rejection reason and emits conflict feedback without dispatching approval", async () => {
    mocks.reject.mockResolvedValue(error("CONFLICT"));
    render();
    const reason = query<HTMLTextAreaElement>("#rejectionReason");
    reason.value = "ข้อความที่ต้องเก็บไว้";

    submit("ปฏิเสธคำขอ");
    await settleAction();

    expect(reason.value).toBe("ข้อความที่ต้องเก็บไว้");
    expect(mocks.reject).toHaveBeenCalledTimes(1);
    expect(mocks.approve).not.toHaveBeenCalled();
    expect(container.textContent).toContain("รายละเอียดประกอบ CONFLICT");
    expect(mocks.notify.warning).toHaveBeenCalledExactlyOnceWith(
      "คำขอนี้ถูกดำเนินการแล้ว โปรดตรวจสอบสถานะล่าสุด",
    );
  });

  it("uses a decision-specific forbidden notification", async () => {
    mocks.reject.mockResolvedValue(error("FORBIDDEN"));
    render();

    submit("ปฏิเสธคำขอ");
    await settleAction();

    expect(container.textContent).toContain("รายละเอียดประกอบ FORBIDDEN");
    expect(mocks.notify.error).toHaveBeenCalledExactlyOnceWith(
      "ไม่มีสิทธิ์ปฏิเสธคำขอโรงพยาบาล",
    );
  });

  it("keeps rejection validation inline-only and preserves the draft", async () => {
    mocks.reject.mockResolvedValue(error("INVALID_INPUT"));
    render();
    const reason = query<HTMLTextAreaElement>("#rejectionReason");
    reason.value = "ข้อมูลเหตุผลที่ยังตรวจสอบไม่ผ่าน";

    submit("ปฏิเสธคำขอ");
    await settleAction();

    expect(reason.value).toBe("ข้อมูลเหตุผลที่ยังตรวจสอบไม่ผ่าน");
    expect(container.textContent).toContain("รายละเอียดประกอบ INVALID_INPUT");
    expect(mocks.reject).toHaveBeenCalledTimes(1);
    expect(mocks.approve).not.toHaveBeenCalled();
    expectNoToast();
  });

  it("shows not-found warning feedback for a rejected application result", async () => {
    mocks.reject.mockResolvedValue(error("NOT_FOUND"));
    render();

    submit("ปฏิเสธคำขอ");
    await settleAction();

    expect(container.textContent).toContain("รายละเอียดประกอบ NOT_FOUND");
    expect(mocks.notify.warning).toHaveBeenCalledExactlyOnceWith(
      "ไม่พบคำขอที่ต้องการตรวจสอบ",
    );
    expect(mocks.approve).not.toHaveBeenCalled();
  });

  it("treats returned UNAVAILABLE and thrown rejection requests as unknown without retrying", async () => {
    mocks.reject.mockResolvedValueOnce(error("UNAVAILABLE"));
    render();

    submit("ปฏิเสธคำขอ");
    await settleAction();
    expect(findButton("โหลดข้อมูลล่าสุด")).toBeTruthy();
    expect(container.querySelectorAll("form button").item(0)?.hasAttribute("disabled")).toBe(true);
    expect(container.querySelectorAll("form button").item(1)?.hasAttribute("disabled")).toBe(true);
    expectNoToast();

    submitFromForm(0);
    expect(mocks.approve).not.toHaveBeenCalled();
    expect(mocks.reject).toHaveBeenCalledTimes(1);

    act(() => root.render(createElement(ReviewActions, { applicationId: "application-333" })));
    mocks.reject.mockRejectedValue(new TypeError("private rejection detail"));
    submit("ปฏิเสธคำขอ");
    await settleAction();
    expect(container.textContent).toContain("โหลดสถานะล่าสุดก่อนดำเนินการต่อ");
    expect(container.textContent).not.toContain("private rejection detail");
    expect(mocks.reject).toHaveBeenCalledTimes(2);
    expectNoToast();
  });

  it("blocks approval while rejection is pending and prevents a duplicate rejection", async () => {
    const response = deferred<HospitalOnboardingReviewActionState>();
    mocks.reject.mockReturnValue(response.promise);
    render();

    submit("ปฏิเสธคำขอ");
    submitFromForm(1);
    submitFromForm(0);

    expect(mocks.reject).toHaveBeenCalledTimes(1);
    expect(mocks.approve).not.toHaveBeenCalled();
    expect(findButton("อนุมัติคำขอ").disabled).toBe(true);

    await act(async () => response.resolve(success("REJECTED")));
    await settleAction();
    expect(mocks.notify.success).toHaveBeenCalledExactlyOnceWith("ปฏิเสธคำขอโรงพยาบาลแล้ว");
    expect(mocks.approve).not.toHaveBeenCalled();
  });
});

describe("ReviewActions lifecycle and context", () => {
  it("does not replay a toast or refresh after rerender", async () => {
    mocks.approve.mockResolvedValue(success("APPROVED"));
    render();

    submit("อนุมัติคำขอ");
    await settleAction();
    render();
    await settleAction();

    expect(mocks.notify.success).toHaveBeenCalledTimes(1);
    expect(mocks.router.refresh).toHaveBeenCalledTimes(1);
  });

  it("does not emit feedback or refresh when an application result arrives after unmount", async () => {
    const response = deferred<HospitalOnboardingReviewActionState>();
    mocks.approve.mockReturnValue(response.promise);
    render();

    submit("อนุมัติคำขอ");
    act(() => root.unmount());
    await act(async () => response.resolve(error("FORBIDDEN")));
    await settleAction();

    expectNoToast();
    expect(mocks.router.refresh).not.toHaveBeenCalled();
  });

  it("does not leak an error returned for application A into application B", async () => {
    const response = deferred<HospitalOnboardingReviewActionState>();
    mocks.approve.mockReturnValue(response.promise);
    render("application-A");

    submit("อนุมัติคำขอ");
    render("application-B");
    await act(async () => response.resolve(error("FORBIDDEN")));
    await settleAction();

    expect(container.textContent).not.toContain("รายละเอียดประกอบ FORBIDDEN");
    expect(container.textContent).not.toContain("ไม่มีสิทธิ์");
    expectNoToast();
    expect(mocks.router.refresh).not.toHaveBeenCalled();
  });

  it("does not render a hidden response marker into the native forms", () => {
    render();

    expect(container.querySelector('input[name="__reviewResponseMode"]')).toBeNull();
  });
});
