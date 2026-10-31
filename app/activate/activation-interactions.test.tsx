// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  completePatient: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  details: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  completeWorkforce: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  previewWorkforce: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  login: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  notifyError: vi.fn<(message: string) => void>(),
  notifySuccess: vi.fn<(message: string) => void>(),
  notifyWarning: vi.fn<(message: string) => void>(),
}));

vi.mock("@/components/ui/notify", () => ({
  notify: {
    error: mocks.notifyError,
    info: vi.fn(),
    success: mocks.notifySuccess,
    warning: mocks.notifyWarning,
  },
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/modules/patient-activation/transport/server-actions", () => ({
  completePatientActivationAction: mocks.completePatient,
  getPatientActivationDetailsAction: mocks.details,
}));
vi.mock("@/modules/auth/transport/server-actions", () => ({ loginAction: mocks.login }));
vi.mock("@/modules/workforce/transport/server-actions", () => ({
  completeWorkforceActivationAction: mocks.completeWorkforce,
  previewWorkforceActivationAction: mocks.previewWorkforce,
}));

import { LoginForm } from "../login/login-form";
import { PatientActivationForm } from "./patient/patient-activation-form";
import { WorkforceActivationForm } from "./workforce/workforce-activation-form";

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
  if (!container.textContent?.includes("เปิดใช้งานบัญชีสำเร็จ!")) {
    expect(container.querySelector('a[href^="https://liff.line.me/"]')).toBeNull();
  }
  act(() => root.unmount());
  container.remove();
  window.history.replaceState(null, "", "/");
});

function buttonByText(text: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes(text));
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
}

describe("Login form", () => {
  beforeEach(() => {
    act(() => root.render(createElement(LoginForm, { applicationAccessDenied: false, safeReturnTo: null })));
  });

  it("keeps the entered identifier after rejected credentials", async () => {
    mocks.login.mockResolvedValue({ status: "ERROR", code: "INVALID_CREDENTIALS", message: "ข้อมูลเข้าสู่ระบบไม่ถูกต้อง" });
    container.querySelector<HTMLInputElement>("#nationalId")!.value = "1234567890123";
    container.querySelector<HTMLInputElement>("#password")!.value = "secret-password";

    await act(async () => {
      buttonByText("เข้าสู่ระบบ").click();
    });

    expect(container.querySelector("#login-error")?.textContent).toBe("ข้อมูลเข้าสู่ระบบไม่ถูกต้อง");
    expect(container.querySelector<HTMLInputElement>("#nationalId")!.value).toBe("1234567890123");
  });

  it("reports an unreachable sign-in as a retryable connection failure", async () => {
    mocks.login.mockRejectedValue(new TypeError("Failed to fetch"));
    container.querySelector<HTMLInputElement>("#nationalId")!.value = "1234567890123";
    container.querySelector<HTMLInputElement>("#password")!.value = "secret-password";

    await act(async () => {
      buttonByText("เข้าสู่ระบบ").click();
    });

    expect(container.querySelector("#login-error")?.textContent).toContain("เชื่อมต่อระบบไม่สำเร็จ");
    expect(buttonByText("เข้าสู่ระบบ").disabled).toBe(false);
  });
});

