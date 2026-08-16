import { beforeEach, describe, expect, it, vi } from "vitest";

import PatientOsmAssignmentPage from "../../../../app/app/patients/[relationshipId]/assignment/page";
import { NotFoundError } from "@/shared/errors/application-error";

const {
  mockedConnection,
  mockedGetManagementView,
  mockedListCandidates,
  mockedGetProtectedApplicationActor,
  mockedNotFound,
  mockedRedirect,
} = vi.hoisted(() => ({
  mockedConnection: vi.fn(),
  mockedGetManagementView: vi.fn(),
  mockedListCandidates: vi.fn(),
  mockedGetProtectedApplicationActor: vi.fn(),
  mockedNotFound: vi.fn(),
  mockedRedirect: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: mockedConnection }));
vi.mock("next/navigation", () => ({
  notFound: mockedNotFound,
  redirect: mockedRedirect,
}));
vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: mockedGetProtectedApplicationActor,
}));
vi.mock("@/modules/patient-assignment/services/patient-osm-assignment-query-service", () => ({
  getPatientOsmAssignmentManagementView: mockedGetManagementView,
  listPatientOsmCandidates: mockedListCandidates,
}));

const relationshipId = "11111111-1111-4111-8111-111111111111";
const patient = {
  patientProfileId: "22222222-2222-4222-8222-222222222222",
  patientHospitalRelationshipId: relationshipId,
  displayName: "สมชาย ผู้ป่วย",
  hospital: {
    id: "33333333-3333-4333-8333-333333333333",
    name: "โรงพยาบาล ก",
  },
  hospitalNumber: "HN-001",
};

describe("Patient assignment page authorization boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedConnection.mockResolvedValue(undefined);
    mockedGetProtectedApplicationActor.mockResolvedValue({ userId: "owner" });
    mockedGetManagementView.mockResolvedValue({ patient, currentAssignment: null });
    mockedListCandidates.mockResolvedValue([{ userId: "44444444-4444-4444-8444-444444444444", displayName: "อสม. หนึ่ง" }]);
    mockedNotFound.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
    mockedRedirect.mockImplementation((location: string): never => {
      throw new Error(`REDIRECT:${location}`);
    });
  });

  it("revalidates the opaque relationship ID for management and candidate queries", async () => {
    const page = await PatientOsmAssignmentPage({
      params: Promise.resolve({ relationshipId }),
      searchParams: Promise.resolve({ value: "สม" }),
    });

    expect(mockedGetManagementView).toHaveBeenCalledWith(expect.anything(), relationshipId);
    expect(mockedListCandidates).toHaveBeenCalledWith(expect.anything(), {
      patientHospitalRelationshipId: relationshipId,
      value: "สม",
    });
    expect(page.props).toMatchObject({ relationshipId, patient, candidates: expect.any(Array) });
  });

  it("uses the safe not-found path for an inaccessible relationship", async () => {
    mockedGetManagementView.mockRejectedValue(new NotFoundError());

    await expect(
      PatientOsmAssignmentPage({
        params: Promise.resolve({ relationshipId }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockedNotFound).toHaveBeenCalledOnce();
    expect(mockedListCandidates).not.toHaveBeenCalled();
  });
});
