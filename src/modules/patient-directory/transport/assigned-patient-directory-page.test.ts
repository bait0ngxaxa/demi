import { beforeEach, describe, expect, it, vi } from "vitest";

import AssignedPatientDirectoryPage from "../../../../app/app/patients/assigned/page";
import { ForbiddenError, UnauthenticatedError, ValidationError } from "@/shared/errors/application-error";

const {
  mockedConnection,
  mockedFindAssignedPatientDirectory,
  mockedGetProtectedApplicationActor,
  mockedRedirect,
} = vi.hoisted(() => ({
  mockedConnection: vi.fn(),
  mockedFindAssignedPatientDirectory: vi.fn(),
  mockedGetProtectedApplicationActor: vi.fn(),
  mockedRedirect: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: mockedConnection }));
vi.mock("next/navigation", () => ({ redirect: mockedRedirect }));
vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: mockedGetProtectedApplicationActor,
}));
vi.mock("@/modules/patient-directory/services/patient-directory-query-service", () => ({
  findAssignedPatientDirectory: mockedFindAssignedPatientDirectory,
}));

const result = {
  items: [],
  lookupType: "HOSPITAL_NUMBER" as const,
  value: "HN-001",
  page: 1,
  pageSize: 25,
  total: 0,
  totalPages: 1,
  hasPreviousPage: false,
  hasNextPage: false,
};
const invalidTaskModes: Array<{ name: string; task: string | string[] }> = [
  { name: "unknown", task: "unknown" },
  { name: "duplicate", task: ["screening", "followup"] },
];

describe("assigned Patient directory page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedConnection.mockResolvedValue(undefined);
    mockedGetProtectedApplicationActor.mockResolvedValue({ userId: "actor" });
    mockedFindAssignedPatientDirectory.mockResolvedValue(result);
    mockedRedirect.mockImplementation((location: string): never => {
      throw new Error(`REDIRECT:${location}`);
    });
  });

  it("passes bounded name/HN search and page values to the OSM query service", async () => {
    const page = await AssignedPatientDirectoryPage({
      searchParams: Promise.resolve({ lookupType: "HOSPITAL_NUMBER", value: " HN-001 ", page: "2" }),
    });

    expect(mockedFindAssignedPatientDirectory).toHaveBeenCalledWith(expect.anything(), {
      lookupType: "HOSPITAL_NUMBER",
      value: " HN-001 ",
      page: "2",
      classification: "ALL",
    });
    expect(page.props).toMatchObject({ lookupType: "HOSPITAL_NUMBER", value: "HN-001", result });
  });

  it.each([
    ["screening", "screening"],
    ["followup", "followup"],
  ] as const)("accepts only the bounded %s task mode", async (task, expectedMode) => {
    const page = await AssignedPatientDirectoryPage({
      searchParams: Promise.resolve({ task }),
    });

    expect(page.props.taskMode).toBe(expectedMode);
    expect(mockedFindAssignedPatientDirectory).toHaveBeenCalledWith(expect.anything(), {
      lookupType: "NAME",
      value: "",
      page: "1",
      classification: "ALL",
    });
  });

  it.each(invalidTaskModes)("drops the $name task mode before building a return target", async ({ task }) => {
    mockedGetProtectedApplicationActor.mockRejectedValue(new UnauthenticatedError());

    await expect(AssignedPatientDirectoryPage({
      searchParams: Promise.resolve({ task }),
    })).rejects.toThrow("REDIRECT:/login?returnTo=%2Fapp%2Fpatients%2Fassigned");
    expect(mockedRedirect).toHaveBeenCalledWith("/login?returnTo=%2Fapp%2Fpatients%2Fassigned");
  });

  it("returns an unauthenticated task launch to the same fixed task mode after login", async () => {
    mockedGetProtectedApplicationActor.mockRejectedValue(new UnauthenticatedError());

    await expect(AssignedPatientDirectoryPage({
      searchParams: Promise.resolve({ task: "screening" }),
    })).rejects.toThrow("REDIRECT:/login?returnTo=%2Fapp%2Fpatients%2Fassigned%3Ftask%3Dscreening");
    expect(mockedRedirect).toHaveBeenCalledWith(
      "/login?returnTo=%2Fapp%2Fpatients%2Fassigned%3Ftask%3Dscreening",
    );
  });

  it("redirects a non-OSM actor without rendering a roster", async () => {
    mockedFindAssignedPatientDirectory.mockRejectedValue(new ForbiddenError());

    await expect(
      AssignedPatientDirectoryPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("REDIRECT:/app");
    expect(mockedRedirect).toHaveBeenCalledWith("/app");
  });

  it("renders a safe validation state for an oversized search", async () => {
    mockedFindAssignedPatientDirectory.mockRejectedValue(new ValidationError());

    const page = await AssignedPatientDirectoryPage({
      searchParams: Promise.resolve({ lookupType: "NAME", value: "สมชาย" }),
    });

    expect(page.props).toMatchObject({
      errorMessage: "กรุณาตรวจสอบประเภทและความยาวของคำค้นหา แล้วลองใหม่อีกครั้ง",
      result: null,
    });
  });
});
