"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Alert } from "@/components/ui/alert";
import { Button, buttonClassName } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LocalNavigation } from "@/components/ui/local-navigation";
import { ModalDialog } from "@/components/ui/modal-dialog";
import {
  connectionFailureMessage,
  submitPreservingInput,
  unknownOutcomeMessage,
  useMutationActionState,
} from "@/components/ui/mutation-action-state";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import { getPatientClassificationLabel } from "@/modules/patient-classification/presentation/patient-classification-labels";
import type {
  PatientImportClassification,
  PatientImportBaselineStatus,
  PatientImportPreview,
  PatientImportPreviewRow,
  PatientImportRowResult,
  PatientImportResultSummary,
} from "@/modules/patient-provisioning/services/patient-roster-import-types";
import { isPatientImportAttentionResult } from "@/modules/patient-provisioning/services/patient-roster-import-types";
import {
  countPatientImportExecutableRows,
  countPatientImportRowsRequiringAttention,
  getPatientImportBaselineReason,
  getPatientImportAttentionReason,
  getPatientImportClassificationReason,
  getPatientImportRecoveryGuidance,
  getPatientImportResultPresentation,
  partitionPatientImportPreviewRows,
  summarizePatientImportPreview,
  type PatientImportResultPresentation,
} from "@/modules/patient-provisioning/presentation/patient-import-presentation";
import type { PatientProvisioningScope } from "@/modules/patient-provisioning/services/patient-provisioning-service";
import {
  PATIENT_IMPORT_SAVED_FIELD_KEYS,
  PATIENT_IMPORT_UNSAVED_FIELD_KEYS,
  type PatientImportFieldKey,
} from "@/modules/patient-provisioning/import/patient-import-contract";
import {
  createPatientImportTemplateDownloadPath,
  createPatientImportTemplateFilename,
  PATIENT_IMPORT_TEMPLATE_MISMATCH_MESSAGE,
} from "@/modules/patient-provisioning/import/patient-import-template-contract";
import {
  confirmPatientImportAction,
  provisionPatientAction,
  previewPatientImportAction,
} from "@/modules/patient-provisioning/transport/server-actions";
import {
  initialPatientImportActionState,
  initialPatientImportPreviewActionState,
  initialPatientProvisionActionState,
  type PatientImportActionState,
  type PatientImportPreviewBinding,
  type PatientImportPreviewActionState,
  type PatientProvisionActionState,
  type PatientProvisionResultState,
} from "@/modules/patient-provisioning/transport/action-state";
import { downloadPatientImportFailedRows } from "@/modules/patient-provisioning/transport/patient-import-failed-rows-client";

type PatientProvisioningWorkspaceProps = {
  scopes: PatientProvisioningScope[];
  selectedHospitalId: string;
  selectedScope: PatientProvisioningScope;
  /** Active OWNER of the selected Hospital: the import result links to bulk OSM assignment. */
  canAssignOsm?: boolean;
};

type ProvisioningMode = "SINGLE" | "EXCEL";

/** Where focus returns when the import review dialog closes. */
type ImportDialogReturnFocus = "PREVIEW_SUBMIT" | "FILE_INPUT" | "EFFECTIVE_DATE";

const PATIENT_IMPORT_FILE_INPUT_ID = "patient-import-file";
const PATIENT_IMPORT_EFFECTIVE_DATE_INPUT_ID = "patient-import-effective-date";

const classificationLabels: Record<PatientImportClassification, string> = {
  READY: "ผู้ป่วยใหม่",
  ALREADY_EXISTS: "มีอยู่แล้ว",
  DUPLICATE_IN_FILE: "ซ้ำในไฟล์",
  INVALID: "ข้อมูลไม่ถูกต้อง",
  CONFLICT: "ข้อมูลขัดแย้ง",
};

const classificationVariants: Record<PatientImportClassification, StatusVariant> = {
  READY: "success",
  ALREADY_EXISTS: "neutral",
  DUPLICATE_IN_FILE: "warning",
  INVALID: "danger",
  CONFLICT: "danger",
};

const baselineStatusLabels: Record<PatientImportBaselineStatus, string> = {
  NOT_APPLICABLE: "",
  BASELINE_READY: "ข้อมูลตั้งต้นพร้อมบันทึก",
  BASELINE_CREATED: "บันทึกข้อมูลตั้งต้นแล้ว",
  BASELINE_DATE_REQUIRED: "ต้องระบุวันที่ข้อมูลตั้งต้น",
  BASELINE_DATA_INVALID: "ข้อมูลตั้งต้นไม่ถูกต้อง",
};

const importResultLabels: Record<PatientImportRowResult["result"], string> = {
  IMPORTED: "นำเข้าผู้ป่วยใหม่แล้ว",
  ALREADY_EXISTS: "มีอยู่แล้ว",
  DUPLICATE_IN_FILE: "ซ้ำในไฟล์",
  INVALID: "ข้อมูลไม่ถูกต้อง",
  CONFLICT: "ข้อมูลขัดแย้ง",
  FAILED: "บันทึกไม่สำเร็จ",
};

const importResultVariants: Record<PatientImportRowResult["result"], StatusVariant> = {
  IMPORTED: "success",
  ALREADY_EXISTS: "neutral",
  DUPLICATE_IN_FILE: "warning",
  INVALID: "danger",
  CONFLICT: "danger",
  FAILED: "danger",
};

const importFieldLabels: Record<PatientImportFieldKey, string> = {
  nationalId: "เลขบัตรประชาชน",
  dateOfBirth: "วันเกิด",
  givenName: "ชื่อ",
  familyName: "นามสกุล",
  hospitalNumber: "HN",
  gender: "เพศ",
  phoneNumber: "เบอร์โทรศัพท์",
  weight: "น้ำหนัก",
  height: "ส่วนสูง",
  waistCircumference: "รอบเอว",
  diabetesClassification: "ประเภทเบาหวาน/กลุ่มเสี่ยง",
  bloodSugarDtx: "ค่าน้ำตาลในเลือด (DTX)",
  hba1c: "HbA1c",
  houseNumber: "บ้านเลขที่",
  villageNumber: "หมู่ที่/ชุมชน",
  villageName: "หมู่บ้าน",
  soi: "ซอย",
  road: "ถนน",
  province: "จังหวัด",
  district: "อำเภอ",
  subdistrict: "ตำบล",
  postalCode: "รหัสไปรษณีย์",
  emergencyContactName: "ชื่อผู้ติดต่อฉุกเฉิน",
  emergencyContactPhone: "เบอร์ผู้ติดต่อฉุกเฉิน",
  emergencyContactRelationship: "ความสัมพันธ์กับผู้ติดต่อ",
  sourceSequenceNumber: "ลำดับจากไฟล์",
};

function fieldLabels(fields: readonly PatientImportFieldKey[]): string {
  return fields.map((field) => importFieldLabels[field]).join(", ");
}

function patientImportRowName(row: Pick<PatientImportPreviewRow, "givenName" | "familyName">): string {
  return [row.givenName, row.familyName].filter(Boolean).join(" ") || "ไม่ระบุชื่อ";
}

