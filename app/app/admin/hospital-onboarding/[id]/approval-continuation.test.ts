import { HospitalOnboardingApplicationStatus } from "@prisma/client";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ApprovalContinuation } from "./approval-continuation";

describe("hospital onboarding approval continuation", () => {
  it("shows separate-login guidance only for an approved application", () => {
    const approved = renderToStaticMarkup(
      createElement(ApprovalContinuation, {
        status: HospitalOnboardingApplicationStatus.APPROVED,
      }),
    );
    const pending = renderToStaticMarkup(
      createElement(ApprovalContinuation, {
        status: HospitalOnboardingApplicationStatus.PENDING,
      }),
    );

    expect(approved).toContain("โรงพยาบาลได้รับการอนุมัติแล้ว");
    expect(approved).toContain("ผู้สมัครได้รับสถานะ Hospital Owner แล้ว");
    expect(approved).toContain('href="/login"');
    expect(pending).toBe("");
  });
});
