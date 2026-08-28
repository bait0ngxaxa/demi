"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";

import { Alert } from "@/components/ui/alert";
import { Button, buttonClassName } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LocalNavigation } from "@/components/ui/local-navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";
import { getPatientClassificationLabel } from "@/modules/patient-classification/presentation/patient-classification-labels";
import type {
  PatientImportClassification,
  PatientImportBaselineStatus,
  PatientImportPreview,
  PatientImportPreviewRow,
  PatientImportRowResult,
  PatientImportResultSummary,
} from "@/modules/patient-provisioning/services/patient-roster-import-types";
import {
  isPatientImportAttentionClassification,
  isPatientImportAttentionResult,
} from "@/modules/patient-provisioning/services/patient-roster-import-types";
import {
  countPatientImportExecutableRows,
  countPatientImportRowsRequiringAttention,
  getPatientImportBaselineReason,
  getPatientImportAttentionReason,
  getPatientImportClassificationReason,
  getPatientImportOsmReason,
  getPatientImportResultPresentation,
  selectedPatientImportOsmCandidate,
  summarizePatientImportPreview,
} from "@/modules/patient-provisioning/presentation/patient-import-presentation";
import type { PatientProvisioningScope } from "@/modules/patient-provisioning/services/patient-provisioning-service";
import type { PatientImportFieldKey } from "@/modules/patient-provisioning/import/patient-import-contract";
import {
  PATIENT_IMPORT_TEMPLATE_DOWNLOAD_FILENAME,
  PATIENT_IMPORT_TEMPLATE_DOWNLOAD_PATH,
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
  type PatientImportOsmAssignmentChoiceBinding,
  type PatientImportPreviewReconciliationBinding,
  type PatientImportPreviewActionState,
  type PatientProvisionActionState,
  type PatientProvisionResultState,
} from "@/modules/patient-provisioning/transport/action-state";

type PatientProvisioningWorkspaceProps = {
  scopes: PatientProvisioningScope[];
  selectedHospitalId: string;
  selectedScope: PatientProvisioningScope;
};

type ProvisioningMode = "SINGLE" | "EXCEL";

const classificationLabels: Record<PatientImportClassification, string> = {
  READY: "พร้อมนำเข้า",
  ALREADY_EXISTS: "มีอยู่แล้ว",
  DUPLICATE_IN_FILE: "ซ้ำในไฟล์",
  INVALID: "ข้อมูลไม่ถูกต้อง",
  CONFLICT: "ข้อมูลขัดแย้ง",
  NEEDS_REVIEW: "ต้องตรวจสอบ",
  HOSPITAL_MISMATCH: "โรงพยาบาลไม่ตรงกัน",
  UNSUPPORTED_REQUIREMENT: "รอยืนยันข้อกำหนด",
};

const classificationVariants: Record<PatientImportClassification, StatusVariant> = {
  READY: "success",
  ALREADY_EXISTS: "neutral",
  DUPLICATE_IN_FILE: "warning",
  INVALID: "danger",
  CONFLICT: "danger",
  NEEDS_REVIEW: "warning",
  HOSPITAL_MISMATCH: "danger",
  UNSUPPORTED_REQUIREMENT: "warning",
};

const baselineStatusLabels: Record<PatientImportBaselineStatus, string> = {
  NOT_APPLICABLE: "",
  BASELINE_READY: "ข้อมูลตั้งต้นพร้อมบันทึก",
  BASELINE_CREATED: "บันทึกข้อมูลตั้งต้นแล้ว",
  BASELINE_ALREADY_EXISTS: "ข้อมูลตั้งต้นมีอยู่แล้ว",
  BASELINE_CONFLICT: "ข้อมูลตั้งต้นขัดแย้ง",
  BASELINE_DATE_REQUIRED: "ต้องระบุวันที่ข้อมูลตั้งต้น",
  BASELINE_DATA_INVALID: "ข้อมูลตั้งต้นไม่ถูกต้อง",
};

const importResultLabels: Record<PatientImportRowResult["result"], string> = {
  IMPORTED: "นำเข้าสำเร็จ",
  ALREADY_EXISTS: "มีอยู่แล้ว",
  DUPLICATE_IN_FILE: "ซ้ำในไฟล์",
  INVALID: "ข้อมูลไม่ถูกต้อง",
  CONFLICT: "ข้อมูลขัดแย้ง",
  NEEDS_REVIEW: "ต้องตรวจสอบ",
  HOSPITAL_MISMATCH: "โรงพยาบาลไม่ตรงกัน",
  UNSUPPORTED_REQUIREMENT: "รอยืนยันข้อกำหนด",
  FAILED: "บันทึกไม่สำเร็จ",
};

const importResultVariants: Record<PatientImportRowResult["result"], StatusVariant> = {
  IMPORTED: "success",
  ALREADY_EXISTS: "neutral",
  DUPLICATE_IN_FILE: "warning",
  INVALID: "danger",
  CONFLICT: "danger",
  NEEDS_REVIEW: "warning",
  HOSPITAL_MISMATCH: "danger",
  UNSUPPORTED_REQUIREMENT: "warning",
  FAILED: "danger",
};

