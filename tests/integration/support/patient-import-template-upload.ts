import type { CellValue } from "exceljs";

import {
  readPatientImportCandidates,
  type PatientImportUpload,
} from "@/modules/patient-provisioning/adapters/excel-patient-import-adapter";
import type { PatientImportFieldKey } from "@/modules/patient-provisioning/import/patient-import-contract";
import { createPatientImportTemplateWorkbook } from "@/modules/patient-provisioning/import/patient-import-template";
import { PATIENT_IMPORT_TEMPLATE_COLUMNS } from "@/modules/patient-provisioning/import/patient-import-template-contract";
import {
  findPatientImportDataWorksheet,
  type PatientImportTemplateTarget,
} from "@/modules/patient-provisioning/import/patient-import-template-validation";

/** The Hospital columns an integration test already has from `prisma.hospital.create`. */
export type ImportTestHospital = { id: string; hospitalCode: string; name: string };

export type TemplateRow = Partial<Record<PatientImportFieldKey, CellValue>>;

export function importTargetOf(hospital: ImportTestHospital): PatientImportTemplateTarget {
  return {
    hospitalId: hospital.id,
    hospitalCode: hospital.hospitalCode,
    hospitalName: hospital.name,
  };
}

/**
 * Builds a real hospital-bound template v2 workbook with the given rows, starting at
 * row 3 unless explicit worksheet rows are given (for example 501 and 502).
 */
export async function createTemplateUpload(
  templateHospital: ImportTestHospital,
  rows: readonly TemplateRow[],
  options: { rowNumbers?: readonly number[]; name?: string } = {},
): Promise<PatientImportUpload> {
  const workbook = await createPatientImportTemplateWorkbook({
    hospitalCode: templateHospital.hospitalCode,
    hospitalName: templateHospital.name,
  });
  const worksheet = findPatientImportDataWorksheet(workbook);

  if (!worksheet) {
    throw new Error("The synthetic template workbook has no patient worksheet");
  }

  for (const [index, row] of rows.entries()) {
    const rowNumber = options.rowNumbers?.[index] ?? index + 3;

    for (const column of PATIENT_IMPORT_TEMPLATE_COLUMNS) {
      worksheet.getCell(`${column.column}${rowNumber}`).value = row[column.field] ?? null;
    }
  }

  const written = await workbook.xlsx.writeBuffer();
  const bytes = Uint8Array.from(new Uint8Array(written));

  return {
    name: options.name ?? "synthetic-patients.xlsx",
    size: bytes.byteLength,
    arrayBuffer: async () => bytes.slice().buffer as ArrayBuffer,
  };
}

export async function readTemplateCandidates(
  importHospital: ImportTestHospital,
  rows: readonly TemplateRow[],
  options: { rowNumbers?: readonly number[] } = {},
  selectedHospital: ImportTestHospital = importHospital,
) {
  return readPatientImportCandidates(
    await createTemplateUpload(importHospital, rows, options),
    importTargetOf(selectedHospital),
  );
}
