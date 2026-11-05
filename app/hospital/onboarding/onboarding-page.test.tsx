import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connection: vi.fn().mockResolvedValue(undefined),
  formProps: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("@/modules/legal/transport/legal-page-context", async () => ({
  getAccountCreationLegalView: async () => (await import("../../../tests/support/legal-fixtures")).accountCreationLegalViewFixture(),
}));
vi.mock("./onboarding-form", () => ({
  HospitalOnboardingForm: (props: Record<string, unknown>) => {
    mocks.formProps(props);
    return null;
  },
}));

import HospitalOnboardingPage from "./page";

describe("Hospital onboarding language", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("describes the Hospital list as available in DEMI and keeps approval pending", async () => {
    const markup = renderToStaticMarkup(await HospitalOnboardingPage());

    expect(markup).toContain("ขอใช้งาน DEMI สำหรับโรงพยาบาล");
    expect(markup).toContain("รายชื่อในระบบ");
    expect(markup).toContain("บัญชีจะเข้าใช้งานได้เมื่อคำขอได้รับอนุมัติ");
    expect(markup).not.toContain("DEMI รับรอง");
  });

  it("ships no Hospital registry with the page: the applicant searches on the server", async () => {
    renderToStaticMarkup(await HospitalOnboardingPage());

    expect(mocks.formProps).toHaveBeenCalledTimes(1);
    expect(Object.keys(mocks.formProps.mock.calls[0]?.[0] ?? {})).toEqual(["legal"]);
  });
});
