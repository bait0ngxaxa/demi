// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ useActionState: vi.fn(), check: vi.fn() }));
vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<typeof import("react")>()), useActionState: mocks.useActionState }));
vi.mock("@/modules/account-security/transport/server-actions", () => ({
  checkMediatedPasswordResetAction: mocks.check,
  completeMediatedPasswordResetAction: vi.fn(),
}));

import { PublicAccountRecoveryForm } from "./public-account-recovery-form";

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  mocks.check.mockReset().mockResolvedValue({ status: "READY", expiresAt: "2026-10-23T03:00:00.000Z", mode: "ONLINE", confirmationKind: "THAI_NATIONAL_ID" });
  mocks.useActionState.mockReturnValue([{ status: "IDLE" }, vi.fn(), false]);
  window.history.replaceState(null, "", `/recover#${"z".repeat(43)}`);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("public account recovery", () => {
  it("offers both the Hospital and LINE recovery paths", async () => {
    window.history.replaceState(null, "", "/recover");

    await act(async () => root.render(createElement(PublicAccountRecoveryForm, { lineRecoveryAvailable: true })));
    expect(container.textContent).toContain("ติดต่อโรงพยาบาลเพื่อยืนยันตัวตน");
    expect(container.textContent).toContain("ลืมรหัสผ่าน · รับลิงก์ทาง LINE");
    expect(container.querySelector('a[href="/recover/line"]')).not.toBeNull();
  });

  it("keeps tokenized REC-1 links on the existing mediated-reset form", async () => {
    await act(async () => {
      root.render(createElement(PublicAccountRecoveryForm));
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mocks.check).toHaveBeenCalledWith("z".repeat(43));
    expect(container.textContent).toContain("ตั้งรหัสผ่านใหม่");
    expect(container.querySelector('input[name="nationalId"]')).not.toBeNull();
    expect(container.querySelector('input[name="newPassword"]')).not.toBeNull();
  });

  it("confirms a Platform ADMIN account with its registered login identifier while retaining the proof explanation", async () => {
    mocks.check.mockResolvedValue({
      status: "READY",
      expiresAt: "2026-10-23T03:00:00.000Z",
      mode: "ONLINE",
      confirmationKind: "PLATFORM_ADMIN_IDENTIFIER",
    });

    await act(async () => {
      root.render(createElement(PublicAccountRecoveryForm));
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.querySelector('input[name="platformAdminIdentifier"]')).not.toBeNull();
    expect(container.querySelector('input[name="nationalId"]')).toBeNull();
    expect(container.textContent).toContain("ตัวระบุเข้าสู่ระบบ ADMIN ที่ลงทะเบียนไว้");
    expect(container.textContent).toContain("ไม่ใช้แทนการตรวจสอบตัวตน");
    expect(container.textContent).toContain("ลิงก์ออนไลน์ใช้ได้ 24 ชั่วโมง");
  });

  it("hides the LINE entry and directs users to the Hospital process when LINE is not configured", async () => {
    window.history.replaceState(null, "", "/recover");

    await act(async () => root.render(createElement(PublicAccountRecoveryForm, { lineRecoveryAvailable: false })));

    expect(container.textContent).toContain("ช่องทางนี้ยังไม่พร้อม");
    expect(container.querySelector('a[href="/recover/line"]')).toBeNull();
    expect(container.querySelector('a[href="#recover-hospital"]')?.textContent).toBe("ดูวิธีติดต่อโรงพยาบาล");
    expect(container.querySelector("#recover-hospital")?.textContent).toContain("กรุณาติดต่อโรงพยาบาลที่ดูแลเพื่อขอความช่วยเหลือ");
  });

  it("keeps the reset form usable and marks the password field when provider policy rejects it", async () => {
    mocks.useActionState.mockReturnValue([
      { status: "ERROR", message: "ยังไม่ได้เปลี่ยนรหัสผ่าน", fieldErrors: { newPassword: "รหัสผ่านนี้ไม่ผ่านนโยบายความปลอดภัย" } },
      vi.fn(),
      false,
    ]);

    await act(async () => {
      root.render(createElement(PublicAccountRecoveryForm));
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const password = container.querySelector<HTMLInputElement>('input[name="newPassword"]');
    expect(password?.getAttribute("aria-invalid")).toBe("true");
    const describedBy = password?.getAttribute("aria-describedby");
    expect(describedBy && container.querySelector(`#${describedBy}`)?.textContent).toBe("รหัสผ่านนี้ไม่ผ่านนโยบายความปลอดภัย");
    expect(container.querySelector('button[type="submit"]')).not.toBeNull();
  });
});
