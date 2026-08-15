import { beforeEach, describe, expect, it, vi } from "vitest";

import PatientProvisioningPage from "../../../../app/app/patients/provision/page";

const {
  mockedConnection,
  mockedGetProtectedApplicationActor,
  mockedListPatientProvisioningScopes,
  mockedRedirect,
} = vi.hoisted(() => ({
  mockedConnection: vi.fn(),
  mockedGetProtectedApplicationActor: vi.fn(),
  mockedListPatientProvisioningScopes: vi.fn(),
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

vi.mock("@/modules/patient-provisioning/services/patient-provisioning-service", () => ({
  listPatientProvisioningScopes: mockedListPatientProvisioningScopes,
}));

const scopes = [
  {
    hospitalId: "11111111-1111-4111-8111-111111111111",
    hospitalCode: "HOSPITAL-A",
    hospitalName: "โรงพยาบาล ก",
    canBulkImport: true,
  },
  {
    hospitalId: "22222222-2222-4222-8222-222222222222",
    hospitalCode: "HOSPITAL-B",
    hospitalName: "โรงพยาบาล ข",
    canBulkImport: false,
  },
];

describe("Patient provisioning page Hospital context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedConnection.mockResolvedValue(undefined);
    mockedGetProtectedApplicationActor.mockResolvedValue({ userId: "actor" });
    mockedListPatientProvisioningScopes.mockResolvedValue(scopes);
  });

  it("keys the workspace by the server-validated selected Hospital", async () => {
    const hospitalA = await PatientProvisioningPage({
      searchParams: Promise.resolve({ hospitalId: scopes[0].hospitalId }),
    });
    const hospitalB = await PatientProvisioningPage({
      searchParams: Promise.resolve({ hospitalId: scopes[1].hospitalId }),
    });

    expect(hospitalA.key).toBe(scopes[0].hospitalId);
    expect(hospitalB.key).toBe(scopes[1].hospitalId);
    expect(hospitalB.key).not.toBe(hospitalA.key);
  });

  it("does not use an unauthorized requested Hospital as the workspace key", async () => {
    const invalidHospital = await PatientProvisioningPage({
      searchParams: Promise.resolve({ hospitalId: "not-authorized" }),
    });

    expect(invalidHospital.key).toBe(scopes[0].hospitalId);
    expect(invalidHospital.key).not.toBe("not-authorized");
  });
});
