import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError } from "@/shared/errors/application-error";

const mocks = vi.hoisted(() => ({
  getActor: vi.fn(),
  redirect: vi.fn((href: string) => {
    throw Object.assign(new Error("redirect"), { href });
  }),
  notFound: vi.fn(() => {
    throw Object.assign(new Error("notFound"), { notFound: true });
  }),
  listHospitals: vi.fn(),
  readContact: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: mocks.notFound }));
vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: mocks.getActor,
}));
vi.mock("../services/hospital-contact-service", () => ({
  listEligibleHospitalContactOwnerHospitals: mocks.listHospitals,
  readHospitalContactForOwner: mocks.readContact,
}));

import { getHospitalContactPageContext } from "./hospital-contact-page-context";

const hospitalA = "11111111-1111-4111-8111-111111111111";
const hospitalB = "22222222-2222-4222-8222-222222222222";
const hospitals = [
  { id: hospitalA, hospitalCode: "H-001", name: "โรงพยาบาล ก" },
  { id: hospitalB, hospitalCode: "H-002", name: "โรงพยาบาล ข" },
];
const contact = {
  hospital: hospitals[0],
  addressText: null,
  phoneNumber: null,
  expectedUpdatedAt: null,
};

describe("Hospital Contact Owner page context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActor.mockResolvedValue({ userId: "actor", personId: "person", roles: [], hospitalMemberships: [], osmHospitalRelationships: [] });
    mocks.listHospitals.mockResolvedValue(hospitals);
    mocks.readContact.mockResolvedValue(contact);
  });

  it("defaults to the first server-authorized Hospital when no locator is supplied", async () => {
    await expect(getHospitalContactPageContext(undefined)).resolves.toEqual({
      hospitals,
      selectedHospitalId: hospitalA,
      contact,
    });
    expect(mocks.readContact).toHaveBeenCalledWith(expect.anything(), hospitalA);
  });

  it("uses only an explicitly selected Hospital from the authorized selector", async () => {
    mocks.readContact.mockResolvedValueOnce({ ...contact, hospital: hospitals[1] });

    await expect(getHospitalContactPageContext(hospitalB)).resolves.toMatchObject({
      selectedHospitalId: hospitalB,
      contact: { hospital: hospitals[1] },
    });
    expect(mocks.readContact).toHaveBeenCalledWith(expect.anything(), hospitalB);
  });

  it("returns safe not-found for malformed or unauthorized explicit locators without falling back", async () => {
    await expect(getHospitalContactPageContext("not-a-uuid")).rejects.toMatchObject({ notFound: true });
    expect(mocks.listHospitals).not.toHaveBeenCalled();

    await expect(getHospitalContactPageContext("99999999-9999-4999-8999-999999999999"))
      .rejects.toMatchObject({ notFound: true });
    expect(mocks.readContact).not.toHaveBeenCalled();
  });

  it("redirects an owner with no eligible Hospitals and hides explicit scope denial", async () => {
    mocks.listHospitals.mockResolvedValueOnce([]);
    await expect(getHospitalContactPageContext(undefined)).rejects.toMatchObject({ href: "/app" });

    mocks.listHospitals.mockRejectedValueOnce(new ForbiddenError());
    await expect(getHospitalContactPageContext(hospitalA)).rejects.toMatchObject({ notFound: true });
    expect(mocks.readContact).not.toHaveBeenCalled();
  });

  it("rechecks selected Hospital authority before returning the page projection", async () => {
    mocks.readContact.mockRejectedValueOnce(new ForbiddenError());

    await expect(getHospitalContactPageContext(hospitalA)).rejects.toMatchObject({ notFound: true });
  });
});
