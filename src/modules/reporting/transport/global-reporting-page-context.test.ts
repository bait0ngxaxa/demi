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
  mockedGetHospital,
  mockedGetHierarchy,
  mockedGetPage,
  mockedNotFound,
  mockedRedirect,
} = vi.hoisted(() => ({
  mockedGetActor: vi.fn(),
  mockedResolveAccess: vi.fn(),
  mockedRecordAudit: vi.fn(),
  mockedGetDirectory: vi.fn(),
  mockedGetHospital: vi.fn(),
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
  getGlobalReportingHospitalById: mockedGetHospital,
}));
vi.mock("../services/hospital-report-query-service", () => ({
  getGlobalAdminHospitalReportingPage: mockedGetPage,
}));
vi.mock("@/modules/hospital-hierarchy/services/hospital-hierarchy-service", () => ({
  getHospitalHierarchyContext: mockedGetHierarchy,
}));

import { GLOBAL_REPORTING_CAPABILITIES } from "../policies/global-reporting-policy";
import { getGlobalReportingPageContext } from "./global-reporting-page-context";

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
  filters: { search: "", progress: "", status: "" },
  roundProgress: { rounds: [0, 0, 0, 0, 0, 0, 0], afterRecorded: 0, completed: 0 },
  page: { items: [], total: 0, number: 1, previousCursor: null, pageSize: 20, nextCursor: null },
};

describe("Global Reporting page context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetActor.mockResolvedValue(actor);
    mockedResolveAccess.mockResolvedValue({ actor, hospital });
    mockedRecordAudit.mockResolvedValue(undefined);
    mockedGetDirectory.mockResolvedValue(directory);
    mockedGetHospital.mockReturnValue(hospital);
    mockedGetHierarchy.mockResolvedValue(hierarchy);
    mockedGetPage.mockResolvedValue(page);
    mockedNotFound.mockImplementation(() => { throw new Error("NEXT_NOT_FOUND"); });
    mockedRedirect.mockImplementation((path: string) => { throw new Error(`NEXT_REDIRECT:${path}`); });
  });

  it("loads the selected ACTIVE Hospital through the Global operation only", async () => {
    await expect(getGlobalReportingPageContext({ hospitalId, cursor: "signed-cursor", pageSize: 20 })).resolves.toMatchObject({
      directory,
      selectedHospital: hospital,
      hierarchy,
      page,
      selectedHospitalId: hospitalId,
    });
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
  });

  it("keeps an inactive Hospital in the directory without querying patient reports", async () => {
    const pendingHospital = { ...hospital, status: HospitalStatus.PENDING_VERIFICATION };
    mockedGetHospital.mockReturnValue(pendingHospital);
    mockedGetHierarchy.mockResolvedValue({ ...hierarchy, hospital: pendingHospital });

    await expect(getGlobalReportingPageContext({ hospitalId })).resolves.toMatchObject({
      selectedHospital: pendingHospital,
      page: null,
      selectedHospitalId: hospitalId,
    });
    expect(mockedGetPage).not.toHaveBeenCalled();
    expect(mockedResolveAccess).toHaveBeenCalledWith(actor, GLOBAL_REPORTING_CAPABILITIES.directoryRead);
  });

  it("hides a selected Hospital when the exact-Hospital report read is revoked", async () => {
    mockedGetPage.mockRejectedValue(new NotFoundError());

    await expect(getGlobalReportingPageContext({ hospitalId })).rejects.toThrow("NEXT_NOT_FOUND");
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

    await expect(getGlobalReportingPageContext({})).rejects.toThrow("NEXT_REDIRECT:/app");
    expect(mockedNotFound).not.toHaveBeenCalled();
    expect(mockedRecordAudit).toHaveBeenCalledWith(expect.objectContaining({
      capability: GLOBAL_REPORTING_CAPABILITIES.workspaceRead,
      outcome: "denied",
    }));
  });

  it("revalidates directory access before returning a pending Hospital context", async () => {
    const pendingHospital = { ...hospital, status: HospitalStatus.PENDING_VERIFICATION };
    mockedGetHospital.mockReturnValue(pendingHospital);
    mockedGetHierarchy.mockResolvedValue({ ...hierarchy, hospital: pendingHospital });
    mockedResolveAccess
      .mockResolvedValueOnce({ actor, hospital: null })
      .mockRejectedValueOnce(new ForbiddenError());

    await expect(getGlobalReportingPageContext({ hospitalId })).rejects.toThrow("NEXT_REDIRECT:/app");
    expect(mockedNotFound).not.toHaveBeenCalled();
    expect(mockedGetPage).not.toHaveBeenCalled();
    expect(mockedRecordAudit).toHaveBeenCalledWith(expect.objectContaining({
      capability: GLOBAL_REPORTING_CAPABILITIES.directoryRead,
      hospitalId,
      outcome: "denied",
    }));
  });

  it("retains the application sign-in and access redirects", async () => {
    mockedGetActor.mockRejectedValueOnce(new UnauthenticatedError());
    await expect(getGlobalReportingPageContext({})).rejects.toThrow("NEXT_REDIRECT:/login");

    mockedGetActor.mockRejectedValueOnce(new ForbiddenError());
    await expect(getGlobalReportingPageContext({})).rejects.toThrow("NEXT_REDIRECT:/app");
  });
});
