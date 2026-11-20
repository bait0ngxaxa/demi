import { HospitalStatus, Role } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GlobalReportingDirectory } from "../projections/global-reporting-projection";
import type { HospitalReportingPageProjection } from "../projections/hospital-report-projection";
import type {
  HospitalHierarchyContext,
  HospitalHierarchyUnit,
} from "@/modules/hospital-hierarchy/services/hospital-hierarchy-service";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/shared/errors/application-error";

const {
  mockedGetActor,
  mockedResolveAccess,
  mockedRecordAudit,
  mockedGetDirectory,
  mockedGetHierarchy,
  mockedGetPage,
  mockedNotFound,
  mockedRedirect,
} = vi.hoisted(() => ({
  mockedGetActor: vi.fn(),
  mockedResolveAccess: vi.fn(),
  mockedRecordAudit: vi.fn(),
  mockedGetDirectory: vi.fn(),
  mockedGetHierarchy: vi.fn(),
  mockedGetPage: vi.fn(),
  mockedNotFound: vi.fn(),
  mockedRedirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: mockedNotFound, redirect: mockedRedirect }));
vi.mock("@/modules/auth/services/application-access-service", () => ({ getProtectedApplicationActor: mockedGetActor }));
vi.mock("../services/global-reporting-access-service", () => ({
  globalReportingAuditReasonForError: () => "NOT_AUTHORIZED",
  recordGlobalReportingAudit: mockedRecordAudit,
  resolveGlobalReportingAccessContext: mockedResolveAccess,
}));
vi.mock("../services/global-reporting-service", () => ({
  getGlobalReportingDirectory: mockedGetDirectory,
}));
vi.mock("../services/hospital-report-query-service", () => ({
  getGlobalAdminHospitalReportingPage: mockedGetPage,
}));
vi.mock("@/modules/hospital-hierarchy/services/hospital-hierarchy-service", () => ({
  getHospitalHierarchyContext: mockedGetHierarchy,
}));

import { GLOBAL_REPORTING_CAPABILITIES } from "../policies/global-reporting-policy";
import {
  getGlobalHospitalReportPageContext,
  getGlobalReportingDirectoryPageContext,
} from "./global-reporting-page-context";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const actor = {
  userId: "22222222-2222-4222-8222-222222222222",
  personId: "33333333-3333-4333-8333-333333333333",
  roles: [Role.ADMIN],
  hospitalMemberships: [],
  osmHospitalRelationships: [],
};
const hospital: HospitalHierarchyUnit = {
  id: hospitalId,
  hospitalCode: "DEMO-01",
  name: "โรงพยาบาลสังเคราะห์",
  status: HospitalStatus.ACTIVE,
};
const directory: GlobalReportingDirectory = {
  hierarchy: {
    hospitalCount: 1,
    mainHospitalCount: 1,
    subordinateHospitalCount: 0,
    groups: [{ mainHospital: hospital, directChildren: [] }],
    outsideNetwork: [],
  },
  statusCounts: {
    [HospitalStatus.ACTIVE]: 1,
    [HospitalStatus.PENDING_VERIFICATION]: 0,
    [HospitalStatus.SUSPENDED]: 0,
    [HospitalStatus.RETIRED]: 0,
  },
};
const hierarchy: HospitalHierarchyContext = {
  hospital,
  classification: "MAIN",
  parentHospital: null,
  directChildCount: 0,
  directChildren: [],
};
const page: HospitalReportingPageProjection = {
  hospital: { id: hospital.id, hospitalCode: hospital.hospitalCode, name: hospital.name },
  cohort: "ACTIVE",
  counts: {
    patientHospitalRelationships: { grain: "PATIENT_HOSPITAL_RELATIONSHIP", value: 0 },
    relationshipsWithoutProgram: { grain: "PATIENT_HOSPITAL_RELATIONSHIP", value: 0 },
    programs: { grain: "PATIENT_PROGRAM", total: 0, active: 0, completed: 0 },
  },
  serviceProcess: {
    programsWithRoutineRecord: { grain: "PATIENT_PROGRAM", value: 0 },
    programsWithFloatingChartRecord: { grain: "PATIENT_PROGRAM", value: 0 },
    programsWithDreamCardRecord: { grain: "PATIENT_PROGRAM", value: 0 },
    programsWithConfidenceRecord: { grain: "PATIENT_PROGRAM", value: 0 },
  },
  filters: { search: "", progress: "", status: "" },
  roundProgress: { rounds: [0, 0, 0, 0, 0, 0, 0], afterRecorded: 0, completed: 0 },
  page: { items: [], total: 0, number: 1, previousCursor: null, pageSize: 20, nextCursor: null },
};

