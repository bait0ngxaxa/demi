import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  notFound: vi.fn(),
  getPageContext: vi.fn(),
  readContact: vi.fn(),
  updateContact: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/modules/hospital-contact/transport/hospital-contact-page-context", () => ({
  getHospitalContactPageContext: mocks.getPageContext,
}));
vi.mock("@/modules/hospital-contact/transport/server-actions", () => ({
  readHospitalContactForOwnerAction: mocks.readContact,
  updateHospitalContactAction: mocks.updateContact,
}));

import HospitalContactPage from "./page";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const otherHospitalId = "22222222-2222-4222-8222-222222222222";

describe("Hospital Contact Work route boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.notFound.mockImplementation(() => {
      throw Object.assign(new Error("notFound"), { notFound: true });
    });
  });

  it("rejects repeated Hospital locators instead of guessing a selected scope", async () => {
    await expect(
      HospitalContactPage({ searchParams: Promise.resolve({ hospitalId: [hospitalId, otherHospitalId] }) }),
    ).rejects.toMatchObject({ notFound: true });
    expect(mocks.getPageContext).not.toHaveBeenCalled();
  });

  it("passes a single explicit page-local locator to fresh server authorization", async () => {
    mocks.getPageContext.mockResolvedValue({
      hospitals: [],
      selectedHospitalId: hospitalId,
      contact: {
        hospital: { id: hospitalId, hospitalCode: "H-001", name: "โรงพยาบาล ก" },
        addressText: null,
        phoneNumber: null,
        expectedUpdatedAt: null,
      },
    });

    await HospitalContactPage({ searchParams: Promise.resolve({ hospitalId: [hospitalId] }) });

    expect(mocks.connection).toHaveBeenCalledOnce();
    expect(mocks.getPageContext).toHaveBeenCalledWith(hospitalId);
  });

  it("lets the server choose the first authorized Hospital only when no locator was supplied", async () => {
    mocks.getPageContext.mockResolvedValue({
      hospitals: [],
      selectedHospitalId: hospitalId,
      contact: {
        hospital: { id: hospitalId, hospitalCode: "H-001", name: "โรงพยาบาล ก" },
        addressText: null,
        phoneNumber: null,
        expectedUpdatedAt: null,
      },
    });

    await HospitalContactPage({ searchParams: Promise.resolve({}) });

    expect(mocks.getPageContext).toHaveBeenCalledWith(undefined);
  });
});
