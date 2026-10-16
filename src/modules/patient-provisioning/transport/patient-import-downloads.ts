import "server-only";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ValidationError } from "@/shared/errors/application-error";

import {
  MAX_PATIENT_IMPORT_BYTES,
  readPatientImportFile,
  type PatientImportUpload,
} from "../adapters/excel-patient-import-adapter";
import {
  createPatientImportFailedRowsWorkbook,
  createPatientImportTemplateWorkbook,
  writePatientImportWorkbookBuffer,
  type PatientImportFailedTemplateRow,
} from "../import/patient-import-template";
import {
  createPatientImportFailedRowsFilename,
  createPatientImportTemplateFilename,
} from "../import/patient-import-template-contract";
import { getPatientImportAttentionReason } from "../presentation/patient-import-presentation";
import type { PatientImportFailedRowsInput } from "../schemas/patient-provisioning-schemas";
import { resolvePatientImportTemplateTarget } from "../services/patient-import-template-service";
import { previewPatientRosterImport } from "../services/patient-roster-import-service";
import {
  assertPatientImportPreviewBinding,
} from "./patient-import-file-binding";

export type PatientImportDownload = {
  filename: string;
  buffer: Buffer;
};

const FAILED_ROW_COMMIT_REASON = "ระบบบันทึกแถวนี้ไม่สำเร็จ กรุณาแก้ไขหรือลองนำเข้าอีกครั้ง";

/** A template bound to one Hospital, generated on demand for an authorized actor. */
export async function createPatientImportTemplateDownload(
  actor: ActorContext,
  targetHospitalId: string,
): Promise<PatientImportDownload> {
  const target = await resolvePatientImportTemplateTarget(actor, targetHospitalId);
  const workbook = await createPatientImportTemplateWorkbook(target);

  return {
    filename: createPatientImportTemplateFilename(),
    buffer: await writePatientImportWorkbookBuffer(workbook),
  };
}

/**
 * Rebuilds, statelessly, the rows that were not imported from the re-sent file and
 * the preview binding. `ALREADY_EXISTS` rows are never exported; `failedRowNumbers`
 * only adds rows that were importable but failed while committing.
 */
export async function createPatientImportFailedRowsDownload(
  actor: ActorContext,
  request: PatientImportFailedRowsInput,
  file: PatientImportUpload,
): Promise<PatientImportDownload> {
  const target = await resolvePatientImportTemplateTarget(actor, request.targetHospitalId);

  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_PATIENT_IMPORT_BYTES) {
    throw new ValidationError("ไฟล์ Excel ต้องมีขนาดไม่เกิน 5 MB");
  }

  await assertPatientImportPreviewBinding({
    actorUserId: actor.userId,
    targetHospitalId: request.targetHospitalId,
    previewTargetHospitalId: request.previewTargetHospitalId,
    fileFingerprint: request.fileFingerprint,
    previewBinding: request.previewBinding,
    effectiveDate: request.effectiveDate ?? null,
    importContractVersion: request.importContractVersion,
    file,
  });

  const { candidates, sourceRows } = await readPatientImportFile(file, target);
  const preview = await previewPatientRosterImport(
    actor,
    target.hospitalId,
    candidates,
    undefined,
    {
      effectiveDate: request.effectiveDate ?? null,
      importContractVersion: request.importContractVersion,
    },
  );
  const failedRowNumbers = new Set(request.failedRowNumbers);
  const failedRows: PatientImportFailedTemplateRow[] = [];

  for (const row of preview.rows) {
    const values = sourceRows.get(row.rowNumber);

    if (!values) {
      continue;
    }

    if (row.classification === "READY") {
      if (failedRowNumbers.has(row.rowNumber)) {
        failedRows.push({ values, reason: FAILED_ROW_COMMIT_REASON });
      }

      continue;
    }

    if (row.classification !== "ALREADY_EXISTS") {
      failedRows.push({ values, reason: getPatientImportAttentionReason(row) });
    }
  }

  if (failedRows.length === 0) {
    throw new ValidationError("ไม่มีแถวที่ต้องแก้ไขให้ดาวน์โหลด");
  }

  const workbook = await createPatientImportFailedRowsWorkbook(target, failedRows);

  return {
    filename: createPatientImportFailedRowsFilename(),
    buffer: await writePatientImportWorkbookBuffer(workbook),
  };
}
