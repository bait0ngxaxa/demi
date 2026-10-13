import { beforeEach, describe, expect, it, vi } from "vitest";

import { PATIENT_IMPORT_CONTRACT_VERSION } from "@/modules/patient-provisioning/import/patient-import-contract";
import { PatientImportPreviewBindingError } from "@/modules/patient-provisioning/transport/patient-import-file-binding";
import { ForbiddenError, ValidationError } from "@/shared/errors/application-error";

const mockedActor = vi.hoisted(() => vi.fn());
const mockedFailedRowsDownload = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: mockedActor,
}));
vi.mock("@/modules/patient-provisioning/transport/patient-import-downloads", () => ({
  createPatientImportFailedRowsDownload: mockedFailedRowsDownload,
}));

import { POST } from "./route";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const actor = { userId: "22222222-2222-4222-8222-222222222222" };

function formData(overrides: Record<string, string | string[] | null> = {}): FormData {
  const values: Record<string, string | string[] | null> = {
    targetHospitalId: hospitalId,
    previewTargetHospitalId: hospitalId,
    fileFingerprint: "a".repeat(64),
    previewBinding: "b".repeat(64),
    importContractVersion: PATIENT_IMPORT_CONTRACT_VERSION,
    effectiveDate: "",
    ...overrides,
  };
  const body = new FormData();

  for (const [key, value] of Object.entries(values)) {
    if (value === null) {
      continue;
    }

    for (const item of Array.isArray(value) ? value : [value]) {
      body.append(key, item);
    }
  }

  body.set("file", new File(["xlsx"], "patients.xlsx"));
  return body;
}

function request(body: FormData, headers?: HeadersInit): Request {
  return new Request("http://localhost/api/v1/hospital/patient-import/failed-rows", {
    method: "POST",
    body,
    headers,
  });
}

describe("POST /api/v1/hospital/patient-import/failed-rows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedActor.mockResolvedValue(actor);
    mockedFailedRowsDownload.mockResolvedValue({
      filename: "DEMI_patient_import_SYN-A_v2_failed_rows.xlsx",
      buffer: Buffer.from("failed-xlsx"),
    });
  });

  it("returns the rebuilt workbook for the bound file", async () => {
    const response = await POST(request(formData({ failedRowNumber: ["4", "9"] })));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("failed_rows.xlsx");
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("failed-xlsx");
    expect(mockedFailedRowsDownload).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        targetHospitalId: hospitalId,
        previewTargetHospitalId: hospitalId,
        failedRowNumbers: [4, 9],
      }),
      expect.any(File),
    );
  });

  it("returns 403 and no workbook for an out-of-scope hospital", async () => {
    mockedFailedRowsDownload.mockRejectedValue(new ForbiddenError());

    const response = await POST(request(formData()));

    expect(response.status).toBe(403);
    expect(response.headers.get("content-disposition")).toBeNull();
  });

  it("returns 400 for a stale or forged binding", async () => {
    mockedFailedRowsDownload.mockRejectedValue(new PatientImportPreviewBindingError());

    expect((await POST(request(formData()))).status).toBe(400);
  });

  it("returns the template mismatch message as 400", async () => {
    mockedFailedRowsDownload.mockRejectedValue(new ValidationError("ไฟล์นี้ไม่ได้จัดทำสำหรับโรงพยาบาลนี้"));

    const response = await POST(request(formData()));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "ไฟล์นี้ไม่ได้จัดทำสำหรับโรงพยาบาลนี้" });
  });

  it.each([
    ["a missing fingerprint", { fileFingerprint: null }],
    ["a malformed fingerprint", { fileFingerprint: "xyz" }],
    ["an unsupported contract version", { importContractVersion: "old" }],
    ["a non-numeric failed row", { failedRowNumber: ["abc"] }],
    [
      "more than 500 failed rows",
      { failedRowNumber: Array.from({ length: 501 }, (_, index) => String(index + 1)) },
    ],
  ])("returns 400 for %s without invoking the service", async (_label, overrides) => {
    const response = await POST(request(formData(overrides)));

    expect(response.status).toBe(400);
    expect(mockedFailedRowsDownload).not.toHaveBeenCalled();
  });

  it("returns 400 when the file part is missing", async () => {
    const body = formData();
    body.delete("file");

    expect((await POST(request(body))).status).toBe(400);
    expect(mockedFailedRowsDownload).not.toHaveBeenCalled();
  });

  it("rejects an oversized declared body before parsing it", async () => {
    const response = await POST(request(formData(), { "content-length": String(50 * 1024 * 1024) }));

    expect(response.status).toBe(400);
    expect(mockedFailedRowsDownload).not.toHaveBeenCalled();
  });
});
