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
import type {
  PatientImportClassification,
  PatientImportPreviewRow,
  PatientImportRowResult,
  PatientImportResultSummary,
  PatientProvisioningScope,
} from "@/modules/patient-provisioning/services/patient-provisioning-service";
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
  type PatientImportPreviewActionState,
  type PatientProvisionActionState,
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
};

const classificationVariants: Record<PatientImportClassification, StatusVariant> = {
  READY: "success",
  ALREADY_EXISTS: "neutral",
  DUPLICATE_IN_FILE: "warning",
  INVALID: "danger",
  CONFLICT: "danger",
};

const importResultLabels: Record<PatientImportRowResult["result"], string> = {
  IMPORTED: "นำเข้าสำเร็จ",
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

function fieldError(
  state: PatientProvisionActionState,
  field: "nationalId" | "givenName" | "familyName" | "hospitalNumber",
): string | null {
  return state.status === "ERROR" ? state.fieldErrors?.[field] ?? null : null;
}

function createPatientImportFormData(file: File, targetHospitalId: string): FormData {
  const formData = new FormData();
  formData.set("targetHospitalId", targetHospitalId);
  formData.set("file", file, file.name);
  return formData;
}

function createPatientImportConfirmFormData(
  file: File,
  targetHospitalId: string,
  previewTargetHospitalId: string,
  fileFingerprint: string,
  previewBinding: string,
): FormData {
  const formData = createPatientImportFormData(file, targetHospitalId);
  formData.set("previewTargetHospitalId", previewTargetHospitalId);
  formData.set("fileFingerprint", fileFingerprint);
  formData.set("previewBinding", previewBinding);
  return formData;
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
        {state.result.accountStatus === "PROVISIONED" ? (
          <Link
            className="mt-3 inline-flex font-semibold text-brand-strong underline decoration-brand-soft underline-offset-4 hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
            href="/app/patients/activation"
          >
            จัดการการเปิดใช้งานบัญชีผู้ป่วย
          </Link>
        ) : null}
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
      {state.result.accountStatus === "PROVISIONED" ? (
        <Link
          className="mt-3 inline-flex font-semibold text-brand-strong underline decoration-brand-soft underline-offset-4 hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
          href="/app/patients/activation"
        >
          จัดการการเปิดใช้งานบัญชีผู้ป่วย
        </Link>
      ) : null}
    </Alert>
  );
}

