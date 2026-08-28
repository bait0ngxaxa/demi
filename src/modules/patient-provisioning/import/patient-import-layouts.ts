import type { Cell, Worksheet } from "exceljs";

import { ValidationError } from "@/shared/errors/application-error";

import {
  PATIENT_IMPORT_FIELD_KEYS,
  isPatientImportBaselineField,
  isPatientImportClassificationField,
  isPatientImportOsmAssignmentField,
  type PatientImportDiagnostic,
  type PatientImportFieldKey,
  type PatientImportFileMetadata,
  type PatientImportLayoutKey,
  type PatientImportDateFormat,
} from "./patient-import-contract";
import {
  createPatientImportHeaderBinding,
  normalizePatientImportHeader,
  type PatientImportHeaderBinding,
} from "./patient-import-header-aliases";
import {
  PATIENT_IMPORT_TEMPLATE_COLUMNS,
  PATIENT_IMPORT_TEMPLATE_DATA_START_ROW,
  PATIENT_IMPORT_TEMPLATE_EXPECTED_COLUMN_COUNT,
  PATIENT_IMPORT_TEMPLATE_MAX_HEADER_SCAN_ROWS,
  PATIENT_IMPORT_TEMPLATE_MISMATCH_MESSAGE,
  PATIENT_IMPORT_TEMPLATE_SECONDARY_HEADERS,
  PATIENT_IMPORT_TEMPLATE_SECONDARY_HEADER_ROW,
} from "./patient-import-template-contract";

export const MAX_PATIENT_IMPORT_COLUMNS = 64;

export type PatientImportHeaderResolution = {
  bindings: readonly PatientImportHeaderBinding[];
  byField: ReadonlyMap<PatientImportFieldKey, PatientImportHeaderBinding>;
  ambiguousFields: ReadonlySet<PatientImportFieldKey>;
  recognizedHeaders: readonly string[];
  unknownHeaders: readonly string[];
  ambiguousHeaders: readonly string[];
  layout: PatientImportLayoutKey;
  dateFormat: PatientImportDateFormat;
  diagnostics: readonly PatientImportDiagnostic[];
};

export type CanonicalPatientImportTemplateValidation = {
  headerRowNumber: number;
  dataStartRowNumber: number;
  resolution: PatientImportHeaderResolution;
};

function normalizeCanonicalPatientImportHeader(value: string): string {
  return value
    .replace(/^\uFEFF/u, "")
    .normalize("NFC")
    .replace(/[\s\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000]+/gu, " ")
    .trim();
}

export function readPatientImportHeaderCellText(cell: Cell): string {
  if (cell.isMerged) {
    const cellAddress = cell.fullAddress;
    const masterAddress = cell.master.fullAddress;

    if (cellAddress.row !== masterAddress.row || cellAddress.col !== masterAddress.col) {
      return "";
    }

    return cell.master.text;
  }

  return cell.text;
}

export function extractPatientImportHeaders(
  worksheet: Worksheet,
  headerRowNumber: number,
  maximumColumns = MAX_PATIENT_IMPORT_COLUMNS,
): readonly string[] | null {
  if (worksheet.actualColumnCount === 0 || worksheet.actualColumnCount > maximumColumns) {
    return null;
  }

  const headerRow = worksheet.getRow(headerRowNumber);
  const headers: string[] = [];

  for (let columnNumber = 1; columnNumber <= worksheet.actualColumnCount; columnNumber += 1) {
    headers.push(readPatientImportHeaderCellText(headerRow.getCell(columnNumber)));
  }

  return headers;
}

function isCanonicalPrimaryHeaderRow(headers: readonly string[]): boolean {
  return (
    headers.length === PATIENT_IMPORT_TEMPLATE_EXPECTED_COLUMN_COUNT &&
    PATIENT_IMPORT_TEMPLATE_COLUMNS.every(
      (column, index) =>
        normalizeCanonicalPatientImportHeader(headers[index] ?? "") ===
        normalizeCanonicalPatientImportHeader(column.header),
    )
  );
}