const importFieldLabels: Record<PatientImportFieldKey, string> = {
  nationalId: "เลขบัตรประชาชน",
  dateOfBirth: "วันเกิด",
  givenName: "ชื่อ",
  familyName: "นามสกุล",
  combinedNameText: "ชื่อรวม",
  hospitalNumber: "HN",
  gender: "เพศ",
  phoneNumber: "เบอร์โทรศัพท์",
  weight: "น้ำหนัก",
  height: "ส่วนสูง",
  waistCircumference: "รอบเอว",
  diabetesClassification: "ประเภทเบาหวาน/กลุ่มเสี่ยง",
  bloodSugar: "ค่าน้ำตาลในเลือด",
  bloodSugarDtx: "ค่าน้ำตาลในเลือด (DTX)",
  hba1c: "HbA1c",
  hospitalName: "โรงพยาบาลจากไฟล์",
  subHospitalName: "รพ.สต. จากไฟล์",
  organizationCombinedText: "โรงพยาบาล/รพ.สต. จากไฟล์",
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
  osmCaregiverName: "ชื่อผู้ดูแล/โค้ช",
  sourceSequenceNumber: "ลำดับจากไฟล์",
  externalPatientId: "PID",
  ageAtRoster: "อายุ ณ วันที่จัดทำไฟล์",
  addressText: "ที่อยู่",
  bloodPressureText: "ความดันโลหิต",
  pulseRate: "ชีพจร",
  bmi: "BMI",
  dtxReading: "ค่า DTX",
  riskFactorText: "ปัจจัยเสี่ยง",
  serviceVisitDate: "วันที่รับบริการ",
  extendedMeasurementSeries: "ชุดข้อมูลการติดตามเพิ่มเติม",
};

function fieldLabels(fields: readonly PatientImportFieldKey[]): string {
  return fields.map((field) => importFieldLabels[field]).join(", ");
}

