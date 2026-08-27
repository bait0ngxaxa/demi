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
