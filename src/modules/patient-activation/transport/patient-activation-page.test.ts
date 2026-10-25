import { beforeEach, describe, expect, it, vi } from "vitest";

import PatientActivationPage from "../../../../app/app/patients/activation/page";

const {
  mockedConnection,
  mockedGetProtectedApplicationActor,
  mockedGetPatientActivationCandidateForRelationship,
  mockedListPatientActivationScopes,
  mockedNotFound,
  mockedRedirect,
} = vi.hoisted(() => ({
  mockedConnection: vi.fn(),
  mockedGetProtectedApplicationActor: vi.fn(),
  mockedGetPatientActivationCandidateForRelationship: vi.fn(),
  mockedListPatientActivationScopes: vi.fn(),
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

vi.mock(
  "@/modules/patient-activation/services/patient-activation-query-service",
  () => ({
    listPatientActivationScopes: mockedListPatientActivationScopes,
    getPatientActivationCandidateForRelationship: mockedGetPatientActivationCandidateForRelationship,
  }),
);

const scopes = [
  {
    hospitalId: "11111111-1111-4111-8111-111111111111",
    hospitalCode: "HOSPITAL-A",
    hospitalName: "โรงพยาบาล ก",
  },
  {
    hospitalId: "22222222-2222-4222-8222-222222222222",
    hospitalCode: "HOSPITAL-B",
    hospitalName: "โรงพยาบาล ข",
  },
];

describe("Patient activation page Hospital context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedConnection.mockResolvedValue(undefined);
    mockedGetProtectedApplicationActor.mockResolvedValue({ userId: "actor" });
    mockedListPatientActivationScopes.mockResolvedValue(scopes);
    mockedNotFound.mockImplementation(() => { throw new Error("NOT_FOUND"); });
  });

  it("keys the workspace by the server-validated selected Hospital", async () => {
    const hospitalA = await PatientActivationPage({
      searchParams: Promise.resolve({ hospitalId: scopes[0].hospitalId }),
    });
    const hospitalB = await PatientActivationPage({
      searchParams: Promise.resolve({ hospitalId: scopes[1].hospitalId }),
    });

    expect(hospitalA.key).toBe(scopes[0].hospitalId);
    expect(hospitalB.key).toBe(scopes[1].hospitalId);
    expect(hospitalB.key).not.toBe(hospitalA.key);
  });

  it("loads activation from the exact patient Hospital relationship context", async () => {
    const relationshipId = "33333333-3333-4333-8333-333333333333";
    const candidate = {
      userId: "44444444-4444-4444-8444-444444444444",
      patientProfileId: "55555555-5555-4555-8555-555555555555",
      hospitalId: scopes[1].hospitalId,
      displayName: "ผู้ป่วยทดสอบ",
      hospitalNumber: "HN-02",
      accountStatus: "PROVISIONED",
      activationStatus: "NOT_ISSUED",
      activationExpiresAt: null,
      activationMayBeIssued: true,
    } as const;
    mockedGetPatientActivationCandidateForRelationship.mockResolvedValue(candidate);

    const page = await PatientActivationPage({
      searchParams: Promise.resolve({ hospitalId: scopes[1].hospitalId, relationshipId }),
    });

    expect(mockedGetPatientActivationCandidateForRelationship).toHaveBeenCalledWith(
      expect.anything(),
      { targetHospitalId: scopes[1].hospitalId, patientHospitalRelationshipId: relationshipId },
    );
    expect(page.props).toMatchObject({
      selectedHospitalId: scopes[1].hospitalId,
      contextualCandidate: candidate,
      contextualPatientHref: `/app/patients/${relationshipId}`,
    });
  });
});