function createCanonicalPatientImportHeaderResolution(
  sourceHeaders: readonly string[],
): PatientImportHeaderResolution {
  const bindings: PatientImportHeaderBinding[] = [];
  const byField = new Map<PatientImportFieldKey, PatientImportHeaderBinding>();

  for (const [index, column] of PATIENT_IMPORT_TEMPLATE_COLUMNS.entries()) {
    const sourceHeader = sourceHeaders[index] ?? column.header;
    const binding: PatientImportHeaderBinding = {
      field: column.field,
      columnNumber: index + 1,
      sourceHeader: sourceHeader.replace(/^\uFEFF/u, "").trim(),
      normalizedHeader: normalizePatientImportHeader(sourceHeader),
      heightUnit: column.field === "height" ? "cm" : null,
    };

    if (byField.has(binding.field)) {
      throw new Error("PATIENT_IMPORT_TEMPLATE_DUPLICATE_FIELD");
    }

    bindings.push(binding);
    byField.set(binding.field, binding);
  }

  return {
    bindings,
    byField,
    ambiguousFields: new Set<PatientImportFieldKey>(),
    recognizedHeaders: bindings.map(({ sourceHeader }) => sourceHeader),
    unknownHeaders: [],
    ambiguousHeaders: [],
    layout: "OPERATIONAL_ROSTER",
    dateFormat: "DMY",
    diagnostics: [],
  };
}

export function findCanonicalPatientImportHeaderRows(
  worksheet: Worksheet,
  maximumHeaderScanRows = PATIENT_IMPORT_TEMPLATE_MAX_HEADER_SCAN_ROWS,
): readonly number[] {
  if (worksheet.actualColumnCount !== PATIENT_IMPORT_TEMPLATE_EXPECTED_COLUMN_COUNT) {
    return [];
  }

  const maximumHeaderRow = Math.min(
    maximumHeaderScanRows,
    Math.max(worksheet.actualRowCount, worksheet.rowCount),
  );
  const candidateRows: number[] = [];

  for (let rowNumber = 1; rowNumber <= maximumHeaderRow; rowNumber += 1) {
    const headers = extractPatientImportHeaders(worksheet, rowNumber);

    if (headers && isCanonicalPrimaryHeaderRow(headers)) {
      candidateRows.push(rowNumber);
    }
  }

  return candidateRows;
}

export function validateCanonicalPatientImportTemplate(
  worksheet: Worksheet,
  maximumHeaderScanRows = PATIENT_IMPORT_TEMPLATE_MAX_HEADER_SCAN_ROWS,
): CanonicalPatientImportTemplateValidation {
  if (worksheet.actualColumnCount !== PATIENT_IMPORT_TEMPLATE_EXPECTED_COLUMN_COUNT) {
    throw new ValidationError(PATIENT_IMPORT_TEMPLATE_MISMATCH_MESSAGE);
  }

  const candidateRows = findCanonicalPatientImportHeaderRows(worksheet, maximumHeaderScanRows);

  if (candidateRows.length === 0) {
    throw new ValidationError(PATIENT_IMPORT_TEMPLATE_MISMATCH_MESSAGE);
  }

  if (candidateRows.length > 1) {
    throw new ValidationError("พบหัวตารางผู้ป่วยมากกว่าหนึ่งแถวในแผ่นงานเดียวกัน");
  }

  const headerRowNumber = candidateRows[0];

  if (headerRowNumber === undefined) {
    throw new ValidationError(PATIENT_IMPORT_TEMPLATE_MISMATCH_MESSAGE);
  }

  const secondaryHeaders = extractPatientImportHeaders(
    worksheet,
    PATIENT_IMPORT_TEMPLATE_SECONDARY_HEADER_ROW + headerRowNumber - 1,
  );

  if (!secondaryHeaders || secondaryHeaders.length !== PATIENT_IMPORT_TEMPLATE_EXPECTED_COLUMN_COUNT) {
    throw new ValidationError(PATIENT_IMPORT_TEMPLATE_MISMATCH_MESSAGE);
  }

  for (const [index, column] of PATIENT_IMPORT_TEMPLATE_COLUMNS.entries()) {
    const expectedSecondaryHeader = PATIENT_IMPORT_TEMPLATE_SECONDARY_HEADERS[column.column] ?? "";
    const actualSecondaryHeader = normalizeCanonicalPatientImportHeader(secondaryHeaders[index] ?? "");

    if (actualSecondaryHeader !== normalizeCanonicalPatientImportHeader(expectedSecondaryHeader)) {
      throw new ValidationError(PATIENT_IMPORT_TEMPLATE_MISMATCH_MESSAGE);
    }
  }

  const primaryHeaders = extractPatientImportHeaders(worksheet, headerRowNumber);

  if (!primaryHeaders || !isCanonicalPrimaryHeaderRow(primaryHeaders)) {
    throw new ValidationError(PATIENT_IMPORT_TEMPLATE_MISMATCH_MESSAGE);
  }

  return {
    headerRowNumber,
    dataStartRowNumber: headerRowNumber + PATIENT_IMPORT_TEMPLATE_DATA_START_ROW - 1,
    resolution: createCanonicalPatientImportHeaderResolution(primaryHeaders),
  };
}

function diagnostic(
  code: PatientImportDiagnostic["code"],
  message: string,
  options: Pick<PatientImportDiagnostic, "field" | "sourceHeader"> = {},
): PatientImportDiagnostic {
  return { code, message, ...options };
}

