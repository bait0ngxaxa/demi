import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(async () => ({ userId: "admin" })),
  authorize: vi.fn(),
  list: vi.fn(async () => ({ items: [], page: 3, totalPages: 20, total: 400, hasPreviousPage: true, hasNextPage: true })),
}));
vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("@/modules/auth/services/application-access-service", () => ({ getProtectedApplicationActor: mocks.actor }));
vi.mock("@/modules/hospital-onboarding/policies/hospital-onboarding-policy", () => ({
  assertHospitalOnboardingCapability: mocks.authorize,
  HOSPITAL_ONBOARDING_CAPABILITIES: { review: "review" },
}));
vi.mock("@/modules/hospital-onboarding/services/hospital-onboarding-service", () => ({ listPendingHospitalOnboardingApplications: mocks.list }));

import HospitalOnboardingReviewPage from "./page";

describe("pending Hospital application pagination", () => {
  it("offers arbitrary page targets after the existing authorization and page load", async () => {
    const html = renderToStaticMarkup(await HospitalOnboardingReviewPage({ searchParams: Promise.resolve({ page: "3" }) }));
    expect(mocks.authorize).toHaveBeenCalledWith({ userId: "admin" }, "review");
    expect(html).toContain('aria-label="ไปหน้าที่ 5"');
    expect(html).toContain('href="/app/admin/hospital-onboarding?page=5"');
    expect(html).toContain('href="/app/admin/hospital-onboarding"');
  });
});
