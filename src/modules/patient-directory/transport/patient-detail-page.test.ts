import { beforeEach, describe, expect, it, vi } from "vitest";

import PatientDetailPage from "../../../../app/app/patients/[relationshipId]/page";
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

describe("Patient detail page authorization boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedConnection.mockResolvedValue(undefined);
    mockedGetProtectedApplicationActor.mockResolvedValue({ userId: "actor" });
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
