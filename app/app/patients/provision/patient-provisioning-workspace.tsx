"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
  PatientProvisioningScope,
} from "@/modules/patient-provisioning/services/patient-provisioning-service";
import type { PatientImportFieldKey } from "@/modules/patient-provisioning/import/patient-import-contract";
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

const baselineStatusVariants: Record<PatientImportBaselineStatus, StatusVariant> = {
  NOT_APPLICABLE: "neutral",
  BASELINE_READY: "success",
  BASELINE_CREATED: "success",
  BASELINE_ALREADY_EXISTS: "neutral",
  BASELINE_CONFLICT: "danger",
  BASELINE_DATE_REQUIRED: "danger",
  BASELINE_DATA_INVALID: "danger",
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

function PreviewTable({
  rows,
  reconciliations,
  selectedReconciliationRows,
  onToggleReconciliation,
}: {
  rows: PatientImportPreviewRow[];
  reconciliations: PatientImportPreviewBinding["classificationReconciliations"];
  selectedReconciliationRows: ReadonlySet<number>;
  onToggleReconciliation: (rowNumber: number, checked: boolean) => void;
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

  return (
    <div className="overflow-x-auto rounded-panel border border-border">
      <table className="min-w-full divide-y divide-line text-left text-sm">
        <thead className="bg-canvas text-xs font-semibold text-muted">
          <tr>
            <th className="whitespace-nowrap px-3 py-3" scope="col">แถว</th>
            <th className="whitespace-nowrap px-3 py-3" scope="col">เลขบัตรประชาชน</th>
            <th className="whitespace-nowrap px-3 py-3" scope="col">ชื่อ-นามสกุล</th>
            <th className="whitespace-nowrap px-3 py-3" scope="col">HN</th>
            <th className="whitespace-nowrap px-3 py-3" scope="col">สถานะ</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line bg-white">
          {rows.map((row) => (
            <tr key={row.rowNumber}>
              <td className="whitespace-nowrap px-3 py-3 text-muted">{row.rowNumber}</td>
              <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-muted">{row.identityDisplay}</td>
              <td className="whitespace-nowrap px-3 py-3 font-semibold text-ink">
                {[row.givenName, row.familyName].filter(Boolean).join(" ") || row.combinedNameText || "ไม่ระบุชื่อ"}
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-muted">{row.hospitalNumber ?? "-"}</td>
              <td className="min-w-44 px-3 py-3">
                <StatusBadge variant={classificationVariants[row.classification]}>
                  {classificationLabels[row.classification]}
                </StatusBadge>
                {row.baselineStatus !== "NOT_APPLICABLE" ? (
                  <div className="mt-2">
                    <StatusBadge variant={baselineStatusVariants[row.baselineStatus]}>
                      {baselineStatusLabels[row.baselineStatus]}
                    </StatusBadge>
                  </div>
                ) : null}
                {row.reason ? <p className="mt-1 text-xs leading-5 text-muted">{row.reason}</p> : null}
                {row.requirementGatedFields.length > 0 ? (
                  <p className="mt-1 text-xs leading-5 text-muted">
                    ตรวจพบเพิ่มเติม: {fieldLabels(row.requirementGatedFields)} (ยังไม่บันทึก)
                  </p>
                ) : null}
                {row.patientClassification.sourceClassification &&
                row.patientClassification.status !==
                  "CLASSIFICATION_CHANGE_REQUIRES_CONFIRMATION" ? (
                  <p className="mt-1 text-xs leading-5 text-muted">
                    สถานะผู้ป่วยจากไฟล์: {getPatientClassificationLabel(row.patientClassification.sourceClassification)}
                  </p>
                ) : null}
                {row.patientClassification.status ===
                  "CLASSIFICATION_CHANGE_REQUIRES_CONFIRMATION" ? (
                  <div className="mt-3 rounded-control border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
                    <p className="font-semibold">สถานะปัจจุบันของผู้ป่วยแตกต่างจากไฟล์</p>
                    <p className="mt-1">
                      สถานะเดิม: {getPatientClassificationLabel(row.patientClassification.currentClassification)}
                    </p>
                    <p>
                      สถานะจากไฟล์: {getPatientClassificationLabel(row.patientClassification.sourceClassification)}
                    </p>
                    {reconciliationByRow.has(row.rowNumber) ? (
                      <label className="mt-2 flex items-start gap-2 font-normal">
                        <input
                          checked={selectedReconciliationRows.has(row.rowNumber)}
                          className="mt-1 size-4 accent-brand-strong"
                          onChange={(event) =>
                            onToggleReconciliation(row.rowNumber, event.currentTarget.checked)
                          }
                          type="checkbox"
                        />
                        <span>
                          ยืนยันเปลี่ยนสถานะผู้ป่วยรายนี้เป็น “
                          {getPatientClassificationLabel(row.patientClassification.sourceClassification)}”
                        </span>
                      </label>
                    ) : null}
                  </div>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PreviewFileSummary({ preview }: { preview: PatientImportPreview }): React.JSX.Element {
  const file = preview.file;
  const rows = preview.rows;
  const ready = rows.filter((row) => row.classification === "READY").length;
  const existing = rows.filter((row) => row.classification === "ALREADY_EXISTS").length;
  const invalid = rows.filter((row) => row.classification === "INVALID").length;
  const conflicts = rows.filter((row) => row.classification === "CONFLICT").length;
  const needsReview = rows.filter((row) => row.classification === "NEEDS_REVIEW").length;
  const hospitalMismatch = rows.filter((row) => row.classification === "HOSPITAL_MISMATCH").length;
  const baselineReady = rows.filter((row) => row.baselineStatus === "BASELINE_READY").length;
  const baselineExisting = rows.filter(
    (row) => row.baselineStatus === "BASELINE_ALREADY_EXISTS",
  ).length;
  const baselineConflicts = rows.filter((row) => row.baselineStatus === "BASELINE_CONFLICT").length;
  const baselineInvalid = rows.filter(
    (row) =>
      row.baselineStatus === "BASELINE_DATA_INVALID" ||
      row.baselineStatus === "BASELINE_DATE_REQUIRED",
  ).length;
  const classificationReady = rows.filter(
    (row) => row.patientClassification.status === "CLASSIFICATION_READY",
  ).length;
  const classificationExisting = rows.filter(
    (row) => row.patientClassification.status === "CLASSIFICATION_ALREADY_EXISTS",
  ).length;
  const classificationConflicts = rows.filter(
    (row) =>
      row.patientClassification.status === "CLASSIFICATION_CHANGE_REQUIRES_CONFIRMATION",
  ).length;
  const classificationInvalid = rows.filter(
    (row) => row.patientClassification.status === "CLASSIFICATION_DATA_INVALID",
  ).length;

  return (
    <div className="rounded-panel border border-border bg-surface-muted p-4 text-sm leading-6">
      <h3 className="font-semibold text-ink">สรุปผลการตรวจไฟล์</h3>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        <div><dt className="text-muted">แถวผู้ป่วยที่พบ</dt><dd className="font-semibold">{rows.length}</dd></div>
        <div><dt className="text-muted">พร้อมนำเข้า</dt><dd className="font-semibold">{ready}</dd></div>
        <div><dt className="text-muted">มีอยู่แล้ว</dt><dd className="font-semibold">{existing}</dd></div>
        <div><dt className="text-muted">ไม่ถูกต้อง</dt><dd className="font-semibold">{invalid}</dd></div>
        <div><dt className="text-muted">ขัดแย้ง</dt><dd className="font-semibold">{conflicts}</dd></div>
        <div><dt className="text-muted">ต้องตรวจสอบ</dt><dd className="font-semibold">{needsReview + hospitalMismatch}</dd></div>
      </dl>
      <div className="mt-4 border-t border-border pt-4">
        <p className="font-semibold text-ink">ข้อมูลตั้งต้นของทั้งไฟล์</p>
        <p className="mt-1 text-muted">
          วันที่มีผลร่วมกันทุกแถว: {preview.effectiveDate ?? "ยังไม่ได้ระบุ"}
        </p>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
          <div><dt className="text-muted">พร้อมบันทึก</dt><dd className="font-semibold">{baselineReady}</dd></div>
          <div><dt className="text-muted">มีอยู่แล้ว</dt><dd className="font-semibold">{baselineExisting}</dd></div>
          <div><dt className="text-muted">ขัดแย้ง</dt><dd className="font-semibold">{baselineConflicts}</dd></div>
          <div><dt className="text-muted">ไม่ถูกต้อง/ขาดวันที่</dt><dd className="font-semibold">{baselineInvalid}</dd></div>
        </dl>
        {preview.baselineDateRequired ? (
          <p className="mt-3 font-semibold text-danger">
            ต้องระบุวันที่ข้อมูลตั้งต้นก่อนยืนยันนำเข้า วันที่นี้จะใช้กับข้อมูลตั้งต้นทุกแถวในไฟล์
          </p>
        ) : null}
      </div>
      <div className="mt-4 border-t border-border pt-4">
        <p className="font-semibold text-ink">สถานะปัจจุบันของผู้ป่วย</p>
        <p className="mt-1 text-muted">
          สถานะนี้เป็นสถานะปัจจุบันของผู้ป่วยและใช้ร่วมกันทุกโรงพยาบาลที่ดูแลผู้ป่วยรายนี้
        </p>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          <div><dt className="text-muted">พร้อมบันทึก</dt><dd className="font-semibold">{classificationReady}</dd></div>
          <div><dt className="text-muted">ตรงกับปัจจุบัน</dt><dd className="font-semibold">{classificationExisting}</dd></div>
          <div><dt className="text-muted">ต้องยืนยันการเปลี่ยน</dt><dd className="font-semibold">{classificationConflicts}</dd></div>
          <div><dt className="text-muted">ค่าไม่ถูกต้อง</dt><dd className="font-semibold">{classificationInvalid}</dd></div>
        </dl>
        {classificationConflicts > 0 ? (
          <p className="mt-3 font-semibold text-amber-900" role="alert">
            กรุณาติ๊กยืนยันเป็นรายแถวสำหรับสถานะที่แตกต่างก่อนนำเข้า ระบบจะไม่เปลี่ยนสถานะโดยอัตโนมัติ
          </p>
        ) : null}
      </div>
      <div className="mt-4 border-t border-border pt-4">
        <p className="font-semibold text-ink">ข้อมูลที่จะนำเข้าในขั้นตอนนี้</p>
        <p className="mt-1 text-muted">
          เลขบัตรประชาชน ชื่อ นามสกุล HN (ถ้ามี) และข้อมูลตั้งต้นที่รองรับ ได้แก่ น้ำหนัก (kg)
          ส่วนสูง (cm) รอบเอว (cm) DTX (mg/dL) HbA1c (%) และสถานะผู้ป่วยที่รองรับ
        </p>
      </div>
      {file?.requirementGatedFields.length ? (
        <div className="mt-4 border-t border-border pt-4">
          <p className="font-semibold text-ink">ข้อมูลที่ตรวจพบ แต่ยังไม่ถูกบันทึกเนื่องจากรอยืนยัน Requirement</p>
          <p className="mt-1 text-muted">{fieldLabels(file.requirementGatedFields)}</p>
        </div>
      ) : null}
      {file && (file.unknownHeaders.length > 0 || file.ambiguousHeaders.length > 0) ? (
        <div className="mt-4 border-t border-border pt-4">
          <p className="font-semibold text-ink">ข้อมูลที่ระบบไม่สามารถตีความได้ / ต้องตรวจสอบ</p>
          {file.ambiguousHeaders.length > 0 ? <p className="mt-1 text-muted">หัวตารางกำกวม: {file.ambiguousHeaders.join(", ")}</p> : null}
          {file.unknownHeaders.length > 0 ? <p className="mt-1 text-muted">หัวตารางที่ยังไม่รู้จัก: {file.unknownHeaders.join(", ")}</p> : null}
        </div>
      ) : null}
      {file ? <p className="mt-4 text-xs text-muted">แผ่นงานที่เลือก: {file.worksheetName} · แถวหัวตาราง: {file.headerRowNumber}</p> : null}
    </div>
  );
}

function ImportSummary({ summary }: { summary: PatientImportResultSummary }): React.JSX.Element {
  const attentionRows = summary.rows.filter((row) => row.result !== "IMPORTED");
  const hasAttentionRows = attentionRows.length > 0;

  return (
    <Alert variant={hasAttentionRows ? "warning" : "success"}>
      <p className="font-semibold">{hasAttentionRows ? "นำเข้าข้อมูลเสร็จแล้ว มีบางแถวต้องตรวจสอบ" : "นำเข้าข้อมูลเสร็จแล้ว"}</p>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        <div><dt className="text-muted">เพิ่มใหม่</dt><dd className="font-semibold">{summary.imported}</dd></div>
        <div><dt className="text-muted">มีอยู่แล้ว</dt><dd className="font-semibold">{summary.alreadyExists}</dd></div>
        <div><dt className="text-muted">ซ้ำในไฟล์</dt><dd className="font-semibold">{summary.duplicateInFile}</dd></div>
        <div><dt className="text-muted">ไม่ถูกต้อง</dt><dd className="font-semibold">{summary.invalid}</dd></div>
        <div><dt className="text-muted">ขัดแย้ง</dt><dd className="font-semibold">{summary.conflict}</dd></div>
        <div><dt className="text-muted">ต้องตรวจสอบ</dt><dd className="font-semibold">{summary.needsReview + summary.hospitalMismatch + summary.unsupportedRequirement}</dd></div>
        <div><dt className="text-muted">ล้มเหลว</dt><dd className="font-semibold">{summary.failed}</dd></div>
        <div><dt className="text-muted">สร้างข้อมูลตั้งต้น</dt><dd className="font-semibold">{summary.baselineCreated}</dd></div>
        <div><dt className="text-muted">ข้อมูลตั้งต้นมีอยู่แล้ว</dt><dd className="font-semibold">{summary.baselineAlreadyExists}</dd></div>
        <div><dt className="text-muted">ข้อมูลตั้งต้นขัดแย้ง</dt><dd className="font-semibold">{summary.baselineConflict}</dd></div>
        <div><dt className="text-muted">สร้างสถานะผู้ป่วย</dt><dd className="font-semibold">{summary.classificationCreated}</dd></div>
        <div><dt className="text-muted">สถานะตรงกับปัจจุบัน</dt><dd className="font-semibold">{summary.classificationAlreadyExists}</dd></div>
        <div><dt className="text-muted">เปลี่ยนสถานะผู้ป่วย</dt><dd className="font-semibold">{summary.classificationChanged}</dd></div>
        <div><dt className="text-muted">สถานะต้องตรวจสอบ</dt><dd className="font-semibold">{summary.classificationNeedsReview}</dd></div>
        <div><dt className="text-muted">สถานะไม่ถูกต้อง</dt><dd className="font-semibold">{summary.classificationInvalid}</dd></div>
      </dl>
      {hasAttentionRows ? (
        <div className="mt-5 border-t border-amber-200 pt-4">
          <h3 className="font-semibold">แถวที่ต้องตรวจสอบ</h3>
          <div className="mt-3 overflow-x-auto rounded-panel border border-border bg-surface">
            <table className="min-w-full divide-y divide-line text-left text-sm">
              <thead className="bg-canvas text-xs font-semibold text-muted">
                <tr>
                  <th className="whitespace-nowrap px-3 py-3" scope="col">แถว</th>
                  <th className="whitespace-nowrap px-3 py-3" scope="col">เลขบัตรประชาชน</th>
                  <th className="whitespace-nowrap px-3 py-3" scope="col">ชื่อ-นามสกุล</th>
                  <th className="whitespace-nowrap px-3 py-3" scope="col">HN</th>
                  <th className="whitespace-nowrap px-3 py-3" scope="col">ผลลัพธ์</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {attentionRows.map((row) => (
                  <tr key={row.rowNumber}>
                    <td className="whitespace-nowrap px-3 py-3 text-muted">{row.rowNumber}</td>
                    <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-muted">{row.identityDisplay}</td>
                    <td className="max-w-56 break-words px-3 py-3 font-semibold text-ink">
                      {[row.givenName, row.familyName].filter(Boolean).join(" ") || row.combinedNameText || "ไม่ระบุชื่อ"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-muted">{row.hospitalNumber ?? "-"}</td>
                    <td className="min-w-52 px-3 py-3">
                      <StatusBadge variant={importResultVariants[row.result]}>
                        {importResultLabels[row.result]}
                      </StatusBadge>
                      {row.reason ? <p className="mt-1 text-xs leading-5 text-muted">{row.reason}</p> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="mt-4 border-t border-success/20 pt-4 text-muted">ทุกแถวที่ส่งเข้าระบบบันทึกสำเร็จ</p>
      )}
      <p className="mt-4 border-t border-border pt-4 text-muted">
        ระบบบันทึกข้อมูลผู้ป่วยหลัก สถานะผู้ป่วย และข้อมูลตั้งต้นที่มีค่าจาก roster ตามวันที่มีผลร่วมกันของไฟล์
      </p>
      {summary.file?.requirementGatedFields.length ? (
        <p className="mt-1 text-muted">
          ตรวจพบคอลัมน์เพิ่มเติมแต่ยังไม่ถูกบันทึก: {fieldLabels(summary.file.requirementGatedFields)}
        </p>
      ) : null}
      <Link
        className="mt-5 inline-flex min-h-10 items-center font-semibold text-brand-strong underline decoration-brand-soft underline-offset-4 hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
        href={`/app/patients?hospitalId=${encodeURIComponent(summary.targetHospitalId)}`}
      >
        เปิดรายชื่อผู้ป่วยในโรงพยาบาลนี้
      </Link>
    </Alert>
  );
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
    setFileInputKey((current) => current + 1);
  }, [selectedHospitalId]);

  const hasImportableRows =
    previewState.status === "SUCCESS" &&
    previewState.preview.rows.some(
      (row) =>
        row.classification === "READY" ||
        row.classification === "ALREADY_EXISTS" ||
        (row.classification === "NEEDS_REVIEW" &&
          selectedClassificationReconciliationRows.has(row.rowNumber)),
    );

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
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>): void {
    invalidateImportPreview();
    setSelectedFile(event.currentTarget.files?.[0] ?? null);
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

    if (!previewIsCurrent || previewState.status !== "SUCCESS" || !selectedFile) {
      return;
    }

    const requestVersion = importContextVersion.current;
    const file = selectedFile;
    const preview = previewState.preview;
    const classificationReconciliationChoices = preview.classificationReconciliations.filter(
      ({ rowNumber }) => selectedClassificationReconciliationRows.has(rowNumber),
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

  function changeHospital(hospitalId: string): void {
    importContextVersion.current += 1;
    setSelectedFile(null);
    setPreviewFile(null);
    setEffectiveDate("");
    setPreviewState(initialPatientImportPreviewActionState);
    setImportState(initialPatientImportActionState);
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
          <div className="mt-6">
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
                  รองรับไฟล์ Excel รูปแบบ roster ที่มีคอลัมน์หลายรูปแบบ โดยระบบจะบันทึกข้อมูลผู้ป่วยหลักและข้อมูลตั้งต้นที่ยืนยันแล้ว ไม่เกิน 500 แถวและ 64 คอลัมน์
                </p>
              </div>
              <form className="mt-6 space-y-4" encType="multipart/form-data" onSubmit={handlePreview}>
                <input name="targetHospitalId" type="hidden" value={selectedHospitalId} />
                <label className="block space-y-2 text-sm font-semibold" htmlFor="patient-import-effective-date">
                  <span>
                    ข้อมูลตั้งต้น ณ วันที่{" "}
                    <span className="font-normal text-muted">(ใช้กับข้อมูลตั้งต้นทุกแถวในไฟล์)</span>
                  </span>
                  <Input
                    aria-describedby="patient-import-effective-date-help"
                    id="patient-import-effective-date"
                    name="effectiveDate"
                    onChange={(event) => {
                      invalidateImportPreview();
                      setEffectiveDate(event.target.value);
                    }}
                    readOnly={previewPending || importPending}
                    type="date"
                    value={effectiveDate}
                  />
                  <span className="text-xs font-normal leading-5 text-muted" id="patient-import-effective-date-help">
                    ไม่ใช่เวลาที่อัปโหลดไฟล์ หากไฟล์มีข้อมูลตั้งต้นที่รองรับ ต้องระบุวันที่นี้ก่อนยืนยันนำเข้า
                  </span>
                </label>
                <label className="block space-y-2 text-sm font-semibold" htmlFor="patient-import-file">
                  <span>ไฟล์ Excel (.xlsx)</span>
                  <input
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="block min-h-12 w-full rounded-control border border-border bg-surface px-3 py-3 text-sm font-normal file:mr-3 file:rounded-control file:border-0 file:bg-brand-soft file:px-3 file:py-2 file:font-semibold file:text-brand-strong focus:outline-none focus:ring-4 focus:ring-focus-ring"
                    id="patient-import-file"
                    key={fileInputKey}
                    name="file"
                    onChange={handleFileChange}
                    required
                    type="file"
                  />
                </label>
                {selectedFile ? <p className="text-xs leading-5 text-muted">ไฟล์ที่เลือก: {selectedFile.name}</p> : null}
                <p className="text-xs leading-5 text-muted">
                  ระบบจะอ่านแถวข้อมูล ตรวจซ้ำและตรวจความขัดแย้งก่อนยืนยันนำเข้า โดยไม่รับรหัสอ้างอิงโรงพยาบาลจากไฟล์
                </p>
                {previewState.status === "ERROR" ? <Alert className="mt-2" variant="danger">{previewState.message}</Alert> : null}
                <Button className="w-full" disabled={previewPending || importPending} loading={previewPending} type="submit" variant="secondary">
                  {previewPending ? "กำลังตรวจสอบไฟล์..." : "ตรวจสอบและแสดงตัวอย่าง"}
                </Button>
                {previewState.status === "SUCCESS" ? (
                  <>
                    <div className="space-y-3">
                      <div>
                        <h3 className="text-base font-semibold">ตัวอย่างผลตรวจสอบ</h3>
                        <p className="mt-1 text-sm leading-6 text-muted">ตัวอย่างนี้ผูกกับไฟล์ โรงพยาบาล วันที่ข้อมูลตั้งต้น และรูปแบบนำเข้า หากเปลี่ยนอย่างใดอย่างหนึ่งต้องตรวจสอบใหม่</p>
                        <p className="mt-1 text-sm leading-6 text-muted">ยืนยันแล้วระบบจะประมวลผลและบันทึกแต่ละแถวแยกกัน สถานะที่แตกต่างต้องติ๊กยืนยันเป็นรายแถว</p>
                      </div>
                      <PreviewFileSummary preview={previewState.preview} />
                      <PreviewTable
                        onToggleReconciliation={toggleClassificationReconciliation}
                        reconciliations={previewState.preview.classificationReconciliations}
                        rows={previewState.preview.rows}
                        selectedReconciliationRows={selectedClassificationReconciliationRows}
                      />
                    </div>
                    {importState.status === "ERROR" ? <Alert className="mt-2" variant="danger">{importState.message}</Alert> : null}
                    {importState.status === "SUCCESS" ? <ImportSummary summary={importState.summary} /> : null}
                    <Button className="w-full" disabled={!previewIsCurrent || !hasImportableRows || previewState.preview.baselineDateRequired || importPending || previewPending} loading={importPending} onClick={handleImport} type="button">
                      {importPending ? "กำลังนำเข้า..." : "ยืนยันนำเข้ารายการที่พร้อม"}
                    </Button>
                  </>
                ) : null}
              </form>
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}
