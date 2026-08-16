import { beforeEach, describe, expect, it, vi } from "vitest";

import PatientDirectoryPage from "../../../../app/app/patients/page";
import { ValidationError } from "@/shared/errors/application-error";

const {
  mockedConnection,
  mockedFindPatientDirectory,
  mockedGetProtectedApplicationActor,
  mockedListPatientDirectoryScopes,
  mockedRedirect,
} = vi.hoisted(() => ({
  mockedConnection: vi.fn(),
  mockedFindPatientDirectory: vi.fn(),
  mockedGetProtectedApplicationActor: vi.fn(),
  mockedListPatientDirectoryScopes: vi.fn(),
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

vi.mock("@/modules/patient-directory/services/patient-directory-query-service", () => ({
  findPatientDirectory: mockedFindPatientDirectory,
  listPatientDirectoryScopes: mockedListPatientDirectoryScopes,
}));

const scopes = [
  {
    hospitalId: "11111111-1111-4111-8111-111111111111",
    hospitalName: "โรงพยาบาล ก",
  },
  {
    hospitalId: "22222222-2222-4222-8222-222222222222",
    hospitalName: "โรงพยาบาล ข",
  },
];

const result = {
  hospital: scopes[0],
  items: [],
  lookupType: "NAME" as const,
  value: "",
  page: 1,
  pageSize: 25,
  total: 0,
  totalPages: 1,
  hasPreviousPage: false,
  hasNextPage: false,
};

describe("Patient Directory page Hospital context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedConnection.mockResolvedValue(undefined);
    mockedGetProtectedApplicationActor.mockResolvedValue({ userId: "actor" });
    mockedListPatientDirectoryScopes.mockResolvedValue(scopes);
    mockedFindPatientDirectory.mockResolvedValue(result);
    mockedRedirect.mockImplementation((location: string): never => {
      throw new Error(`REDIRECT:${location}`);
    });
  });

  it("uses the server-validated Hospital as the workspace key and query context", async () => {
    const page = await PatientDirectoryPage({
      searchParams: Promise.resolve({ hospitalId: scopes[1].hospitalId }),
    });

    expect(page.key).toBe(scopes[1].hospitalId);
    expect(mockedFindPatientDirectory).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ targetHospitalId: scopes[1].hospitalId }),
    );
  });

  it("uses the first authorized Hospital when no Hospital context is provided", async () => {
    const page = await PatientDirectoryPage({ searchParams: Promise.resolve({}) });

    expect(page.key).toBe(scopes[0].hospitalId);
    expect(mockedFindPatientDirectory).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ targetHospitalId: scopes[0].hospitalId }),
    );
  });

  it("redirects an invalid explicit Hospital context without querying another Hospital", async () => {
    const forgedHospitalId = "33333333-3333-4333-8333-333333333333";

    await expect(
      PatientDirectoryPage({
        searchParams: Promise.resolve({ hospitalId: forgedHospitalId }),
      }),
    ).rejects.toThrow("REDIRECT:/app/patients");

    expect(mockedRedirect).toHaveBeenCalledWith("/app/patients");
    expect(mockedFindPatientDirectory).not.toHaveBeenCalled();
    expect(mockedFindPatientDirectory).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ targetHospitalId: scopes[0].hospitalId }),
    );
    expect(mockedFindPatientDirectory).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ targetHospitalId: forgedHospitalId }),
    );
  });

  it("renders a safe validation state for a bounded query error", async () => {
    mockedFindPatientDirectory.mockRejectedValue(new ValidationError());

    const page = await PatientDirectoryPage({
      searchParams: Promise.resolve({
        hospitalId: scopes[0].hospitalId,
        lookupType: "NAME",
        value: "สมชาย",
      }),
    });

    expect(page.props).toMatchObject({
      errorMessage: "กรุณาตรวจสอบประเภทและความยาวของคำค้นหา แล้วลองใหม่อีกครั้ง",
      result: null,
    });
  });
});
