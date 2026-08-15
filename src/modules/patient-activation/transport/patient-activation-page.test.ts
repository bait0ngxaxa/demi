import { beforeEach, describe, expect, it, vi } from "vitest";

import PatientActivationPage from "../../../../app/app/patients/activation/page";

const {
  mockedConnection,
  mockedGetProtectedApplicationActor,
  mockedListPatientActivationScopes,
  mockedRedirect,
} = vi.hoisted(() => ({
  mockedConnection: vi.fn(),
  mockedGetProtectedApplicationActor: vi.fn(),
  mockedListPatientActivationScopes: vi.fn(),
  mockedRedirect: vi.fn(),
}));

vi.mock("next/server", () => ({
  connection: mockedConnection,
}));

vi.mock("next/navigation", () => ({
  redirect: mockedRedirect,
}));

vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: mockedGetProtectedApplicationActor,
}));

vi.mock(
  "@/modules/patient-activation/services/patient-activation-query-service",
  () => ({
    listPatientActivationScopes: mockedListPatientActivationScopes,
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
});