function PreviewTable({ rows }: { rows: PatientImportPreviewRow[] }): React.JSX.Element {
  if (rows.length === 0) {
    return (
      <p className="rounded-panel border border-dashed border-border bg-surface-muted px-4 py-8 text-center text-sm leading-6 text-text-muted">
        ไม่พบแถวข้อมูลที่พร้อมตรวจสอบในไฟล์นี้
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-panel border border-border">
      <table className="min-w-full divide-y divide-line text-left text-sm">
        <thead className="bg-canvas text-xs font-semibold text-muted">
          <tr>
            <th className="whitespace-nowrap px-3 py-3" scope="col">แถว</th>
            <th className="whitespace-nowrap px-3 py-3" scope="col">ตัวตน</th>
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
                {[row.givenName, row.familyName].filter(Boolean).join(" ") || "ไม่ระบุชื่อ"}
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-muted">{row.hospitalNumber ?? "-"}</td>
              <td className="min-w-44 px-3 py-3">
                <StatusBadge variant={classificationVariants[row.classification]}>
                  {classificationLabels[row.classification]}
                </StatusBadge>
                {row.reason ? <p className="mt-1 text-xs leading-5 text-muted">{row.reason}</p> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
        <div><dt className="text-muted">ล้มเหลว</dt><dd className="font-semibold">{summary.failed}</dd></div>
      </dl>
      {hasAttentionRows ? (
        <div className="mt-5 border-t border-amber-200 pt-4">
          <h3 className="font-semibold">แถวที่ต้องตรวจสอบ</h3>
          <div className="mt-3 overflow-x-auto rounded-panel border border-border bg-surface">
            <table className="min-w-full divide-y divide-line text-left text-sm">
              <thead className="bg-canvas text-xs font-semibold text-muted">
                <tr>
                  <th className="whitespace-nowrap px-3 py-3" scope="col">แถว</th>
                  <th className="whitespace-nowrap px-3 py-3" scope="col">ตัวตน</th>
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
                      {[row.givenName, row.familyName].filter(Boolean).join(" ") || "ไม่ระบุชื่อ"}
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
    setPreviewState(initialPatientImportPreviewActionState);
    setImportState(initialPatientImportActionState);
    setFileInputKey((current) => current + 1);
  }, [selectedHospitalId]);

  const hasReadyRows =
    previewState.status === "SUCCESS" &&
    previewState.preview.rows.some(
      (row) => row.classification === "READY" || row.classification === "ALREADY_EXISTS",
    );

  const previewIsCurrent =
    selectedFile !== null &&
    previewFile === selectedFile &&
    previewState.status === "SUCCESS" &&
    previewState.preview.targetHospitalId === selectedHospitalId;
  const activeMode: ProvisioningMode = selectedScope.canBulkImport ? mode : "SINGLE";

  function invalidateImportPreview(): void {
    importContextVersion.current += 1;
    setPreviewFile(null);
    setPreviewState(initialPatientImportPreviewActionState);
    setImportState(initialPatientImportActionState);
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
        createPatientImportFormData(file, targetHospitalId),
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

    startImportTransition(async () => {
      const result = await confirmPatientImportAction(
        createPatientImportConfirmFormData(
          file,
          selectedHospitalId,
          preview.targetHospitalId,
          preview.fileFingerprint,
          preview.previewBinding,
        ),
      );

      if (requestVersion !== importContextVersion.current) {
        return;
      }

      setImportState(result);
    });
  }

  function changeHospital(hospitalId: string): void {
    importContextVersion.current += 1;
    setSelectedFile(null);
    setPreviewFile(null);
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
            ขอบเขตโรงพยาบาลและสิทธิ์เพิ่มผู้ป่วยตรวจสอบจากข้อมูลฝั่งเซิร์ฟเวอร์ทุกครั้ง
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

        <div className="mt-6 max-w-4xl">
          {activeMode === "SINGLE" ? (
          <Panel>
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
              {provisionState.status === "ERROR" ? <p className="text-sm leading-6 text-danger" role="alert">{provisionState.message}</p> : null}
              <Button className="w-full" disabled={provisionPending} type="submit">
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
                  ใช้คอลัมน์ Thai National ID, First name, Last name และ HN (ถ้ามี) รองรับไม่เกิน 500 แถว
                </p>
              </div>
              <form className="mt-6 space-y-4" encType="multipart/form-data" onSubmit={handlePreview}>
                <input name="targetHospitalId" type="hidden" value={selectedHospitalId} />
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
                {previewState.status === "ERROR" ? <p className="text-sm leading-6 text-danger" role="alert">{previewState.message}</p> : null}
                <Button className="w-full" disabled={previewPending || importPending} type="submit" variant="secondary">
                  {previewPending ? "กำลังตรวจสอบไฟล์..." : "ตรวจสอบและแสดงตัวอย่าง"}
                </Button>
                {previewState.status === "SUCCESS" ? (
                  <>
                    <div className="space-y-3">
                      <div>
                        <h3 className="text-base font-semibold">ตัวอย่างผลตรวจสอบ</h3>
                        <p className="mt-1 text-sm leading-6 text-muted">ตัวอย่างนี้ผูกกับไฟล์และโรงพยาบาลที่เลือก หากเปลี่ยนอย่างใดอย่างหนึ่งต้องตรวจสอบใหม่</p>
                        <p className="mt-1 text-sm leading-6 text-muted">ยืนยันแล้วระบบจะประมวลผลและบันทึกแต่ละแถวแยกกัน</p>
                      </div>
                      <PreviewTable rows={previewState.preview.rows} />
                    </div>
                    {importState.status === "ERROR" ? <p className="text-sm leading-6 text-danger" role="alert">{importState.message}</p> : null}
                    {importState.status === "SUCCESS" ? <ImportSummary summary={importState.summary} /> : null}
                    <Button className="w-full" disabled={!previewIsCurrent || !hasReadyRows || importPending || previewPending} onClick={handleImport} type="button">
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
