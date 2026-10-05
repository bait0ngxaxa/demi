import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  getPageContext: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound, useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/modules/hospital-contact/transport/server-actions", () => ({
  readHospitalContactForOwnerAction: vi.fn(),
  updateHospitalContactAction: vi.fn(),
}));
vi.mock("@/modules/hospital-contact/transport/hospital-contact-page-context", () => ({
  getHospitalContactPageContext: mocks.getPageContext,
}));

import HospitalContactPage from "./page";

const hospitalA = "11111111-1111-4111-8111-111111111111";
const hospitalB = "22222222-2222-4222-8222-222222222222";

function pageContext(hospitalId: string) {
  return {
    hospitals: [],
    selectedHospitalId: hospitalId,
    contact: {
      hospital: { id: hospitalId, hospitalCode: hospitalId === hospitalA ? "H-001" : "H-002", name: "โรงพยาบาล" },
      addressText: null,
      phoneNumber: null,
      expectedUpdatedAt: null,
    },
  };
}

describe("Hospital Contact page-local Hospital state boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.getPageContext.mockImplementation(async (hospitalId: string) => pageContext(hospitalId));
  });

  it("keys the editor to the exact authorized Hospital so a previous selection cannot populate the next one", async () => {
    const firstHospitalPage = await HospitalContactPage({
      searchParams: Promise.resolve({ hospitalId: hospitalA }),
    });
    const secondHospitalPage = await HospitalContactPage({
      searchParams: Promise.resolve({ hospitalId: hospitalB }),
    });

    expect(mocks.getPageContext).toHaveBeenNthCalledWith(1, hospitalA);
    expect(mocks.getPageContext).toHaveBeenNthCalledWith(2, hospitalB);
    expect(firstHospitalPage.key).toBe(hospitalA);
    expect(secondHospitalPage.key).toBe(hospitalB);
    expect(firstHospitalPage.key).not.toBe(secondHospitalPage.key);
  });
});