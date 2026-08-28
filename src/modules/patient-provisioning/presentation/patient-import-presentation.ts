import type {
  PatientImportPreviewRow,
  PatientImportClassification,
  PatientImportResultSummary,
} from "../services/patient-roster-import-types";
import {
  isPatientImportAttentionClassification,
  isPatientImportAttentionResult,
} from "../services/patient-roster-import-types";
import type {
  PatientImportOsmCandidateBinding,
  PatientImportOsmAssignmentReconciliationBinding,
  PatientImportPreviewBinding,
} from "../transport/action-state";

export type PatientImportPreviewSummary = {
  total: number;
  ready: number;
  alreadyExists: number;
  attention: number;
  invalid: number;
};

export type PatientImportResultPresentation = {
  variant: "neutral" | "success" | "warning" | "danger";
  heading: string;
  detail: string | null;
  reviewCount: number;
  hasAttentionRows: boolean;
  hasSuccessfulRows: boolean;
  allIdempotent: boolean;
};

export function summarizePatientImportPreview(
  rows: readonly PatientImportPreviewRow[],
): PatientImportPreviewSummary {
  return rows.reduce<PatientImportPreviewSummary>(
    (summary, row) => ({
      total: summary.total + 1,
      ready: summary.ready + (row.classification === "READY" ? 1 : 0),
      alreadyExists: summary.alreadyExists + (row.classification === "ALREADY_EXISTS" ? 1 : 0),
      attention: summary.attention + (isPatientImportAttentionClassification(row.classification) ? 1 : 0),
      invalid: summary.invalid + (row.classification === "INVALID" ? 1 : 0),
    }),
    { total: 0, ready: 0, alreadyExists: 0, attention: 0, invalid: 0 },
  );
}

export function selectedPatientImportOsmCandidate(
  reconciliation: PatientImportOsmAssignmentReconciliationBinding,
): PatientImportOsmCandidateBinding | null {
  return reconciliation.resolutionStatus === "OSM_MATCHED"
    ? reconciliation.candidates[0] ?? null
    : null;
}

export function isPatientImportRowImportable(
  row: PatientImportPreviewRow,
  preview: Pick<
    PatientImportPreviewBinding,
    "canManageOsmAssignment" | "osmAssignmentReconciliations"
  >,
  selectedClassificationRows: ReadonlySet<number>,
  selectedReassignmentRows: ReadonlySet<number>,
): boolean {
  if (
    row.classification === "INVALID" ||
    row.classification === "DUPLICATE_IN_FILE" ||
    row.classification === "CONFLICT" ||
    row.classification === "HOSPITAL_MISMATCH" ||
    row.classification === "UNSUPPORTED_REQUIREMENT"
  ) {
    return false;
  }

  if (row.patientClassification.status === "CLASSIFICATION_DATA_INVALID") {
    return false;
  }

  if (
    row.patientClassification.status === "CLASSIFICATION_CHANGE_REQUIRES_CONFIRMATION" &&
    !selectedClassificationRows.has(row.rowNumber)
  ) {
    return false;
  }

  if (
    row.baselineStatus === "BASELINE_CONFLICT" ||
    row.baselineStatus === "BASELINE_DATA_INVALID" ||
    row.baselineStatus === "BASELINE_DATE_REQUIRED"
  ) {
    return false;
  }

  const osm = row.patientOsmAssignment;

  if (
    osm.resolutionStatus === "OSM_NOT_APPLICABLE" ||
    osm.assignmentStatus === "OSM_ASSIGNMENT_ALREADY_EXISTS"
  ) {
    return true;
  }

  if (
    !preview.canManageOsmAssignment ||
    osm.resolutionStatus === "OSM_NOT_FOUND" ||
    osm.resolutionStatus === "OSM_AMBIGUOUS" ||
    osm.resolutionStatus === "OSM_SELF_ASSIGNMENT_FORBIDDEN" ||
    osm.resolutionStatus === "OSM_DATA_INVALID" ||
    osm.assignmentStatus === "OSM_OWNER_REQUIRED"
  ) {
    return false;
  }

  const reconciliation = preview.osmAssignmentReconciliations.find(
    ({ rowNumber }) => rowNumber === row.rowNumber,
  );

  if (!reconciliation) {
    return false;
  }

  const candidate = selectedPatientImportOsmCandidate(reconciliation);

  if (!candidate) {
    return false;
  }

  return !osm.currentCaregiver ||
    candidate.sameAsCurrent ||
    selectedReassignmentRows.has(row.rowNumber);
}

