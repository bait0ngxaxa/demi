import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const recoveryConfiguration = vi.hoisted(() => ({ requestAvailable: true }));

vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("@/modules/line/services/line-password-recovery-configuration", () => ({
  isLinePasswordRecoveryRequestConfigured: () => recoveryConfiguration.requestAvailable,
}));

import LineRecoveryEntryPage from "./page";

describe("LINE recovery entry route", () => {
  it("renders the generic national-ID request form", async () => {
    recoveryConfiguration.requestAvailable = true;
    const markup = renderToStaticMarkup(await LineRecoveryEntryPage());
    expect(markup).toContain("รับลิงก์ทาง LINE");
    expect(markup).toContain('name="nationalId"');
  });

  it("shows the Hospital fallback without rendering a request form when LINE is unavailable", async () => {
    recoveryConfiguration.requestAvailable = false;
    const markup = renderToStaticMarkup(await LineRecoveryEntryPage());

    expect(markup).toContain("กู้คืนรหัสผ่านผ่าน LINE ยังไม่พร้อมให้บริการ");
    expect(markup).toContain('href="/recover#recover-hospital"');
    expect(markup).not.toContain('name="nationalId"');
    expect(markup).not.toContain("DEMI_LINE_MESSAGING");
  });
});
