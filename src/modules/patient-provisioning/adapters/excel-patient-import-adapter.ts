import "server-only";

import ExcelJS from "exceljs";
import type { Cell, Worksheet } from "exceljs";

import { THAI_NATIONAL_IDENTITY_NAMESPACE } from "@/modules/identity/schemas/identity-schemas";
import { ValidationError } from "@/shared/errors/application-error";

import {
  patientProvisionFormSchema,
  patientProvisionScopeSchema,
} from "../schemas/patient-provisioning-schemas";
import type {
  CanonicalPatientImportRow,
  PatientImportDiagnostic,
  PatientImportDiagnosticCode,
  PatientImportFieldAssessment,
  PatientImportFieldAssessmentMap,
  PatientImportFieldKey,
  PatientImportFieldStatus,
  PatientImportFileMetadata,
  ExtendedMeasurementCandidate,
  PatientProvisioningImportCandidate,
} from "../import/patient-import-contract";
import {
  createPatientImportFileMetadata,
  hasPatientIdentityHeaderSignature,
  MAX_PATIENT_IMPORT_COLUMNS,
  resolvePatientImportHeaders,
  type PatientImportHeaderResolution,
} from "../import/patient-import-layouts";
import type { PatientImportHeaderBinding } from "../import/patient-import-header-aliases";
import {
  normalizeDateCell,
  normalizeNationalIdCell,
  normalizeNumericCell,
  normalizePhoneCell,
  normalizeTextCell,
} from "../import/patient-import-normalization";

export { MAX_PATIENT_IMPORT_COLUMNS } from "../import/patient-import-layouts";

export const MAX_PATIENT_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_PATIENT_IMPORT_ROWS = 500;
export const MAX_PATIENT_IMPORT_WORKSHEETS_SCANNED = 12;
export const MAX_PATIENT_IMPORT_HEADER_SCAN_ROWS = 8;

export type PatientImportUpload = {
  name: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
};

type SheetInspection = {
  worksheet: Worksheet;
  headerRowNumber: number;
  resolution: PatientImportHeaderResolution;
  dataRowNumbers: readonly number[];
  tooManyRows: boolean;
};

const CORE_FIELDS = new Set<PatientImportFieldKey>([
  "nationalId",
  "givenName",
  "familyName",
  "hospitalNumber",
]);