export function countPatientImportExecutableRows(
  preview: PatientImportPreviewBinding,
  selectedClassificationRows: ReadonlySet<number>,
  selectedReassignmentRows: ReadonlySet<number>,
): number {
  if (preview.baselineDateRequired) {
    return 0;
  }

  return preview.rows.filter(
    (row) =>
      row.classification !== "ALREADY_EXISTS" &&
      isPatientImportRowImportable(
        row,
        preview,
        selectedClassificationRows,
        selectedReassignmentRows,
      ),
  ).length;
}

export function countPatientImportRowsRequiringAttention(
  preview: PatientImportPreviewBinding,
  selectedClassificationRows: ReadonlySet<number>,
  selectedReassignmentRows: ReadonlySet<number>,
): number {
  return preview.rows.filter(
    (row) =>
      isPatientImportAttentionClassification(row.classification) &&
      !isPatientImportRowImportable(
        row,
        preview,
        selectedClassificationRows,
        selectedReassignmentRows,
      ),
  ).length;
}

export function getPatientImportResultPresentation(
  summary: PatientImportResultSummary,
): PatientImportResultPresentation {
  const hasAttentionRows = summary.rows.some((row) => isPatientImportAttentionResult(row.result));
  const hasSuccessfulRows = summary.imported > 0 || summary.alreadyExists > 0;
  const allIdempotent =
    summary.imported === 0 &&
    summary.alreadyExists > 0 &&
    !hasAttentionRows;
  const reviewCount =
    summary.duplicateInFile +
    summary.conflict +
    summary.needsReview +
    summary.hospitalMismatch +
    summary.unsupportedRequirement;
  const variant = hasAttentionRows
    ? hasSuccessfulRows
      ? "warning"
      : "danger"
    : hasSuccessfulRows
      ? "success"
      : "neutral";
  const heading = allIdempotent
    ? "ไฟล์นี้ไม่มีรายการที่ต้องแก้ไข"
    : hasAttentionRows && hasSuccessfulRows
      ? "นำเข้ารายการที่พร้อมเรียบร้อยแล้ว และยังมีบางรายการที่ต้องตรวจสอบ"
      : !hasAttentionRows && summary.imported > 0
        ? "นำเข้าข้อมูลเรียบร้อยแล้ว"
        : "ยังไม่มีรายการที่บันทึกได้";
  const detail = allIdempotent
    ? "ไฟล์นี้ไม่มีรายการที่ต้องแก้ไข ข้อมูลที่มีอยู่แล้วไม่ได้ถูกสร้างซ้ำ"
    : hasAttentionRows && hasSuccessfulRows
      ? "ระบบบันทึกเฉพาะรายการที่พร้อมแล้ว รายการที่ต้องตรวจสอบยังไม่ถูกบันทึก"
      : hasAttentionRows
        ? "รายการที่ต้องตรวจสอบยังไม่ถูกบันทึก กรุณาแก้ไขแล้วอัปโหลดไฟล์ใหม่"
        : null;

  return {
    variant,
    heading,
    detail,
    reviewCount,
    hasAttentionRows,
    hasSuccessfulRows,
    allIdempotent,
  };
}

export function getPatientImportAttentionReason(row: PatientImportPreviewRow): string {
  if (row.classification === "HOSPITAL_MISMATCH") {
    return "ชื่อโรงพยาบาลในไฟล์ไม่ตรงกับโรงพยาบาลที่เลือก";
  }

  if (row.classification === "DUPLICATE_IN_FILE") {
    return "พบเลขบัตรประชาชนซ้ำในไฟล์เดียวกัน";
  }

  return (
    getPatientImportBaselineReason(row) ??
    getPatientImportClassificationReason(row) ??
    getPatientImportOsmReason(row) ??
    row.reason ??
    fallbackPatientImportAttentionReason(row)
  );
}