function detectLayout(fields: ReadonlySet<PatientImportFieldKey>): PatientImportLayoutKey {
  if (
    fields.has("externalPatientId") ||
    fields.has("serviceVisitDate") ||
    fields.has("extendedMeasurementSeries") ||
    fields.has("bloodPressureText") ||
    fields.has("pulseRate") ||
    fields.has("bmi")
  ) {
    return "EXTENDED_ROSTER";
  }

  if (fields.has("combinedNameText") && !fields.has("givenName") && !fields.has("familyName")) {
    return "COMBINED_NAME_REVIEW";
  }

  if (
    fields.has("nationalId") &&
    (fields.has("givenName") || fields.has("familyName")) &&
    fields.size <= 4
  ) {
    return "CURRENT_MINIMAL";
  }

  if (fields.size >= 5) {
    return "OPERATIONAL_ROSTER";
  }

  return "UNKNOWN";
}

function detectDateFormat(
  fields: ReadonlySet<PatientImportFieldKey>,
  normalizedHeaders: readonly string[],
  layout: PatientImportLayoutKey,
): PatientImportDateFormat {
  if (!fields.has("dateOfBirth") && !fields.has("serviceVisitDate")) {
    return "UNKNOWN";
  }

  const hasKnownOperationalShape =
    fields.has("hospitalName") ||
    fields.has("subHospitalName") ||
    fields.has("organizationCombinedText") ||
    fields.has("weight") ||
    fields.has("height") ||
    fields.has("phoneNumber") ||
    fields.has("gender") ||
    fields.has("externalPatientId") ||
    fields.has("serviceVisitDate");

  if (
    (layout === "OPERATIONAL_ROSTER" && hasKnownOperationalShape) ||
    layout === "EXTENDED_ROSTER" ||
    normalizedHeaders.some((header) => header.includes("วันเกิด") || header.includes("วันเดือน"))
  ) {
    return "DMY";
  }

  return "UNKNOWN";
}

function isAllowedRepeatedField(field: PatientImportFieldKey): boolean {
  return field === "serviceVisitDate" || field === "extendedMeasurementSeries";
}

function resolveKnownDuplicatePhoneBindings(
  bindings: readonly PatientImportHeaderBinding[],
): PatientImportHeaderBinding[] {
  const genericPhoneBindings = bindings
    .filter(
      (binding) =>
        binding.field === "phoneNumber" &&
        binding.normalizedHeader === normalizePatientImportHeader("เบอร์โทร"),
    )
    .sort((left, right) => left.columnNumber - right.columnNumber);

  if (genericPhoneBindings.length !== 2) {
    return [...bindings];
  }

  const emergencyNameBindings = bindings.filter(
    ({ field }) => field === "emergencyContactName",
  );
  const emergencyRelationshipBindings = bindings.filter(
    ({ field }) => field === "emergencyContactRelationship",
  );

  if (emergencyNameBindings.length !== 1 || emergencyRelationshipBindings.length !== 1) {
    return [...bindings];
  }

  const [patientPhoneBinding, emergencyPhoneBinding] = genericPhoneBindings;
  const emergencyNameBinding = emergencyNameBindings[0];
  const emergencyRelationshipBinding = emergencyRelationshipBindings[0];

  const matchesKnownOperationalContactGroup =
    patientPhoneBinding.columnNumber < emergencyNameBinding.columnNumber &&
    emergencyNameBinding.columnNumber < emergencyPhoneBinding.columnNumber &&
    emergencyPhoneBinding.columnNumber < emergencyRelationshipBinding.columnNumber;

  if (!matchesKnownOperationalContactGroup) {
    return [...bindings];
  }

  return bindings.map((binding) =>
    binding.columnNumber === emergencyPhoneBinding.columnNumber
      ? { ...binding, field: "emergencyContactPhone" }
      : binding,
  );
}