const diagnosticMessages: Readonly<Record<PatientImportDiagnosticCode, string>> = {
  UNKNOWN_HEADER: "มีหัวตารางที่ระบบยังไม่รู้จัก",
  AMBIGUOUS_HEADER: "มีหัวตารางซ้ำหรือมีความหมายกำกวม",
  MISSING_REQUIRED_HEADER: "ไม่พบหัวตารางข้อมูลผู้ป่วยที่จำเป็น",
  INVALID_VALUE: "ค่าบางรายการไม่อยู่ในรูปแบบที่รองรับ",
  LOSSY_EXCEL_VALUE: "ค่าใน Excel อาจสูญเสียข้อมูลจากการจัดรูปแบบ",
  AMBIGUOUS_VALUE: "ค่าบางรายการตีความได้มากกว่าหนึ่งแบบ",
  REQUIREMENT_GATED: "ตรวจพบข้อมูลเพิ่มเติมที่ยังไม่บันทึกในระยะนี้",
  UNSUPPORTED_REQUIREMENT: "ข้อมูลนี้ยังไม่มีขอบเขตการบันทึกที่ยืนยันแล้ว",
  FORMULA_VALUE: "ไม่รับค่าจากสูตร Excel เป็นข้อมูลอ้างอิงโดยอัตโนมัติ",
  EXCEL_ERROR: "เซลล์ Excel มีค่าผิดพลาด",
  UNIT_NOT_CONFIRMED: "ยังไม่ยืนยันหน่วยของข้อมูล",
  DUPLICATE_SOURCE_ROW: "พบข้อมูลซ้ำในไฟล์เดียวกัน",
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
  return value.replace(/[\s\u00A0\u2000-\u200B\u202F\u205F\u3000]+/gu, " ").trim();
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

function rowHasPatientCoreSignal(
  row: ExcelJS.Row,
  resolution: PatientImportHeaderResolution,
): boolean {
  const patientCoreFields: readonly PatientImportFieldKey[] = [
    "nationalId",
    "givenName",
    "familyName",
    "combinedNameText",
  ];

  return patientCoreFields.some((field) => {
    const binding = resolution.byField.get(field);
    return binding ? cellHasMeaningfulValue(row.getCell(binding.columnNumber)) : false;
  });
}

function inspectDataRows(
  worksheet: Worksheet,
  headerRowNumber: number,
  resolution: PatientImportHeaderResolution,
): { dataRowNumbers: number[]; tooManyRows: boolean } {
  const dataRowNumbers: number[] = [];
  let tooManyRows = false;

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNumber || !rowHasPatientCoreSignal(row, resolution)) {
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

function getWorksheetHeaders(
  worksheet: Worksheet,
  headerRowNumber: number,
): readonly string[] | null {
  if (worksheet.actualColumnCount === 0 || worksheet.actualColumnCount > MAX_PATIENT_IMPORT_COLUMNS) {
    return null;
  }

  const headerRow = worksheet.getRow(headerRowNumber);
  const headers: string[] = [];

  for (let columnNumber = 1; columnNumber <= worksheet.actualColumnCount; columnNumber += 1) {
    headers.push(headerRow.getCell(columnNumber).text);
  }

  return headers;
}

function inspectWorksheet(worksheet: Worksheet): SheetInspection | null {
  const candidateHeaders: Array<{ rowNumber: number; resolution: PatientImportHeaderResolution }> = [];
  const maximumHeaderRow = Math.min(
    MAX_PATIENT_IMPORT_HEADER_SCAN_ROWS,
    Math.max(worksheet.actualRowCount, worksheet.rowCount),
  );

  for (let rowNumber = 1; rowNumber <= maximumHeaderRow; rowNumber += 1) {
    const headers = getWorksheetHeaders(worksheet, rowNumber);

    if (!headers) {
      continue;
    }

    const resolution = resolvePatientImportHeaders(headers);

    if (hasPatientIdentityHeaderSignature(resolution)) {
      candidateHeaders.push({ rowNumber, resolution });
    }
  }

  if (candidateHeaders.length === 0) {
    return null;
  }

  if (candidateHeaders.length > 1) {
    throw new ValidationError("พบหัวตารางผู้ป่วยมากกว่าหนึ่งแถวในแผ่นงานเดียวกัน");
  }

  const candidate = candidateHeaders[0];
  const rowInspection = inspectDataRows(worksheet, candidate.rowNumber, candidate.resolution);

  return {
    worksheet,
    headerRowNumber: candidate.rowNumber,
    resolution: candidate.resolution,
    dataRowNumbers: rowInspection.dataRowNumbers,
    tooManyRows: rowInspection.tooManyRows,
  };
}

function selectWorksheet(workbook: ExcelJS.Workbook): SheetInspection {
  const inspections: SheetInspection[] = [];
  const worksheets = workbook.worksheets.slice(0, MAX_PATIENT_IMPORT_WORKSHEETS_SCANNED);

  for (const worksheet of worksheets) {
    const inspection = inspectWorksheet(worksheet);

    if (inspection) {
      inspections.push(inspection);
    }
  }

  if (inspections.length === 0) {
    throw new ValidationError("ไม่พบแผ่นงานที่มีหัวตารางผู้ป่วยที่รองรับ");
  }

  const populated = inspections.filter(({ dataRowNumbers }) => dataRowNumbers.length > 0);

  if (populated.length > 1) {
    throw new ValidationError("พบแผ่นงานผู้ป่วยที่มีข้อมูลมากกว่าหนึ่งแผ่น กรุณาแยกไฟล์ก่อนนำเข้า");
  }

  if (populated.length === 1) {
    return populated[0];
  }

  if (inspections.length === 1) {
    return inspections[0];
  }

  throw new ValidationError("พบแผ่นงานผู้ป่วยหลายแผ่นแต่ไม่พบแผ่นที่มีข้อมูลชัดเจน");
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

  for (const field of [
    "nationalId",
    "dateOfBirth",
    "givenName",
    "familyName",
    "combinedNameText",
    "hospitalNumber",
    "gender",
    "phoneNumber",
    "weight",
    "height",
    "waistCircumference",
    "diabetesClassification",
    "bloodSugar",
    "hba1c",
    "hospitalName",
    "subHospitalName",
    "organizationCombinedText",
    "houseNumber",
    "villageNumber",
    "villageName",
    "soi",
    "road",
    "province",
    "district",
    "subdistrict",
    "postalCode",
    "emergencyContactName",
    "emergencyContactPhone",
    "emergencyContactRelationship",
    "osmCaregiverName",
    "sourceSequenceNumber",
    "externalPatientId",
    "ageAtRoster",
    "addressText",
    "bloodPressureText",
    "pulseRate",
    "bmi",
    "dtxReading",
    "riskFactorText",
    "serviceVisitDate",
    "extendedMeasurementSeries",
  ] as const) {
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
    PARSED_REQUIREMENT_GATED: 1,
    UNKNOWN_SOURCE_HEADER: 2,
    INVALID: 3,
    AMBIGUOUS: 4,
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
  if (!CORE_FIELDS.has(field) && value !== null) {
    diagnostics.push(createDiagnostic("REQUIREMENT_GATED", field, sourceHeader));
  }
}

function createExtendedMeasurementCandidate(
  row: ExcelJS.Row,
  binding: PatientImportHeaderBinding,
): {
  value: CanonicalPatientImportRow["clinicalCandidates"]["extendedMeasurementSeries"][number];
  diagnostics: readonly PatientImportDiagnosticCode[];
} {
  const normalizedHeader = binding.normalizedHeader.replace(/\s+/gu, "");
  const observationMatch = /ครั้งที่(\d+)/u.exec(normalizedHeader);
  const observationNumber = observationMatch ? Number(observationMatch[1]) : null;
  const cell = row.getCell(binding.columnNumber);
  const textResult = normalizeTextCell(cell);
  const numericResult = normalizeNumericCell(cell);
  const isTextSeries = normalizedHeader.includes("สรุป") || normalizedHeader.includes("ผลสรุป");
  const diagnostics = isTextSeries ? textResult.diagnostics : numericResult.diagnostics;

  return {
    value: {
      sourceHeader: binding.sourceHeader,
      sourceColumn: binding.columnNumber,
      observationNumber,
      serviceVisitDate: null,
      weight: normalizedHeader.startsWith("น้ำหนัก") ? numericResult.value : null,
      waistCircumference: normalizedHeader.startsWith("รอบเอว") ? numericResult.value : null,
      dtxReading: normalizedHeader.startsWith("ค่าdtx") ? numericResult.value : null,
      summaryText: isTextSeries ? textResult.value : null,
      diagnostics,
    },
    diagnostics,
  };
}

function readCanonicalRow(
  worksheet: Worksheet,
  rowNumber: number,
  resolution: PatientImportHeaderResolution,
  fileMetadata: PatientImportFileMetadata,
): CanonicalPatientImportRow {
  const row = worksheet.getRow(rowNumber);
  const assessments = createEmptyFieldAssessmentMap();
  const diagnostics: PatientImportDiagnostic[] = [];
  const bindingsByField = resolution.byField;

  for (const field of resolution.ambiguousFields) {
    const bindings = resolution.bindings.filter((binding) => binding.field === field);

    for (const binding of bindings) {
      updateFieldAssessment(assessments, field, binding.sourceHeader, "AMBIGUOUS", ["AMBIGUOUS_HEADER"]);
      diagnostics.push(createDiagnostic("AMBIGUOUS_HEADER", field, binding.sourceHeader));
    }
  }

  let nationalId: string | null = null;
  let givenName: string | null = null;
  let familyName: string | null = null;
  let combinedNameText: string | null = null;
  let hospitalNumber: string | null = null;
  let dateOfBirth: string | null = null;
  let gender: string | null = null;
  let phoneNumber: string | null = null;
  let weight: number | null = null;
  let height: number | null = null;
  let heightUnit: "cm" | "m" | null = null;
  let waistCircumference: number | null = null;
  let diabetesClassification: string | null = null;
  let bloodSugar: number | null = null;
  let hba1c: number | null = null;
  let hospitalName: string | null = null;
  let subHospitalName: string | null = null;
  let organizationCombinedText: string | null = null;
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
  let osmCaregiverName: string | null = null;
  let sourceSequenceNumber: string | null = null;
  let externalPatientId: string | null = null;
  let ageAtRoster: number | null = null;
  let addressText: string | null = null;
  let bloodPressureText: string | null = null;
  let pulseRate: number | null = null;
  let bmi: number | null = null;
  let dtxReading: number | null = null;
  let riskFactorText: string | null = null;
  let serviceVisitDate: string | null = null;
  const extendedMeasurementSeries: ExtendedMeasurementCandidate[] = [];

  const parseTextField = (
    field: PatientImportFieldKey,
    target: (value: string | null) => void,
  ): void => {
    const binding = bindingsByField.get(field);

    if (!binding) {
      return;
    }

    const result = field === "phoneNumber"
      ? normalizePhoneCell(row.getCell(binding.columnNumber))
      : normalizeTextCell(row.getCell(binding.columnNumber));
    target(result.value);
    const status = assessmentStatus(field, result.diagnostics);
    updateFieldAssessment(assessments, field, binding.sourceHeader, status, result.diagnostics);
    addDiagnostics(diagnostics, field, binding.sourceHeader, result.diagnostics);
    setRequirementDiagnostic(diagnostics, field, binding.sourceHeader, result.value);
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
  parseTextField("combinedNameText", (value) => { combinedNameText = value; });
  parseTextField("hospitalNumber", (value) => { hospitalNumber = value; });
  parseTextField("gender", (value) => { gender = value; });
  parseTextField("phoneNumber", (value) => { phoneNumber = value; });
  parseTextField("diabetesClassification", (value) => { diabetesClassification = value; });
  parseTextField("hospitalName", (value) => { hospitalName = value; });
  parseTextField("subHospitalName", (value) => { subHospitalName = value; });
  parseTextField("organizationCombinedText", (value) => { organizationCombinedText = value; });
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
  parseTextField("osmCaregiverName", (value) => { osmCaregiverName = value; });
  parseTextField("sourceSequenceNumber", (value) => { sourceSequenceNumber = value; });
  parseTextField("externalPatientId", (value) => { externalPatientId = value; });
  parseTextField("addressText", (value) => { addressText = value; });
  parseTextField("bloodPressureText", (value) => { bloodPressureText = value; });
  parseTextField("riskFactorText", (value) => { riskFactorText = value; });
  parseTextField("emergencyContactPhone", (value) => { emergencyContactPhone = value; });

  const dateBinding = bindingsByField.get("dateOfBirth");
  if (dateBinding) {
    const result = normalizeDateCell(row.getCell(dateBinding.columnNumber), fileMetadata.dateFormat);
    dateOfBirth = result.value;
    updateFieldAssessment(assessments, "dateOfBirth", dateBinding.sourceHeader, assessmentStatus("dateOfBirth", result.diagnostics), result.diagnostics);
    addDiagnostics(diagnostics, "dateOfBirth", dateBinding.sourceHeader, result.diagnostics);
    setRequirementDiagnostic(diagnostics, "dateOfBirth", dateBinding.sourceHeader, result.value);
  }

  const visitDateBinding = bindingsByField.get("serviceVisitDate");
  if (visitDateBinding) {
    const result = normalizeDateCell(row.getCell(visitDateBinding.columnNumber), fileMetadata.dateFormat);
    serviceVisitDate = result.value;
    updateFieldAssessment(assessments, "serviceVisitDate", visitDateBinding.sourceHeader, assessmentStatus("serviceVisitDate", result.diagnostics), result.diagnostics);
    addDiagnostics(diagnostics, "serviceVisitDate", visitDateBinding.sourceHeader, result.diagnostics);
    setRequirementDiagnostic(diagnostics, "serviceVisitDate", visitDateBinding.sourceHeader, result.value);
  }

  const numericFields: ReadonlyArray<readonly [PatientImportFieldKey, (value: number | null) => void]> = [
    ["weight", (value) => { weight = value; }],
    ["height", (value) => { height = value; }],
    ["waistCircumference", (value) => { waistCircumference = value; }],
    ["bloodSugar", (value) => { bloodSugar = value; }],
    ["hba1c", (value) => { hba1c = value; }],
    ["ageAtRoster", (value) => { ageAtRoster = value; }],
    ["pulseRate", (value) => { pulseRate = value; }],
    ["bmi", (value) => { bmi = value; }],
    ["dtxReading", (value) => { dtxReading = value; }],
  ];

  for (const [field, target] of numericFields) {
    parseNumericField(field, target);
  }

  const heightBinding = bindingsByField.get("height");
  heightUnit = heightBinding?.heightUnit ?? null;
  if (height !== null && heightBinding && !heightUnit) {
    updateFieldAssessment(assessments, "height", heightBinding.sourceHeader, "AMBIGUOUS", ["UNIT_NOT_CONFIRMED"]);
    diagnostics.push(createDiagnostic("UNIT_NOT_CONFIRMED", "height", heightBinding.sourceHeader));
  }

  for (const binding of resolution.bindings.filter(({ field }) => field === "extendedMeasurementSeries")) {
    const extended = createExtendedMeasurementCandidate(row, binding);
    extendedMeasurementSeries.push(extended.value);
    updateFieldAssessment(assessments, "extendedMeasurementSeries", binding.sourceHeader, assessmentStatus("extendedMeasurementSeries", extended.diagnostics), extended.diagnostics);
    addDiagnostics(diagnostics, "extendedMeasurementSeries", binding.sourceHeader, extended.diagnostics);
    setRequirementDiagnostic(diagnostics, "extendedMeasurementSeries", binding.sourceHeader, extended.value.summaryText ?? extended.value.weight ?? extended.value.waistCircumference ?? extended.value.dtxReading);
  }

  if (givenName === null && bindingsByField.has("givenName")) {
    const sourceHeader = bindingsByField.get("givenName")?.sourceHeader ?? "";
    updateFieldAssessment(assessments, "givenName", sourceHeader, "INVALID", ["INVALID_VALUE"]);
    diagnostics.push(createDiagnostic("INVALID_VALUE", "givenName", sourceHeader));
  }

  if (familyName === null && bindingsByField.has("familyName")) {
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
    identity: {
      nationalId,
      externalPatientId,
      givenName,
      familyName,
      combinedNameText,
      ageAtRoster,
    },
    demographics: { dateOfBirth, gender },
    contact: {
      phoneNumber,
      emergencyContactName,
      emergencyContactPhone,
      emergencyContactRelationship,
    },
    address: {
      addressText,
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
      heightUnit,
      waistCircumference,
      diabetesClassification,
      bloodSugar,
      hba1c,
      bloodPressureText,
      pulseRate,
      bmi,
      dtxReading,
      riskFactorText,
      serviceVisitDate,
      extendedMeasurementSeries,
    },
    organizationCandidates: {
      hospitalNumber,
      hospitalName,
      subHospitalName,
      organizationCombinedText,
    },
    caregiverCandidates: { osmCaregiverName },
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
    return canonicalRow.identity.combinedNameText
      ? "พบชื่อรวมในไฟล์ แต่ยังไม่สามารถแยกชื่อและนามสกุลอย่างปลอดภัย"
      : "กรุณาระบุชื่อ";
  }

  if (fields.has("familyName")) {
    return "กรุณาระบุนามสกุล";
  }

  if (fields.has("hospitalNumber")) {
    return "HN ยาวเกินจำนวนที่รองรับ";
  }

  return "ข้อมูลแถวนี้ไม่ถูกต้อง";
}

function assertRequiredHeaders(resolution: PatientImportHeaderResolution): void {
  if (!resolution.byField.has("nationalId")) {
    throw new ValidationError("Excel ต้องมีคอลัมน์เลขบัตรประชาชน");
  }

  if (
    !resolution.byField.has("givenName") &&
    !resolution.byField.has("familyName") &&
    !resolution.byField.has("combinedNameText")
  ) {
    throw new ValidationError("Excel ต้องมีคอลัมน์ชื่อและนามสกุล หรือชื่อรวมที่ผู้ส่งตรวจสอบเอง");
  }
}

function buildCandidate(
  worksheet: Worksheet,
  rowNumber: number,
  resolution: PatientImportHeaderResolution,
  fileMetadata: PatientImportFileMetadata,
  targetHospitalId: string,
): PatientProvisioningImportCandidate {
  const canonicalRow = readCanonicalRow(worksheet, rowNumber, resolution, fileMetadata);
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
    combinedNameText: canonicalRow.identity.combinedNameText,
    hospitalNumber: canonicalRow.organizationCandidates.hospitalNumber,
    validationMessage: parsedRow.success ? null : mapValidationMessage(parsedRow.error.issues, canonicalRow),
    canonicalRow,
    fileMetadata,
  };
}

export async function readPatientImportCandidates(
  file: PatientImportUpload,
  targetHospitalId: string,
): Promise<PatientProvisioningImportCandidate[]> {
  const parsedScope = patientProvisionScopeSchema.safeParse({ targetHospitalId });

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

  const workbook = new ExcelJS.Workbook();

  try {
    type ExcelJsInputBuffer = Parameters<typeof workbook.xlsx.load>[0];
    await workbook.xlsx.load(buffer as unknown as ExcelJsInputBuffer);
  } catch {
    throw new ValidationError("ไฟล์ Excel ไม่ถูกต้องหรือไม่สามารถอ่านได้");
  }

  if (workbook.worksheets.length === 0) {
    throw new ValidationError("ไม่พบแผ่นงานในไฟล์ Excel");
  }

  const selected = selectWorksheet(workbook);

  if (selected.tooManyRows) {
    throw new ValidationError(`ไฟล์ Excel รองรับผู้ป่วยไม่เกิน ${MAX_PATIENT_IMPORT_ROWS} แถว`);
  }

  assertRequiredHeaders(selected.resolution);

  const fileMetadata = createPatientImportFileMetadata(
    selected.worksheet.name,
    selected.headerRowNumber,
    selected.resolution,
  );

  return selected.dataRowNumbers.map((rowNumber) =>
    buildCandidate(
      selected.worksheet,
      rowNumber,
      selected.resolution,
      fileMetadata,
      parsedScope.data.targetHospitalId,
    ),
  );
}

export const patientImportAdapterInternals = {
  createEmptyFieldAssessmentMap,
  maskIdentity,
  normalizeCellText,
  readCanonicalRow,
  resolvePatientImportHeaders,
};
