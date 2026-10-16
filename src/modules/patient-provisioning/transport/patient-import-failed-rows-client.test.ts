import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PATIENT_IMPORT_CONTRACT_VERSION } from "../import/patient-import-contract";
import { PATIENT_IMPORT_FAILED_ROWS_DOWNLOAD_PATH } from "../import/patient-import-template-contract";
import type { PatientImportPreviewBinding } from "./action-state";
import {
  createPatientImportFailedRowsFormData,
  downloadPatientImportFailedRows,
} from "./patient-import-failed-rows-client";

const preview: PatientImportPreviewBinding = {
  targetHospitalId: "11111111-1111-4111-8111-111111111111",
  effectiveDate: "2026-08-01",
  importContractVersion: PATIENT_IMPORT_CONTRACT_VERSION,
  baselineDateRequired: false,
  rows: [],
  file: null,
  fileFingerprint: "a".repeat(64),
  previewBinding: "b".repeat(64),
};

describe("failed-rows download client", () => {
  const file = new File(["xlsx"], "patients.xlsx");

  const anchor = { href: "", download: "", click: vi.fn(), remove: vi.fn() };
  const body = { append: vi.fn() };

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("document", { createElement: vi.fn(() => anchor), body });
    URL.createObjectURL = vi.fn(() => "blob:test");
    URL.revokeObjectURL = vi.fn();
    anchor.click.mockClear();
    anchor.remove.mockClear();
    body.append.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("re-sends the file with the preview binding and the failed row numbers", () => {
    const formData = createPatientImportFailedRowsFormData({ file, preview, failedRowNumbers: [4, 9] });

    expect(formData.get("targetHospitalId")).toBe(preview.targetHospitalId);
    expect(formData.get("previewTargetHospitalId")).toBe(preview.targetHospitalId);
    expect(formData.get("fileFingerprint")).toBe(preview.fileFingerprint);
    expect(formData.get("previewBinding")).toBe(preview.previewBinding);
    expect(formData.get("importContractVersion")).toBe(PATIENT_IMPORT_CONTRACT_VERSION);
    expect(formData.get("effectiveDate")).toBe("2026-08-01");
    expect((formData.get("file") as File).name).toBe("patients.xlsx");
    expect(formData.getAll("failedRowNumber")).toEqual(["4", "9"]);
  });

  it("downloads the workbook the server returns", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(new Blob(["xlsx"]), {
        status: 200,
        headers: { "content-disposition": 'attachment; filename="DEMI_patient_import_SYN-A_v2_failed_rows.xlsx"' },
      }),
    );
    const result = await downloadPatientImportFailedRows({ file, preview, failedRowNumbers: [] });

    expect(result).toEqual({ status: "SUCCESS" });
    expect(fetch).toHaveBeenCalledWith(
      PATIENT_IMPORT_FAILED_ROWS_DOWNLOAD_PATH,
      expect.objectContaining({ method: "POST" }),
    );
    expect(anchor.href).toBe("blob:test");
    expect(anchor.download).toBe("DEMI_patient_import_SYN-A_v2_failed_rows.xlsx");
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test");
  });

  it("surfaces the server's message when the download is refused", async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์นำเข้าผู้ป่วยในโรงพยาบาลนี้" }, { status: 403 }),
    );

    expect(await downloadPatientImportFailedRows({ file, preview, failedRowNumbers: [] })).toEqual({
      status: "ERROR",
      message: "บัญชีนี้ไม่มีสิทธิ์นำเข้าผู้ป่วยในโรงพยาบาลนี้",
    });
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("reports a network failure with a safe message", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("network"));

    expect(await downloadPatientImportFailedRows({ file, preview, failedRowNumbers: [] })).toMatchObject({
      status: "ERROR",
      message: expect.stringContaining("ดาวน์โหลดแถวที่ต้องแก้ไขไม่สำเร็จ"),
    });
  });
});
