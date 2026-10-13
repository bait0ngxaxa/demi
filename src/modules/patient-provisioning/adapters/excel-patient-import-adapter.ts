import "server-only";

import ExcelJS from "exceljs";
import type { Cell, CellValue, Worksheet } from "exceljs";

import { THAI_NATIONAL_IDENTITY_NAMESPACE } from "@/modules/identity/schemas/identity-schemas";
import { ValidationError } from "@/shared/errors/application-error";

import { assertSafePatientImportXlsxResourceEnvelope } from "../import/patient-import-xlsx-resource-preflight";
import {
  patientProvisionFormSchema,
  patientProvisionScopeSchema,
} from "../schemas/patient-provisioning-schemas";
import {
  isPatientImportClassificationField,
  isPatientImportBaselineField,
  PATIENT_IMPORT_FIELD_KEYS,
} from "../import/patient-import-contract";
import type {
  CanonicalPatientImportRow,
  PatientImportDiagnostic,
  PatientImportDiagnosticCode,
  PatientImportFieldAssessment,
  PatientImportFieldAssessmentMap,
  PatientImportFieldKey,
  PatientImportFieldStatus,
  PatientImportFileMetadata,
  PatientProvisioningImportCandidate,
} from "../import/patient-import-contract";
import { PATIENT_IMPORT_TEMPLATE_COLUMNS } from "../import/patient-import-template-contract";
import {
  PATIENT_IMPORT_COLUMN_BINDINGS,
  validatePatientImportTemplateWorkbook,
  type PatientImportTemplateTarget,
} from "../import/patient-import-template-validation";
import {
  normalizeDateCell,
  normalizeNationalIdCell,
  normalizeNumericCell,
  normalizePhoneCell,
  normalizePatientClassificationCell,
  normalizeTextCell,
} from "../import/patient-import-normalization";

export const MAX_PATIENT_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_PATIENT_IMPORT_ROWS = 500;

export type PatientImportUpload = {
  name: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
};

/** Original cell values of one data row, one entry per template column. */
export type PatientImportSourceRow = readonly CellValue[];

export type PatientImportFileRead = {
  candidates: PatientProvisioningImportCandidate[];
  sourceRows: ReadonlyMap<number, PatientImportSourceRow>;
};

const CORE_FIELDS = new Set<PatientImportFieldKey>([
  "nationalId",
  "givenName",
  "familyName",
  "hospitalNumber",
]);

const diagnosticMessages: Readonly<Record<PatientImportDiagnosticCode, string>> = {
  INVALID_VALUE: "ค่าบางรายการไม่อยู่ในรูปแบบที่รองรับ",
  LOSSY_EXCEL_VALUE: "ค่าใน Excel อาจสูญเสียข้อมูลจากการจัดรูปแบบ",
  AMBIGUOUS_VALUE: "ค่าบางรายการตีความได้มากกว่าหนึ่งแบบ",
  REQUIREMENT_GATED: "ตรวจพบข้อมูลเพิ่มเติมที่ยังไม่บันทึกในระยะนี้",
  CLASSIFICATION_DATA_INVALID: "ค่ากลุ่มสถานะผู้ป่วยไม่ใช่ค่าที่รองรับ",
  FORMULA_VALUE: "ไม่รับค่าจากสูตร Excel เป็นข้อมูลอ้างอิงโดยอัตโนมัติ",
  EXCEL_ERROR: "เซลล์ Excel มีค่าผิดพลาด",
};

function createDiagnostic(
  code: PatientImportDiagnosticCode,
  field?: PatientImportFieldKey,
  sourceHeader?: string,
): PatientImportDiagnostic {
  return {
    code,
    message: diagnosticMessages[code],
    ...(field ? { field } : {}),
    ...(sourceHeader ? { sourceHeader } : {}),
  };
}

function normalizeCellText(value: string): string {
  return value.replace(/[\s  -​  　]+/gu, " ").trim();
}

