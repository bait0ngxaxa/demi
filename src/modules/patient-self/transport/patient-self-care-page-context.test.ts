import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@prisma/client";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { LINE_WEB_NAVIGATION_PATHS } from "@/modules/line/domain/line-navigation-intents";
import {
  listDelegatedAppointments,
  listDelegatedAppointmentSubjects,
} from "@/modules/family/services/delegated-appointment-query-service";
import {
  getOwnPatientCareJourney,
  listOwnPatientAppointmentHub,
} from "@/modules/patient-self/services/patient-self-care-query-service";
import { listOwnPatientRelationshipNavigation } from "@/modules/patient-self/services/patient-self-query-service";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/shared/errors/application-error";

import { PATIENT_ACCESS_UNAVAILABLE } from "./patient-access-unavailable";
import {
  getPatientSelfCareJourneyPageContext,
  getPatientSelfRelationshipNavigationPageContext,
  getPersonalAppointmentHubPageContext,
} from "./patient-self-care-page-context";

const { mockedRedirect } = vi.hoisted(() => ({ mockedRedirect: vi.fn() }));

vi.mock("next/navigation", () => ({ redirect: mockedRedirect, notFound: vi.fn() }));
vi.mock("@/modules/auth/services/application-access-service", () => ({ getProtectedApplicationActor: vi.fn() }));
vi.mock("@/modules/patient-self/services/patient-self-query-service", () => ({ listOwnPatientRelationshipNavigation: vi.fn() }));
vi.mock("@/modules/patient-self/services/patient-self-care-query-service", () => ({
  getOwnPatientCareJourney: vi.fn(),
  listOwnPatientAppointmentHub: vi.fn(),
}));
vi.mock("@/modules/family/services/delegated-appointment-query-service", () => ({
  listDelegatedAppointments: vi.fn(),
  listDelegatedAppointmentSubjects: vi.fn(),
}));

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

describe("AF-4 appointment hub page context", () => {
  const grantId = "66666666-6666-4666-8666-666666666666";
  const otherGrantId = "77777777-7777-4777-8777-777777777777";
  const cursor = "88888888-8888-4888-8888-888888888888";
  const patientActor = { ...workforceActor, roles: [Role.PATIENT] };
  const caregiverActor = { ...workforceActor, roles: [Role.CAREGIVER] };
  const ownRelationship = {
    relationshipId: "44444444-4444-4444-8444-444444444444", hospitalCode: "H-1", hospitalName: "โรงพยาบาล ก",
    hospitalNumber: null, hospitalStatus: "ACTIVE" as const, careEndedAt: null,
  };
  const subject = (id: string) => ({ grantId: id, patient: { givenName: "แม่", familyName: "ใจดี" }, hospitalName: "รพ.สต. ข" });
  const selfHub = { tab: "upcoming" as const, relationships: [ownRelationship], endedRelationships: [], selectedRelationshipId: null, appointments: [], nextCursor: null };
  const familyPage = { appointments: [], nextCursor: null };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getProtectedApplicationActor).mockResolvedValue(patientActor);
    vi.mocked(listOwnPatientRelationshipNavigation).mockResolvedValue([ownRelationship]);
    vi.mocked(listDelegatedAppointmentSubjects).mockResolvedValue([subject(grantId)]);
    vi.mocked(listOwnPatientAppointmentHub).mockResolvedValue(selfHub);
    vi.mocked(listDelegatedAppointments).mockResolvedValue(familyPage);
  });

  it("defaults a Patient to ฉัน and passes only the hub selection to the SELF query", async () => {
    const context = await getPersonalAppointmentHubPageContext({ tab: "history", hospital: ownRelationship.relationshipId, cursor, extra: "x" });

    expect(context).toMatchObject({ selected: { kind: "SELF", key: "me" }, tab: "history", self: selfHub, family: null });
    expect(context).toHaveProperty("subjects", [{ kind: "SELF", key: "me" }, { kind: "FAMILY", key: grantId, ...subject(grantId) }]);
    expect(listOwnPatientAppointmentHub).toHaveBeenCalledWith(patientActor, { tab: "history", hospital: ownRelationship.relationshipId, cursor });
    expect(listDelegatedAppointments).not.toHaveBeenCalled();
  });

  it("selects a family member only through a server-listed ACTIVE grant", async () => {
    const context = await getPersonalAppointmentHubPageContext({ subject: grantId.toUpperCase(), cursor });

    expect(context).toMatchObject({ selected: { kind: "FAMILY", key: grantId }, tab: "upcoming", self: null, family: familyPage });
    expect(listDelegatedAppointments).toHaveBeenCalledWith(patientActor, { grantId, cursor });
    expect(listOwnPatientAppointmentHub).not.toHaveBeenCalled();
  });

  it.each([
    ["revoked or foreign grant", { subject: otherGrantId }],
    ["malformed subject", { subject: "../../admin" }],
    ["repeated subject", { subject: [grantId, grantId] }],
  ])("falls back to the default selection for a %s", async (_label, search) => {
    const context = await getPersonalAppointmentHubPageContext(search);

    expect(context).toMatchObject({ selected: { kind: "SELF", key: "me" } });
    expect(listDelegatedAppointments).not.toHaveBeenCalled();
  });

  it("gives a CAREGIVER-only account no ฉัน entry and never reads SELF data", async () => {
    vi.mocked(getProtectedApplicationActor).mockResolvedValue(caregiverActor);

    const context = await getPersonalAppointmentHubPageContext({ subject: "me" });

    expect(context).toMatchObject({ subjects: [{ kind: "FAMILY", key: grantId }], selected: { kind: "FAMILY", key: grantId }, self: null });
    expect(listOwnPatientRelationshipNavigation).not.toHaveBeenCalled();
    expect(listOwnPatientAppointmentHub).not.toHaveBeenCalled();
  });

  it("explains access for a non-Patient without any ACTIVE grant", async () => {
    vi.mocked(getProtectedApplicationActor).mockResolvedValue(caregiverActor);
    vi.mocked(listDelegatedAppointmentSubjects).mockResolvedValue([]);

    await expect(getPersonalAppointmentHubPageContext({})).resolves.toBe(PATIENT_ACCESS_UNAVAILABLE);
  });

  it("keeps the family history tab to the consent note without reading delegated rows", async () => {
    const context = await getPersonalAppointmentHubPageContext({ subject: grantId, tab: "history" });

    expect(context).toMatchObject({ selected: { kind: "FAMILY" }, tab: "history", family: null });
    expect(listDelegatedAppointments).not.toHaveBeenCalled();
  });

  it("restarts a stale family cursor and reports a grant that stopped authorizing between reads", async () => {
    vi.mocked(listDelegatedAppointments).mockRejectedValueOnce(new NotFoundError());
    await expect(getPersonalAppointmentHubPageContext({ subject: grantId, cursor })).resolves.toMatchObject({ family: familyPage });
    expect(listDelegatedAppointments).toHaveBeenLastCalledWith(patientActor, { grantId });

    vi.mocked(listDelegatedAppointments).mockRejectedValue(new NotFoundError());
    await expect(getPersonalAppointmentHubPageContext({ subject: grantId })).resolves.toMatchObject({ family: "UNAVAILABLE" });
  });
});
