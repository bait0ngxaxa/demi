import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/modules/workforce/transport/server-actions", () => ({
  issueWorkforcePasswordResetAction: vi.fn(),
}));

import { WorkforcePasswordResetControl } from "./workforce-password-reset-control";

describe("workforce password reset control", () => {
  const html = renderToStaticMarkup(
    <WorkforcePasswordResetControl
      subjectLabel="อสม. รายนี้"
      targetHospitalId="11111111-1111-4111-8111-111111111111"
      userId="22222222-2222-4222-8222-222222222222"
    />,
  );

  it("explains the unavailable global recovery boundary in Thai", () => {
    expect(html).toContain("การกู้คืนรหัสผ่าน");
    expect(html).toContain("ยังไม่เปิดให้ผู้ดูแลรีเซ็ตรหัสผ่าน");
    expect(html).toContain("เป็นอิสระจากผู้ดูแล");
    expect(html).toContain("ยืนยันรหัสผ่านปัจจุบัน");
  });

  it("exposes no issuer confirmation, token or actionable reset form", () => {
    expect(html).not.toContain("<form");
    expect(html).not.toContain('type="checkbox"');
    expect(html).not.toContain('type="password"');
    expect(html).not.toContain('name="userId"');
  });
});