function patientImportRowName(row: Pick<PatientImportPreviewRow, "givenName" | "familyName" | "combinedNameText">): string {
  return [row.givenName, row.familyName].filter(Boolean).join(" ") || row.combinedNameText || "ไม่ระบุชื่อ";
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
  classificationReconciliationChoices: readonly PatientImportPreviewReconciliationBinding[],
  osmAssignmentChoices: readonly PatientImportOsmAssignmentChoiceBinding[],
): FormData {
  const formData = createPatientImportFormData(file, targetHospitalId, effectiveDate ?? "");
  formData.set("previewTargetHospitalId", previewTargetHospitalId);
  formData.set("fileFingerprint", fileFingerprint);
  formData.set("previewBinding", previewBinding);
  formData.set("importContractVersion", importContractVersion);

  if (classificationReconciliationChoices.length > 0) {
    formData.set(
      "classificationReconciliationChoices",
      JSON.stringify(classificationReconciliationChoices),
    );
  }

  if (osmAssignmentChoices.length > 0) {
    formData.set("osmAssignmentChoices", JSON.stringify(osmAssignmentChoices));
  }

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

function PreviewRowDetails({
  row,
  reconciliation,
  osmReconciliation,
  selectedReconciliation,
  selectedOsmReassignment,
  onToggleReconciliation,
  onToggleOsmReassignment,
  canManageOsmAssignment,
  disabled,
}: {
  row: PatientImportPreviewRow;
  reconciliation: PatientImportPreviewBinding["classificationReconciliations"][number] | undefined;
  osmReconciliation: PatientImportPreviewBinding["osmAssignmentReconciliations"][number] | undefined;
  selectedReconciliation: boolean;
  selectedOsmReassignment: boolean;
  onToggleReconciliation: (rowNumber: number, checked: boolean) => void;
  onToggleOsmReassignment: (rowNumber: number, checked: boolean) => void;
  canManageOsmAssignment: boolean;
  disabled: boolean;
}): React.JSX.Element {
  const classification = row.patientClassification;
  const osm = row.patientOsmAssignment;
  const osmCandidate = osmReconciliation
    ? selectedPatientImportOsmCandidate(osmReconciliation)
    : null;
  const candidateDisplayName =
    osmCandidate?.displayName ?? osm.resolvedCandidate?.displayName ?? null;
  const currentCaregiver = osm.currentCaregiver;
  const classificationChangeNeedsConfirmation =
    classification.status === "CLASSIFICATION_CHANGE_REQUIRES_CONFIRMATION";
  const osmReassignmentNeedsConfirmation = Boolean(
    canManageOsmAssignment &&
      osm.assignmentStatus !== "OSM_OWNER_REQUIRED" &&
      currentCaregiver &&
      osmCandidate &&
      !osmCandidate.sameAsCurrent,
  );
  const primaryReason =
    row.classification === "ALREADY_EXISTS"
      ? row.reason ?? "ข้อมูลมีอยู่แล้ว ระบบจะไม่สร้างซ้ำ"
      : isPatientImportAttentionClassification(row.classification)
        ? getPatientImportAttentionReason(row)
        : row.classification === "READY"
          ? null
          : row.reason;
  const baselineReason = getPatientImportBaselineReason(row);
  const classificationReason = getPatientImportClassificationReason(row);
  const osmReason = getPatientImportOsmReason(row);

  return (
    <div className="space-y-3">
      {primaryReason ? <p className="text-muted">{primaryReason}</p> : null}

      {row.baselineStatus !== "NOT_APPLICABLE" ? (
        <div className="border-l-2 border-border-strong pl-3">
          <p className="font-semibold text-ink">ข้อมูลตั้งต้น</p>
          <p className="mt-1 text-muted">{baselineStatusLabels[row.baselineStatus]}</p>
          {baselineReason ? <p className="mt-1 text-danger">{baselineReason}</p> : null}
        </div>
      ) : null}

      {classification.status !== "NOT_APPLICABLE" ? (
        <div className="border-l-2 border-border-strong pl-3">
          <p className="font-semibold text-ink">สถานะผู้ป่วย</p>
          {classificationChangeNeedsConfirmation ? (
            <>
              <p className="mt-1 text-muted">
                เปลี่ยนจาก {getPatientClassificationLabel(classification.currentClassification)} →{" "}
                {getPatientClassificationLabel(classification.sourceClassification)}
              </p>
              {classificationReason ? (
                <p className="mt-1 text-warning">{classificationReason}</p>
              ) : null}
              {reconciliation ? (
                <label
                  className="mt-2 flex items-start gap-2 font-normal text-ink"
                  htmlFor={"patient-import-classification-" + row.rowNumber}
                >
                  <input
                    checked={selectedReconciliation}
                    className="mt-1 size-4 accent-brand-strong"
                    disabled={disabled}
                    id={"patient-import-classification-" + row.rowNumber}
                    onChange={(event) =>
                      onToggleReconciliation(row.rowNumber, event.currentTarget.checked)
                    }
                    type="checkbox"
                  />
                  <span>
                    ยืนยันเปลี่ยนสถานะผู้ป่วยจาก{" "}
                    {getPatientClassificationLabel(classification.currentClassification)} เป็น{" "}
                    {getPatientClassificationLabel(classification.sourceClassification)}
                  </span>
                </label>
              ) : null}
            </>
          ) : (
            <>
              {classification.sourceClassification ? (
                <p className="mt-1 text-muted">
                  จากไฟล์: {getPatientClassificationLabel(classification.sourceClassification)}
                </p>
              ) : null}
              {classificationReason ? (
                <p className="mt-1 text-danger">{classificationReason}</p>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {osm.sourceCaregiverName || osm.assignmentStatus === "OSM_OWNER_REQUIRED" ? (
        <div className="border-l-2 border-border-strong pl-3">
          <p className="font-semibold text-ink">ผู้ดูแล</p>
          <p className="mt-1 text-muted">
            จากไฟล์: {osm.sourceCaregiverName ?? "ไม่ระบุชื่อผู้ดูแล"}
          </p>
          {currentCaregiver ? (
            <p className="mt-1 text-muted">
              ผู้ดูแลปัจจุบัน: {currentCaregiver.displayName}
            </p>
          ) : null}

          {osm.resolutionStatus === "OSM_MATCHED" && candidateDisplayName ? (
            <>
              <p className="mt-1 text-muted">ผู้ดูแลที่จับคู่ได้: {candidateDisplayName}</p>
              {!currentCaregiver &&
              canManageOsmAssignment &&
              osm.assignmentStatus !== "OSM_OWNER_REQUIRED" ? (
                <p className="mt-1 text-success">
                  เมื่อยืนยัน ระบบจะกำหนดผู้ดูแล: {candidateDisplayName}
                </p>
              ) : osmCandidate?.sameAsCurrent ? (
                <p className="mt-1 text-muted">
                  ผู้ดูแลตรงกับปัจจุบัน ระบบจะไม่เปลี่ยนแปลง
                </p>
              ) : currentCaregiver &&
                !canManageOsmAssignment &&
                osm.assignmentStatus === "OSM_OWNER_REQUIRED" ? (
                <p className="mt-1 text-warning">
                  ผู้ดูแลปัจจุบัน → ผู้ดูแลจากไฟล์: {currentCaregiver.displayName} →{" "}
                  {candidateDisplayName}
                </p>
              ) : currentCaregiver && osmReassignmentNeedsConfirmation ? (
                <>
                  <p className="mt-1 text-warning">
                    ผู้ดูแลปัจจุบัน → ผู้ดูแลจากไฟล์: {currentCaregiver.displayName} →{" "}
                    {candidateDisplayName}
                  </p>
                  <label
                    className="mt-2 flex items-start gap-2 font-normal text-ink"
                    htmlFor={"patient-import-osm-" + row.rowNumber}
                  >
                    <input
                      checked={selectedOsmReassignment}
                      className="mt-1 size-4 accent-brand-strong"
                      disabled={disabled}
                      id={"patient-import-osm-" + row.rowNumber}
                      onChange={(event) =>
                        onToggleOsmReassignment(row.rowNumber, event.currentTarget.checked)
                      }
                      type="checkbox"
                    />
                    <span>ยืนยันเปลี่ยนผู้ดูแลเป็น {candidateDisplayName}</span>
                  </label>
                </>
              ) : null}
            </>
          ) : null}

          {osm.resolutionStatus === "OSM_NOT_FOUND" ||
          osm.resolutionStatus === "OSM_AMBIGUOUS" ||
          osm.resolutionStatus === "OSM_SELF_ASSIGNMENT_FORBIDDEN" ||
          osm.resolutionStatus === "OSM_DATA_INVALID" ? (
            <p className="mt-1 text-danger">{osmReason}</p>
          ) : null}

          {osm.assignmentStatus === "OSM_OWNER_REQUIRED" ? (
            <p className="mt-1 text-warning">
              รายการนี้ต้องให้เจ้าของโรงพยาบาลยืนยันผู้ดูแล
            </p>
          ) : null}

          {osm.assignmentStatus === "OSM_ASSIGNMENT_CONFLICT" &&
          !osmReassignmentNeedsConfirmation ? (
            <p className="mt-1 text-warning">{osmReason}</p>
          ) : null}
        </div>
      ) : null}

      {row.requirementGatedFields.length > 0 ? (
        <p className="border-l-2 border-border-strong pl-3 text-muted">
          คอลัมน์ต่อไปนี้จะยังไม่ถูกบันทึกในเวอร์ชันนี้:{" "}
          {fieldLabels(row.requirementGatedFields)}
        </p>
      ) : null}

      {!primaryReason &&
      row.baselineStatus === "NOT_APPLICABLE" &&
      classification.status === "NOT_APPLICABLE" &&
      !osm.sourceCaregiverName &&
      row.requirementGatedFields.length === 0 ? (
        <span className="text-muted">-</span>
      ) : null}
    </div>
  );
}

function PreviewTable({
  rows,
  reconciliations,
  osmAssignmentReconciliations,
  selectedReconciliationRows,
  selectedOsmReassignmentRows,
  onToggleReconciliation,
  onToggleOsmReassignment,
  canManageOsmAssignment,
  disabled,
}: {
  rows: PatientImportPreviewRow[];
  reconciliations: PatientImportPreviewBinding["classificationReconciliations"];
  osmAssignmentReconciliations: PatientImportPreviewBinding["osmAssignmentReconciliations"];
  selectedReconciliationRows: ReadonlySet<number>;
  selectedOsmReassignmentRows: ReadonlySet<number>;
  onToggleReconciliation: (rowNumber: number, checked: boolean) => void;
  onToggleOsmReassignment: (rowNumber: number, checked: boolean) => void;
  canManageOsmAssignment: boolean;
  disabled: boolean;
}): React.JSX.Element {
  if (rows.length === 0) {
    return (
      <p className="rounded-panel border border-dashed border-border bg-surface-muted px-4 py-8 text-center text-sm leading-6 text-text-muted">
        ไม่พบแถวข้อมูลที่พร้อมตรวจสอบในไฟล์นี้
      </p>
    );
  }

  const reconciliationByRow = new Map(
    reconciliations.map((reconciliation) => [reconciliation.rowNumber, reconciliation]),
  );
  const osmReconciliationByRow = new Map(
    osmAssignmentReconciliations.map((reconciliation) => [reconciliation.rowNumber, reconciliation]),
  );

  return (
    <div className="overflow-x-auto rounded-panel border border-border">
      <table className="min-w-[920px] divide-y divide-line bg-surface text-left text-sm">
        <caption className="sr-only">ผลการตรวจสอบรายชื่อผู้ป่วยจากไฟล์</caption>
        <thead className="bg-canvas text-xs font-semibold text-muted">
          <tr>
            <th className="whitespace-nowrap px-3 py-3" scope="col">แถวใน Excel</th>
            <th className="whitespace-nowrap px-3 py-3" scope="col">เลขบัตรประชาชน</th>
            <th className="whitespace-nowrap px-3 py-3" scope="col">ชื่อ-นามสกุล</th>
            <th className="whitespace-nowrap px-3 py-3" scope="col">HN</th>
            <th className="whitespace-nowrap px-3 py-3" scope="col">สถานะ</th>
            <th className="min-w-[26rem] px-3 py-3" scope="col">รายละเอียด</th>
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
              <td className="whitespace-nowrap px-3 py-3 text-muted">
                {row.hospitalNumber ?? "-"}
              </td>
              <td className="whitespace-nowrap px-3 py-3 align-top">
                <StatusBadge variant={classificationVariants[row.classification]}>
                  {classificationLabels[row.classification]}
                </StatusBadge>
              </td>
              <td className="px-3 py-3 align-top">
                <PreviewRowDetails
                  canManageOsmAssignment={canManageOsmAssignment}
                  disabled={disabled}
                  onToggleOsmReassignment={onToggleOsmReassignment}
                  onToggleReconciliation={onToggleReconciliation}
                  osmReconciliation={osmReconciliationByRow.get(row.rowNumber)}
                  reconciliation={reconciliationByRow.get(row.rowNumber)}
                  row={row}
                  selectedOsmReassignment={selectedOsmReassignmentRows.has(row.rowNumber)}
                  selectedReconciliation={selectedReconciliationRows.has(row.rowNumber)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PreviewFileSummary({
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
          <dt className="text-muted">ทั้งหมด</dt>
          <dd className="text-lg font-semibold text-ink">{summary.total}</dd>
        </div>
        <div className="min-w-28 flex-1 px-3 py-3">
          <dt className="text-muted">พร้อมนำเข้า</dt>
          <dd className="text-lg font-semibold text-success">{executableRowCount}</dd>
        </div>
        <div className="min-w-28 flex-1 px-3 py-3">
          <dt className="text-muted">มีอยู่แล้ว</dt>
          <dd className="text-lg font-semibold text-ink">{summary.alreadyExists}</dd>
        </div>
        <div className="min-w-28 flex-1 px-3 py-3">
          <dt className="text-muted">ต้องตรวจสอบ</dt>
          <dd className="text-lg font-semibold text-warning">{attentionRowCount}</dd>
        </div>
        <div className="min-w-28 flex-1 px-3 py-3">
          <dt className="text-muted">ข้อมูลไม่ถูกต้อง</dt>
          <dd className="text-lg font-semibold text-danger">{summary.invalid}</dd>
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
            ข้อมูลทั้งหมดมีอยู่แล้ว ไม่มีรายการที่ต้องบันทึกเพิ่ม
          </p>
        ) : executableRowCount > 0 ? (
          <>
            <p className="font-semibold text-success">
              พร้อมนำเข้า {executableRowCount} จาก {summary.total} รายการ
            </p>
            {attentionRowCount > 0 ? (
              <>
                <p className="font-semibold text-warning">
                  ยังต้องตรวจสอบ {attentionRowCount} รายการ
                </p>
                <p className="text-muted">
                  ระบบจะนำเข้าเฉพาะรายการที่พร้อม ส่วนรายการที่ต้องตรวจสอบจะไม่ถูกบันทึก
                </p>
              </>
            ) : null}
          </>
        ) : attentionRowCount > 0 ? (
          <p className="font-semibold text-warning">
            ยังไม่มีรายการที่พร้อมนำเข้า กรุณาตรวจสอบรายการด้านล่าง
          </p>
        ) : summary.total > 0 ? (
          <p className="font-semibold text-warning">
            ยังไม่มีรายการที่พร้อมนำเข้า กรุณาตรวจสอบรายการด้านล่าง
          </p>
        ) : (
          <p className="text-muted">ไม่พบรายการผู้ป่วยในไฟล์นี้</p>
        )}
      </div>

      <p className="mt-4 border-t border-border pt-4 text-muted">
        วันที่ข้อมูลตั้งต้นของไฟล์: {preview.effectiveDate ?? "ยังไม่ได้ระบุ"}
      </p>
      {file?.requirementGatedFields.length ? (
        <p className="mt-2 text-muted">
          คอลัมน์ต่อไปนี้จะยังไม่ถูกบันทึกในเวอร์ชันนี้:{" "}
          {fieldLabels(file.requirementGatedFields)}
        </p>
      ) : null}
    </section>
  );
}

function ImportSummary({
  summary,
  onNewImport,
}: {
  summary: PatientImportResultSummary;
  onNewImport: () => void;
}): React.JSX.Element {
  const attentionRows = summary.rows.filter((row) => isPatientImportAttentionResult(row.result));
  const {
    detail,
    hasAttentionRows,
    hasSuccessfulRows,
    heading,
    reviewCount,
    variant,
  } = getPatientImportResultPresentation(summary);

  return (
    <Alert variant={variant}>
      <p className="font-semibold">{heading}</p>
      {detail ? <p className="mt-1 text-muted">{detail}</p> : null}

      <dl className="mt-3 flex flex-wrap divide-y divide-line border-y border-line sm:divide-x sm:divide-y-0">
        <div className="min-w-28 flex-1 px-3 py-3 first:pl-0">
          <dt className="text-muted">นำเข้าสำเร็จ</dt>
          <dd className="text-lg font-semibold text-success">{summary.imported}</dd>
        </div>
        <div className="min-w-28 flex-1 px-3 py-3">
          <dt className="text-muted">มีอยู่แล้ว</dt>
          <dd className="text-lg font-semibold text-ink">{summary.alreadyExists}</dd>
        </div>
        <div className="min-w-28 flex-1 px-3 py-3">
          <dt className="text-muted">ต้องตรวจสอบ</dt>
          <dd className="text-lg font-semibold text-warning">{reviewCount}</dd>
        </div>
        <div className="min-w-28 flex-1 px-3 py-3">
          <dt className="text-muted">ข้อมูลไม่ถูกต้อง</dt>
          <dd className="text-lg font-semibold text-danger">{summary.invalid}</dd>
        </div>
        <div className="min-w-28 flex-1 px-3 py-3">
          <dt className="text-muted">บันทึกไม่สำเร็จ</dt>
          <dd className="text-lg font-semibold text-danger">{summary.failed}</dd>
        </div>
      </dl>

      {hasAttentionRows ? (
        <div className="mt-5 border-t border-border pt-4">
          <h3 className="font-semibold">แถวที่ต้องตรวจสอบ</h3>
          <div className="mt-3 overflow-x-auto rounded-panel border border-border bg-surface">
            <table className="min-w-[820px] divide-y divide-line text-left text-sm">
              <caption className="sr-only">รายการที่ต้องตรวจสอบหลังนำเข้า</caption>
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
                    row.reason ??
                    (row.result === "FAILED"
                      ? "ระบบไม่สามารถบันทึกรายการนี้ได้ กรุณาลองใหม่"
                      : getPatientImportAttentionReason(row));

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

      {summary.file?.requirementGatedFields.length ? (
        <p className="mt-4 border-t border-border pt-4 text-muted">
          คอลัมน์ต่อไปนี้จะยังไม่ถูกบันทึกในเวอร์ชันนี้:{" "}
          {fieldLabels(summary.file.requirementGatedFields)}
        </p>
      ) : null}

      {hasAttentionRows ? (
        <div className="mt-4 border-t border-border pt-4 text-muted">
          <p>แก้ไขข้อมูลในไฟล์แล้วอัปโหลดใหม่</p>
          {summary.osmOwnerRequired > 0 ? (
            <p className="mt-1">
              รายการที่ต้องยืนยันผู้ดูแล: ให้เจ้าของโรงพยาบาลดำเนินการนำเข้าไฟล์อีกครั้ง
            </p>
          ) : null}
          {summary.classificationNeedsReview > 0 || summary.osmAssignmentConflict > 0 ? (
            <p className="mt-1">
              หากเป็นรายการที่ยังไม่ได้ยืนยัน ให้ตรวจสอบตัวอย่างใหม่และยืนยันทุกข้อที่ต้องการก่อนนำเข้าอีกครั้ง
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <Button
          onClick={onNewImport}
          size="compact"
          type="button"
          variant={hasSuccessfulRows ? "secondary" : "primary"}
        >
          นำเข้าไฟล์ใหม่
        </Button>
        <Link
          className="inline-flex min-h-10 items-center font-semibold text-brand-strong underline decoration-brand-soft underline-offset-4 hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
          href={"/app/patients?hospitalId=" + encodeURIComponent(summary.targetHospitalId)}
        >
          เปิดรายชื่อผู้ป่วยในโรงพยาบาลนี้
        </Link>
      </div>
    </Alert>
  );
}

function createOsmAssignmentChoices(
  preview: PatientImportPreviewBinding,
  selectedReassignmentRows: ReadonlySet<number>,
): PatientImportOsmAssignmentChoiceBinding[] {
  return preview.osmAssignmentReconciliations.flatMap((reconciliation) => {
    const candidate = selectedPatientImportOsmCandidate(reconciliation);

    if (!candidate) {
      return [];
    }

    const explicitReassignment = Boolean(
      reconciliation.currentCaregiver &&
        !candidate.sameAsCurrent &&
        selectedReassignmentRows.has(reconciliation.rowNumber),
    );

    return [{
      rowNumber: reconciliation.rowNumber,
      resolutionStatus: reconciliation.resolutionStatus,
      candidateToken: candidate.candidateToken,
      candidateReferenceToken: candidate.candidateReferenceToken,
      explicitReassignment,
      ...(explicitReassignment && candidate.reassignmentToken
        ? { reassignmentToken: candidate.reassignmentToken }
        : {}),
    }];
  });
}
export function PatientProvisioningWorkspace({
  scopes,
  selectedHospitalId,
  selectedScope,
}: PatientProvisioningWorkspaceProps): React.JSX.Element {
  const router = useRouter();
  const [provisionState, provisionAction, provisionPending] = useActionState<
    PatientProvisionActionState,
    FormData
  >(provisionPatientAction, initialPatientProvisionActionState);
  const [previewState, setPreviewState] = useState<PatientImportPreviewActionState>(
    initialPatientImportPreviewActionState,
  );
  const [importState, setImportState] = useState<PatientImportActionState>(
    initialPatientImportActionState,
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [effectiveDate, setEffectiveDate] = useState("");
  const [selectedClassificationReconciliationRows, setSelectedClassificationReconciliationRows] =
    useState<Set<number>>(new Set());
  const [selectedOsmReassignmentRows, setSelectedOsmReassignmentRows] = useState<Set<number>>(
    new Set(),
  );
  const [fileInputKey, setFileInputKey] = useState(0);
  const [previewPending, startPreviewTransition] = useTransition();
  const [importPending, startImportTransition] = useTransition();
  const [mode, setMode] = useState<ProvisioningMode>("SINGLE");
  const importContextVersion = useRef(0);
  const previousHospitalId = useRef(selectedHospitalId);

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
    setSelectedClassificationReconciliationRows(new Set());
    setSelectedOsmReassignmentRows(new Set());
    setFileInputKey((current) => current + 1);
  }, [selectedHospitalId]);

  const importableRowCount = previewState.status === "SUCCESS"
    ? countPatientImportExecutableRows(
        previewState.preview,
        selectedClassificationReconciliationRows,
        selectedOsmReassignmentRows,
      )
    : 0;
  const attentionRowCount = previewState.status === "SUCCESS"
    ? countPatientImportRowsRequiringAttention(
        previewState.preview,
        selectedClassificationReconciliationRows,
        selectedOsmReassignmentRows,
      )
    : 0;
  const hasImportableRows = importableRowCount > 0;
  const previewAllRowsAlreadyExist = previewState.status === "SUCCESS" &&
    previewState.preview.rows.length > 0 &&
    previewState.preview.rows.every((row) => row.classification === "ALREADY_EXISTS");

  const previewIsCurrent =
    selectedFile !== null &&
    previewFile === selectedFile &&
    previewState.status === "SUCCESS" &&
    previewState.preview.targetHospitalId === selectedHospitalId &&
    previewState.preview.effectiveDate === (effectiveDate.trim() || null);
  const activeMode: ProvisioningMode = selectedScope.canBulkImport ? mode : "SINGLE";

  function invalidateImportPreview(): void {
    importContextVersion.current += 1;
    setPreviewFile(null);
    setPreviewState(initialPatientImportPreviewActionState);
    setImportState(initialPatientImportActionState);
    setSelectedClassificationReconciliationRows(new Set());
    setSelectedOsmReassignmentRows(new Set());
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
      const result = await previewPatientImportAction(
        createPatientImportFormData(file, targetHospitalId, effectiveDate),
      );

      if (requestVersion !== importContextVersion.current) {
        return;
      }

      setPreviewState(result);
      setPreviewFile(result.status === "SUCCESS" ? file : null);
    });
  }

  function handleImport(event: React.MouseEvent<HTMLButtonElement>): void {
    event.preventDefault();

    if (
      !previewIsCurrent ||
      previewState.status !== "SUCCESS" ||
      !selectedFile ||
      !hasImportableRows ||
      importState.status === "SUCCESS"
    ) {
      return;
    }

    const requestVersion = importContextVersion.current;
    const file = selectedFile;
    const preview = previewState.preview;
    const classificationReconciliationChoices = preview.classificationReconciliations.filter(
      ({ rowNumber }) => selectedClassificationReconciliationRows.has(rowNumber),
    );
    const osmAssignmentChoices = createOsmAssignmentChoices(
      preview,
      selectedOsmReassignmentRows,
    );

    startImportTransition(async () => {
      const result = await confirmPatientImportAction(
        createPatientImportConfirmFormData(
          file,
          selectedHospitalId,
          preview.targetHospitalId,
          preview.fileFingerprint,
          preview.previewBinding,
          preview.effectiveDate,
          preview.importContractVersion,
          classificationReconciliationChoices,
          osmAssignmentChoices,
        ),
      );

      if (requestVersion !== importContextVersion.current) {
        return;
      }

      setImportState(result);
    });
  }

  function toggleClassificationReconciliation(rowNumber: number, checked: boolean): void {
    setSelectedClassificationReconciliationRows((current) => {
      const next = new Set(current);

      if (checked) {
        next.add(rowNumber);
      } else {
        next.delete(rowNumber);
      }

      return next;
    });
  }

  function toggleOsmReassignment(rowNumber: number, checked: boolean): void {
    setSelectedOsmReassignmentRows((current) => {
      const next = new Set(current);

      if (checked) {
        next.add(rowNumber);
      } else {
        next.delete(rowNumber);
      }

      return next;
    });
  }

  function changeHospital(hospitalId: string): void {
    if (previewPending || importPending) {
      return;
    }

    importContextVersion.current += 1;
    setSelectedFile(null);
    setPreviewFile(null);
    setEffectiveDate("");
    setPreviewState(initialPatientImportPreviewActionState);
    setImportState(initialPatientImportActionState);
    setSelectedClassificationReconciliationRows(new Set());
    setSelectedOsmReassignmentRows(new Set());
    setFileInputKey((current) => current + 1);
    router.push(`/app/patients/provision?hospitalId=${encodeURIComponent(hospitalId)}`);
  }

  return (
    <div>
      <PageHeader
        actions={<StatusBadge variant="info">เพิ่มผู้ป่วย</StatusBadge>}
        breadcrumbs={[{ label: "ผู้ป่วย" }, { label: "เพิ่ม / นำเข้าผู้ป่วย" }]}
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
                disabled={previewPending || importPending}
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
                download={PATIENT_IMPORT_TEMPLATE_DOWNLOAD_FILENAME}
                href={PATIENT_IMPORT_TEMPLATE_DOWNLOAD_PATH}
              >
                ดาวน์โหลด Template
              </a>
              <p className="text-xs text-muted">รองรับสูงสุด 500 รายการต่อไฟล์</p>
              <p className="text-xs text-muted">หากรูปแบบคอลัมน์ถูกแก้ไข ระบบอาจไม่รับไฟล์</p>
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
            <form action={provisionAction} className="mt-6 space-y-4">
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
              <Button className="w-full" disabled={provisionPending} loading={provisionPending} type="submit">
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
              </div>

              <form className="mt-6 space-y-4" encType="multipart/form-data" onSubmit={handlePreview}>
                <input name="targetHospitalId" type="hidden" value={selectedHospitalId} />

                <label className="block space-y-2 text-sm font-semibold" htmlFor="patient-import-file">
                  <span>ไฟล์ Excel (.xlsx)</span>
                  <input
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="block min-h-12 w-full rounded-control border border-border bg-surface px-3 py-3 text-sm font-normal file:mr-3 file:rounded-control file:border-0 file:bg-brand-soft file:px-3 file:py-2 file:font-semibold file:text-brand-strong focus:outline-none focus:ring-4 focus:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={previewPending || importPending}
                    id="patient-import-file"
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
                  htmlFor="patient-import-effective-date"
                >
                  <span>ข้อมูลตั้งต้น ณ วันที่</span>
                  <Input
                    aria-describedby="patient-import-effective-date-help"
                    disabled={previewPending || importPending}
                    id="patient-import-effective-date"
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
                      download={PATIENT_IMPORT_TEMPLATE_DOWNLOAD_FILENAME}
                      href={PATIENT_IMPORT_TEMPLATE_DOWNLOAD_PATH}
                    >
                      ดาวน์โหลด Template
                    </a>
                  </Alert>
                ) : null}

                <Button
                  className="w-full"
                  disabled={previewPending || importPending}
                  loading={previewPending}
                  type="submit"
                  variant="secondary"
                >
                  {previewPending ? "กำลังตรวจสอบไฟล์..." : "ตรวจสอบและแสดงตัวอย่าง"}
                </Button>

                {previewPending ? (
                  <Alert aria-live="polite" className="mt-2" variant="info">
                    กำลังตรวจสอบไฟล์... ข้อมูลไฟล์และวันที่ยังอยู่ในแบบฟอร์ม
                  </Alert>
                ) : null}

                {previewState.status === "SUCCESS" ? (
                  <div
                    aria-busy={previewPending || importPending}
                    className="mt-6 space-y-4"
                  >
                    <div>
                      <h3 className="text-base font-semibold">ตัวอย่างผลตรวจสอบ</h3>
                      <p className="mt-1 text-sm leading-6 text-muted">
                        หากเปลี่ยนไฟล์ โรงพยาบาล หรือวันที่ข้อมูลตั้งต้น ต้องตรวจสอบใหม่
                      </p>
                      <p className="mt-1 text-sm leading-6 text-muted">
                        ติ๊กยืนยันเฉพาะการเปลี่ยนสถานะผู้ป่วยหรือผู้ดูแลที่ต้องการดำเนินการ
                      </p>
                    </div>

                    <PreviewFileSummary
                      attentionRowCount={attentionRowCount}
                      executableRowCount={importableRowCount}
                      preview={previewState.preview}
                    />

                    {importState.status !== "SUCCESS" ? (
                      <PreviewTable
                        canManageOsmAssignment={previewState.preview.canManageOsmAssignment}
                        disabled={previewPending || importPending}
                        onToggleReconciliation={toggleClassificationReconciliation}
                        onToggleOsmReassignment={toggleOsmReassignment}
                        osmAssignmentReconciliations={previewState.preview.osmAssignmentReconciliations}
                        reconciliations={previewState.preview.classificationReconciliations}
                        rows={previewState.preview.rows}
                        selectedOsmReassignmentRows={selectedOsmReassignmentRows}
                        selectedReconciliationRows={selectedClassificationReconciliationRows}
                      />
                    ) : null}

                    {importState.status === "ERROR" ? (
                      <Alert className="mt-2" variant="danger">
                        {importState.message}
                      </Alert>
                    ) : null}
                    {importState.status === "SUCCESS" ? (
                      <ImportSummary onNewImport={handleNewImport} summary={importState.summary} />
                    ) : null}

                    <div
                      aria-live="polite"
                      className="rounded-panel border border-border bg-surface-muted px-4 py-3 text-sm leading-6"
                    >
                      {importableRowCount > 0 ? (
                        <p className="font-semibold text-ink">
                          พร้อมนำเข้า {importableRowCount} จาก {previewState.preview.rows.length} รายการ
                        </p>
                      ) : previewAllRowsAlreadyExist ? (
                        <p className="font-semibold text-ink">
                          ข้อมูลทั้งหมดมีอยู่แล้ว ไม่มีรายการที่ต้องบันทึกเพิ่ม
                        </p>
                      ) : (
                        <p className="font-semibold text-warning">
                          ยังไม่มีรายการที่พร้อมนำเข้า กรุณาตรวจสอบรายการด้านล่าง
                        </p>
                      )}
                      {importableRowCount > 0 && attentionRowCount > 0 ? (
                        <p className="mt-1 text-muted">
                          ระบบจะนำเข้าเฉพาะรายการที่พร้อม ส่วนรายการที่ต้องตรวจสอบจะไม่ถูกบันทึก
                        </p>
                      ) : null}
                    </div>

                    <Button
                      className="w-full"
                      disabled={
                        !previewIsCurrent ||
                        !hasImportableRows ||
                        previewState.preview.baselineDateRequired ||
                        importState.status === "SUCCESS" ||
                        importPending ||
                        previewPending
                      }
                      loading={importPending}
                      onClick={handleImport}
                      type="button"
                    >
                      {importPending
                        ? "กำลังนำเข้าข้อมูล..."
                        : importableRowCount > 0
                          ? "ยืนยันนำเข้า " + importableRowCount + " รายการ"
                          : "ยืนยันนำเข้า"}
                    </Button>
                  </div>
                ) : null}
              </form>
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}
