import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApplicationError, ForbiddenError, NotFoundError, UnauthenticatedError } from "@/shared/errors/application-error";
import { HospitalReportExportLimitError } from "@/modules/reporting/services/hospital-report-query-service";

const { mockedGetActor, mockedExport, mockedAudit } = vi.hoisted(() => ({
  mockedGetActor: vi.fn(),
  mockedExport: vi.fn(),
  mockedAudit: vi.fn(),
}));

vi.mock("@/modules/auth/services/application-access-service", () => ({ getProtectedApplicationActor: mockedGetActor }));
vi.mock("@/modules/reporting/services/hospital-report-workbook-service", () => ({
  exportGlobalAdminHospitalReportingWorkbook: mockedExport,
}));
vi.mock("@/modules/reporting/services/global-reporting-access-service", () => ({
  globalReportingAuditReasonForError: (error: unknown) => error instanceof UnauthenticatedError
    ? "UNAUTHENTICATED"
    : error instanceof ApplicationError && error.code === "VALIDATION"
      ? "INVALID_REQUEST"
      : "NOT_AUTHORIZED",
  recordGlobalReportingAudit: mockedAudit,
}));

import { GET } from "./route";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const actor = { userId: "22222222-2222-4222-8222-222222222222" };
const generatedAt = new Date("2026-10-11T05:00:00.000Z");

describe("Global Admin report export endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetActor.mockResolvedValue(actor);
    mockedExport.mockResolvedValue({
      buffer: Buffer.from("synthetic-xlsx-bytes"),
      generatedAt,
      hospitalCode: "DEMO-A",
    });
  });

  it("returns a private, non-cacheable Hospital-specific XLSX", async () => {
    const response = await GET(new Request(`https://demi.example.test/api/v1/admin/reporting/export?hospitalId=${hospitalId}`));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(response.headers.get("Cache-Control")).toContain("private");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Content-Disposition")).toContain("DEMO-A");
    expect(response.headers.get("X-Report-Generated-At")).toBe(generatedAt.toISOString());
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array(Buffer.from("synthetic-xlsx-bytes")));
    expect(mockedExport).toHaveBeenCalledWith(actor, { hospitalId });
  });

  it("rejects malformed or extra query parameters before reading reporting data and audits the denial", async () => {
    const response = await GET(new Request(`https://demi.example.test/api/v1/admin/reporting/export?hospitalId=${hospitalId}&hospitalId=${hospitalId}`));

    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(mockedGetActor).not.toHaveBeenCalled();
    expect(mockedExport).not.toHaveBeenCalled();
    expect(mockedAudit).toHaveBeenCalledWith(expect.objectContaining({
      capability: "global:report:hospital:export",
      outcome: "denied",
      reason: "INVALID_REQUEST",
    }));
  });

  it.each([
    [new UnauthenticatedError(), 401],
    [new ForbiddenError(), 403],
    [new NotFoundError(), 404],
    [new HospitalReportExportLimitError("เกินขีดจำกัด"), 413],
  ])("maps authorization and export failures safely", async (error, status) => {
    mockedExport.mockRejectedValue(error);
    const response = await GET(new Request(`https://demi.example.test/api/v1/admin/reporting/export?hospitalId=${hospitalId}`));
    const payload: unknown = await response.json();

    expect(response.status).toBe(status);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(JSON.stringify(payload)).not.toContain("stack");
    expect(JSON.stringify(payload)).not.toContain("Prisma");
  });
});
