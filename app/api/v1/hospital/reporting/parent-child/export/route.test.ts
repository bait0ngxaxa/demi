import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
  UnauthenticatedError,
} from "@/shared/errors/application-error";

const { mockedGetActor, mockedExport, mockedAudit } = vi.hoisted(() => ({
  mockedGetActor: vi.fn(),
  mockedExport: vi.fn(),
  mockedAudit: vi.fn(),
}));

vi.mock("@/modules/auth/services/application-access-service", () => ({ getProtectedApplicationActor: mockedGetActor }));
vi.mock("@/modules/reporting/services/parent-child-hospital-report-workbook-service", () => ({
  exportParentChildHospitalReportWorkbook: mockedExport,
}));
vi.mock("@/modules/reporting/services/parent-child-hospital-report-audit-service", () => ({
  recordParentChildHospitalReportingAudit: mockedAudit,
}));

import { GET } from "./route";

const parentHospitalId = "11111111-1111-4111-8111-111111111111";
const hospitalId = "22222222-2222-4222-8222-222222222222";
const actor = { userId: "33333333-3333-4333-8333-333333333333" };
const generatedAt = new Date("2026-10-17T05:00:00.000Z");
const endpoint = "https://demi.example.test/api/v1/hospital/reporting/parent-child/export";

describe("RPT-32 Parent-to-Child summary export endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetActor.mockResolvedValue(actor);
    mockedAudit.mockResolvedValue(undefined);
    mockedExport.mockResolvedValue({
      buffer: Buffer.from("synthetic-xlsx-bytes"),
      generatedAt,
      summary: { hospital: { id: hospitalId } },
    });
  });

  it("returns a private XLSX named by the exact Child and passes only the Parent/Child locators", async () => {
    const response = await GET(new Request(`${endpoint}?parentHospitalId=${parentHospitalId}&hospitalId=${hospitalId}`));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Content-Disposition")).toBe(
      `attachment; filename="demi-child-summary-${hospitalId}-2026-10-17.xlsx"`,
    );
    expect(mockedExport).toHaveBeenCalledWith(actor, { parentHospitalId, hospitalId });
  });

  it.each([
    `hospitalId=${hospitalId}`,
    `parentHospitalId=${parentHospitalId}`,
    `parentHospitalId=${parentHospitalId}&hospitalId=${hospitalId}&hospitalId=${hospitalId}`,
    `parentHospitalId=${parentHospitalId}&hospitalId=${hospitalId}&cohort=INCLUDE_ENDED`,
  ])("rejects malformed, extra or include-ended parameters after authentication and audits the denial (%s)", async (query) => {
    const response = await GET(new Request(`${endpoint}?${query}`));

    expect(response.status).toBe(400);
    expect(mockedGetActor).toHaveBeenCalledOnce();
    expect(mockedExport).not.toHaveBeenCalled();
    expect(mockedAudit).toHaveBeenCalledOnce();
    expect(mockedAudit).toHaveBeenCalledWith({
      actor,
      operation: "export",
      outcome: "denied",
      reason: "SCOPE_UNAVAILABLE",
    });
  });

  it("does not audit an unauthenticated request, including malformed query parameters", async () => {
    mockedGetActor.mockRejectedValue(new UnauthenticatedError());

    const response = await GET(new Request(`${endpoint}?hospitalId=${hospitalId}`));

    expect(response.status).toBe(401);
    expect(mockedAudit).not.toHaveBeenCalled();
    expect(mockedExport).not.toHaveBeenCalled();
  });

  it("audits a verified session denied DEMI application access without request-supplied scope", async () => {
    mockedGetActor.mockRejectedValue(new ForbiddenError());

    const response = await GET(new Request(`${endpoint}?parentHospitalId=${parentHospitalId}&hospitalId=${hospitalId}`));

    expect(response.status).toBe(403);
    expect(mockedAudit).toHaveBeenCalledOnce();
    expect(mockedAudit).toHaveBeenCalledWith({
      operation: "export",
      outcome: "denied",
      reason: "NOT_AUTHORIZED",
    });
    expect(mockedExport).not.toHaveBeenCalled();
  });

  it.each([
    [new UnauthenticatedError(), 401],
    [new ForbiddenError(), 403],
    [new NotFoundError(), 404],
    [new InfrastructureError("sensitive detail"), 503],
  ])("maps %s without a file body", async (error, status) => {
    mockedExport.mockRejectedValue(error);

    const response = await GET(new Request(`${endpoint}?parentHospitalId=${parentHospitalId}&hospitalId=${hospitalId}`));

    expect(response.status).toBe(status);
    expect(JSON.stringify(await response.json())).not.toContain("sensitive detail");
    expect(mockedAudit).not.toHaveBeenCalled();
  });
});
