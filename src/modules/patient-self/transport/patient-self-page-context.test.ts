import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@prisma/client";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { resolveOwnPatientContext } from "@/modules/patient-self/services/patient-self-query-service";
import { ForbiddenError, InfrastructureError, NotFoundError, UnauthenticatedError } from "@/shared/errors/application-error";

import {
  getPatientPersonalHomePageContext,
  getPatientSelfHospitalProfilePageContext,
  getPatientSelfPageContext,
} from "./patient-self-page-context";

const { mockedRedirect, mockedNotFound } = vi.hoisted(() => ({
  mockedRedirect: vi.fn(),
  mockedNotFound: vi.fn(),
}));

const { listOwnPatientHospitalContacts } = vi.hoisted(() => ({
  listOwnPatientHospitalContacts: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mockedRedirect, notFound: mockedNotFound }));
vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: vi.fn(),
}));
vi.mock("@/modules/patient-self/services/patient-self-query-service", () => ({
  resolveOwnPatientContext: vi.fn(),
}));
vi.mock("@/modules/hospital-contact/services/hospital-contact-service", () => ({
  listOwnPatientHospitalContacts,
}));
vi.mock("@/modules/patient-hospital-profile/services/patient-hospital-profile-service", () => ({
  getOwnPatientHospitalProfile: vi.fn(),
}));

import { getOwnPatientHospitalProfile } from "@/modules/patient-hospital-profile/services/patient-hospital-profile-service";
import { HospitalStatus } from "@prisma/client";

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
    listOwnPatientHospitalContacts.mockResolvedValue([]);
    mockedRedirect.mockImplementation((path: string) => {
      throw new Error(`NEXT_REDIRECT:${path}`);
    });
    mockedNotFound.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
  });

  it("resolves the own Patient scope using only the current authenticated ActorContext", async () => {
    const context = {
      person: { givenName: "สมชาย", familyName: "ใจดี" },
      hospitalRelationships: [],
    };
    vi.mocked(resolveOwnPatientContext).mockResolvedValue(context);

    await expect(getPatientSelfPageContext()).resolves.toEqual(context);
    expect(resolveOwnPatientContext).toHaveBeenCalledWith(actor);
    expect(listOwnPatientHospitalContacts).not.toHaveBeenCalled();
  });

  it("retains the existing incomplete state without reading Contact when PatientProfile does not resolve", async () => {
    await expect(getPatientPersonalHomePageContext()).resolves.toBeNull();
    expect(listOwnPatientHospitalContacts).not.toHaveBeenCalled();
  });

  it("maps a vanished PatientProfile during Contact read to safe not-found", async () => {
    vi.mocked(resolveOwnPatientContext).mockResolvedValue({
      person: { givenName: "สมชาย", familyName: "ใจดี" },
      hospitalRelationships: [],
    });
    listOwnPatientHospitalContacts.mockRejectedValue(new NotFoundError());

    await expect(getPatientPersonalHomePageContext()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockedNotFound).toHaveBeenCalledOnce();
  });

  it("adds only the exact own active Hospital Contact projection and withholds inactive Hospitals", async () => {
    const context = {
      person: { givenName: "สมชาย", familyName: "ใจดี" },
      hospitalRelationships: [
        {
          relationshipId: "44444444-4444-4444-8444-444444444444",
          hospitalCode: "H-001",
          hospitalName: "โรงพยาบาล ก",
          hospitalNumber: null,
          hospitalStatus: HospitalStatus.ACTIVE,
        },
        {
          relationshipId: "55555555-5555-4555-8555-555555555555",
          hospitalCode: "H-002",
          hospitalName: "โรงพยาบาล ข",
          hospitalNumber: null,
          hospitalStatus: HospitalStatus.SUSPENDED,
        },
      ],
    };
    vi.mocked(resolveOwnPatientContext).mockResolvedValue(context);
    listOwnPatientHospitalContacts.mockResolvedValue([
      {
        relationshipId: "44444444-4444-4444-8444-444444444444",
        availability: "AVAILABLE",
        contact: {
          hospital: { hospitalCode: "H-001", name: "โรงพยาบาล ก" },
          addressText: "ถนนสุขภาพ",
          phoneNumber: "02-123-4567",
        },
      },
      { relationshipId: "55555555-5555-4555-8555-555555555555", availability: "UNAVAILABLE" },
    ]);

    await expect(getPatientPersonalHomePageContext()).resolves.toMatchObject({
      hospitalRelationships: [
        {
          relationshipId: "44444444-4444-4444-8444-444444444444",
          hospitalContact: {
            status: "AVAILABLE",
            contact: { addressText: "ถนนสุขภาพ", phoneNumber: "02-123-4567" },
          },
        },
        {
          relationshipId: "55555555-5555-4555-8555-555555555555",
          hospitalContact: { status: "UNAVAILABLE" },
        },
      ],
    });
  });

  it("keeps a contact load failure distinct from confirmed-empty contact", async () => {
    vi.mocked(resolveOwnPatientContext).mockResolvedValue({
      person: { givenName: "สมชาย", familyName: "ใจดี" },
      hospitalRelationships: [],
    });
    listOwnPatientHospitalContacts.mockRejectedValue(new InfrastructureError());

    await expect(getPatientPersonalHomePageContext()).rejects.toBeInstanceOf(InfrastructureError);
    expect(listOwnPatientHospitalContacts).toHaveBeenCalledWith(actor);
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

  it("resolves the exact server-verified Hospital relationship for self edit", async () => {
    const detail = {
      relationshipId: "44444444-4444-4444-8444-444444444444",
      hospitalName: "โรงพยาบาล ก",
      person: { givenName: "สมชาย", familyName: "ใจดี" },
      profile: {
        gender: null,
        phoneNumber: null,
        addressText: null,
        emergencyContactName: null,
        emergencyContactPhone: null,
        occupation: null,
        educationLevel: null,
      },
      source: "LEGACY_FALLBACK" as const,
      version: 0,
    };
    vi.mocked(getOwnPatientHospitalProfile).mockResolvedValue(detail);

    await expect(getPatientSelfHospitalProfilePageContext(detail.relationshipId)).resolves.toEqual(detail);
    expect(getOwnPatientHospitalProfile).toHaveBeenCalledWith(actor, detail.relationshipId);
  });

  it("does not reveal another Patient relationship as an editable profile", async () => {
    vi.mocked(getOwnPatientHospitalProfile).mockRejectedValue(new NotFoundError());

    await expect(
      getPatientSelfHospitalProfilePageContext("55555555-5555-4555-8555-555555555555"),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
