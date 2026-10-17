import { HospitalOnboardingApplicationStatus, Role } from "@prisma/client";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  application: vi.fn(),
  connection: vi.fn(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  redirect: mocks.redirect,
}));

vi.mock("next/server", () => ({ connection: mocks.connection }));

vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: mocks.actor,
}));

vi.mock("@/modules/hospital-onboarding/services/hospital-onboarding-service", () => ({
  getHospitalOnboardingApplication: mocks.application,
}));

vi.mock("./review-actions", () => ({
  ReviewActions: (props: { applicationId: string }) =>
    createElement("form", { "data-review-actions": props.applicationId }),
}));

import HospitalOnboardingDetailPage from "./page";

const APPLICATION_ID = "33333333-3333-4333-8333-333333333333";

function application(
  status: HospitalOnboardingApplicationStatus,
): Record<string, unknown> {
  const terminal = status !== HospitalOnboardingApplicationStatus.PENDING;
  return {
    id: APPLICATION_ID,
    status,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    reviewedAt: terminal ? new Date("2026-09-02T00:00:00.000Z") : null,
    hospitalCode: "KANG",
    hospitalName: "โรงพยาบาลตัวอย่าง",
    applicantGivenName: "สมชาย",
    applicantFamilyName: "ใจดี",
    rejectionReason:
      status === HospitalOnboardingApplicationStatus.REJECTED
        ? "เอกสารประกอบยังไม่ครบ"
        : null,
    reviewerName: terminal ? "ผู้ดูแลระบบ" : null,
  };
}

describe("Hospital onboarding detail decision status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actor.mockResolvedValue({
      userId: "11111111-1111-4111-8111-111111111111",
      personId: "22222222-2222-4222-8222-222222222222",
      roles: [Role.ADMIN],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    });
    mocks.connection.mockResolvedValue(undefined);
  });

  async function renderStatus(
    status: HospitalOnboardingApplicationStatus,
  ): Promise<string> {
    mocks.application.mockResolvedValue(application(status));
    const page = await HospitalOnboardingDetailPage({
      params: Promise.resolve({ id: APPLICATION_ID }),
    });
    return renderToStaticMarkup(page);
  }

  it("keeps review controls available only while the application is pending", async () => {
    const pending = await renderStatus(HospitalOnboardingApplicationStatus.PENDING);
    const approved = await renderStatus(HospitalOnboardingApplicationStatus.APPROVED);
    const rejected = await renderStatus(HospitalOnboardingApplicationStatus.REJECTED);

    expect(pending).toContain('data-review-actions="' + APPLICATION_ID + '"');
    expect(approved).not.toContain("data-review-actions");
    expect(rejected).not.toContain("data-review-actions");
  });

  it("shows the authoritative approved continuation without inferring a Toast", async () => {
    const markup = await renderStatus(HospitalOnboardingApplicationStatus.APPROVED);

    expect(markup).toContain("อนุมัติแล้ว");
    expect(markup).toContain("โรงพยาบาลได้รับการอนุมัติแล้ว");
    expect(markup).toContain("ไปหน้าเข้าสู่ระบบ");
    expect(markup).not.toContain("data-review-actions");
  });

  it("keeps the authoritative rejection reason and terminal explanation", async () => {
    const markup = await renderStatus(HospitalOnboardingApplicationStatus.REJECTED);

    expect(markup).toContain("ปฏิเสธแล้ว");
    expect(markup).toContain("เอกสารประกอบยังไม่ครบ");
    expect(markup).toContain("คำขอนี้ถูกตัดสินแล้ว");
    expect(markup).not.toContain("data-review-actions");
  });
});
