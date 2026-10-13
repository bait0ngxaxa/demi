import { beforeEach, describe, expect, it, vi } from "vitest";

import PatientOsmBulkAssignmentPage from "../../../../app/app/patients/assign-osm/page";
import { ForbiddenError, ValidationError } from "@/shared/errors/application-error";

const {
  mockedConnection,
  mockedGetBulkView,
  mockedGetProtectedApplicationActor,
  mockedListScopes,
  mockedRedirect,
} = vi.hoisted(() => ({
  mockedConnection: vi.fn(),
  mockedGetBulkView: vi.fn(),
  mockedGetProtectedApplicationActor: vi.fn(),
  mockedListScopes: vi.fn(),
  mockedRedirect: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: mockedConnection }));
vi.mock("next/navigation", () => ({ redirect: mockedRedirect }));
vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: mockedGetProtectedApplicationActor,
}));
vi.mock("@/modules/patient-assignment/services/patient-osm-assignment-query-service", () => ({
  getPatientOsmBulkAssignmentView: mockedGetBulkView,
  listPatientOsmAssignmentScopes: mockedListScopes,
}));

const scopes = [
  { hospitalId: "11111111-1111-4111-8111-111111111111", hospitalName: "โรงพยาบาล ก" },
  { hospitalId: "22222222-2222-4222-8222-222222222222", hospitalName: "โรงพยาบาล ข" },
];
const view = {
  hospital: scopes[0],
  patients: [],
  totalWithoutOsm: 0,
  osmCandidates: [],
};

describe("Bulk OSM assignment page boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedConnection.mockResolvedValue(undefined);
    mockedGetProtectedApplicationActor.mockResolvedValue({ userId: "owner" });
    mockedListScopes.mockResolvedValue(scopes);
    mockedGetBulkView.mockResolvedValue(view);
    mockedRedirect.mockImplementation((location: string): never => {
      throw new Error(`REDIRECT:${location}`);
    });
  });

  it("loads the view for the first owned hospital by default and keys the workspace by it", async () => {
    const page = await PatientOsmBulkAssignmentPage({ searchParams: Promise.resolve({}) });

    expect(mockedGetBulkView).toHaveBeenCalledWith(expect.anything(), {
      hospitalId: scopes[0]?.hospitalId,
      value: "",
    });
    expect(page.props).toMatchObject({ selectedScope: scopes[0], view });
  });

  it("uses only a hospital the actor owns, otherwise sends the user back", async () => {
    await expect(
      PatientOsmBulkAssignmentPage({
        searchParams: Promise.resolve({ hospitalId: "99999999-9999-4999-8999-999999999999" }),
      }),
    ).rejects.toThrow("REDIRECT:/app/patients/assign-osm");
    expect(mockedGetBulkView).not.toHaveBeenCalled();
  });

  it("selects the requested owned hospital and passes the search term", async () => {
    await PatientOsmBulkAssignmentPage({
      searchParams: Promise.resolve({ hospitalId: scopes[1]?.hospitalId, value: "สม" }),
    });

    expect(mockedGetBulkView).toHaveBeenCalledWith(expect.anything(), {
      hospitalId: scopes[1]?.hospitalId,
      value: "สม",
    });
  });

  it("redirects an actor who owns no hospital (for example a MEMBER)", async () => {
    mockedListScopes.mockResolvedValue([]);

    await expect(PatientOsmBulkAssignmentPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "REDIRECT:/app/patients",
    );
    expect(mockedGetBulkView).not.toHaveBeenCalled();
  });

  it("redirects when the view itself is forbidden", async () => {
    mockedGetBulkView.mockRejectedValue(new ForbiddenError());

    await expect(PatientOsmBulkAssignmentPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "REDIRECT:/app",
    );
  });

  it("shows a safe message for an overlong search term instead of failing", async () => {
    mockedGetBulkView.mockRejectedValue(new ValidationError());

    const page = await PatientOsmBulkAssignmentPage({ searchParams: Promise.resolve({ value: "x".repeat(500) }) });

    expect(page.props).toMatchObject({ view: null, errorMessage: expect.stringContaining("คำค้นหา") });
    expect(page.props.search).toBe("");
  });
});
