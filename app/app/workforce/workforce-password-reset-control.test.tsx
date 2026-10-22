import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/modules/workforce/transport/server-actions", () => ({
  issueWorkforcePasswordResetAction: vi.fn(),
}));

import { WorkforcePasswordResetControl } from "./workforce-password-reset-control";

describe("workforce password reset control", () => {
  const html = renderToStaticMarkup(
    <WorkforcePasswordResetControl
      relationshipId="33333333-3333-4333-8333-333333333333"
      targetKind="osm"
      subjectLabel="อสม. รายนี้"
    />,
  );

  it("directs callers to the mediated recovery entry point in Thai", () => {
    expect(html).toContain("การกู้คืนรหัสผ่าน");
    expect(html).toContain("หน้ารายละเอียดผู้ใช้");
    expect(html).toContain("วิธียืนยันตัวตน");
    expect(html).toContain("ยืนยันรหัสผ่านปัจจุบัน");
  });

  it("exposes no issuer confirmation, token or actionable reset form", () => {
    expect(html).not.toContain("<form");
    expect(html).not.toContain('type="checkbox"');
    expect(html).not.toContain('type="password"');
    expect(html).not.toContain('name="userId"');
    expect(html).toContain("/app/users/osm/33333333-3333-4333-8333-333333333333");
  });
});
