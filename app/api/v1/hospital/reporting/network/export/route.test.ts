import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ConflictError,
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
} from "@/shared/errors/application-error";

const { mockedGetActor, mockedExport, mockedRefusal } = vi.hoisted(() => ({
  mockedGetActor: vi.fn(),
  mockedExport: vi.fn(),
  mockedRefusal: vi.fn(),
}));

vi.mock("@/modules/auth/services/application-access-service", () => ({ getProtectedApplicationActor: mockedGetActor }));
vi.mock("@/modules/reporting/services/network-report-export-service", () => ({ exportNetworkReportWorkbook: mockedExport }));
vi.mock("@/modules/reporting/services/network-report-audit-service", () => ({ recordNetworkReportExportRefusal: mockedRefusal }));

import { HospitalReportExportLimitError } from "@/modules/reporting/services/hospital-report-query-service";

import { GET } from "./route";

const parentHospitalId = "11111111-1111-4111-8111-111111111111";
const hospitalId = "22222222-2222-4222-8222-222222222222";
const actor = { userId: "33333333-3333-4333-8333-333333333333" };
const generatedAt = new Date("2026-11-01T05:00:00.000Z");
const endpoint = "https://demi.example.test/api/v1/hospital/reporting/network/export";

describe("ADR-0025 network report export endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetActor.mockResolvedValue(actor);
    mockedRefusal.mockResolvedValue(undefined);
    mockedExport.mockResolvedValue({
      buffer: Buffer.from("synthetic-xlsx-bytes"),
      generatedAt,
      parent: { id: parentHospitalId, hospitalCode: "P/001 แม่ข่าย", name: "แม่ข่าย" },
    });
  });

  it("returns a private XLSX named by the Parent code and passes the parsed selection", async () => {
    const response = await GET(new Request(`${endpoint}?parentHospitalId=${parentHospitalId}&scope=ALL&cohort=INCLUDE_ENDED`));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="demi-network-report-P_001________-2026-11-01.xlsx"');
    expect(mockedExport).toHaveBeenCalledWith(actor, { parentHospitalId, hospitalIds: "ALL", cohort: "INCLUDE_ENDED" });
  });

  it("passes repeated hospitalId values as an explicit selection", async () => {
    await GET(new Request(`${endpoint}?parentHospitalId=${parentHospitalId}&hospitalId=${parentHospitalId}&hospitalId=${hospitalId}`));

    expect(mockedExport).toHaveBeenCalledWith(actor, { parentHospitalId, hospitalIds: [parentHospitalId, hospitalId] });
  });

  it.each([
    `parentHospitalId=${parentHospitalId}`,
    `parentHospitalId=${parentHospitalId}&scope=ALL&hospitalId=${hospitalId}`,
    `parentHospitalId=${parentHospitalId}&scope=ALL&extra=1`,
  ])("rejects the malformed query %j with an audited 400 before export", async (query) => {
    const response = await GET(new Request(`${endpoint}?${query}`));

    expect(response.status).toBe(400);
    expect(mockedExport).not.toHaveBeenCalled();
    expect(mockedRefusal).toHaveBeenCalledWith({ actor, outcome: "denied", reason: "INVALID_REQUEST" });
  });

  it.each([
    [new NotFoundError(), 404],
    [new ForbiddenError(), 403],
    [new ValidationError(), 400],
    [new HospitalReportExportLimitError("ส่งออกได้ไม่เกิน 5,000 โปรแกรมต่อไฟล์"), 413],
    [new InfrastructureError(), 503],
  ])("maps %s to %i", async (error, status) => {
    mockedExport.mockRejectedValue(error);
    const response = await GET(new Request(`${endpoint}?parentHospitalId=${parentHospitalId}&scope=ALL`));

    expect(response.status).toBe(status);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });

  it("returns the safe Hospital-naming conflict message as 409", async () => {
    mockedExport.mockRejectedValue(new ConflictError("หน่วยบริการต่อไปนี้ไม่อยู่ในเครือข่ายที่ส่งออกได้แล้ว: รพ.สต.ก"));
    const response = await GET(new Request(`${endpoint}?parentHospitalId=${parentHospitalId}&hospitalId=${hospitalId}`));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "หน่วยบริการต่อไปนี้ไม่อยู่ในเครือข่ายที่ส่งออกได้แล้ว: รพ.สต.ก" });
  });

  it("does not audit an unauthenticated request and records a verified denied session without request IDs", async () => {
    mockedGetActor.mockRejectedValueOnce(new UnauthenticatedError());
    expect((await GET(new Request(`${endpoint}?parentHospitalId=${parentHospitalId}&scope=ALL`))).status).toBe(401);
    expect(mockedRefusal).not.toHaveBeenCalled();

    mockedGetActor.mockRejectedValueOnce(new ForbiddenError());
    expect((await GET(new Request(`${endpoint}?parentHospitalId=${parentHospitalId}&scope=ALL`))).status).toBe(403);
    expect(mockedRefusal).toHaveBeenCalledWith({ outcome: "denied", reason: "NOT_AUTHORIZED" });
  });
});
