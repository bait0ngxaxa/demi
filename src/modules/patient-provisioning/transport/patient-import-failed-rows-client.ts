import { PATIENT_IMPORT_FAILED_ROWS_DOWNLOAD_PATH } from "../import/patient-import-template-contract";
import type { PatientImportPreviewBinding } from "./action-state";

export type PatientImportFailedRowsDownloadResult =
  | { status: "SUCCESS" }
  | { status: "ERROR"; message: string };

const FALLBACK_MESSAGE = "ดาวน์โหลดแถวที่ต้องแก้ไขไม่สำเร็จ กรุณาลองอีกครั้ง";

export function createPatientImportFailedRowsFormData(input: {
  file: File;
  preview: PatientImportPreviewBinding;
  failedRowNumbers: readonly number[];
}): FormData {
  const formData = new FormData();
  formData.set("targetHospitalId", input.preview.targetHospitalId);
  formData.set("previewTargetHospitalId", input.preview.targetHospitalId);
  formData.set("fileFingerprint", input.preview.fileFingerprint);
  formData.set("previewBinding", input.preview.previewBinding);
  formData.set("importContractVersion", input.preview.importContractVersion);
  formData.set("effectiveDate", input.preview.effectiveDate ?? "");
  formData.set("file", input.file, input.file.name);

  for (const rowNumber of input.failedRowNumbers) {
    formData.append("failedRowNumber", String(rowNumber));
  }

  return formData;
}

function readFilename(contentDisposition: string | null): string {
  const match = contentDisposition ? /filename="([^"]+)"/u.exec(contentDisposition) : null;
  return match?.[1] ?? "DEMI_patient_import_failed_rows.xlsx";
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    return typeof body.error === "string" ? body.error : FALLBACK_MESSAGE;
  } catch {
    return FALLBACK_MESSAGE;
  }
}

/** Posts the previewed file and its binding; the server rebuilds the rows statelessly. */
export async function downloadPatientImportFailedRows(input: {
  file: File;
  preview: PatientImportPreviewBinding;
  failedRowNumbers: readonly number[];
}): Promise<PatientImportFailedRowsDownloadResult> {
  try {
    const response = await fetch(PATIENT_IMPORT_FAILED_ROWS_DOWNLOAD_PATH, {
      method: "POST",
      body: createPatientImportFailedRowsFormData(input),
    });

    if (!response.ok) {
      return { status: "ERROR", message: await readErrorMessage(response) };
    }

    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = readFilename(response.headers.get("content-disposition"));
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);

    return { status: "SUCCESS" };
  } catch {
    return { status: "ERROR", message: FALLBACK_MESSAGE };
  }
}
