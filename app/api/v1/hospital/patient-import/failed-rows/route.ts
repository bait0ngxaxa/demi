import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { MAX_PATIENT_IMPORT_BYTES } from "@/modules/patient-provisioning/adapters/excel-patient-import-adapter";
import { patientImportFailedRowsSchema } from "@/modules/patient-provisioning/schemas/patient-provisioning-schemas";
import {
  patientImportDownloadErrorResponse,
  patientImportDownloadResponse,
} from "@/modules/patient-provisioning/transport/patient-import-download-responses";
import { createPatientImportFailedRowsDownload } from "@/modules/patient-provisioning/transport/patient-import-downloads";
import { ValidationError } from "@/shared/errors/application-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REQUEST_BYTES = MAX_PATIENT_IMPORT_BYTES + 256 * 1024;

function getString(formData: FormData, field: string): string | undefined {
  const values = formData.getAll(field);

  if (values.length !== 1 || typeof values[0] !== "string") {
    return undefined;
  }

  return values[0].trim() || undefined;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const contentLength = Number(request.headers.get("content-length"));

    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
      throw new ValidationError("ไฟล์ Excel ต้องมีขนาดไม่เกิน 5 MB");
    }

    const actor = await getProtectedApplicationActor();
    const formData = await request.formData();
    const file = formData.get("file");
    const failedRowNumbers = formData.getAll("failedRowNumber").map((value) =>
      typeof value === "string" && /^\d+$/u.test(value) ? Number(value) : Number.NaN,
    );
    const parsed = patientImportFailedRowsSchema.safeParse({
      targetHospitalId: getString(formData, "targetHospitalId"),
      previewTargetHospitalId: getString(formData, "previewTargetHospitalId"),
      fileFingerprint: getString(formData, "fileFingerprint"),
      previewBinding: getString(formData, "previewBinding"),
      effectiveDate: getString(formData, "effectiveDate"),
      importContractVersion: getString(formData, "importContractVersion"),
      failedRowNumbers,
    });

    if (!parsed.success || !(file instanceof File)) {
      throw new ValidationError("ข้อมูลคำขอดาวน์โหลดแถวที่ไม่ผ่านไม่ถูกต้อง");
    }

    return patientImportDownloadResponse(
      await createPatientImportFailedRowsDownload(actor, parsed.data, file),
    );
  } catch (error: unknown) {
    return patientImportDownloadErrorResponse(error);
  }
}
