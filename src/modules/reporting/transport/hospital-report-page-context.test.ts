import { HospitalStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/shared/errors/application-error";

const {
  mockedGetActor,
  mockedListHospitals,
  mockedListParentGroups,
  mockedGetPage,
  mockedGetParentChildPage,
  mockedGetHierarchyContext,
  mockedNotFound,
  mockedRedirect,
} = vi.hoisted(() => ({
  mockedGetActor: vi.fn(),
  mockedListHospitals: vi.fn(),
  mockedListParentGroups: vi.fn(),
  mockedGetPage: vi.fn(),
  mockedGetParentChildPage: vi.fn(),
  mockedGetHierarchyContext: vi.fn(),
  mockedNotFound: vi.fn(),
  mockedRedirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: mockedNotFound, redirect: mockedRedirect }));
vi.mock("@/modules/auth/services/application-access-service", () => ({ getProtectedApplicationActor: mockedGetActor }));
vi.mock("../services/hospital-report-access-service", () => ({ listHospitalReportingHospitals: mockedListHospitals }));
vi.mock("../services/parent-child-hospital-report-access-service", () => ({
  listParentChildHospitalReportTargetGroups: mockedListParentGroups,
}));
vi.mock("../services/hospital-report-query-service", () => ({
  getHospitalReportingPage: mockedGetPage,
  getParentChildHospitalReportingPage: mockedGetParentChildPage,
}));
vi.mock("@/modules/hospital-hierarchy/services/hospital-hierarchy-service", () => ({
  getHospitalHierarchyContext: mockedGetHierarchyContext,
}));

import { getHospitalReportPageContext } from "./hospital-report-page-context";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const childHospitalId = "22222222-2222-4222-8222-222222222222";
const otherHospitalId = "55555555-5555-4555-8555-555555555555";
const actor = { userId: "33333333-3333-4333-8333-333333333333", roles: [] };
const hospital = { id: hospitalId, hospitalCode: "DEMO-01", name: "โรงพยาบาลทดสอบ", status: HospitalStatus.ACTIVE };
const child = { id: childHospitalId, hospitalCode: "DEMO-02", name: "โรงพยาบาลลูกข่าย", status: HospitalStatus.ACTIVE };
const page = {
  hospital: { id: hospitalId, hospitalCode: "DEMO-01", name: "โรงพยาบาลทดสอบ" },
  counts: {
    patientHospitalRelationships: { grain: "PATIENT_HOSPITAL_RELATIONSHIP", value: 0 },
    relationshipsWithoutProgram: { grain: "PATIENT_HOSPITAL_RELATIONSHIP", value: 0 },
    programs: { grain: "PATIENT_PROGRAM", total: 0, active: 0, completed: 0 },
  },
  page: { items: [], pageSize: 20, nextCursor: null },
};
const childReport = {
  operation: "PARENT_CHILD_REPORT" as const,
  access: "PARENT_OWNER" as const,
  parent: { id: hospitalId, name: hospital.name },
  hospital: { id: childHospitalId, name: child.name },
  content: {
    state: "WITHHELD" as const,
    reason: "PARENT_FIELD_DISCLOSURE_NOT_APPROVED" as const,
    dashboard: { state: "WITHHELD" as const, reason: "PARENT_FIELD_DISCLOSURE_NOT_APPROVED" as const },
    serviceProcess: { state: "WITHHELD" as const, reason: "PARENT_FIELD_DISCLOSURE_NOT_APPROVED" as const },
  },
};
const hierarchy = {
  hospital: { id: hospitalId, hospitalCode: "DEMO-01", name: "โรงพยาบาลทดสอบ", status: HospitalStatus.ACTIVE, parentHospitalId: null },
  classification: "MAIN",
  parentHospital: null,
  directChildCount: 0,
  directChildren: [],
  issues: [],
};
const parentGroups = [{ parent: { id: hospitalId, name: hospital.name }, children: [{ id: childHospitalId, name: child.name }] }];

describe("Hospital report page context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetActor.mockResolvedValue(actor);
    mockedListHospitals.mockResolvedValue([hospital]);
    mockedListParentGroups.mockResolvedValue(parentGroups);
    mockedGetPage.mockResolvedValue(page);
    mockedGetParentChildPage.mockResolvedValue(childReport);
    mockedGetHierarchyContext.mockResolvedValue(hierarchy);
    mockedNotFound.mockImplementation(() => { throw new Error("NEXT_NOT_FOUND"); });
    mockedRedirect.mockImplementation((path: string) => { throw new Error(`NEXT_REDIRECT:${path}`); });
  });

  it("loads the existing direct OWNER report and grouped Child targets", async () => {
    await expect(getHospitalReportPageContext(undefined, undefined, undefined)).resolves.toMatchObject({
      mode: "DIRECT_OWNER",
      hospitals: [hospital],
      parentGroups,
      selection: { kind: "DIRECT_OWNER", hospitalId },
      selectedHospitalId: hospitalId,
      page,
      hierarchy,
    });
    expect(mockedListParentGroups).toHaveBeenCalledWith(actor, [hospitalId]);
    expect(mockedGetPage).toHaveBeenCalledWith(actor, { hospitalId, cursor: undefined, pageSize: undefined });
  });

  it("routes a non-owned Child through the dedicated Parent report read only", async () => {
    const context = await getHospitalReportPageContext(
      undefined,
      undefined,
      undefined,
      `PARENT_CHILD:${hospitalId}:${childHospitalId}`,
    );

    expect(context).toMatchObject({
      mode: "PARENT_CHILD",
      selection: { kind: "PARENT_CHILD", parentHospitalId: hospitalId, hospitalId: childHospitalId },
      selectedHospitalId: childHospitalId,
      report: childReport,
    });
    expect("page" in context).toBe(false);
    expect(mockedGetParentChildPage).toHaveBeenCalledWith(actor, { parentHospitalId: hospitalId, hospitalId: childHospitalId });
    expect(mockedGetPage).not.toHaveBeenCalled();
    expect(mockedGetHierarchyContext).not.toHaveBeenCalled();
  });

  it("preserves the direct OWNER operation when the selected Child is also directly owned", async () => {
    mockedListHospitals.mockResolvedValueOnce([hospital, child]);
    const childHierarchy = { ...hierarchy, hospital: { ...hierarchy.hospital, id: childHospitalId, name: child.name } };
    mockedGetHierarchyContext.mockResolvedValueOnce(childHierarchy);

    const context = await getHospitalReportPageContext(
      undefined,
      undefined,
      undefined,
      `PARENT_CHILD:${hospitalId}:${childHospitalId}`,
    );

    expect(context).toMatchObject({ mode: "DIRECT_OWNER", selectedHospitalId: childHospitalId });
    expect(mockedGetPage).toHaveBeenCalledWith(actor, { hospitalId: childHospitalId });
    expect(mockedGetParentChildPage).not.toHaveBeenCalled();
  });

  it("rejects a target outside the current direct OWNER and Parent contexts", async () => {
    await expect(getHospitalReportPageContext(otherHospitalId, undefined, undefined)).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(getHospitalReportPageContext(
      undefined,
      undefined,
      undefined,
      `PARENT_CHILD:${hospitalId}:${otherHospitalId}`,
    )).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockedNotFound).toHaveBeenCalledTimes(2);
    expect(mockedGetPage).not.toHaveBeenCalled();
    expect(mockedGetParentChildPage).not.toHaveBeenCalled();
  });

  it("resets and rejects Parent report pagination state", async () => {
    await expect(getHospitalReportPageContext(
      undefined,
      "direct-owner-cursor",
      20,
      `PARENT_CHILD:${hospitalId}:${childHospitalId}`,
    )).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockedGetParentChildPage).not.toHaveBeenCalled();
  });

  it("masks a revoked Parent report scope after the dedicated read", async () => {
    mockedGetParentChildPage.mockRejectedValue(new NotFoundError());

    await expect(getHospitalReportPageContext(
      undefined,
      undefined,
      undefined,
      `PARENT_CHILD:${hospitalId}:${childHospitalId}`,
    )).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("redirects users without a direct active OWNER scope and preserves authentication redirects", async () => {
    mockedListHospitals.mockResolvedValueOnce([]);
    await expect(getHospitalReportPageContext(undefined, undefined, undefined)).rejects.toThrow("NEXT_REDIRECT:/app");
    expect(mockedGetParentChildPage).not.toHaveBeenCalled();

    mockedGetActor.mockRejectedValueOnce(new UnauthenticatedError());
    await expect(getHospitalReportPageContext(undefined, undefined, undefined)).rejects.toThrow("NEXT_REDIRECT:/login");

    mockedGetActor.mockRejectedValueOnce(new ForbiddenError());
    await expect(getHospitalReportPageContext(undefined, undefined, undefined)).rejects.toThrow("NEXT_REDIRECT:/app");
  });
});
