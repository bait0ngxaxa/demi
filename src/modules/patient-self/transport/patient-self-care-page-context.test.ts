import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@prisma/client";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { LINE_WEB_NAVIGATION_PATHS } from "@/modules/line/domain/line-navigation-intents";
import { getOwnPatientCareJourney } from "@/modules/patient-self/services/patient-self-care-query-service";
import { listOwnPatientRelationshipNavigation } from "@/modules/patient-self/services/patient-self-query-service";
import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";

import { PATIENT_ACCESS_UNAVAILABLE } from "./patient-access-unavailable";
import {
  getPatientSelfCareJourneyPageContext,
  getPatientSelfRelationshipNavigationPageContext,
} from "./patient-self-care-page-context";

const { mockedRedirect } = vi.hoisted(() => ({ mockedRedirect: vi.fn() }));

vi.mock("next/navigation", () => ({ redirect: mockedRedirect, notFound: vi.fn() }));
vi.mock("@/modules/auth/services/application-access-service", () => ({ getProtectedApplicationActor: vi.fn() }));
vi.mock("@/modules/patient-self/services/patient-self-query-service", () => ({ listOwnPatientRelationshipNavigation: vi.fn() }));
vi.mock("@/modules/patient-self/services/patient-self-care-query-service", () => ({ getOwnPatientCareJourney: vi.fn() }));

const workforceActor = {
  userId: "22222222-2222-4222-8222-222222222222",
  personId: "33333333-3333-4333-8333-333333333333",
  roles: [Role.OSM],
  hospitalMemberships: [],
  osmHospitalRelationships: [],
};

describe("Patient self care page context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getProtectedApplicationActor).mockResolvedValue(workforceActor);
    mockedRedirect.mockImplementation((path: string) => {
      throw new Error(`NEXT_REDIRECT:${path}`);
    });
  });

  it.each([
    LINE_WEB_NAVIGATION_PATHS.OPEN_PATIENT_APPOINTMENTS,
    LINE_WEB_NAVIGATION_PATHS.OPEN_PATIENT_CARE,
  ])("returns the explanatory denied decision for the %s entry instead of redirecting", async (returnTo) => {
    vi.mocked(listOwnPatientRelationshipNavigation).mockRejectedValue(new ForbiddenError());

    await expect(getPatientSelfRelationshipNavigationPageContext(returnTo)).resolves.toBe(PATIENT_ACCESS_UNAVAILABLE);
    expect(listOwnPatientRelationshipNavigation).toHaveBeenCalledWith(workforceActor);
    expect(mockedRedirect).not.toHaveBeenCalled();
  });

  it("returns the own relationships unchanged when the SELF read is allowed", async () => {
    vi.mocked(listOwnPatientRelationshipNavigation).mockResolvedValue([]);

    await expect(getPatientSelfRelationshipNavigationPageContext()).resolves.toEqual([]);
  });

  it("keeps the fixed login return for an expired session on the entry", async () => {
    vi.mocked(getProtectedApplicationActor).mockRejectedValue(new UnauthenticatedError());

    await expect(getPatientSelfRelationshipNavigationPageContext(LINE_WEB_NAVIGATION_PATHS.OPEN_PATIENT_APPOINTMENTS))
      .rejects.toThrow("NEXT_REDIRECT:/login?returnTo=%2Fapp%2Fpersonal%2Fappointments");
    expect(listOwnPatientRelationshipNavigation).not.toHaveBeenCalled();
  });

  it("leaves denied detail routes on the existing redirect", async () => {
    vi.mocked(getOwnPatientCareJourney).mockRejectedValue(new ForbiddenError());

    await expect(getPatientSelfCareJourneyPageContext("44444444-4444-4444-8444-444444444444"))
      .rejects.toThrow("NEXT_REDIRECT:/app");
  });
});
