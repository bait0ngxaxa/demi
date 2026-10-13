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

  it("explains the in-person assisted flow and never asks the issuer for a password", () => {
    expect(html).toContain("รีเซ็ตรหัสผ่าน (ต่อหน้า)");
    expect(html).toContain("15 นาที");
    expect(html).toContain("ห้ามกรอกรหัสผ่านแทนผู้ใช้");
    expect(html).not.toContain('type="password"');
  });

  it("submits only the target user and Hospital, and stays disabled until in-person identity is confirmed", () => {
    expect(html).toContain('name="userId"');
    expect(html).toContain('value="22222222-2222-4222-8222-222222222222"');
    expect(html).toContain('name="targetHospitalId"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*type="submit"|<button[^>]*type="submit"[^>]*disabled=""/);
    expect(html).toContain("ยืนยันตัวตนของเจ้าของบัญชีต่อหน้าแล้ว");
  });
});
