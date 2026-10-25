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
  mocks.check.mockReset().mockResolvedValue({ status: "READY", expiresAt: "2026-10-23T03:00:00.000Z", mode: "ONLINE" });
  window.history.replaceState(null, "", `/recover#${"z".repeat(43)}`);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("public mediated reset form", () => {
  it("offers Hospital recovery and keeps the future LINE entry behind its feature flag", async () => {
    window.history.replaceState(null, "", "/recover");
    mocks.useActionState.mockReturnValue([{ status: "IDLE" }, vi.fn(), false]);

    await act(async () => root.render(createElement(PublicAccountRecoveryForm)));

    expect(container.textContent).toContain("ติดต่อโรงพยาบาลเพื่อยืนยันตัวตน");
    expect(container.textContent).not.toContain("ลืมรหัสผ่าน · รับลิงก์ทาง LINE");

    await act(async () => root.render(createElement(PublicAccountRecoveryForm, { lineRecoveryEnabled: true })));

    expect(container.textContent).toContain("ลืมรหัสผ่าน · รับลิงก์ทาง LINE");
    expect(container.querySelector('a[href="/recover/line"]')).not.toBeNull();
  });

  it("keeps the form usable and marks the password field when the provider rejects the password by policy", async () => {
    mocks.useActionState.mockReturnValue([
      { status: "ERROR", message: "ยังไม่ได้เปลี่ยนรหัสผ่าน", fieldErrors: { newPassword: "รหัสผ่านนี้ไม่ผ่านนโยบายความปลอดภัย" } },
      vi.fn(),
      false,
    ]);

    await act(async () => {
      root.render(createElement(PublicAccountRecoveryForm));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const password = container.querySelector<HTMLInputElement>('input[name="newPassword"]');
    expect(password?.getAttribute("aria-invalid")).toBe("true");
    const describedBy = password?.getAttribute("aria-describedby");
    expect(describedBy && container.querySelector(`#${describedBy}`)?.textContent).toBe("รหัสผ่านนี้ไม่ผ่านนโยบายความปลอดภัย");
    expect(container.querySelector('button[type="submit"]')).not.toBeNull();
  });
});
