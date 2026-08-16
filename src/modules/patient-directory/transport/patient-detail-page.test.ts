import { beforeEach, describe, expect, it, vi } from "vitest";
import { HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";

import PatientDetailPage from "../../../../app/app/patients/[relationshipId]/page";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, NotFoundError } from "@/shared/errors/application-error";

const {
  mockedConnection,
  mockedGetPatientDirectoryDetail,
  mockedGetProtectedApplicationActor,
  mockedNotFound,
  mockedRedirect,
} = vi.hoisted(() => ({
  mockedConnection: vi.fn(),
  mockedGetPatientDirectoryDetail: vi.fn(),
  mockedGetProtectedApplicationActor: vi.fn(),
  mockedNotFound: vi.fn(),
  mockedRedirect: vi.fn(),
}));

vi.mock("next/server", () => ({
  connection: mockedConnection,
}));

vi.mock("next/navigation", () => ({
  notFound: mockedNotFound,
  redirect: mockedRedirect,
}));

vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: mockedGetProtectedApplicationActor,
}));

vi.mock("@/modules/patient-directory/services/patient-directory-query-service", () => ({
  getPatientDirectoryDetail: mockedGetPatientDirectoryDetail,
}));

const patient = {
  patientProfileId: "11111111-1111-4111-8111-111111111111",
  patientHospitalRelationshipId: "22222222-2222-4222-8222-222222222222",
  displayName: "สมชาย ผู้ป่วย",
  hospital: {
    id: "33333333-3333-4333-8333-333333333333",
    name: "โรงพยาบาล ก",
  },
  hospitalNumber: "HN-001",
};

const actor = {
  userId: "44444444-4444-4444-8444-444444444444",
  personId: "55555555-5555-4555-8555-555555555555",
  roles: [Role.HOSPITAL],
  hospitalMemberships: [
    {
      hospitalId: patient.hospital.id,
      membershipType: MembershipType.OWNER,
      profession: null,
      status: MembershipStatus.ACTIVE,
      hospitalStatus: HospitalStatus.ACTIVE,
    },
  ],
  osmHospitalRelationships: [],
} satisfies ActorContext;

function containsString(value: unknown, needle: string, seen = new Set<object>()): boolean {
  if (typeof value === "string") {
    return value.includes(needle);
  }

  if (typeof value !== "object" || value === null) {
    return false;
  }

  if (seen.has(value)) {
    return false;
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.some((item) => containsString(item, needle, seen));
  }

  return Object.values(value).some((item) => containsString(item, needle, seen));
}

describe("Patient detail page authorization boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedConnection.mockResolvedValue(undefined);
    mockedGetProtectedApplicationActor.mockResolvedValue(actor);
    mockedGetPatientDirectoryDetail.mockResolvedValue(patient);
    mockedNotFound.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
    mockedRedirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
  });

  it("passes the opaque relationship ID to the independently authorized service", async () => {
    const page = await PatientDetailPage({
      params: Promise.resolve({ relationshipId: patient.patientHospitalRelationshipId }),
    });

    expect(mockedGetPatientDirectoryDetail).toHaveBeenCalledWith(
      expect.anything(),
      patient.patientHospitalRelationshipId,
    );
    expect(page).toBeDefined();
  });

  it("shows assignment management only for a Hospital OWNER", async () => {
    const ownerPage = await PatientDetailPage({
      params: Promise.resolve({ relationshipId: patient.patientHospitalRelationshipId }),
    });
    expect(containsString(ownerPage, "/assignment")).toBe(true);

    mockedGetProtectedApplicationActor.mockResolvedValue({
      ...actor,
      hospitalMemberships: [
        {
          ...actor.hospitalMemberships[0],
          membershipType: MembershipType.MEMBER,
        },
      ],
    });
    const memberPage = await PatientDetailPage({
      params: Promise.resolve({ relationshipId: patient.patientHospitalRelationshipId }),
    });
    expect(containsString(memberPage, "/assignment")).toBe(false);
  });

  it("uses the safe not-found path for an inaccessible Hospital relationship", async () => {
    mockedGetPatientDirectoryDetail.mockRejectedValue(new NotFoundError());

    await expect(
      PatientDetailPage({
        params: Promise.resolve({ relationshipId: patient.patientHospitalRelationshipId }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockedNotFound).toHaveBeenCalledOnce();
  });

  it("does not render a detail page when the actor is forbidden", async () => {
    mockedGetPatientDirectoryDetail.mockRejectedValue(new ForbiddenError());

    await expect(
      PatientDetailPage({
        params: Promise.resolve({ relationshipId: patient.patientHospitalRelationshipId }),
      }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mockedRedirect).toHaveBeenCalledWith("/app");
  });
});