describe("Patient activation form", () => {
  it("offers a retry when the activation link cannot be checked instead of loading forever", async () => {
    window.history.replaceState(null, "", "/activate/patient#token-1");
    mocks.details.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce({
      status: "AVAILABLE",
      displayName: "สมหญิง ใจดี",
      hospitalName: "โรงพยาบาลทดสอบ",
      activationExpiresAt: "2026-10-16T00:00:00.000Z",
    });

    await act(async () => {
      root.render(createElement(PatientActivationForm, { lineAccountUrl: "https://liff.line.me/1234567890-Test" }));
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toContain("ตรวจสอบลิงก์เปิดใช้งานไม่สำเร็จ");

    await act(async () => {
      buttonByText("ลองอีกครั้ง").click();
    });

    expect(mocks.details).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("บัญชีสำหรับ สมหญิง ใจดี");
  });

  it("keeps an unconfirmed activation from being submitted again", async () => {
    window.history.replaceState(null, "", "/activate/patient#token-1");
    mocks.details.mockResolvedValue({
      status: "AVAILABLE",
      displayName: "สมหญิง ใจดี",
      hospitalName: "โรงพยาบาลทดสอบ",
      activationExpiresAt: "2026-10-16T00:00:00.000Z",
    });
    mocks.completePatient.mockRejectedValue(new TypeError("Failed to fetch"));
    await act(async () => {
      root.render(createElement(PatientActivationForm, { lineAccountUrl: "https://liff.line.me/1234567890-Test" }));
    });
    container.querySelector<HTMLInputElement>("#patient-password")!.value = "a-strong-password";
    container.querySelector<HTMLInputElement>("#patient-password-confirmation")!.value = "a-strong-password";

    await act(async () => {
      buttonByText("เปิดใช้งานบัญชี").click();
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "ระบบยังยืนยันไม่ได้ว่าการเปิดใช้งานสำเร็จหรือไม่",
    );
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("หากตั้งรหัสผ่านสำเร็จ");
    expect(container.querySelector('[role="alert"] button')).toBeNull();
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector('a[href="/login"]')).not.toBeNull();
    expect(mocks.completePatient).toHaveBeenCalledTimes(1);
  });

  describe("completion results", () => {
    async function submitActivation(): Promise<void> {
      window.history.replaceState(null, "", "/activate/patient#token-1");
      mocks.details.mockResolvedValue({
        status: "AVAILABLE",
        displayName: "สมหญิง ใจดี",
        hospitalName: "โรงพยาบาลทดสอบ",
        activationExpiresAt: "2026-10-16T00:00:00.000Z",
      });
      await act(async () => {
        root.render(createElement(PatientActivationForm, { lineAccountUrl: "https://liff.line.me/1234567890-Test" }));
      });
      container.querySelector<HTMLInputElement>("#patient-password")!.value = "a-strong-password";
      container.querySelector<HTMLInputElement>("#patient-password-confirmation")!.value = "a-strong-password";
      await act(async () => {
        buttonByText("เปิดใช้งานบัญชี").click();
      });
    }

    it("treats a returned UNAVAILABLE as unconfirmed instead of a failure to retry", async () => {
      mocks.completePatient.mockResolvedValue({
        status: "ERROR",
        code: "UNAVAILABLE",
        message: "ระบบยังไม่สามารถเปิดใช้งานบัญชีได้ กรุณาลองใหม่หรือติดต่อโรงพยาบาล",
      });

      await submitActivation();

      const alert = container.querySelector('[role="alert"]')?.textContent;
      expect(alert).toContain("ระบบยังยืนยันไม่ได้ว่าการเปิดใช้งานสำเร็จหรือไม่");
      expect(container.textContent).not.toContain("กรุณาลองใหม่หรือติดต่อโรงพยาบาล");
      expect(container.querySelector("form")).toBeNull();
      expect(container.querySelector('a[href="/login"]')).not.toBeNull();
      expect(mocks.completePatient).toHaveBeenCalledTimes(1);
      expect(mocks.notifyError).not.toHaveBeenCalled();
      expect(mocks.notifySuccess).not.toHaveBeenCalled();
    });

    it("keeps invalid passwords inline and editable without a Toast", async () => {
      mocks.completePatient.mockResolvedValue({
        status: "ERROR",
        code: "INVALID_INPUT",
        message: "กรุณาตรวจสอบรหัสผ่านให้ถูกต้อง",
        fieldErrors: { password: "รหัสผ่านต้องมีความยาว 12–128 ตัวอักษร" },
      });

      await submitActivation();

      expect(container.querySelector("#patient-password-error")?.textContent).toContain("12–128");
      expect(buttonByText("เปิดใช้งานบัญชี").disabled).toBe(false);
      expect(mocks.notifyError).not.toHaveBeenCalled();
      expect(mocks.notifySuccess).not.toHaveBeenCalled();
      expect(mocks.notifyWarning).not.toHaveBeenCalled();
    });

    it("explains when a link is expired or already used without claiming success", async () => {
      mocks.completePatient.mockResolvedValue({
        status: "ERROR",
        code: "CONFLICT",
        message: "ลิงก์เปิดใช้งานไม่ถูกต้องหรือหมดอายุ",
      });

      await submitActivation();

      expect(container.textContent).toContain("ลิงก์นี้ใช้ไม่ได้แล้ว");
      expect(container.textContent).toContain("อาจหมดอายุหรือถูกใช้ไปแล้ว");
      expect(container.textContent).not.toContain("ตั้งรหัสผ่านสำเร็จแล้ว");
      expect(document.activeElement).toBe(container.querySelector('[role="status"]'));
      expect(container.querySelector("form")).toBeNull();
      expect(mocks.notifyError).not.toHaveBeenCalled();
      expect(mocks.notifyWarning).not.toHaveBeenCalled();
    });

    it("shows a persistent login confirmation after patient activation succeeds", async () => {
      mocks.completePatient.mockResolvedValue({ status: "SUCCESS" });

      await submitActivation();

      const status = container.querySelector('[role="status"]');
      expect(container.querySelector('a[href="https://liff.line.me/1234567890-Test"]')).not.toBeNull();
      expect(mocks.login).not.toHaveBeenCalled();
      expect(window.location.pathname).toBe("/activate/patient");
      expect(window.location.hash).toBe("");
      expect(container.textContent).toContain("เปิดใช้งานบัญชีสำเร็จ!");
      expect(container.textContent).toContain("บัญชี DEMI ของคุณพร้อมใช้งานแล้ว");
      expect(container.querySelector('a[href="/login"]')?.textContent).toContain("เข้าสู่ระบบผ่านเว็บก่อน");
      expect(container.querySelector("form")).toBeNull();
      expect(status?.getAttribute("aria-live")).toBe("off");
      expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
      expect(document.activeElement).toBe(status);
      expect(mocks.completePatient).toHaveBeenCalledTimes(1);
      expect(mocks.notifySuccess).not.toHaveBeenCalled();
    });

    it("offers recovery guidance for an expired or consumed patient link", async () => {
      window.history.replaceState(null, "", "/activate/patient#token-1");
      mocks.details.mockResolvedValue({
        status: "INVALID",
        message: "ลิงก์เปิดใช้งานไม่ถูกต้องหรือหมดอายุ",
      });

      await act(async () => {
        root.render(createElement(PatientActivationForm, { lineAccountUrl: "https://liff.line.me/1234567890-Test" }));
      });

      expect(container.textContent).toContain("ลิงก์เปิดใช้งานไม่ถูกต้องหรือหมดอายุ");
      expect(container.textContent).toContain("ขอลิงก์ใหม่จากโรงพยาบาล");
      expect(container.querySelector('[role="alert"]')?.getAttribute("aria-live")).toBe("off");
      expect(document.activeElement).toBe(container.querySelector('[role="alert"]'));
      expect(container.querySelector("form")).toBeNull();
    });
  });

  it.each([
    {
      purpose: "ACTIVATION" as const,
      label: "เปิดใช้งานบัญชี",
      pendingLabel: "กำลังเปิดใช้งานบัญชี...",
      successTitle: "เปิดใช้งานบัญชีสำเร็จ!",
    },
    {
      purpose: "RESET" as const,
      label: "ตั้งรหัสผ่านใหม่",
      pendingLabel: "กำลังตั้งรหัสผ่าน...",
      successTitle: "ตั้งรหัสผ่านใหม่สำเร็จแล้ว",
    },
    {
      purpose: "CHILD_OWNER_ONBOARDING" as const,
      label: "เปิดใช้งานบัญชี",
      pendingLabel: "กำลังเปิดใช้งานบัญชี...",
      successTitle: "เปิดใช้งานบัญชีสำเร็จ!",
    },
  ])("shows a purpose-specific confirmed completion for $purpose", async ({ purpose, label, pendingLabel, successTitle }) => {
    window.history.replaceState(null, "", "/activate/workforce#token-1");
    mocks.previewWorkforce.mockResolvedValue({ status: "SUCCESS", maskedName: "ส*** ใจ***", purpose });
    let finishCompletion: (() => void) | null = null;
    mocks.completeWorkforce.mockImplementation(
      () => new Promise((resolve) => {
        finishCompletion = () => resolve({ status: "SUCCESS" });
      }),
    );

    await act(async () => {
      root.render(createElement(WorkforceActivationForm, { lineAccountUrl: "https://liff.line.me/1234567890-Test" }));
      await Promise.resolve();
    });
    expect(Boolean(container.querySelector('ol[aria-label="ขั้นตอนเริ่มใช้งาน DEMI"]'))).toBe(purpose !== "RESET");
    container.querySelector<HTMLInputElement>("#nationalId")!.value = "1000000000009";
    container.querySelector<HTMLInputElement>("#password")!.value = "a-strong-password";
    container.querySelector<HTMLInputElement>("#passwordConfirmation")!.value = "a-strong-password";

    await act(async () => {
      buttonByText(label).click();
      await Promise.resolve();
    });

    expect(buttonByText(pendingLabel).disabled).toBe(true);
    expect(container.querySelector('a[href^="https://liff.line.me/"]')).toBeNull();

    await act(async () => {
      finishCompletion?.();
    });

    expect(container.textContent).toContain(successTitle);
    expect(container.querySelector('a[href="/login"]')?.textContent).toContain(purpose === "RESET" ? "ไปหน้าเข้าสู่ระบบ" : "เข้าสู่ระบบผ่านเว็บก่อน");
    expect(Boolean(container.querySelector('a[href^="https://liff.line.me/"]'))).toBe(purpose !== "RESET");
    expect(container.textContent?.includes("ขั้นตอนถัดไป: เชื่อม LINE")).toBe(purpose !== "RESET");
    expect(container.querySelector("form")).toBeNull();
    const status = container.querySelector('[role="status"]');
    expect(status?.getAttribute("aria-live")).toBe("off");
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(document.activeElement).toBe(status);
    expect(mocks.completeWorkforce).toHaveBeenCalledTimes(1);
    expect(mocks.login).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe("/activate/workforce");
  });

  it("names the invited Hospital and platform ADMIN on a Parent OWNER invitation link (ADR-0024)", async () => {
    window.history.replaceState(null, "", "/activate/workforce#token-1");
    mocks.previewWorkforce.mockResolvedValue({
      status: "SUCCESS", maskedName: "ส*** ใจ***", purpose: "PARENT_OWNER_ONBOARDING", hospitalName: "โรงพยาบาลชุมชนใหม่",
    });

    await act(async () => {
      root.render(createElement(WorkforceActivationForm, { lineAccountUrl: "https://liff.line.me/1234567890-Test" }));
      await Promise.resolve();
    });

    expect(container.textContent).toContain("เปิดใช้งานบัญชีผู้ดูแลโรงพยาบาลของ ส*** ใจ***");
    expect(container.textContent).toContain("คำเชิญจากผู้ดูแลระบบ DEMI ให้เป็นผู้ดูแล โรงพยาบาลชุมชนใหม่");
    expect(container.querySelector("#nationalId")).not.toBeNull();
  });

  it.each(["CONFLICT", "FORBIDDEN", "UNAVAILABLE", "INVALID_INPUT"])("never offers LINE onboarding for a workforce %s completion", async (code) => {
    window.history.replaceState(null, "", "/activate/workforce#token-1");
    mocks.previewWorkforce.mockResolvedValue({ status: "SUCCESS", maskedName: "ส***", purpose: "ACTIVATION" });
    mocks.completeWorkforce.mockResolvedValue({ status: "ERROR", code, message: "ดำเนินการไม่สำเร็จ" });
    await act(async () => root.render(createElement(WorkforceActivationForm, { lineAccountUrl: "https://liff.line.me/1234567890-Test" })));
    container.querySelector<HTMLInputElement>("#nationalId")!.value = "1000000000009";
    container.querySelector<HTMLInputElement>("#password")!.value = "a-strong-password";
    container.querySelector<HTMLInputElement>("#passwordConfirmation")!.value = "a-strong-password";
    await act(async () => buttonByText("เปิดใช้งานบัญชี").click());
    expect(container.textContent).not.toContain("เปิดใช้งานบัญชีสำเร็จ!");
    expect(container.querySelector('a[href^="https://liff.line.me/"]')).toBeNull();
    expect(mocks.completeWorkforce).toHaveBeenCalledOnce();
  });

  it("does not introduce onboarding for an expired or consumed workforce invitation", async () => {
    window.history.replaceState(null, "", "/activate/workforce#token-1");
    mocks.previewWorkforce.mockResolvedValue({ status: "ERROR", message: "ลิงก์หมดอายุหรือถูกใช้แล้ว" });
    await act(async () => root.render(createElement(WorkforceActivationForm, { lineAccountUrl: "https://liff.line.me/1234567890-Test" })));
    expect(container.textContent).toContain("ลิงก์หมดอายุหรือถูกใช้แล้ว");
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector("ol")).toBeNull();
    expect(mocks.completeWorkforce).not.toHaveBeenCalled();
  });

  it("checks a one-time workforce activation through account sign-in guidance, not token replay", async () => {
    window.history.replaceState(null, "", "/activate/workforce#token-1");
    mocks.previewWorkforce.mockResolvedValue({
      status: "SUCCESS",
      maskedName: "ส*** ใจ***",
      purpose: "ACTIVATION",
    });
    mocks.completeWorkforce.mockRejectedValue(new TypeError("Failed to fetch"));

    await act(async () => {
      root.render(createElement(WorkforceActivationForm, { lineAccountUrl: "https://liff.line.me/1234567890-Test" }));
    });
    container.querySelector<HTMLInputElement>("#nationalId")!.value = "1000000000009";
    container.querySelector<HTMLInputElement>("#password")!.value = "a-strong-password";
    container.querySelector<HTMLInputElement>("#passwordConfirmation")!.value = "a-strong-password";

    await act(async () => buttonByText("เปิดใช้งานบัญชี").click());

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "ระบบยังยืนยันไม่ได้ว่าการเปิดใช้งานสำเร็จหรือไม่",
    );
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "ลองเข้าสู่ระบบด้วยรหัสผ่านที่ตั้งไว้",
    );
    expect(container.querySelector('[role="alert"] button')).toBeNull();
    expect(container.textContent).not.toContain("ตรวจสอบผลด้วยคำขอเดิม");
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector('a[href="/login"]')).not.toBeNull();
    expect(mocks.completeWorkforce).toHaveBeenCalledTimes(1);
  });

  it("offers recovery guidance when a workforce link is expired or already used", async () => {
    window.history.replaceState(null, "", "/activate/workforce#token-1");
    mocks.previewWorkforce.mockResolvedValue({
      status: "ERROR",
      message: "ลิงก์เปิดใช้งานไม่ถูกต้องหรือหมดอายุ",
    });

    await act(async () => {
      root.render(createElement(WorkforceActivationForm, { lineAccountUrl: "https://liff.line.me/1234567890-Test" }));
      await Promise.resolve();
    });

    expect(container.textContent).toContain("ลิงก์เปิดใช้งานไม่ถูกต้องหรือหมดอายุ");
    expect(container.textContent).toContain("ขอลิงก์ใหม่จากผู้ดูแลโรงพยาบาล");
    expect(container.querySelector('[role="alert"]')?.getAttribute("aria-live")).toBe("off");
    expect(document.activeElement).toBe(container.querySelector('[role="alert"]'));
    expect(container.querySelector("form")).toBeNull();
  });
});
