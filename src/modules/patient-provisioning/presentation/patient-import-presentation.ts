import type {
  PatientImportPreview,
  PatientImportPreviewRow,
  PatientImportClassification,
  PatientImportResultSummary,
} from "../services/patient-roster-import-types";
import {
  isPatientImportAttentionClassification,
  isPatientImportAttentionResult,
} from "../services/patient-roster-import-types";

export type PatientImportPreviewSummary = {
  total: number;
  /** New patients that will be created (READY). */
  ready: number;
  /** Patients already in this Hospital; the import leaves them untouched. */
  alreadyExists: number;
  /** Rows that need correcting before they can be imported. */
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

export type PatientImportRecoveryAction = "DATA_REVIEW" | "RETRY_FAILED";

export type PatientImportRecoveryGuidance = {
  kind: PatientImportRecoveryAction;
  message: string;
  detail?: string;
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

/** Attention rows first so they are fixed first, then new patients; existing patients are grouped apart. */
export function partitionPatientImportPreviewRows(rows: readonly PatientImportPreviewRow[]): {
  primaryRows: PatientImportPreviewRow[];
  alreadyExistsRows: PatientImportPreviewRow[];
} {
  const attentionRows = rows.filter((row) => isPatientImportAttentionClassification(row.classification));
  const readyRows = rows.filter((row) => row.classification === "READY");

  return {
    primaryRows: [...attentionRows, ...readyRows],
    alreadyExistsRows: rows.filter((row) => row.classification === "ALREADY_EXISTS"),
  };
}

export function countPatientImportExecutableRows(
  preview: Pick<PatientImportPreview, "baselineDateRequired" | "rows">,
): number {
  if (preview.baselineDateRequired) {
    return 0;
  }

  return preview.rows.filter((row) => row.classification === "READY").length;
}

export function countPatientImportRowsRequiringAttention(
  preview: Pick<PatientImportPreview, "rows">,
): number {
  return preview.rows.filter((row) => isPatientImportAttentionClassification(row.classification)).length;
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
  const reviewCount = summary.duplicateInFile + summary.conflict;
  const variant = hasAttentionRows
    ? hasSuccessfulRows
      ? "warning"
      : "danger"
    : hasSuccessfulRows
      ? "success"
      : "neutral";
  const heading = allIdempotent
    ? "ไม่มีผู้ป่วยใหม่ในไฟล์นี้"
    : hasAttentionRows && hasSuccessfulRows
      ? "นำเข้าผู้ป่วยใหม่เรียบร้อยแล้ว และยังมีบางรายการที่ต้องแก้ไข"
      : !hasAttentionRows && summary.imported > 0
        ? "นำเข้าผู้ป่วยใหม่เรียบร้อยแล้ว"
        : "ยังไม่มีรายการที่บันทึกได้";
  const detail = allIdempotent
    ? "ผู้ป่วยที่มีอยู่แล้วไม่ถูกสร้างซ้ำและไม่ถูกเปลี่ยนแปลง"
    : hasAttentionRows && hasSuccessfulRows
      ? "ระบบบันทึกเฉพาะผู้ป่วยใหม่ที่พร้อมแล้ว รายการที่ต้องแก้ไขยังไม่ถูกบันทึก"
      : hasAttentionRows
        ? "รายการที่ต้องแก้ไขยังไม่ถูกบันทึก"
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

const patientImportRecoveryGuidanceByAction: Record<
  PatientImportRecoveryAction,
  PatientImportRecoveryGuidance
> = {
  DATA_REVIEW: {
    kind: "DATA_REVIEW",
    message:
      "ดาวน์โหลดแถวที่ไม่ผ่าน แก้ไขตามเหตุผลที่ระบุ แล้วนำเข้าไฟล์นั้นอีกครั้ง",
    detail: "ไม่ต้องลบคอลัมน์ “เหตุผล” ระบบจะไม่นำคอลัมน์นี้ไปใช้",
  },
  RETRY_FAILED: {
    kind: "RETRY_FAILED",
    message: "มีบางรายการที่ระบบไม่สามารถบันทึกได้ กรุณาลองนำเข้าอีกครั้ง",
    detail: "หากยังเกิดปัญหาเดิม กรุณาแจ้งผู้ดูแลระบบ",
  },
};

export function getPatientImportRecoveryGuidance(
  summary: Pick<PatientImportResultSummary, "rows">,
): readonly PatientImportRecoveryGuidance[] {
  const guidance: PatientImportRecoveryGuidance[] = [];

  if (
    summary.rows.some(
      (row) =>
        row.result === "INVALID" ||
        row.result === "DUPLICATE_IN_FILE" ||
        row.result === "CONFLICT",
    )
  ) {
    guidance.push(patientImportRecoveryGuidanceByAction.DATA_REVIEW);
  }

  if (summary.rows.some((row) => row.result === "FAILED")) {
    guidance.push(patientImportRecoveryGuidanceByAction.RETRY_FAILED);
  }

  return guidance;
}

export function getPatientImportAttentionReason(row: PatientImportPreviewRow): string {
  if (row.classification === "DUPLICATE_IN_FILE") {
    return "พบเลขบัตรประชาชนซ้ำในไฟล์เดียวกัน";
  }

  return (
    getPatientImportBaselineReason(row) ??
    getPatientImportClassificationReason(row) ??
    row.reason ??
    fallbackPatientImportAttentionReason(row)
  );
}

export function getPatientImportBaselineReason(
  row: PatientImportPreviewRow,
): string | null {
  switch (row.baselineStatus) {
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
  return row.patientClassification.status === "CLASSIFICATION_DATA_INVALID"
    ? "สถานะผู้ป่วยจากไฟล์ไม่ใช่ค่าที่รองรับ"
    : null;
}

/* istanbul ignore next -- kept local to the preceding public helper for exhaustive fallback typing */
function fallbackPatientImportAttentionReason(
  row: PatientImportPreviewRow,
): string {
  const fallbackReasons: Record<PatientImportClassification, string> = {
    READY: "พร้อมนำเข้า",
    ALREADY_EXISTS: "มีผู้ป่วยรายนี้ในโรงพยาบาลแล้ว ระบบไม่เปลี่ยนแปลงข้อมูลเดิม",
    DUPLICATE_IN_FILE: "พบข้อมูลซ้ำในไฟล์เดียวกัน",
    INVALID: "ข้อมูลหลักของแถวนี้ไม่ครบถ้วนหรือไม่ถูกต้อง",
    CONFLICT: "ข้อมูลผู้ป่วยขัดแย้งกับข้อมูลเดิม",
  };

  return fallbackReasons[row.classification];
}