export function resolvePatientImportHeaders(
  sourceHeaders: readonly string[],
): PatientImportHeaderResolution {
  if (sourceHeaders.length === 0 || sourceHeaders.length > MAX_PATIENT_IMPORT_COLUMNS) {
    throw new Error("PATIENT_IMPORT_COLUMN_LIMIT");
  }

  const initialBindings: PatientImportHeaderBinding[] = [];
  const unknownHeaders: string[] = [];
  const ambiguousHeaders: string[] = [];
  const diagnostics: PatientImportDiagnostic[] = [];

  sourceHeaders.forEach((sourceHeader, index) => {
    const trimmedHeader = sourceHeader.replace(/^\uFEFF/u, "").trim();

    if (!trimmedHeader) {
      unknownHeaders.push(`คอลัมน์ที่ ${index + 1}`);
      return;
    }

    const binding = createPatientImportHeaderBinding(trimmedHeader, index + 1);

    if (!binding) {
      unknownHeaders.push(trimmedHeader);
      diagnostics.push(
        diagnostic("UNKNOWN_HEADER", "ไม่รู้จักหัวตารางนี้ จะแสดงไว้ให้ตรวจสอบ", {
          sourceHeader: trimmedHeader,
        }),
      );
      return;
    }

    initialBindings.push(binding);
  });

  const bindings = resolveKnownDuplicatePhoneBindings(initialBindings);
  const columnsByField = new Map<PatientImportFieldKey, PatientImportHeaderBinding[]>();

  for (const binding of bindings) {
    const current = columnsByField.get(binding.field) ?? [];
    current.push(binding);
    columnsByField.set(binding.field, current);
  }

  const ambiguousFields = new Set<PatientImportFieldKey>();
  const byField = new Map<PatientImportFieldKey, PatientImportHeaderBinding>();

  for (const [field, fieldBindings] of columnsByField) {
    if (fieldBindings.length === 1 || isAllowedRepeatedField(field)) {
      byField.set(field, fieldBindings[0]);
      continue;
    }

    ambiguousFields.add(field);
    for (const binding of fieldBindings) {
      ambiguousHeaders.push(binding.sourceHeader);
      diagnostics.push(
        diagnostic("AMBIGUOUS_HEADER", "หัวตารางนี้ซ้ำและไม่สามารถระบุความหมายได้อย่างปลอดภัย", {
          field,
          sourceHeader: binding.sourceHeader,
        }),
      );
    }
  }

  const fields = new Set(bindings.map(({ field }) => field));
  const normalizedHeaders = bindings.map(({ normalizedHeader }) => normalizedHeader);
  const layout = detectLayout(fields);
  const dateFormat = detectDateFormat(fields, normalizedHeaders, layout);

  if (!fields.has("nationalId")) {
    diagnostics.push(
      diagnostic("MISSING_REQUIRED_HEADER", "ไม่พบหัวตารางเลขบัตรประชาชน", {
        field: "nationalId",
      }),
    );
  }

  if (!fields.has("givenName")) {
    diagnostics.push(
      diagnostic("MISSING_REQUIRED_HEADER", "ไม่พบหัวตารางชื่อผู้ป่วย", {
        field: "givenName",
      }),
    );
  }

  if (!fields.has("familyName")) {
    diagnostics.push(
      diagnostic("MISSING_REQUIRED_HEADER", "ไม่พบหัวตารางนามสกุลผู้ป่วย", {
        field: "familyName",
      }),
    );
  }

  return {
    bindings,
    byField,
    ambiguousFields,
    recognizedHeaders: bindings.map(({ sourceHeader }) => sourceHeader),
    unknownHeaders,
    ambiguousHeaders,
    layout,
    dateFormat,
    diagnostics,
  };
}

export function createPatientImportFileMetadata(
  worksheetName: string,
  headerRowNumber: number,
  resolution: PatientImportHeaderResolution,
): PatientImportFileMetadata {
  const recognizedFields = new Set(resolution.bindings.map(({ field }) => field));
  const requirementGatedFields = PATIENT_IMPORT_FIELD_KEYS.filter(
    (field) =>
      recognizedFields.has(field) &&
      !isPatientImportBaselineField(field) &&
      !isPatientImportClassificationField(field) &&
      !isPatientImportOsmAssignmentField(field) &&
      field !== "nationalId" &&
      field !== "givenName" &&
      field !== "familyName" &&
      field !== "hospitalNumber",
  );

  return {
    worksheetName,
    headerRowNumber,
    layout: resolution.layout,
    dateFormat: resolution.dateFormat,
    recognizedHeaders: resolution.recognizedHeaders,
    requirementGatedFields,
    unknownHeaders: resolution.unknownHeaders,
    ambiguousHeaders: resolution.ambiguousHeaders,
    diagnostics: resolution.diagnostics,
  };
}

export function hasPatientIdentityHeaderSignature(
  resolution: PatientImportHeaderResolution,
): boolean {
  return resolution.byField.has("nationalId") &&
    (resolution.byField.has("givenName") || resolution.byField.has("familyName") ||
      resolution.byField.has("combinedNameText"));
}

export function hasRequiredPatientCoreHeaders(
  resolution: PatientImportHeaderResolution,
): boolean {
  return (
    resolution.byField.has("nationalId") &&
    resolution.byField.has("givenName") &&
    resolution.byField.has("familyName")
  );
}

export function normalizePatientImportOrganizationText(value: string): string {
  return normalizePatientImportHeader(value).replace(/[.\-]/gu, "");
}
