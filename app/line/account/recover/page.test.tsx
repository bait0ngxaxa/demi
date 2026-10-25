import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const recoveryConfiguration = vi.hoisted(() => ({ completionAvailable: false }));

vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("@/modules/line/services/line-password-recovery-configuration", () => ({
  isLinePasswordRecoveryCompletionConfigured: () => recoveryConfiguration.completionAvailable,
}));

import LinePasswordRecoveryPage from "./page";

describe("LINE recovery completion entry", () => {
  it("provides the Hospital fallback without opening a fake recovery state when completion config is unavailable", async () => {
    recoveryConfiguration.completionAvailable = false;
    const markup = renderToStaticMarkup(await LinePasswordRecoveryPage());

    expect(markup).toContain("กู้คืนรหัสผ่านผ่าน LINE ยังไม่พร้อมให้บริการ");
    expect(markup).toContain('href="/recover#recover-hospital"');
    expect(markup).not.toContain("กำลังยืนยันบัญชี LINE");
    expect(markup).not.toContain("DEMI_LINE_LOGIN_CHANNEL_ID");
  });
});