export function getPatientImportBaselineReason(
  row: PatientImportPreviewRow,
): string | null {
  switch (row.baselineStatus) {
    case "BASELINE_CONFLICT":
      return "ข้อมูลตั้งต้นแตกต่างจากข้อมูลที่บันทึกไว้แล้ว";
    case "BASELINE_DATE_REQUIRED":
      return "ต้องระบุวันที่ข้อมูลตั้งต้นก่อนนำเข้า";
    case "BASELINE_DATA_INVALID":
      return "ข้อมูลตั้งต้นไม่ถูกต้องหรือไม่รองรับหน่วยที่ระบุ";
    default:
      return null;
  }
}

export function getPatientImportClassificationReason(
  row: PatientImportPreviewRow,
): string | null {
  switch (row.patientClassification.status) {
    case "CLASSIFICATION_CHANGE_REQUIRES_CONFIRMATION":
      return "สถานะผู้ป่วยจากไฟล์แตกต่างจากสถานะปัจจุบัน";
    case "CLASSIFICATION_DATA_INVALID":
      return "สถานะผู้ป่วยจากไฟล์ไม่ใช่ค่าที่รองรับ";
    default:
      return null;
  }
}

export function getPatientImportOsmReason(row: PatientImportPreviewRow): string | null {
  const osm = row.patientOsmAssignment;

  if (osm.resolutionStatus === "OSM_NOT_FOUND") {
    return "ไม่พบผู้ดูแลในโรงพยาบาลนี้";
  }

  if (osm.resolutionStatus === "OSM_AMBIGUOUS") {
    return "พบผู้ดูแลชื่อเดียวกันมากกว่า 1 คน";
  }

  if (osm.resolutionStatus === "OSM_SELF_ASSIGNMENT_FORBIDDEN") {
    return "ไม่สามารถกำหนดตนเองเป็นผู้ดูแลผู้ป่วยได้";
  }

  if (osm.resolutionStatus === "OSM_DATA_INVALID") {
    return "ชื่อผู้ดูแลจากไฟล์ไม่ถูกต้อง";
  }

  if (osm.assignmentStatus === "OSM_OWNER_REQUIRED") {
    return "ต้องให้ผู้ใช้งานสิทธิ์เจ้าของโรงพยาบาลเป็นผู้ยืนยันผู้ดูแล";
  }

  if (osm.assignmentStatus === "OSM_ASSIGNMENT_CONFLICT") {
    return "ผู้ดูแลจากไฟล์แตกต่างจากผู้ดูแลปัจจุบัน";
  }

  return null;
}

/* istanbul ignore next -- kept local to the preceding public helper for exhaustive fallback typing */
function fallbackPatientImportAttentionReason(
  row: PatientImportPreviewRow,
): string {
  const fallbackReasons: Record<PatientImportClassification, string> = {
    READY: "พร้อมนำเข้า",
    ALREADY_EXISTS: "ข้อมูลมีอยู่แล้ว ระบบจะไม่สร้างซ้ำ",
    DUPLICATE_IN_FILE: "พบข้อมูลซ้ำในไฟล์เดียวกัน",
    INVALID: "ข้อมูลหลักของแถวนี้ไม่ครบถ้วนหรือไม่ถูกต้อง",
    CONFLICT: "ข้อมูลผู้ป่วยขัดแย้งกับข้อมูลเดิม",
    NEEDS_REVIEW: "รายการนี้ยังต้องตรวจสอบก่อนนำเข้า",
    HOSPITAL_MISMATCH: "ชื่อโรงพยาบาลในไฟล์ไม่ตรงกับโรงพยาบาลที่เลือก",
    UNSUPPORTED_REQUIREMENT: "ข้อมูลบางส่วนยังอยู่นอกขอบเขตการบันทึกของระบบ",
  };

  return fallbackReasons[row.classification];
}
