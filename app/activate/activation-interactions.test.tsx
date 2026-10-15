// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  completePatient: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  details: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  login: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
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

import { LoginForm } from "../login/login-form";
import { PatientActivationForm } from "./patient/patient-activation-form";

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
      root.render(createElement(PatientActivationForm));
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
      root.render(createElement(PatientActivationForm));
    });
    container.querySelector<HTMLInputElement>("#patient-password")!.value = "a-strong-password";
    container.querySelector<HTMLInputElement>("#patient-password-confirmation")!.value = "a-strong-password";

    await act(async () => {
      buttonByText("เปิดใช้งานบัญชี").click();
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toContain("ระบบยังยืนยันผลการดำเนินการไม่ได้");
    expect(buttonByText("เปิดใช้งานบัญชี").disabled).toBe(true);
    expect(mocks.completePatient).toHaveBeenCalledTimes(1);
  });
});
