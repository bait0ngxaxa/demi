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

  it("accepts only the bounded screening task mode", async () => {
    const page = await AssignedPatientDirectoryPage({
      searchParams: Promise.resolve({ task: "screening" }),
    });

    expect(page.props.taskMode).toBe("screening");
    expect(mockedFindAssignedPatientDirectory).toHaveBeenCalledWith(expect.anything(), {
      lookupType: "NAME",
      value: "",
      page: "1",
      classification: "ALL",
    });
  });

  it.each([
    [{ task: "followup" }, "/app/services"],
    [{ task: "followup", hospitalId: "44444444-4444-4444-8444-444444444444" }, "/app/services?hospitalId=44444444-4444-4444-8444-444444444444"],
    [{ task: ["followup", "screening"], hospitalId: ["44444444-4444-4444-8444-444444444444", "x"] }, "/app/services?hospitalId=44444444-4444-4444-8444-444444444444"],
  ])("redirects the former follow-up queue %j to the จัดบริการ workspace (CT-3)", async (searchParams, location) => {
    await expect(AssignedPatientDirectoryPage({ searchParams: Promise.resolve(searchParams) }))
      .rejects.toThrow(`REDIRECT:${location}`);
    expect(mockedRedirect).toHaveBeenCalledWith(location);
    // Before any session or roster read, so a LINE message sent earlier lands on the workspace (or its login).
    expect(mockedGetProtectedApplicationActor).not.toHaveBeenCalled();
    expect(mockedFindAssignedPatientDirectory).not.toHaveBeenCalled();
  });

  it("forwards the Hospital locator to the service, which validates and only narrows it", async () => {
    const hospitalId = "44444444-4444-4444-8444-444444444444";
    await AssignedPatientDirectoryPage({
      searchParams: Promise.resolve({ task: "screening", hospitalId: [hospitalId, "99999999-9999-4999-8999-999999999999"] }),
    });

    expect(mockedFindAssignedPatientDirectory).toHaveBeenCalledWith(expect.anything(), {
      lookupType: "NAME",
      value: "",
      page: "1",
      classification: "ALL",
      hospitalId,
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