function cellHasMeaningfulValue(cell: Cell): boolean {
  if (cell.value === null || cell.value === undefined) {
    return false;
  }

  if (typeof cell.value === "string") {
    const text = normalizeCellText(cell.value);
    return text !== "" && text !== "-";
  }

  return cell.type !== ExcelJS.ValueType.Null;
}

const PATIENT_CORE_SIGNAL_FIELDS: readonly PatientImportFieldKey[] = [
  "nationalId",
  "givenName",
  "familyName",
];

function rowHasPatientCoreSignal(row: ExcelJS.Row): boolean {
  return PATIENT_CORE_SIGNAL_FIELDS.some((field) => {
    const binding = PATIENT_IMPORT_COLUMN_BINDINGS.get(field);
    return binding ? cellHasMeaningfulValue(row.getCell(binding.columnNumber)) : false;
  });
}

function inspectDataRows(
  worksheet: Worksheet,
  dataStartRowNumber: number,
): { dataRowNumbers: number[]; tooManyRows: boolean } {
  const dataRowNumbers: number[] = [];
  let tooManyRows = false;

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber < dataStartRowNumber || !rowHasPatientCoreSignal(row)) {
      return;
    }

    if (dataRowNumbers.length >= MAX_PATIENT_IMPORT_ROWS) {
      tooManyRows = true;
      return;
    }

    dataRowNumbers.push(rowNumber);
  });

  return { dataRowNumbers, tooManyRows };
}

function maskIdentity(value: string | null): string {
  if (!value || value.length < 4) {
    return "ไม่แสดง";
  }

  return `••••••${value.slice(-4)}`;
}

function emptyFieldAssessment(): PatientImportFieldAssessment {
  return {
    status: "NOT_PRESENT",
    present: false,
    sourceHeaders: [],
    diagnostics: [],
  };
}

function createEmptyFieldAssessmentMap(): PatientImportFieldAssessmentMap {
  const assessments = {} as PatientImportFieldAssessmentMap;

  for (const field of PATIENT_IMPORT_FIELD_KEYS) {
    assessments[field] = emptyFieldAssessment();
  }

  return assessments;
}

function assessmentStatus(
  field: PatientImportFieldKey,
  diagnostics: readonly PatientImportDiagnosticCode[],
): PatientImportFieldStatus {
  if (diagnostics.includes("AMBIGUOUS_VALUE")) {
    return "AMBIGUOUS";
  }

  if (diagnostics.length > 0) {
    return "INVALID";
  }

  return CORE_FIELDS.has(field)
    ? "SUPPORTED_FOR_CURRENT_PROVISIONING"
    : isPatientImportBaselineField(field)
      ? "PARSED_FOR_INITIAL_BASELINE"
      : isPatientImportClassificationField(field)
        ? "SUPPORTED_FOR_PATIENT_CLASSIFICATION"
        : "PARSED_REQUIREMENT_GATED";
}

function updateFieldAssessment(
  assessments: PatientImportFieldAssessmentMap,
  field: PatientImportFieldKey,
  sourceHeader: string,
  status: PatientImportFieldStatus,
  diagnostics: readonly PatientImportDiagnosticCode[],
): void {
  const current = assessments[field];
  const statusPriority: Record<PatientImportFieldStatus, number> = {
    NOT_PRESENT: 0,
    SUPPORTED_FOR_CURRENT_PROVISIONING: 1,
    PARSED_FOR_INITIAL_BASELINE: 2,
    SUPPORTED_FOR_PATIENT_CLASSIFICATION: 2,
    PARSED_REQUIREMENT_GATED: 1,
    INVALID: 4,
    AMBIGUOUS: 5,
  };
  const mergedStatus =
    statusPriority[status] >= statusPriority[current.status] ? status : current.status;

  assessments[field] = {
    status: mergedStatus,
    present: true,
    sourceHeaders: current.sourceHeaders.includes(sourceHeader)
      ? current.sourceHeaders
      : [...current.sourceHeaders, sourceHeader],
    diagnostics: [...new Set([...current.diagnostics, ...diagnostics])],
  };
}

