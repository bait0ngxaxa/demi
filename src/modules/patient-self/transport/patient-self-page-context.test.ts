import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@prisma/client";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { resolveOwnPatientContext } from "@/modules/patient-self/services/patient-self-query-service";
import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";

import { getPatientSelfPageContext } from "./patient-self-page-context";

const { mockedRedirect } = vi.hoisted(() => ({ mockedRedirect: vi.fn() }));

vi.mock("next/navigation", () => ({ redirect: mockedRedirect }));
vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: vi.fn(),
}));
vi.mock("@/modules/patient-self/services/patient-self-query-service", () => ({
  resolveOwnPatientContext: vi.fn(),
}));

const actor = {
  userId: "22222222-2222-4222-8222-222222222222",
  personId: "33333333-3333-4333-8333-333333333333",
  roles: [Role.PATIENT],
  hospitalMemberships: [],
  osmHospitalRelationships: [],
};

describe("Patient self page context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getProtectedApplicationActor).mockResolvedValue(actor);
    vi.mocked(resolveOwnPatientContext).mockResolvedValue(null);
    mockedRedirect.mockImplementation((path: string) => {
      throw new Error(`NEXT_REDIRECT:${path}`);
    });
  });

  it("resolves the own Patient scope using only the current authenticated ActorContext", async () => {
    const context = {
      person: { givenName: "สมชาย", familyName: "ใจดี" },
      profile: {
        phoneNumber: null,
        addressText: null,
      },
      hospitalRelationships: [],
    };
    vi.mocked(resolveOwnPatientContext).mockResolvedValue(context);

    await expect(getPatientSelfPageContext()).resolves.toEqual(context);
    expect(resolveOwnPatientContext).toHaveBeenCalledWith(actor);
  });

  it.each([new UnauthenticatedError(), new ForbiddenError()])(
    "redirects an actor that cannot enter the authenticated application (%s)",
    async (error) => {
      vi.mocked(getProtectedApplicationActor).mockRejectedValue(error);

      await expect(getPatientSelfPageContext()).rejects.toThrow("NEXT_REDIRECT:/login");
      expect(mockedRedirect).toHaveBeenCalledWith("/login");
      expect(resolveOwnPatientContext).not.toHaveBeenCalled();
    },
  );

  it("returns the safe incomplete result when no valid PatientProfile resolves", async () => {
    await expect(getPatientSelfPageContext()).resolves.toBeNull();
  });

  it("redirects a non-Patient actor away from Personal without widening its scope", async () => {
    vi.mocked(resolveOwnPatientContext).mockRejectedValue(new ForbiddenError());

    await expect(getPatientSelfPageContext()).rejects.toThrow("NEXT_REDIRECT:/app");
    expect(mockedRedirect).toHaveBeenCalledWith("/app");
  });
});
