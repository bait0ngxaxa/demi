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
  page: 1,
  pageSize: 25,
  totalPages: 1,
  hasPreviousPage: false,
  hasNextPage: false,
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

  it("loads page 1 for the first owned hospital by default and keys the workspace by the hospital only", async () => {
    const page = await PatientOsmBulkAssignmentPage({ searchParams: Promise.resolve({}) });

    expect(mockedGetBulkView).toHaveBeenCalledWith(expect.anything(), {
      hospitalId: scopes[0]?.hospitalId,
      value: "",
      page: 1,
    });
    expect(page.props).toMatchObject({ selectedScope: scopes[0], view });
    expect(page.key).toBe(scopes[0]?.hospitalId);
  });

  it("keeps the workspace key across pages and searches of the same hospital", async () => {
    const first = await PatientOsmBulkAssignmentPage({ searchParams: Promise.resolve({ hospitalId: scopes[1]?.hospitalId }) });
    const paged = await PatientOsmBulkAssignmentPage({
      searchParams: Promise.resolve({ hospitalId: scopes[1]?.hospitalId, value: "สม", page: "3" }),
    });

    expect(paged.key).toBe(first.key);
    expect(paged.props).toMatchObject({ search: "สม" });
    expect(mockedGetBulkView).toHaveBeenLastCalledWith(expect.anything(), {
      hospitalId: scopes[1]?.hospitalId,
      value: "สม",
      page: 3,
    });
  });

  it.each([["0"], ["-2"], ["abc"], ["1.5"], ["99999999999999999999"], [["2", "3"]]])(
    "reads page %j as a positive integer, otherwise page 1",
    async (requested) => {
      await PatientOsmBulkAssignmentPage({ searchParams: Promise.resolve({ page: requested }) });

      expect(mockedGetBulkView).toHaveBeenCalledWith(expect.anything(), {
        hospitalId: scopes[0]?.hospitalId,
        value: "",
        page: Array.isArray(requested) ? 2 : 1,
      });
    },
  );

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
      page: 1,
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