function addDiagnostics(
  diagnostics: PatientImportDiagnostic[],
  field: PatientImportFieldKey,
  sourceHeader: string,
  codes: readonly PatientImportDiagnosticCode[],
): void {
  for (const code of codes) {
    diagnostics.push(createDiagnostic(code, field, sourceHeader));
  }
}

function setRequirementDiagnostic(
  diagnostics: PatientImportDiagnostic[],
  field: PatientImportFieldKey,
  sourceHeader: string,
  value: string | number | null,
): void {
  if (
    !CORE_FIELDS.has(field) &&
    !isPatientImportBaselineField(field) &&
    !isPatientImportClassificationField(field) &&
    value !== null
  ) {
    diagnostics.push(createDiagnostic("REQUIREMENT_GATED", field, sourceHeader));
  }
}

function readCanonicalRow(worksheet: Worksheet, rowNumber: number): CanonicalPatientImportRow {
  const row = worksheet.getRow(rowNumber);
  const assessments = createEmptyFieldAssessmentMap();
  const diagnostics: PatientImportDiagnostic[] = [];
  const bindingsByField = PATIENT_IMPORT_COLUMN_BINDINGS;

  let nationalId: string | null = null;
  let givenName: string | null = null;
  let familyName: string | null = null;
  let hospitalNumber: string | null = null;
  let dateOfBirth: string | null = null;
  let gender: string | null = null;
  let phoneNumber: string | null = null;
  let weight: number | null = null;
  let height: number | null = null;
  let waistCircumference: number | null = null;
  let diabetesClassification: CanonicalPatientImportRow["clinicalCandidates"]["diabetesClassification"] = null;
  let bloodSugarDtx: number | null = null;
  let hba1c: number | null = null;
  let houseNumber: string | null = null;
  let villageNumber: string | null = null;
  let villageName: string | null = null;
  let soi: string | null = null;
  let road: string | null = null;
  let province: string | null = null;
  let district: string | null = null;
  let subdistrict: string | null = null;
  let postalCode: string | null = null;
  let emergencyContactName: string | null = null;
  let emergencyContactPhone: string | null = null;
  let emergencyContactRelationship: string | null = null;
  let sourceSequenceNumber: string | null = null;

  const parseTextField = (
    field: PatientImportFieldKey,
    target: (value: string | null) => void,
  ): void => {
    const binding = bindingsByField.get(field);

    if (!binding) {
      return;
    }

    const result = field === "phoneNumber" || field === "emergencyContactPhone"
      ? normalizePhoneCell(row.getCell(binding.columnNumber))
      : normalizeTextCell(row.getCell(binding.columnNumber));
    target(result.value);
    const status = assessmentStatus(field, result.diagnostics);
    updateFieldAssessment(assessments, field, binding.sourceHeader, status, result.diagnostics);
    addDiagnostics(diagnostics, field, binding.sourceHeader, result.diagnostics);
    setRequirementDiagnostic(diagnostics, field, binding.sourceHeader, result.value);
  };

  const parseClassificationField = (): void => {
    const field = "diabetesClassification" as const;
    const binding = bindingsByField.get(field);

    if (!binding) {
      return;
    }

    const result = normalizePatientClassificationCell(row.getCell(binding.columnNumber));
    diabetesClassification = result.value;
    const status = assessmentStatus(field, result.diagnostics);
    updateFieldAssessment(assessments, field, binding.sourceHeader, status, result.diagnostics);
    addDiagnostics(diagnostics, field, binding.sourceHeader, result.diagnostics);
  };

  const parseNumericField = (
    field: PatientImportFieldKey,
    target: (value: number | null) => void,
  ): void => {
    const binding = bindingsByField.get(field);

    if (!binding) {
      return;
    }

    const result = normalizeNumericCell(row.getCell(binding.columnNumber));
    target(result.value);
    const status = assessmentStatus(field, result.diagnostics);
    updateFieldAssessment(assessments, field, binding.sourceHeader, status, result.diagnostics);
    addDiagnostics(diagnostics, field, binding.sourceHeader, result.diagnostics);
    setRequirementDiagnostic(diagnostics, field, binding.sourceHeader, result.value);
  };

  const nationalBinding = bindingsByField.get("nationalId");

  if (nationalBinding) {
    const result = normalizeNationalIdCell(row.getCell(nationalBinding.columnNumber));
    nationalId = result.value;
    const codes: readonly PatientImportDiagnosticCode[] =
      result.diagnostics.length > 0 ? result.diagnostics : result.value ? [] : ["INVALID_VALUE"];
    updateFieldAssessment(
      assessments,
      "nationalId",
      nationalBinding.sourceHeader,
      result.value ? assessmentStatus("nationalId", result.diagnostics) : "INVALID",
      codes,
    );
    addDiagnostics(diagnostics, "nationalId", nationalBinding.sourceHeader, codes);
  }

  parseTextField("givenName", (value) => { givenName = value; });
  parseTextField("familyName", (value) => { familyName = value; });
  parseTextField("hospitalNumber", (value) => { hospitalNumber = value; });
  parseTextField("gender", (value) => { gender = value; });
  parseTextField("phoneNumber", (value) => { phoneNumber = value; });
  parseClassificationField();
  parseTextField("houseNumber", (value) => { houseNumber = value; });
  parseTextField("villageNumber", (value) => { villageNumber = value; });
  parseTextField("villageName", (value) => { villageName = value; });
  parseTextField("soi", (value) => { soi = value; });
  parseTextField("road", (value) => { road = value; });
  parseTextField("province", (value) => { province = value; });
  parseTextField("district", (value) => { district = value; });
  parseTextField("subdistrict", (value) => { subdistrict = value; });
  parseTextField("postalCode", (value) => { postalCode = value; });
  parseTextField("emergencyContactName", (value) => { emergencyContactName = value; });
  parseTextField("emergencyContactRelationship", (value) => { emergencyContactRelationship = value; });
  parseTextField("sourceSequenceNumber", (value) => { sourceSequenceNumber = value; });
  parseTextField("emergencyContactPhone", (value) => { emergencyContactPhone = value; });

  const dateBinding = bindingsByField.get("dateOfBirth");
  if (dateBinding) {
    const result = normalizeDateCell(row.getCell(dateBinding.columnNumber), "DMY");
    dateOfBirth = result.value;
    updateFieldAssessment(assessments, "dateOfBirth", dateBinding.sourceHeader, assessmentStatus("dateOfBirth", result.diagnostics), result.diagnostics);
    addDiagnostics(diagnostics, "dateOfBirth", dateBinding.sourceHeader, result.diagnostics);
    setRequirementDiagnostic(diagnostics, "dateOfBirth", dateBinding.sourceHeader, result.value);
  }

  const numericFields: ReadonlyArray<readonly [PatientImportFieldKey, (value: number | null) => void]> = [
    ["weight", (value) => { weight = value; }],
    ["height", (value) => { height = value; }],
    ["waistCircumference", (value) => { waistCircumference = value; }],
    ["bloodSugarDtx", (value) => { bloodSugarDtx = value; }],
    ["hba1c", (value) => { hba1c = value; }],
  ];

  for (const [field, target] of numericFields) {
    parseNumericField(field, target);
  }

  if (givenName === null) {
    const sourceHeader = bindingsByField.get("givenName")?.sourceHeader ?? "";
    updateFieldAssessment(assessments, "givenName", sourceHeader, "INVALID", ["INVALID_VALUE"]);
    diagnostics.push(createDiagnostic("INVALID_VALUE", "givenName", sourceHeader));
  }

  if (familyName === null) {
    const sourceHeader = bindingsByField.get("familyName")?.sourceHeader ?? "";
    updateFieldAssessment(assessments, "familyName", sourceHeader, "INVALID", ["INVALID_VALUE"]);
    diagnostics.push(createDiagnostic("INVALID_VALUE", "familyName", sourceHeader));
  }

  return {
    provenance: {
      sourceSheetName: worksheet.name,
      sourceRowNumber: rowNumber,
      sourceSequenceNumber,
    },
    identity: { nationalId, givenName, familyName },
    demographics: { dateOfBirth, gender },
    contact: {
      phoneNumber,
      emergencyContactName,
      emergencyContactPhone,
      emergencyContactRelationship,
    },
    address: {
      houseNumber,
      villageNumber,
      villageName,
      soi,
      road,
      province,
      district,
      subdistrict,
      postalCode,
    },
    clinicalCandidates: {
      weight,
      height,
      waistCircumference,
      diabetesClassification,
      bloodSugarDtx,
      hba1c,
    },
    organizationCandidates: { hospitalNumber },
    fieldAssessments: assessments,
    diagnostics,
  };
}

