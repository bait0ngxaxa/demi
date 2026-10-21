import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connection: vi.fn().mockResolvedValue(undefined),
  listHospitals: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("@/modules/hospital-onboarding/services/onboarding-hospital-service", () => ({
  listOnboardingHospitals: mocks.listHospitals,
}));
vi.mock("./onboarding-form", () => ({ HospitalOnboardingForm: () => null }));

import HospitalOnboardingPage from "./page";

describe("Hospital onboarding language", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listHospitals.mockResolvedValue([]);
  });

  it("describes the Hospital list as available in DEMI and keeps approval pending", async () => {
    const markup = renderToStaticMarkup(await HospitalOnboardingPage());

    expect(markup).toContain("ขอใช้งาน DEMI สำหรับโรงพยาบาล");
    expect(markup).toContain("รายชื่อในระบบ");
    expect(markup).toContain("บัญชีจะเข้าใช้งานได้เมื่อคำขอได้รับอนุมัติ");
    expect(markup).not.toContain("DEMI รับรอง");
  });
});
