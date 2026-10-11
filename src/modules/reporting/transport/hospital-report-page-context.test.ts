import { HospitalStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/shared/errors/application-error";

const {
  mockedGetActor,
  mockedListHospitals,
  mockedGetPage,
  mockedGetHierarchyContext,
  mockedNotFound,
  mockedRedirect,
} = vi.hoisted(() => ({
  mockedGetActor: vi.fn(),
  mockedListHospitals: vi.fn(),
  mockedGetPage: vi.fn(),
  mockedGetHierarchyContext: vi.fn(),
  mockedNotFound: vi.fn(),
  mockedRedirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: mockedNotFound, redirect: mockedRedirect }));
vi.mock("@/modules/auth/services/application-access-service", () => ({ getProtectedApplicationActor: mockedGetActor }));
vi.mock("../services/hospital-report-access-service", () => ({ listHospitalReportingHospitals: mockedListHospitals }));
vi.mock("../services/hospital-report-query-service", () => ({ getHospitalReportingPage: mockedGetPage }));
vi.mock("@/modules/hospital-hierarchy/services/hospital-hierarchy-service", () => ({
  getHospitalHierarchyContext: mockedGetHierarchyContext,
}));

import { getHospitalReportPageContext } from "./hospital-report-page-context";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const otherHospitalId = "22222222-2222-4222-8222-222222222222";
const actor = { userId: "33333333-3333-4333-8333-333333333333", roles: [] };
const hospital = { id: hospitalId, hospitalCode: "DEMO-01", name: "โรงพยาบาลทดสอบ", status: HospitalStatus.ACTIVE };
const page = {
  hospital: { id: hospitalId, hospitalCode: "DEMO-01", name: "โรงพยาบาลทดสอบ" },
  counts: {
    patientHospitalRelationships: { grain: "PATIENT_HOSPITAL_RELATIONSHIP", value: 0 },
    relationshipsWithoutProgram: { grain: "PATIENT_HOSPITAL_RELATIONSHIP", value: 0 },
    programs: { grain: "PATIENT_PROGRAM", total: 0, active: 0, completed: 0 },
  },
  page: { items: [], pageSize: 20, nextCursor: null },
};
const hierarchy = {
  hospital: { id: hospitalId, hospitalCode: "DEMO-01", name: "โรงพยาบาลทดสอบ", status: HospitalStatus.ACTIVE, parentHospitalId: null },
  classification: "MAIN",
  parentHospital: null,
  directChildCount: 0,
  directChildren: [],
  issues: [],
};

describe("Hospital report page context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetActor.mockResolvedValue(actor);
    mockedListHospitals.mockResolvedValue([hospital]);
    mockedGetPage.mockResolvedValue(page);
    mockedGetHierarchyContext.mockResolvedValue(hierarchy);
    mockedNotFound.mockImplementation(() => { throw new Error("NEXT_NOT_FOUND"); });
    mockedRedirect.mockImplementation((path: string) => { throw new Error(`NEXT_REDIRECT:${path}`); });
  });

  it("selects only an active directly owned Hospital and loads its data projection", async () => {
    await expect(getHospitalReportPageContext(undefined, undefined, undefined)).resolves.toMatchObject({
      hospitals: [hospital],
      selectedHospitalId: hospitalId,
      page,
      hierarchy,
    });
    expect(mockedGetPage).toHaveBeenCalledWith(actor, { hospitalId, cursor: undefined, pageSize: undefined });
  });

  it("rejects a Hospital not returned by the active direct Owner scope", async () => {
    await expect(getHospitalReportPageContext(otherHospitalId, undefined, undefined)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockedNotFound).toHaveBeenCalledOnce();
    expect(mockedGetPage).not.toHaveBeenCalled();
  });

  it("redirects an actor without a direct active Owner scope instead of presenting reporting as a missing route", async () => {
    mockedListHospitals.mockResolvedValueOnce([]);

    await expect(getHospitalReportPageContext(undefined, undefined, undefined)).rejects.toThrow("NEXT_REDIRECT:/app");
    expect(mockedGetPage).not.toHaveBeenCalled();
  });

  it("revalidates the page read after Hospital selection and masks a revoked scope", async () => {
    mockedGetPage.mockRejectedValue(new NotFoundError());

    await expect(getHospitalReportPageContext(hospitalId, "next-page-cursor", 20)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockedGetPage).toHaveBeenCalledWith(actor, {
      hospitalId,
      cursor: "next-page-cursor",
      pageSize: 20,
    });
  });

  it("masks a revoked hierarchy context after the exact-Hospital report read", async () => {
    mockedGetHierarchyContext.mockRejectedValue(new NotFoundError());

    await expect(getHospitalReportPageContext(hospitalId, undefined, undefined)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockedGetPage).toHaveBeenCalledOnce();
    expect(mockedGetHierarchyContext).toHaveBeenCalledWith(actor, hospitalId);
  });

  it("keeps the existing sign-in and application redirects", async () => {
    mockedGetActor.mockRejectedValueOnce(new UnauthenticatedError());
    await expect(getHospitalReportPageContext(undefined, undefined, undefined)).rejects.toThrow("NEXT_REDIRECT:/login");

    mockedGetActor.mockRejectedValueOnce(new ForbiddenError());
    await expect(getHospitalReportPageContext(undefined, undefined, undefined)).rejects.toThrow("NEXT_REDIRECT:/app");
  });
});