function mapValidationMessage(
  issues: readonly { path: readonly unknown[] }[],
  canonicalRow: CanonicalPatientImportRow,
): string {
  const fields = new Set(issues.map((issue) => issue.path[0]));

  if (fields.has("nationalId")) {
    return canonicalRow.diagnostics.some(({ code }) => code === "LOSSY_EXCEL_VALUE")
      ? "เลขบัตรประชาชนในไฟล์อาจสูญเสียข้อมูลจากการจัดรูปแบบ Excel กรุณาแก้เป็นข้อความแล้วตรวจสอบใหม่"
      : "เลขบัตรประชาชนไม่ถูกต้อง";
  }

  if (fields.has("givenName")) {
    return "กรุณาระบุชื่อ";
  }

  if (fields.has("familyName")) {
    return "กรุณาระบุนามสกุล";
  }

  if (fields.has("hospitalNumber")) {
    return "HN ยาวเกินจำนวนที่รองรับ";
  }

  return "ข้อมูลแถวนี้ไม่ถูกต้อง";
}

function buildCandidate(
  worksheet: Worksheet,
  rowNumber: number,
  fileMetadata: PatientImportFileMetadata,
  targetHospitalId: string,
): PatientProvisioningImportCandidate {
  const canonicalRow = readCanonicalRow(worksheet, rowNumber);
  const parsedRow = patientProvisionFormSchema.safeParse({
    nationalId: canonicalRow.identity.nationalId ?? "",
    givenName: canonicalRow.identity.givenName ?? "",
    familyName: canonicalRow.identity.familyName ?? "",
    hospitalNumber: canonicalRow.organizationCandidates.hospitalNumber ?? "",
    targetHospitalId,
  });

  return {
    rowNumber,
    identityDisplay: maskIdentity(canonicalRow.identity.nationalId),
    input: parsedRow.success
      ? {
          identity: {
            namespace: THAI_NATIONAL_IDENTITY_NAMESPACE,
            value: parsedRow.data.nationalId,
          },
          givenName: parsedRow.data.givenName,
          familyName: parsedRow.data.familyName,
          hospitalNumber: parsedRow.data.hospitalNumber,
          targetHospitalId: parsedRow.data.targetHospitalId,
        }
      : null,
    givenName: canonicalRow.identity.givenName ?? "",
    familyName: canonicalRow.identity.familyName ?? "",
    hospitalNumber: canonicalRow.organizationCandidates.hospitalNumber,
    validationMessage: parsedRow.success ? null : mapValidationMessage(parsedRow.error.issues, canonicalRow),
    canonicalRow,
    fileMetadata,
  };
}