function formatFileSize(size: number): string {
  if (size < 1024) {
    return `${size} ไบต์`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function fieldError(
  state: PatientProvisionActionState,
  field: "nationalId" | "givenName" | "familyName" | "hospitalNumber",
): string | null {
  return state.status === "ERROR" ? state.fieldErrors?.[field] ?? null : null;
}

function createPatientImportFormData(
  file: File,
  targetHospitalId: string,
  effectiveDate: string,
): FormData {
  const formData = new FormData();
  formData.set("targetHospitalId", targetHospitalId);
  formData.set("file", file, file.name);
  formData.set("effectiveDate", effectiveDate);
  return formData;
}

function createPatientImportConfirmFormData(
  file: File,
  targetHospitalId: string,
  previewTargetHospitalId: string,
  fileFingerprint: string,
  previewBinding: string,
  effectiveDate: string | null,
  importContractVersion: string,
): FormData {
  const formData = createPatientImportFormData(file, targetHospitalId, effectiveDate ?? "");
  formData.set("previewTargetHospitalId", previewTargetHospitalId);
  formData.set("fileFingerprint", fileFingerprint);
  formData.set("previewBinding", previewBinding);
  formData.set("importContractVersion", importContractVersion);
  return formData;
}

function ProvisionContinuation({
  result,
}: {
  result: PatientProvisionResultState;
}): React.JSX.Element {
  const canManageActivation =
    result.accountStatus === "PROVISIONED" && result.canManagePatientActivation;

  if (!result.canOpenPatientDetail && !canManageActivation) {
    return (
      <p className="mt-3 text-sm leading-6 text-muted">
        ขณะนี้บัญชีนี้ยังไม่มีสิทธิ์ดำเนินการต่อในรายละเอียดหรือการเปิดใช้งานของผู้ป่วยรายนี้
      </p>
    );
  }

  return (
    <>
      {result.canOpenPatientDetail ? (
        <Link
          className="mt-3 inline-flex font-semibold text-brand-strong underline decoration-brand-soft underline-offset-4 hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
          href={`/app/patients/${encodeURIComponent(result.relationshipId)}`}
        >
          เปิดข้อมูลผู้ป่วย
        </Link>
      ) : null}
      {canManageActivation ? (
        <Link
          className="mt-3 inline-flex font-semibold text-brand-strong underline decoration-brand-soft underline-offset-4 hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
          href={`/app/patients/activation?hospitalId=${encodeURIComponent(result.hospitalId)}`}
        >
          จัดการการเปิดใช้งานบัญชีผู้ป่วย
        </Link>
      ) : null}
    </>
  );
}

function ProvisionResult({
  state,
}: {
  state: PatientProvisionActionState;
}): React.JSX.Element | null {
  if (state.status !== "SUCCESS") {
    return null;
  }

  if (state.result.outcome === "ALREADY_PROVISIONED") {
    return (
      <Alert className="mt-4" variant="neutral">
        <p className="font-semibold">ผู้ป่วยรายนี้มีข้อมูลในโรงพยาบาลแล้ว</p>
        <p className="mt-1 text-muted">ระบบไม่สร้างข้อมูลซ้ำ และไม่เปลี่ยนแปลงบัญชีเดิม</p>
        <ProvisionContinuation result={state.result} />
      </Alert>
    );
  }

  const accountMessage =
    state.result.accountStatus === "ACTIVE"
      ? "เชื่อมกับบัญชี DEMI ที่เปิดใช้งานอยู่แล้ว โดยคงสถานะและการยืนยันตัวตนเดิมไว้"
      : "สร้างข้อมูลผู้ป่วยแล้ว บัญชีอยู่ในสถานะรอเปิดใช้งานและยังเข้าสู่ระบบไม่ได้";

  return (
    <Alert className="mt-4" variant="success">
      <p className="font-semibold">เพิ่มข้อมูลผู้ป่วยเรียบร้อยแล้ว</p>
      <p className="mt-1 text-muted">{accountMessage}</p>
      <p className="mt-1 text-muted">ระบบไม่ได้สร้างหรือแสดงรหัสผ่านให้ผู้ดำเนินการ</p>
      <ProvisionContinuation result={state.result} />
    </Alert>
  );
}

/** One batch-level statement of what an import saves, instead of a warning on every row. */
function PatientImportSavedFieldsNote({ className }: { className?: string }): React.JSX.Element {
  return (
    <div className={className}>
      <p>
        <span className="font-semibold text-ink">ระบบบันทึกจากไฟล์:</span>{" "}
        {fieldLabels(PATIENT_IMPORT_SAVED_FIELD_KEYS)}
        {" "}(ประเภทเบาหวาน/กลุ่มเสี่ยงบันทึกเมื่อผู้ป่วยยังไม่มีสถานะ และข้อมูลตั้งต้นบันทึกเมื่อระบุวันที่ข้อมูลตั้งต้น)
      </p>
      <p className="mt-1">
        <span className="font-semibold text-ink">ใช้สำหรับอ้างอิงแถวในไฟล์:</span>{" "}
        {fieldLabels(PATIENT_IMPORT_UNSAVED_FIELD_KEYS)}
      </p>
    </div>
  );
}

export function PatientImportUploadGuidance(): React.JSX.Element {
  return (
    <>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 text-muted">
        <li>นำเข้าซ้ำได้: เพิ่มผู้ป่วยใหม่ต่อท้ายไฟล์เดิม ระบบจะเพิ่มเฉพาะผู้ป่วยใหม่</li>
        <li>การแก้ไขข้อมูลของผู้ป่วยที่มีอยู่แล้วในไฟล์จะไม่ถูกนำไปใช้ ให้แก้ไขในระบบ</li>
        <li>การกำหนด อสม. ทำหลังนำเข้า</li>
      </ul>
      <PatientImportSavedFieldsNote className="mt-3 text-sm leading-6 text-muted" />
    </>
  );
}

function PreviewRowDetails({ row }: { row: PatientImportPreviewRow }): React.JSX.Element {
  const classification = row.patientClassification;
  const primaryReason =
    row.classification === "READY" ? null : getPatientImportAttentionReason(row);
  const baselineReason = getPatientImportBaselineReason(row);
  const classificationReason = getPatientImportClassificationReason(row);

  return (
    <div className="space-y-3">
      {row.sourceSequenceNumber ? <p className="text-muted">ลำดับในไฟล์: {row.sourceSequenceNumber}</p> : null}
      {primaryReason ? <p className="text-muted">{primaryReason}</p> : null}

      {row.classification === "READY" && row.baselineStatus !== "NOT_APPLICABLE" ? (
        <div className="border-l-2 border-border-strong pl-3">
          <p className="font-semibold text-ink">ข้อมูลตั้งต้น</p>
          <p className="mt-1 text-muted">{baselineStatusLabels[row.baselineStatus]}</p>
          {baselineReason ? <p className="mt-1 text-danger">{baselineReason}</p> : null}
        </div>
      ) : null}

      {row.classification === "READY" && classification.status !== "NOT_APPLICABLE" ? (
        <div className="border-l-2 border-border-strong pl-3">
          <p className="font-semibold text-ink">สถานะผู้ป่วย</p>
          {classification.sourceClassification ? (
            <p className="mt-1 text-muted">
              จากไฟล์: {getPatientClassificationLabel(classification.sourceClassification)}
            </p>
          ) : null}
          {classification.status === "CLASSIFICATION_ALREADY_EXISTS" ? (
            <p className="mt-1 text-muted">ผู้ป่วยมีสถานะอยู่แล้ว ระบบจะไม่เปลี่ยนสถานะเดิม</p>
          ) : null}
          {classificationReason ? <p className="mt-1 text-danger">{classificationReason}</p> : null}
        </div>
      ) : null}

      {!primaryReason &&
      row.baselineStatus === "NOT_APPLICABLE" &&
      classification.status === "NOT_APPLICABLE" ? (
        <span className="text-muted">-</span>
      ) : null}
    </div>
  );
}

function PreviewRowsTable({
  rows,
  caption,
  showDetails,
}: {
  rows: readonly PatientImportPreviewRow[];
  caption: string;
  showDetails: boolean;
}): React.JSX.Element {
  return (
    <div className="overflow-x-auto rounded-panel border border-border">
      <table className="min-w-[760px] divide-y divide-line bg-surface text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-canvas text-xs font-semibold text-muted">
          <tr>
            <th className="whitespace-nowrap px-3 py-3" scope="col">แถวใน Excel</th>
            <th className="whitespace-nowrap px-3 py-3" scope="col">เลขบัตรประชาชน</th>
            <th className="whitespace-nowrap px-3 py-3" scope="col">ชื่อ-นามสกุล</th>
            <th className="whitespace-nowrap px-3 py-3" scope="col">HN</th>
            <th className="whitespace-nowrap px-3 py-3" scope="col">สถานะ</th>
            {showDetails ? (
              <th className="min-w-[22rem] px-3 py-3" scope="col">รายละเอียด</th>
            ) : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={row.rowNumber}>
              <td className="whitespace-nowrap px-3 py-3 text-muted">{row.rowNumber}</td>
              <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-muted">
                {row.identityDisplay}
              </td>
              <td className="max-w-56 break-words px-3 py-3 font-semibold text-ink">
                {patientImportRowName(row)}
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-muted">{row.hospitalNumber ?? "-"}</td>
              <td className="whitespace-nowrap px-3 py-3 align-top">
                <StatusBadge variant={classificationVariants[row.classification]}>
                  {classificationLabels[row.classification]}
                </StatusBadge>
              </td>
              {showDetails ? (
                <td className="px-3 py-3 align-top">
                  <PreviewRowDetails row={row} />
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PreviewTable({ preview }: { preview: PatientImportPreviewBinding }): React.JSX.Element {
  const { rows } = preview;

  if (rows.length === 0) {
    return (
      <p className="rounded-panel border border-dashed border-border bg-surface-muted px-4 py-8 text-center text-sm leading-6 text-text-muted">
        ไม่พบแถวข้อมูลที่พร้อมตรวจสอบในไฟล์นี้
      </p>
    );
  }

  const { primaryRows, alreadyExistsRows } = partitionPatientImportPreviewRows(rows);

  return (
    <div className="space-y-4">
      {primaryRows.length > 0 ? (
        <PreviewRowsTable
          caption="ผลการตรวจสอบรายชื่อผู้ป่วยใหม่และรายการที่ต้องแก้ไข"
          rows={primaryRows}
          showDetails
        />
      ) : null}

      {alreadyExistsRows.length > 0 ? (
        <details className="rounded-panel border border-border bg-surface">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring">
            ผู้ป่วยที่มีอยู่แล้ว {alreadyExistsRows.length} รายการ (ไม่ถูกเปลี่ยนแปลง)
          </summary>
          <div className="border-t border-border p-3">
            <PreviewRowsTable
              caption="ผู้ป่วยที่มีอยู่แล้วในโรงพยาบาล"
              rows={alreadyExistsRows}
              showDetails={false}
            />
          </div>
        </details>
      ) : null}
    </div>
  );
}

export function PreviewFileSummary({
  preview,
  executableRowCount,
  attentionRowCount,
}: {
  preview: PatientImportPreview;
  executableRowCount: number;
  attentionRowCount: number;
}): React.JSX.Element {
  const summary = summarizePatientImportPreview(preview.rows);
  const file = preview.file;
  const allRowsAlreadyExist =
    summary.total > 0 && summary.alreadyExists === summary.total;

  return (
    <section
      aria-live="polite"
      className="rounded-panel border border-border bg-surface-muted p-4 text-sm leading-6"
    >
      <h3 className="font-semibold text-ink">สรุปผลการตรวจไฟล์</h3>
      <dl className="mt-3 flex flex-wrap divide-y divide-line border-y border-line sm:divide-x sm:divide-y-0">
        <div className="min-w-28 flex-1 px-3 py-3 first:pl-0">
          <dt className="text-muted">ใหม่</dt>
          <dd className="text-lg font-semibold text-success">{executableRowCount}</dd>
        </div>
        <div className="min-w-28 flex-1 px-3 py-3">
          <dt className="text-muted">มีอยู่แล้ว</dt>
          <dd className="text-lg font-semibold text-ink">{summary.alreadyExists}</dd>
        </div>
        <div className="min-w-28 flex-1 px-3 py-3">
          <dt className="text-muted">ต้องแก้ไข</dt>
          <dd className="text-lg font-semibold text-warning">{attentionRowCount}</dd>
        </div>
      </dl>

      <div className="mt-4 space-y-2">
        {preview.baselineDateRequired ? (
          <p className="font-semibold text-danger">
            ต้องระบุวันที่ข้อมูลตั้งต้นก่อนยืนยันนำเข้า
          </p>
        ) : null}
        {allRowsAlreadyExist ? (
          <p className="font-semibold text-ink">
            ผู้ป่วยทั้งหมดมีอยู่แล้ว ไม่มีผู้ป่วยใหม่ที่ต้องบันทึก
          </p>
        ) : executableRowCount > 0 ? (
          <>
            <p className="font-semibold text-success">
              พร้อมนำเข้าผู้ป่วยใหม่ {executableRowCount} จาก {summary.total} รายการ
            </p>
            {attentionRowCount > 0 ? (
              <p className="text-muted">
                ระบบจะนำเข้าเฉพาะผู้ป่วยใหม่ที่พร้อม ส่วนรายการที่ต้องแก้ไขจะไม่ถูกบันทึก
              </p>
            ) : null}
          </>
        ) : summary.total > 0 ? (
          <p className="font-semibold text-warning">
            ยังไม่มีรายการที่พร้อมนำเข้า กรุณาตรวจสอบรายการด้านล่าง
          </p>
        ) : (
          <p className="text-muted">ไม่พบรายการผู้ป่วยในไฟล์นี้</p>
        )}
      </div>

      <p className="mt-4 border-t border-border pt-4 text-muted">
        วันที่ข้อมูลตั้งต้นของผู้ป่วยใหม่: {preview.effectiveDate ?? "ยังไม่ได้ระบุ"}
      </p>
      {file?.requirementGatedFields.length ? (
        <PatientImportSavedFieldsNote className="mt-2 text-muted" />
      ) : null}
    </section>
  );
}

function FailedRowsDownloadButton({
  file,
  preview,
  failedRowNumbers,
  importPending = false,
}: {
  file: File | null;
  preview: PatientImportPreviewBinding;
  failedRowNumbers: readonly number[];
  importPending?: boolean;
}): React.JSX.Element {
  const [pending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleDownload(): void {
    if (!file) {
      return;
    }

    setErrorMessage(null);
    startTransition(async () => {
      const result = await downloadPatientImportFailedRows({ file, preview, failedRowNumbers });
      setErrorMessage(result.status === "ERROR" ? result.message : null);
    });
  }

  return (
    <div className="space-y-2">
      <Button
        disabled={pending || importPending || !file}
        loading={pending}
        onClick={handleDownload}
        size="compact"
        type="button"
        variant="secondary"
      >
        {pending ? "กำลังสร้างไฟล์..." : "ดาวน์โหลดแถวที่ไม่ผ่าน"}
      </Button>
      {errorMessage ? (
        <p aria-live="polite" className="text-sm text-danger">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}

/** Outcome of a confirmed import; rendered in the review dialog body. */
export function ImportSummary({
  summary,
  canAssignOsm,
}: {
  summary: PatientImportResultSummary;
  canAssignOsm: boolean;
}): React.JSX.Element {
  const attentionRows = summary.rows.filter((row) => isPatientImportAttentionResult(row.result));
  const {
    detail,
    hasAttentionRows,
    heading,
    reviewCount,
    variant,
  } = getPatientImportResultPresentation(summary);
  const recoveryGuidance = getPatientImportRecoveryGuidance(summary);

  return (
    <div className="space-y-5 text-sm leading-6">
      <Alert variant={variant}>
        <p className="font-semibold">{heading}</p>
        {detail ? <p className="mt-1 text-muted">{detail}</p> : null}
      </Alert>

      <dl className="flex flex-wrap divide-y divide-line border-y border-line sm:divide-x sm:divide-y-0">
        <div className="min-w-28 flex-1 px-3 py-3 first:pl-0">
          <dt className="text-muted">นำเข้าผู้ป่วยใหม่</dt>
          <dd className="text-lg font-semibold text-success">{summary.imported}</dd>
        </div>
        <div className="min-w-28 flex-1 px-3 py-3">
          <dt className="text-muted">มีอยู่แล้ว</dt>
          <dd className="text-lg font-semibold text-ink">{summary.alreadyExists}</dd>
        </div>
        <div className="min-w-28 flex-1 px-3 py-3">
          <dt className="text-muted">ต้องแก้ไข</dt>
          <dd className="text-lg font-semibold text-warning">{reviewCount + summary.invalid}</dd>
        </div>
        <div className="min-w-28 flex-1 px-3 py-3">
          <dt className="text-muted">บันทึกไม่สำเร็จ</dt>
          <dd className="text-lg font-semibold text-danger">{summary.failed}</dd>
        </div>
      </dl>

      {hasAttentionRows ? (
        <div>
          <h3 className="font-semibold">แถวที่ไม่ผ่าน</h3>
          <div className="mt-3 overflow-x-auto rounded-panel border border-border bg-surface">
            <table className="min-w-[820px] divide-y divide-line text-left text-sm">
              <caption className="sr-only">รายการที่ไม่ผ่านหลังนำเข้า</caption>
              <thead className="bg-canvas text-xs font-semibold text-muted">
                <tr>
                  <th className="whitespace-nowrap px-3 py-3" scope="col">แถวใน Excel</th>
                  <th className="whitespace-nowrap px-3 py-3" scope="col">เลขบัตรประชาชน</th>
                  <th className="whitespace-nowrap px-3 py-3" scope="col">ชื่อ-นามสกุล</th>
                  <th className="whitespace-nowrap px-3 py-3" scope="col">HN</th>
                  <th className="whitespace-nowrap px-3 py-3" scope="col">ผลลัพธ์</th>
                  <th className="min-w-64 px-3 py-3" scope="col">รายละเอียด</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {attentionRows.map((row) => {
                  const reason =
                    row.result === "FAILED"
                      ? "ระบบไม่สามารถบันทึกรายการนี้ได้ กรุณาลองใหม่"
                      : getPatientImportAttentionReason(row);

                  return (
                    <tr key={row.rowNumber}>
                      <td className="whitespace-nowrap px-3 py-3 text-muted">{row.rowNumber}</td>
                      <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-muted">
                        {row.identityDisplay}
                      </td>
                      <td className="max-w-56 break-words px-3 py-3 font-semibold text-ink">
                        {patientImportRowName(row)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-muted">
                        {row.hospitalNumber ?? "-"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 align-top">
                        <StatusBadge variant={importResultVariants[row.result]}>
                          {importResultLabels[row.result]}
                        </StatusBadge>
                      </td>
                      <td className="min-w-64 px-3 py-3 align-top text-muted">{reason}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {summary.imported > 0 || summary.file?.requirementGatedFields.length ? (
        <PatientImportSavedFieldsNote className="border-t border-border pt-4 text-muted" />
      ) : null}

      {recoveryGuidance.length > 0 ? (
        <div className="border-t border-border pt-4 text-muted">
          <p className="font-semibold text-ink">ขั้นตอนถัดไป</p>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            {recoveryGuidance.map((guidance) => (
              <li key={guidance.kind}>
                <p>{guidance.message}</p>
                {guidance.detail ? <p className="mt-1">{guidance.detail}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {summary.imported > 0 ? (
        <p className="border-t border-border pt-4 text-muted">
          ผู้ป่วยที่นำเข้าใหม่ยังไม่มี อสม. ผู้รับผิดชอบ{" "}
          {canAssignOsm
            ? "กำหนด อสม. ให้ผู้ป่วยหลายคนได้ในขั้นตอนถัดไป"
            : "เจ้าของโรงพยาบาลเป็นผู้กำหนด อสม. หลังนำเข้า"}
        </p>
      ) : null}
    </div>
  );
}

/** Next steps after a confirmed import; rendered in the review dialog footer. */
export function ImportResultActions({
  summary,
  preview,
  file,
  canAssignOsm,
  onNewImport,
  onClose,
}: {
  summary: PatientImportResultSummary;
  preview: PatientImportPreviewBinding;
  file: File | null;
  canAssignOsm: boolean;
  onNewImport: () => void;
  onClose: () => void;
}): React.JSX.Element {
  const { hasAttentionRows, hasSuccessfulRows } = getPatientImportResultPresentation(summary);
  const failedRowNumbers = summary.rows
    .filter((row) => row.result === "FAILED")
    .map((row) => row.rowNumber);
  const canAssign = summary.imported > 0 && canAssignOsm;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
      <div className="flex flex-wrap items-center gap-3">
        {hasAttentionRows ? (
          <FailedRowsDownloadButton
            failedRowNumbers={failedRowNumbers}
            file={file}
            preview={preview}
          />
        ) : null}
        <Link
          className="inline-flex min-h-11 items-center font-semibold text-brand-strong underline decoration-brand-soft underline-offset-4 hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
          href={"/app/patients?hospitalId=" + encodeURIComponent(summary.targetHospitalId)}
        >
          เปิดรายชื่อผู้ป่วยในโรงพยาบาลนี้
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:justify-end">
        <Button onClick={onClose} size="compact" type="button" variant="ghost">
          ปิด
        </Button>
        <Button
          onClick={onNewImport}
          size="compact"
          type="button"
          variant={hasSuccessfulRows || canAssign ? "secondary" : "primary"}
        >
          นำเข้าไฟล์ใหม่
        </Button>
        {canAssign ? (
          <Link
            className={buttonClassName({ size: "compact", variant: "primary" })}
            href={`/app/patients/assign-osm?hospitalId=${encodeURIComponent(summary.targetHospitalId)}`}
          >
            กำหนด อสม.
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/** Which file and hospital the dialog is about, so the reviewer never confirms the wrong batch. */
function PatientImportDialogContext({
  fileName,
  hospitalName,
}: {
  fileName: string | null;
  hospitalName: string;
}): React.JSX.Element {
  return (
    <p className="break-words">
      <span className="font-semibold text-ink">{hospitalName}</span>
      {fileName ? <> · ไฟล์ {fileName}</> : null}
    </p>
  );
}

/** Review step footer: the commit action stays visible however long the row list is. */
function PatientImportReviewActions({
  preview,
  file,
  executableRowCount,
  attentionRowCount,
  baselineDateRequired,
  importPending,
  importUnknown,
  onCancel,
  onConfirm,
  onEditEffectiveDate,
  onEditFile,
}: {
  preview: PatientImportPreviewBinding;
  file: File | null;
  executableRowCount: number;
  attentionRowCount: number;
  baselineDateRequired: boolean;
  importPending: boolean;
  importUnknown: boolean;
  onCancel: () => void;
  onConfirm: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onEditEffectiveDate: () => void;
  onEditFile: () => void;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-2 text-sm leading-6">
        {baselineDateRequired ? (
          <p className="font-semibold text-danger">ต้องระบุวันที่ข้อมูลตั้งต้นก่อนยืนยันนำเข้า</p>
        ) : executableRowCount > 0 ? (
          <p className="font-semibold text-ink">
            จะนำเข้าผู้ป่วยใหม่ {executableRowCount} จาก {preview.rows.length} รายการ
            {attentionRowCount > 0 ? (
              <span className="block font-normal text-muted">
                รายการที่ต้องแก้ไข {attentionRowCount} รายการจะไม่ถูกบันทึก
              </span>
            ) : null}
          </p>
        ) : (
          <p className="font-semibold text-warning">ไม่มีรายการที่นำเข้าได้จากไฟล์นี้</p>
        )}
        {attentionRowCount > 0 ? (
          <FailedRowsDownloadButton
            failedRowNumbers={[]}
            file={file}
            importPending={importPending}
            preview={preview}
          />
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:justify-end">
        <Button disabled={importPending} onClick={onCancel} size="compact" type="button" variant="ghost">
          ยกเลิก
        </Button>
        {baselineDateRequired ? (
          <Button onClick={onEditEffectiveDate} size="compact" type="button">
            ระบุวันที่ข้อมูลตั้งต้น
          </Button>
        ) : executableRowCount > 0 ? (
          <Button
            disabled={importPending || importUnknown}
            loading={importPending}
            onClick={onConfirm}
            size="compact"
            type="button"
          >
            {importPending ? "กำลังนำเข้าข้อมูล..." : `ยืนยันนำเข้า ${executableRowCount} รายการ`}
          </Button>
        ) : (
          <Button onClick={onEditFile} size="compact" type="button">
            เลือกไฟล์ใหม่
          </Button>
        )}
      </div>
    </div>
  );
}

/** Shown on the page after the review dialog is dismissed, so a checked file or a result is one click away. */
export function PatientImportReviewReminder({
  executableRowCount,
  attentionRowCount,
  baselineDateRequired,
  result,
  onOpen,
  onNewImport,
}: {
  executableRowCount: number;
  attentionRowCount: number;
  baselineDateRequired: boolean;
  result: { heading: string; variant: PatientImportResultPresentation["variant"] } | null;
  onOpen: () => void;
  onNewImport: () => void;
}): React.JSX.Element {
  const message = result
    ? result.heading
    : baselineDateRequired
      ? "ตรวจสอบไฟล์แล้ว ต้องระบุวันที่ข้อมูลตั้งต้นก่อนยืนยันนำเข้า"
      : `ตรวจสอบไฟล์แล้ว: ผู้ป่วยใหม่ ${executableRowCount} รายการ · ต้องแก้ไข ${attentionRowCount} รายการ`;

  return (
    <Alert className="mt-2" variant={result ? result.variant : "neutral"}>
      <p className="font-semibold">{message}</p>
      {!result ? (
        <p className="mt-1 text-muted">
          ยังไม่ได้นำเข้า กรุณายืนยันในหน้าตรวจสอบ หากเปลี่ยนไฟล์ โรงพยาบาล หรือวันที่ข้อมูลตั้งต้น ต้องตรวจสอบใหม่
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-3">
        <Button onClick={onOpen} size="compact" type="button" variant="secondary">
          {result ? "ดูผลการนำเข้า" : "เปิดหน้าตรวจสอบ"}
        </Button>
        {result ? (
          <Button onClick={onNewImport} size="compact" type="button" variant="ghost">
            นำเข้าไฟล์ใหม่
          </Button>
        ) : null}
      </div>
    </Alert>
  );
}

export function PatientProvisioningWorkspace({
  scopes,
  selectedHospitalId,
  selectedScope,
  canAssignOsm = false,
}: PatientProvisioningWorkspaceProps): React.JSX.Element {
  const router = useRouter();
  const [provisionState, provisionAction, provisionPending, provisionUnknown] = useMutationActionState<
    PatientProvisionActionState,
    FormData
  >(provisionPatientAction, initialPatientProvisionActionState);
  const provisionFormRef = useRef<HTMLFormElement>(null);
  const [importUnknown, setImportUnknown] = useState(false);
  const [previewState, setPreviewState] = useState<PatientImportPreviewActionState>(
    initialPatientImportPreviewActionState,
  );
  const [importState, setImportState] = useState<PatientImportActionState>(
    initialPatientImportActionState,
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [effectiveDate, setEffectiveDate] = useState("");
  const [fileInputKey, setFileInputKey] = useState(0);
  const [previewPending, startPreviewTransition] = useTransition();
  const [importPending, startImportTransition] = useTransition();
  const [hospitalSwitching, startHospitalSwitch] = useTransition();
  const [mode, setMode] = useState<ProvisioningMode>("SINGLE");
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const importContextVersion = useRef(0);
  const previousHospitalId = useRef(selectedHospitalId);
  const previewSubmitRef = useRef<HTMLButtonElement>(null);
  const dialogReturnFocus = useRef<ImportDialogReturnFocus>("PREVIEW_SUBMIT");

  useEffect(() => {
    if (provisionState.status === "SUCCESS") {
      provisionFormRef.current?.reset();
    }
  }, [provisionState]);

  useEffect(() => {
    if (previousHospitalId.current === selectedHospitalId) {
      return;
    }

    previousHospitalId.current = selectedHospitalId;
    importContextVersion.current += 1;
    setSelectedFile(null);
    setPreviewFile(null);
    setEffectiveDate("");
    setPreviewState(initialPatientImportPreviewActionState);
    setImportState(initialPatientImportActionState);
    setReviewDialogOpen(false);
    setFileInputKey((current) => current + 1);
  }, [selectedHospitalId]);

  const importableRowCount = previewState.status === "SUCCESS"
    ? countPatientImportExecutableRows(previewState.preview)
    : 0;
  const attentionRowCount = previewState.status === "SUCCESS"
    ? countPatientImportRowsRequiringAttention(previewState.preview)
    : 0;
  const hasImportableRows = importableRowCount > 0;

  const previewIsCurrent =
    selectedFile !== null &&
    previewFile === selectedFile &&
    previewState.status === "SUCCESS" &&
    previewState.preview.targetHospitalId === selectedHospitalId &&
    previewState.preview.effectiveDate === (effectiveDate.trim() || null);
  const activeMode: ProvisioningMode = selectedScope.canBulkImport ? mode : "SINGLE";
  const reviewPreview =
    previewIsCurrent && previewState.status === "SUCCESS" ? previewState.preview : null;
  const importSummary = importState.status === "SUCCESS" ? importState.summary : null;
  const importResultPresentation = importSummary
    ? getPatientImportResultPresentation(importSummary)
    : null;
  const showReviewDialog = reviewDialogOpen && reviewPreview !== null;

  function invalidateImportPreview(): void {
    importContextVersion.current += 1;
    setPreviewFile(null);
    setPreviewState(initialPatientImportPreviewActionState);
    setImportState(initialPatientImportActionState);
    setImportUnknown(false);
    setReviewDialogOpen(false);
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>): void {
    invalidateImportPreview();
    setSelectedFile(event.currentTarget.files?.[0] ?? null);
  }

  function clearSelectedFile(): void {
    if (previewPending || importPending) {
      return;
    }

    invalidateImportPreview();
    setSelectedFile(null);
    setFileInputKey((current) => current + 1);
  }

  function handleNewImport(): void {
    if (importPending) {
      return;
    }

    dialogReturnFocus.current = "FILE_INPUT";
    invalidateImportPreview();
    setSelectedFile(null);
    setEffectiveDate("");
    setFileInputKey((current) => current + 1);
  }

  function handlePreview(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    invalidateImportPreview();

    const file = selectedFile;

    if (!file) {
      setPreviewState({
        status: "ERROR",
        code: "INVALID_INPUT",
        message: "กรุณาเลือกไฟล์ Excel ก่อนตรวจสอบ",
      });
      return;
    }

    const requestVersion = importContextVersion.current;
    const targetHospitalId = selectedHospitalId;

    startPreviewTransition(async () => {
      let result: PatientImportPreviewActionState;
      try {
        result = await previewPatientImportAction(
          createPatientImportFormData(file, targetHospitalId, effectiveDate),
        );
      } catch {
        result = { status: "ERROR", code: "UNAVAILABLE", message: connectionFailureMessage };
      }

      if (requestVersion !== importContextVersion.current) {
        return;
      }

      setPreviewState(result);
      setPreviewFile(result.status === "SUCCESS" ? file : null);
      setReviewDialogOpen(result.status === "SUCCESS");
    });
  }

  function handleImport(event: React.MouseEvent<HTMLButtonElement>): void {
    event.preventDefault();

    if (
      !previewIsCurrent ||
      previewState.status !== "SUCCESS" ||
      !selectedFile ||
      !hasImportableRows ||
      importState.status === "SUCCESS" ||
      importUnknown
    ) {
      return;
    }

    const requestVersion = importContextVersion.current;
    const file = selectedFile;
    const preview = previewState.preview;

    startImportTransition(async () => {
      let result: PatientImportActionState;
      try {
        result = await confirmPatientImportAction(
          createPatientImportConfirmFormData(
            file,
            selectedHospitalId,
            preview.targetHospitalId,
            preview.fileFingerprint,
            preview.previewBinding,
            preview.effectiveDate,
            preview.importContractVersion,
          ),
        );
      } catch {
        if (requestVersion === importContextVersion.current) {
          setImportUnknown(true);
        }
        return;
      }

      if (requestVersion !== importContextVersion.current) {
        return;
      }

      setImportState(result);
    });
  }

  function openReviewDialog(): void {
    if (!reviewPreview || previewPending) {
      return;
    }

    dialogReturnFocus.current = "PREVIEW_SUBMIT";
    setReviewDialogOpen(true);
  }

  function closeReviewDialog(returnFocus: ImportDialogReturnFocus = "PREVIEW_SUBMIT"): void {
    if (importPending) {
      return;
    }

    dialogReturnFocus.current = returnFocus;
    setReviewDialogOpen(false);
  }

  function restoreFocusAfterReviewDialog(): void {
    const target = dialogReturnFocus.current;
    dialogReturnFocus.current = "PREVIEW_SUBMIT";

    const element =
      target === "PREVIEW_SUBMIT"
        ? previewSubmitRef.current
        : document.getElementById(
            target === "FILE_INPUT"
              ? PATIENT_IMPORT_FILE_INPUT_ID
              : PATIENT_IMPORT_EFFECTIVE_DATE_INPUT_ID,
          );

    element?.focus({ preventScroll: false });
  }

  function changeHospital(hospitalId: string): void {
    if (previewPending || importPending || hospitalSwitching) {
      return;
    }

    importContextVersion.current += 1;
    setSelectedFile(null);
    setPreviewFile(null);
    setEffectiveDate("");
    setPreviewState(initialPatientImportPreviewActionState);
    setImportState(initialPatientImportActionState);
    setImportUnknown(false);
    setReviewDialogOpen(false);
    setFileInputKey((current) => current + 1);
    startHospitalSwitch(() => {
      router.push(`/app/patients/provision?hospitalId=${encodeURIComponent(hospitalId)}`);
    });
  }

  return (
    <div>
      <PageHeader
        actions={<StatusBadge variant="info">เพิ่มผู้ป่วย</StatusBadge>}
        breadcrumbs={[{ label: "งานโรงพยาบาล", href: `/app#hospital-workspace-${encodeURIComponent(selectedHospitalId)}` }, { label: "เพิ่ม / นำเข้าผู้ป่วย" }]}
        description="เพิ่มข้อมูลผู้ป่วยเข้าสู่ DEMI โดยไม่สร้างบัญชีซ้ำ และไม่รับรหัสผ่านจากผู้ดำเนินการ"
        title="เพิ่ม / นำเข้าผู้ป่วย"
      />

      <div className="pt-8">
        <Panel>
          {scopes.length > 1 ? (
            <>
              <label className="block text-sm font-semibold text-ink" htmlFor="targetHospitalId">
                โรงพยาบาลที่ดำเนินการ
              </label>
              <Select
                className="mt-2 max-w-xl"
                disabled={previewPending || importPending || hospitalSwitching}
                id="targetHospitalId"
                onChange={(event) => changeHospital(event.target.value)}
                value={selectedHospitalId}
              >
                {scopes.map((scope) => (
                  <option key={scope.hospitalId} value={scope.hospitalId}>
                    {scope.hospitalName} · {scope.hospitalCode}
                  </option>
                ))}
              </Select>
              {hospitalSwitching ? <p className="mt-2 text-sm text-text-muted" role="status">กำลังเปลี่ยนโรงพยาบาล...</p> : null}
            </>
          ) : (
            <div>
              <p className="text-sm font-semibold text-ink">โรงพยาบาลที่ดำเนินการ</p>
              <p className="mt-2 text-base font-semibold text-brand-strong">
                {selectedScope.hospitalName} · {selectedScope.hospitalCode}
              </p>
            </div>
          )}
          <p className="mt-2 text-sm leading-6 text-muted">
              เพิ่มผู้ป่วยได้เฉพาะโรงพยาบาลที่เลือก
          </p>
        </Panel>

        {selectedScope.canBulkImport ? (
          <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2 text-sm leading-6">
              <p className="font-semibold text-ink">
                กรุณาใช้ Template ของระบบสำหรับนำเข้ารายชื่อผู้ป่วย
              </p>
              <a
                className={buttonClassName({ size: "compact", variant: "secondary" })}
                download={createPatientImportTemplateFilename(selectedScope.hospitalCode)}
                href={createPatientImportTemplateDownloadPath(selectedHospitalId)}
              >
                ดาวน์โหลด Template ของ {selectedScope.hospitalName}
              </a>
              <p className="text-xs text-muted">รองรับสูงสุด 500 รายการต่อไฟล์</p>
              <p className="text-xs text-muted">
                Template ใช้ได้กับโรงพยาบาลนี้เท่านั้น หากแก้ไขหัวตารางหรือเพิ่มคอลัมน์ ระบบจะไม่รับไฟล์
              </p>
            </div>
            <LocalNavigation
              ariaLabel="รูปแบบการเพิ่มผู้ป่วย"
              items={[
                { label: "เพิ่มรายบุคคล", value: "SINGLE" },
                { label: "นำเข้าจาก Excel", value: "EXCEL" },
              ]}
              onChange={setMode}
              value={activeMode}
            />
          </div>
        ) : null}

        <div className="mt-6">
          {activeMode === "SINGLE" ? (
          <Panel className="max-w-4xl">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.02em]">เพิ่มผู้ป่วยรายบุคคล</h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                ใช้ข้อมูลขั้นต่ำเพื่อสร้างข้อมูลผู้ป่วยและความสัมพันธ์กับโรงพยาบาลนี้
              </p>
            </div>
            <form
              action={provisionAction}
              className="mt-6 space-y-4"
              onSubmit={submitPreservingInput(provisionAction)}
              ref={provisionFormRef}
            >
              <input name="targetHospitalId" type="hidden" value={selectedHospitalId} />
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-sm font-semibold">
                  <span>ชื่อ</span>
                  <Input aria-invalid={Boolean(fieldError(provisionState, "givenName"))} name="givenName" required type="text" />
                  {fieldError(provisionState, "givenName") ? <span className="block text-xs font-normal text-danger">{fieldError(provisionState, "givenName")}</span> : null}
                </label>
                <label className="space-y-2 text-sm font-semibold">
                  <span>นามสกุล</span>
                  <Input aria-invalid={Boolean(fieldError(provisionState, "familyName"))} name="familyName" required type="text" />
                  {fieldError(provisionState, "familyName") ? <span className="block text-xs font-normal text-danger">{fieldError(provisionState, "familyName")}</span> : null}
                </label>
              </div>
              <label className="block space-y-2 text-sm font-semibold">
                <span>เลขบัตรประชาชน</span>
                <Input aria-invalid={Boolean(fieldError(provisionState, "nationalId"))} inputMode="numeric" maxLength={13} name="nationalId" pattern="[0-9]{13}" required type="text" />
                {fieldError(provisionState, "nationalId") ? <span className="block text-xs font-normal text-danger">{fieldError(provisionState, "nationalId")}</span> : null}
              </label>
              <label className="block space-y-2 text-sm font-semibold">
                <span>HN <span className="font-normal text-muted">(ไม่บังคับ)</span></span>
                <Input aria-invalid={Boolean(fieldError(provisionState, "hospitalNumber"))} maxLength={64} name="hospitalNumber" type="text" />
                {fieldError(provisionState, "hospitalNumber") ? <span className="block text-xs font-normal text-danger">{fieldError(provisionState, "hospitalNumber")}</span> : null}
              </label>
              {provisionState.status === "ERROR" ? <Alert className="mt-2" variant="danger">{provisionState.message}</Alert> : null}
              <UnknownOutcomeAlert className="mt-2" active={provisionUnknown} />
              <Button className="w-full" disabled={provisionPending || provisionUnknown} loading={provisionPending} type="submit">
                {provisionPending ? "กำลังบันทึก..." : "เพิ่มผู้ป่วย"}
              </Button>
            </form>
            <ProvisionResult state={provisionState} />
          </Panel>
          ) : null}

          {selectedScope.canBulkImport && activeMode === "EXCEL" ? (
            <Panel>
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.02em]">นำเข้าผู้ป่วยจาก Excel</h2>
                <p className="mt-2 text-sm leading-6 text-muted">
                  ตรวจสอบผลลัพธ์ก่อนยืนยัน ระบบจะประมวลผลแต่ละแถวแยกกัน
                </p>
                <PatientImportUploadGuidance />
              </div>

              <form className="mt-6 space-y-4" encType="multipart/form-data" onSubmit={handlePreview}>
                <input name="targetHospitalId" type="hidden" value={selectedHospitalId} />

                <label className="block space-y-2 text-sm font-semibold" htmlFor={PATIENT_IMPORT_FILE_INPUT_ID}>
                  <span>ไฟล์ Excel (.xlsx)</span>
                  <input
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="block min-h-12 w-full rounded-control border border-border bg-surface px-3 py-3 text-sm font-normal file:mr-3 file:rounded-control file:border-0 file:bg-brand-soft file:px-3 file:py-2 file:font-semibold file:text-brand-strong focus:outline-none focus:ring-4 focus:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={previewPending || importPending}
                    id={PATIENT_IMPORT_FILE_INPUT_ID}
                    key={fileInputKey}
                    name="file"
                    onChange={handleFileChange}
                    required
                    type="file"
                  />
                </label>

                {selectedFile ? (
                  <div className="flex flex-wrap items-center gap-2 text-xs leading-5 text-muted">
                    <p>
                      ไฟล์ที่เลือก: <span className="font-semibold text-ink">{selectedFile.name}</span>{" "}
                      · {formatFileSize(selectedFile.size)}
                    </p>
                    <Button
                      disabled={previewPending || importPending}
                      onClick={clearSelectedFile}
                      size="compact"
                      type="button"
                      variant="ghost"
                    >
                      ล้างไฟล์
                    </Button>
                  </div>
                ) : null}

                <label
                  className="block space-y-2 text-sm font-semibold"
                  htmlFor={PATIENT_IMPORT_EFFECTIVE_DATE_INPUT_ID}
                >
                  <span>ข้อมูลตั้งต้น ณ วันที่</span>
                  <Input
                    aria-describedby="patient-import-effective-date-help"
                    disabled={previewPending || importPending}
                    id={PATIENT_IMPORT_EFFECTIVE_DATE_INPUT_ID}
                    name="effectiveDate"
                    onChange={(event) => {
                      invalidateImportPreview();
                      setEffectiveDate(event.target.value);
                    }}
                    type="date"
                    value={effectiveDate}
                  />
                  <span
                    className="text-xs font-normal leading-5 text-muted"
                    id="patient-import-effective-date-help"
                  >
                    วันที่นี้ใช้ร่วมกับข้อมูลตั้งต้นด้านสุขภาพในไฟล์ เช่น น้ำหนัก รอบเอว
                    ค่าน้ำตาลในเลือด (DTX) และ HbA1c ไม่ใช่วันที่อัปโหลด วันที่ลงทะเบียน
                    หรือวันที่วินิจฉัย
                  </span>
                </label>

                <p className="text-xs leading-5 text-muted">
                  วันที่ข้อมูลตั้งต้นเป็นตัวเลือกตามข้อมูลในไฟล์ ระบบจะแจ้งหากจำเป็นต้องระบุก่อนนำเข้า
                </p>

                {previewState.status === "ERROR" ? (
                  <Alert aria-live="polite" className="mt-2" variant="danger">
                    <p>{previewState.message}</p>
                    {previewState.message === PATIENT_IMPORT_TEMPLATE_MISMATCH_MESSAGE ? (
                      <p className="mt-1">
                        กรุณาดาวน์โหลด Template ล่าสุดแล้วกรอกข้อมูลใหม่
                      </p>
                    ) : null}
                    <a
                      className={buttonClassName({
                        className: "mt-3",
                        size: "compact",
                        variant: "secondary",
                      })}
                      download={createPatientImportTemplateFilename(selectedScope.hospitalCode)}
                      href={createPatientImportTemplateDownloadPath(selectedHospitalId)}
                    >
                      ดาวน์โหลด Template ของ {selectedScope.hospitalName}
                    </a>
                  </Alert>
                ) : null}

                <Button
                  className="w-full"
                  disabled={previewPending || importPending}
                  loading={previewPending}
                  ref={previewSubmitRef}
                  type="submit"
                  variant={reviewPreview ? "secondary" : "primary"}
                >
                  {previewPending ? "กำลังตรวจสอบไฟล์..." : "ตรวจสอบและแสดงตัวอย่าง"}
                </Button>

                {previewPending ? (
                  <Alert aria-live="polite" className="mt-2" variant="info">
                    กำลังตรวจสอบไฟล์... ข้อมูลไฟล์และวันที่ยังอยู่ในแบบฟอร์ม
                  </Alert>
                ) : null}

                {reviewPreview && !showReviewDialog ? (
                  <PatientImportReviewReminder
                    attentionRowCount={attentionRowCount}
                    baselineDateRequired={reviewPreview.baselineDateRequired}
                    executableRowCount={importableRowCount}
                    onNewImport={handleNewImport}
                    onOpen={openReviewDialog}
                    result={
                      importSummary && importResultPresentation
                        ? {
                            heading: importResultPresentation.heading,
                            variant: importResultPresentation.variant,
                          }
                        : null
                    }
                  />
                ) : null}
              </form>
            </Panel>
          ) : null}
        </div>
      </div>

      {showReviewDialog && reviewPreview ? (
        <ModalDialog
          description={
            <PatientImportDialogContext
              fileName={selectedFile?.name ?? null}
              hospitalName={selectedScope.hospitalName}
            />
          }
          dismissible={!importPending}
          footer={
            importSummary ? (
              <ImportResultActions
                canAssignOsm={canAssignOsm}
                file={selectedFile}
                onClose={() => closeReviewDialog()}
                onNewImport={handleNewImport}
                preview={reviewPreview}
                summary={importSummary}
              />
            ) : (
              <PatientImportReviewActions
                attentionRowCount={attentionRowCount}
                baselineDateRequired={reviewPreview.baselineDateRequired}
                executableRowCount={importableRowCount}
                file={selectedFile}
                importPending={importPending}
                importUnknown={importUnknown}
                onCancel={() => closeReviewDialog()}
                onConfirm={handleImport}
                onEditEffectiveDate={() => closeReviewDialog("EFFECTIVE_DATE")}
                onEditFile={() => closeReviewDialog("FILE_INPUT")}
                preview={reviewPreview}
              />
            )
          }
          onClosed={restoreFocusAfterReviewDialog}
          onRequestClose={() => closeReviewDialog()}
          stepKey={importSummary ? "result" : importState.status === "ERROR" ? "review-error" : "review"}
          title={importSummary ? "ผลการนำเข้าผู้ป่วย" : "ตรวจสอบก่อนนำเข้า"}
        >
          {importSummary ? (
            <ImportSummary canAssignOsm={canAssignOsm} summary={importSummary} />
          ) : (
            <div aria-busy={importPending} className="space-y-4">
              {importState.status === "ERROR" ? (
                <Alert variant="danger">
                  <p className="font-semibold">นำเข้าไม่สำเร็จ</p>
                  <p className="mt-1">{importState.message}</p>
                </Alert>
              ) : null}
              {importUnknown ? (
                <Alert role="alert" variant="warning">
                  <p className="font-semibold">{unknownOutcomeMessage}</p>
                  <p className="mt-1">
                    ปิดหน้าต่างนี้แล้วตรวจสอบไฟล์อีกครั้ง ระบบจะแสดงรายการที่บันทึกไปแล้วก่อนให้ยืนยันนำเข้าใหม่
                  </p>
                </Alert>
              ) : null}
              {importPending ? (
                <Alert variant="info">
                  กำลังนำเข้าข้อมูล... กรุณารอจนกว่าระบบจะแสดงผล
                </Alert>
              ) : null}
              <PreviewFileSummary
                attentionRowCount={attentionRowCount}
                executableRowCount={importableRowCount}
                preview={reviewPreview}
              />
              <PreviewTable preview={reviewPreview} />
            </div>
          )}
        </ModalDialog>
      ) : null}
    </div>
  );
}