function auditedReads(): { capability: string; hospitalId?: string }[] {
  return mockedRecordAudit.mock.calls
    .map(([event]) => event as { capability: string; hospitalId?: string; outcome: string })
    .filter(({ outcome }) => outcome === "read")
    .map(({ capability, hospitalId: auditedHospitalId }) => ({ capability, ...(auditedHospitalId ? { hospitalId: auditedHospitalId } : {}) }));
}

describe("Global Reporting page contexts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetActor.mockResolvedValue(actor);
    mockedResolveAccess.mockResolvedValue({ actor, hospital });
    mockedRecordAudit.mockResolvedValue(undefined);
    mockedGetDirectory.mockResolvedValue(directory);
    mockedGetHierarchy.mockResolvedValue(hierarchy);
    mockedGetPage.mockResolvedValue(page);
    mockedNotFound.mockImplementation(() => { throw new Error("NEXT_NOT_FOUND"); });
    mockedRedirect.mockImplementation((path: string) => { throw new Error(`NEXT_REDIRECT:${path}`); });
  });

  it("reads the directory on the directory page without any Hospital report", async () => {
    await expect(getGlobalReportingDirectoryPageContext()).resolves.toEqual({ directory });
    expect(mockedGetDirectory).toHaveBeenCalledWith(actor);
    expect(mockedGetHierarchy).not.toHaveBeenCalled();
    expect(mockedGetPage).not.toHaveBeenCalled();
    expect(auditedReads()).toEqual([{ capability: GLOBAL_REPORTING_CAPABILITIES.workspaceRead }]);
  });

  it("loads an ACTIVE Hospital's report without reading the directory", async () => {
    await expect(getGlobalHospitalReportPageContext({ hospitalId, cursor: "signed-cursor", pageSize: 20 })).resolves.toEqual({
      hierarchy,
      page,
    });
    expect(mockedGetDirectory).not.toHaveBeenCalled();
    expect(mockedGetPage).toHaveBeenCalledWith(actor, {
      hospitalId,
      cursor: "signed-cursor",
      search: "", progress: "", status: "",
      pageSize: 20,
    });
    expect(mockedResolveAccess).toHaveBeenCalledWith(
      actor,
      GLOBAL_REPORTING_CAPABILITIES.hospitalRead,
      hospitalId,
    );
    expect(auditedReads()).toEqual([{ capability: GLOBAL_REPORTING_CAPABILITIES.hospitalRead, hospitalId }]);
  });

  it("shows a pending Hospital's status without querying patient reports or the directory", async () => {
    const pendingHospital = { ...hospital, status: HospitalStatus.PENDING_VERIFICATION };
    mockedGetHierarchy.mockResolvedValue({ ...hierarchy, hospital: pendingHospital });

    await expect(getGlobalHospitalReportPageContext({ hospitalId })).resolves.toEqual({
      hierarchy: { ...hierarchy, hospital: pendingHospital },
      page: null,
    });
    expect(mockedGetPage).not.toHaveBeenCalled();
    expect(mockedGetDirectory).not.toHaveBeenCalled();
    expect(mockedResolveAccess).toHaveBeenCalledWith(actor, GLOBAL_REPORTING_CAPABILITIES.directoryRead);
    expect(auditedReads()).toEqual([{ capability: GLOBAL_REPORTING_CAPABILITIES.workspaceRead, hospitalId }]);
  });

  it("hides a pending Hospital's report pages", async () => {
    mockedGetHierarchy.mockResolvedValue({ ...hierarchy, hospital: { ...hospital, status: HospitalStatus.SUSPENDED } });

    await expect(getGlobalHospitalReportPageContext({ hospitalId, cursor: "signed-cursor" })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockedGetPage).not.toHaveBeenCalled();
  });

  it("hides a RETIRED Hospital, which the directory never lists", async () => {
    mockedGetHierarchy.mockResolvedValue({ ...hierarchy, hospital: { ...hospital, status: HospitalStatus.RETIRED } });

    await expect(getGlobalHospitalReportPageContext({ hospitalId })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockedGetPage).not.toHaveBeenCalled();
    expect(auditedReads()).toEqual([]);
    expect(mockedRecordAudit).toHaveBeenCalledWith(expect.objectContaining({
      capability: GLOBAL_REPORTING_CAPABILITIES.workspaceRead,
      hospitalId,
      outcome: "denied",
    }));
  });

  it("hides an unknown or malformed Hospital", async () => {
    mockedGetHierarchy.mockRejectedValueOnce(new NotFoundError());
    await expect(getGlobalHospitalReportPageContext({ hospitalId })).rejects.toThrow("NEXT_NOT_FOUND");

    await expect(getGlobalHospitalReportPageContext({ hospitalId: "not-a-uuid" })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockedGetPage).not.toHaveBeenCalled();
  });

  it("hides a selected Hospital when the exact-Hospital report read is revoked", async () => {
    mockedGetPage.mockRejectedValue(new NotFoundError());

    await expect(getGlobalHospitalReportPageContext({ hospitalId })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockedNotFound).toHaveBeenCalledOnce();
    expect(mockedRecordAudit).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: actor.userId,
      capability: GLOBAL_REPORTING_CAPABILITIES.hospitalRead,
      hospitalId,
      outcome: "denied",
    }));
  });

  it("redirects an authenticated non-ADMIN away instead of presenting the authorized route as missing", async () => {
    mockedResolveAccess.mockRejectedValueOnce(new ForbiddenError());
    await expect(getGlobalReportingDirectoryPageContext()).rejects.toThrow("NEXT_REDIRECT:/app");

    mockedResolveAccess.mockRejectedValueOnce(new ForbiddenError());
    await expect(getGlobalHospitalReportPageContext({ hospitalId })).rejects.toThrow("NEXT_REDIRECT:/app");

    expect(mockedNotFound).not.toHaveBeenCalled();
    expect(mockedGetDirectory).not.toHaveBeenCalled();
    expect(mockedGetHierarchy).not.toHaveBeenCalled();
    expect(mockedRecordAudit).toHaveBeenCalledWith(expect.objectContaining({
      capability: GLOBAL_REPORTING_CAPABILITIES.workspaceRead,
      outcome: "denied",
    }));
  });

  it("revalidates directory access before returning a pending Hospital context", async () => {
    const pendingHospital = { ...hospital, status: HospitalStatus.PENDING_VERIFICATION };
    mockedGetHierarchy.mockResolvedValue({ ...hierarchy, hospital: pendingHospital });
    mockedResolveAccess
      .mockResolvedValueOnce({ actor, hospital: null })
      .mockRejectedValueOnce(new ForbiddenError());

    await expect(getGlobalHospitalReportPageContext({ hospitalId })).rejects.toThrow("NEXT_REDIRECT:/app");
    expect(mockedNotFound).not.toHaveBeenCalled();
    expect(mockedGetPage).not.toHaveBeenCalled();
    expect(mockedRecordAudit).toHaveBeenCalledWith(expect.objectContaining({
      capability: GLOBAL_REPORTING_CAPABILITIES.directoryRead,
      hospitalId,
      outcome: "denied",
    }));
    expect(auditedReads()).toEqual([]);
  });

  it("retains the application sign-in and access redirects", async () => {
    mockedGetActor.mockRejectedValueOnce(new UnauthenticatedError());
    await expect(getGlobalReportingDirectoryPageContext()).rejects.toThrow("NEXT_REDIRECT:/login");

    mockedGetActor.mockRejectedValueOnce(new ForbiddenError());
    await expect(getGlobalHospitalReportPageContext({ hospitalId })).rejects.toThrow("NEXT_REDIRECT:/app");
  });
});