function toSourceCellValue(cell: Cell): CellValue {
  const value = cell.value;

  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (cell.type === ExcelJS.ValueType.Error) {
    return null;
  }

  // Formulas, rich text and hyperlinks are exported as their displayed text/result.
  return cell.type === ExcelJS.ValueType.Formula ? (cell.result as CellValue) ?? null : cell.text;
}

function readSourceRow(worksheet: Worksheet, rowNumber: number): PatientImportSourceRow {
  const row = worksheet.getRow(rowNumber);

  return PATIENT_IMPORT_TEMPLATE_COLUMNS.map((_, index) => toSourceCellValue(row.getCell(index + 1)));
}

async function loadPatientImportWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();

  try {
    type ExcelJsInputBuffer = Parameters<typeof workbook.xlsx.load>[0];
    await workbook.xlsx.load(buffer as unknown as ExcelJsInputBuffer);
  } catch {
    throw new ValidationError("ไฟล์ Excel ไม่ถูกต้องหรือไม่สามารถอ่านได้");
  }

  return workbook;
}

/**
 * Parses a hospital-bound template v2 workbook. Any contract failure (size,
 * metadata, hospital, header, row capacity) rejects the whole file before a
 * single candidate is produced.
 */
export async function readPatientImportFile(
  file: PatientImportUpload,
  target: PatientImportTemplateTarget,
): Promise<PatientImportFileRead> {
  const parsedScope = patientProvisionScopeSchema.safeParse({ targetHospitalId: target.hospitalId });

  if (!parsedScope.success) {
    throw new ValidationError("โรงพยาบาลที่เลือกไม่ถูกต้อง");
  }

  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    throw new ValidationError("รองรับเฉพาะไฟล์ Excel .xlsx");
  }

  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_PATIENT_IMPORT_BYTES) {
    throw new ValidationError("ไฟล์ Excel ต้องมีขนาดไม่เกิน 5 MB");
  }

  let buffer: Buffer;

  try {
    buffer = Buffer.from(await file.arrayBuffer());
  } catch {
    throw new ValidationError("ไม่สามารถอ่านไฟล์ Excel ได้");
  }

  if (buffer.byteLength > MAX_PATIENT_IMPORT_BYTES) {
    throw new ValidationError("ไฟล์ Excel ต้องมีขนาดไม่เกิน 5 MB");
  }

  await assertSafePatientImportXlsxResourceEnvelope(buffer);
  const workbook = await patientImportAdapterInternals.loadPatientImportWorkbook(buffer);

  if (workbook.worksheets.length === 0) {
    throw new ValidationError("ไม่พบแผ่นงานในไฟล์ Excel");
  }

  const validation = validatePatientImportTemplateWorkbook(workbook, target);
  const rowInspection = inspectDataRows(validation.worksheet, validation.dataStartRowNumber);

  if (rowInspection.tooManyRows) {
    throw new ValidationError(`ไฟล์ Excel รองรับผู้ป่วยไม่เกิน ${MAX_PATIENT_IMPORT_ROWS} แถว`);
  }

  const requirementGatedFields = PATIENT_IMPORT_FIELD_KEYS.filter(
    (field) =>
      !CORE_FIELDS.has(field) &&
      !isPatientImportBaselineField(field) &&
      !isPatientImportClassificationField(field),
  );
  const fileMetadata: PatientImportFileMetadata = {
    worksheetName: validation.worksheet.name,
    headerRowNumber: validation.headerRowNumber,
    templateVersion: validation.templateVersion,
    hospitalCode: validation.hospitalCode,
    requirementGatedFields,
  };

  return {
    candidates: rowInspection.dataRowNumbers.map((rowNumber) =>
      buildCandidate(validation.worksheet, rowNumber, fileMetadata, parsedScope.data.targetHospitalId),
    ),
    sourceRows: new Map(
      rowInspection.dataRowNumbers.map((rowNumber) => [
        rowNumber,
        readSourceRow(validation.worksheet, rowNumber),
      ]),
    ),
  };
}

export async function readPatientImportCandidates(
  file: PatientImportUpload,
  target: PatientImportTemplateTarget,
): Promise<PatientProvisioningImportCandidate[]> {
  return (await readPatientImportFile(file, target)).candidates;
}

export const patientImportAdapterInternals = {
  createEmptyFieldAssessmentMap,
  loadPatientImportWorkbook,
  maskIdentity,
  normalizeCellText,
  readCanonicalRow,
};
