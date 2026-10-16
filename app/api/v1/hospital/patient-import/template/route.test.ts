import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";

const mockedActor = vi.hoisted(() => vi.fn());
const mockedTemplateDownload = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: mockedActor,
}));
vi.mock("@/modules/patient-provisioning/transport/patient-import-downloads", () => ({
  createPatientImportTemplateDownload: mockedTemplateDownload,
}));

import { GET } from "./route";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const actor = { userId: "22222222-2222-4222-8222-222222222222" };

function request(query: string): Request {
  return new Request(`http://localhost/api/v1/hospital/patient-import/template${query}`);
}

describe("GET /api/v1/hospital/patient-import/template", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedActor.mockResolvedValue(actor);
    mockedTemplateDownload.mockResolvedValue({
      filename: "DEMI_โรงพยาบาลสังเคราะห์เอ_patient_import_v2.xlsx",
      buffer: Buffer.from("xlsx-bytes"),
    });
  });

  it("streams the hospital-bound workbook as a no-store attachment", async () => {
    const response = await GET(request(`?hospitalId=${hospitalId}`));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    const contentDisposition = response.headers.get("content-disposition") ?? "";
    const encodedFilename = contentDisposition.match(/filename\*=UTF-8''([^;]+)/u)?.[1];
    expect(contentDisposition).toContain('filename="DEMI_patient_import_v2.xlsx"');
    expect(decodeURIComponent(encodedFilename ?? "")).toBe(
      "DEMI_โรงพยาบาลสังเคราะห์เอ_patient_import_v2.xlsx",
    );
    expect(contentDisposition).not.toContain("SYN-A");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("xlsx-bytes");
    expect(mockedTemplateDownload).toHaveBeenCalledWith(actor, hospitalId);
  });

  it("returns 403 and no workbook for an out-of-scope hospital", async () => {
    mockedTemplateDownload.mockRejectedValue(new ForbiddenError());

    const response = await GET(request(`?hospitalId=${hospitalId}`));

    expect(response.status).toBe(403);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("content-disposition")).toBeNull();
  });

  it("returns 401 for an unauthenticated request", async () => {
    mockedActor.mockRejectedValue(new UnauthenticatedError());

    const response = await GET(request(`?hospitalId=${hospitalId}`));

    expect(response.status).toBe(401);
    expect(mockedTemplateDownload).not.toHaveBeenCalled();
  });

  it.each([
    ["no hospital id", ""],
    ["a malformed hospital id", "?hospitalId=not-a-uuid"],
    ["an extra query parameter", `?hospitalId=${hospitalId}&x=1`],
  ])("returns 400 for %s without touching the service", async (_label, query) => {
    const response = await GET(request(query));

    expect(response.status).toBe(400);
    expect(mockedTemplateDownload).not.toHaveBeenCalled();
  });

  it("returns 503 for an unexpected failure", async () => {
    mockedTemplateDownload.mockRejectedValue(new Error("boom"));

    expect((await GET(request(`?hospitalId=${hospitalId}`))).status).toBe(503);
  });
});
