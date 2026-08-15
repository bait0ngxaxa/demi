"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";

import type {
  PatientImportClassification,
  PatientImportPreviewRow,
  PatientImportResultSummary,
  PatientProvisioningScope,
} from "@/modules/patient-provisioning/services/patient-provisioning-service";
import {
  confirmPatientImportAction,
  previewPatientImportAction,
  provisionPatientAction,
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

const classificationLabels: Record<PatientImportClassification, string> = {
  READY: "พร้อมนำเข้า",
  ALREADY_EXISTS: "มีอยู่แล้ว",
  DUPLICATE_IN_FILE: "ซ้ำในไฟล์",
  INVALID: "ข้อมูลไม่ถูกต้อง",
  CONFLICT: "ข้อมูลขัดแย้ง",
};

const classificationClasses: Record<PatientImportClassification, string> = {
  READY: "bg-success-soft text-success",
  ALREADY_EXISTS: "bg-canvas text-muted",
  DUPLICATE_IN_FILE: "bg-amber-50 text-amber-950",
  INVALID: "bg-danger/10 text-danger",
  CONFLICT: "bg-danger/10 text-danger",
};

function fieldError(
  state: PatientProvisionActionState,
  field: "nationalId" | "givenName" | "familyName" | "hospitalNumber",
): string | null {
  return state.status === "ERROR" ? state.fieldErrors?.[field] ?? null : null;
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
      <div className="rounded-[12px] border border-line bg-canvas px-4 py-4 text-sm leading-6 text-ink" role="status">
        <p className="font-semibold">ผู้ป่วยรายนี้มีข้อมูลในโรงพยาบาลแล้ว</p>
        <p className="mt-1 text-muted">ระบบไม่สร้างข้อมูลซ้ำ และไม่เปลี่ยนแปลงบัญชีเดิม</p>
      </div>
    );
  }

  const accountMessage =
    state.result.accountStatus === "ACTIVE"
      ? "เชื่อมกับบัญชี DEMI ที่เปิดใช้งานอยู่แล้ว โดยคงสถานะและการยืนยันตัวตนเดิมไว้"
      : "สร้างข้อมูลผู้ป่วยแล้ว บัญชีอยู่ในสถานะรอเปิดใช้งานและยังเข้าสู่ระบบไม่ได้";

  return (
    <div className="rounded-[12px] border border-success/20 bg-success-soft px-4 py-4 text-sm leading-6 text-ink" role="status">
      <p className="font-semibold">เพิ่มข้อมูลผู้ป่วยเรียบร้อยแล้ว</p>
      <p className="mt-1 text-muted">{accountMessage}</p>
      <p className="mt-1 text-muted">ระบบไม่ได้สร้างหรือแสดงรหัสผ่านให้ผู้ดำเนินการ</p>
    </div>
  );
}

function PreviewTable({ rows }: { rows: PatientImportPreviewRow[] }): React.JSX.Element {
  if (rows.length === 0) {
    return (
      <p className="rounded-[12px] border border-dashed border-line bg-canvas px-4 py-8 text-center text-sm leading-6 text-muted">
        ไม่พบแถวข้อมูลที่พร้อมตรวจสอบในไฟล์นี้
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[12px] border border-line">
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
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${classificationClasses[row.classification]}`}>
                  {classificationLabels[row.classification]}
                </span>
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
  return (
    <div className="rounded-[12px] border border-success/20 bg-success-soft px-4 py-4 text-sm leading-6 text-ink" role="status">
      <p className="font-semibold">นำเข้าข้อมูลเสร็จแล้ว</p>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        <div><dt className="text-muted">เพิ่มใหม่</dt><dd className="font-semibold">{summary.imported}</dd></div>
        <div><dt className="text-muted">มีอยู่แล้ว</dt><dd className="font-semibold">{summary.alreadyExists}</dd></div>
        <div><dt className="text-muted">ซ้ำในไฟล์</dt><dd className="font-semibold">{summary.duplicateInFile}</dd></div>
        <div><dt className="text-muted">ไม่ถูกต้อง</dt><dd className="font-semibold">{summary.invalid}</dd></div>
        <div><dt className="text-muted">ขัดแย้ง</dt><dd className="font-semibold">{summary.conflict}</dd></div>
        <div><dt className="text-muted">ล้มเหลว</dt><dd className="font-semibold">{summary.failed}</dd></div>
      </dl>
    </div>
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
  const [previewState, previewAction, previewPending] = useActionState<
    PatientImportPreviewActionState,
    FormData
  >(previewPatientImportAction, initialPatientImportPreviewActionState);
  const [importState, importAction, importPending] = useActionState<
    PatientImportActionState,
    FormData
  >(confirmPatientImportAction, initialPatientImportActionState);
  const [fileName, setFileName] = useState<string | null>(null);

  const hasReadyRows =
    previewState.status === "SUCCESS" &&
    previewState.preview.rows.some(
      (row) => row.classification === "READY" || row.classification === "ALREADY_EXISTS",
    );

  function changeHospital(hospitalId: string): void {
    router.push(`/app/patients/provision?hospitalId=${encodeURIComponent(hospitalId)}`);
  }

  return (
    <main className="min-h-svh bg-canvas text-ink">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex w-full max-w-7xl items-start justify-between gap-6 px-5 py-5 sm:items-center sm:px-8 lg:px-10">
          <div>
            <a
              className="text-sm font-semibold text-brand-strong underline decoration-brand-soft underline-offset-4 hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
              href="/app"
            >
              ← กลับไปพื้นที่ทำงาน
            </a>
            <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">เพิ่มผู้ป่วย</h1>
            <p className="mt-2 max-w-2xl text-base leading-7 text-muted">
              สร้างข้อมูลผู้ป่วยในระบบโดยไม่สร้างบัญชีซ้ำ และไม่ต้องใช้รหัสผ่านจากผู้ดำเนินการ
            </p>
          </div>
          <span className="hidden rounded-full bg-brand-soft px-3 py-1.5 text-xs font-semibold text-brand-strong sm:inline-flex">
            patient:provision
          </span>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8 sm:py-12 lg:px-10">
        <section className="rounded-[16px] border border-line bg-white p-5 sm:p-7">
          {scopes.length > 1 ? (
            <>
              <label className="block text-sm font-semibold text-ink" htmlFor="targetHospitalId">
                โรงพยาบาลที่ดำเนินการ
              </label>
              <select
                className="mt-2 h-12 w-full max-w-xl rounded-[12px] border border-line bg-white px-4 text-base text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft"
                id="targetHospitalId"
                onChange={(event) => changeHospital(event.target.value)}
                value={selectedHospitalId}
              >
                {scopes.map((scope) => (
                  <option key={scope.hospitalId} value={scope.hospitalId}>
                    {scope.hospitalName} · {scope.hospitalCode}
                  </option>
                ))}
              </select>
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
            ขอบเขตโรงพยาบาลและสิทธิ์ patient:provision ตรวจสอบจากข้อมูลฝั่งเซิร์ฟเวอร์ทุกครั้ง
          </p>
        </section>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <section className="rounded-[16px] border border-line bg-white p-5 sm:p-7">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.02em]">เพิ่มผู้ป่วยรายบุคคล</h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                ใช้ข้อมูลขั้นต่ำเพื่อสร้าง PatientProfile และความสัมพันธ์กับโรงพยาบาลนี้
              </p>
            </div>
            <form action={provisionAction} className="mt-6 space-y-4">
              <input name="targetHospitalId" type="hidden" value={selectedHospitalId} />
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-sm font-semibold">
                  <span>ชื่อ</span>
                  <input className="h-12 w-full rounded-[12px] border border-line px-4 font-normal outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft" name="givenName" required type="text" />
                  {fieldError(provisionState, "givenName") ? <span className="block text-xs font-normal text-danger">{fieldError(provisionState, "givenName")}</span> : null}
                </label>
                <label className="space-y-2 text-sm font-semibold">
                  <span>นามสกุล</span>
                  <input className="h-12 w-full rounded-[12px] border border-line px-4 font-normal outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft" name="familyName" required type="text" />
                  {fieldError(provisionState, "familyName") ? <span className="block text-xs font-normal text-danger">{fieldError(provisionState, "familyName")}</span> : null}
                </label>
              </div>
              <label className="block space-y-2 text-sm font-semibold">
                <span>เลขบัตรประชาชน</span>
                <input className="h-12 w-full rounded-[12px] border border-line px-4 font-normal outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft" inputMode="numeric" maxLength={13} name="nationalId" pattern="[0-9]{13}" required type="text" />
                {fieldError(provisionState, "nationalId") ? <span className="block text-xs font-normal text-danger">{fieldError(provisionState, "nationalId")}</span> : null}
              </label>
              <label className="block space-y-2 text-sm font-semibold">
                <span>HN <span className="font-normal text-muted">(ไม่บังคับ)</span></span>
                <input className="h-12 w-full rounded-[12px] border border-line px-4 font-normal outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft" maxLength={64} name="hospitalNumber" type="text" />
                {fieldError(provisionState, "hospitalNumber") ? <span className="block text-xs font-normal text-danger">{fieldError(provisionState, "hospitalNumber")}</span> : null}
              </label>
              {provisionState.status === "ERROR" ? <p className="text-sm leading-6 text-danger" role="alert">{provisionState.message}</p> : null}
              <ProvisionResult state={provisionState} />
              <button className="flex h-12 w-full items-center justify-center rounded-[12px] bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft disabled:cursor-not-allowed disabled:bg-brand-muted" disabled={provisionPending} type="submit">
                {provisionPending ? "กำลังบันทึก..." : "เพิ่มผู้ป่วย"}
              </button>
            </form>
          </section>

          {selectedScope.canBulkImport ? (
            <section className="rounded-[16px] border border-line bg-white p-5 sm:p-7">
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.02em]">นำเข้าผู้ป่วยจาก Excel</h2>
                <p className="mt-2 text-sm leading-6 text-muted">
                  ใช้คอลัมน์ Thai National ID, First name, Last name และ HN (ถ้ามี) รองรับไม่เกิน 500 แถว
                </p>
              </div>
              <form action={previewAction} className="mt-6 space-y-4" encType="multipart/form-data">
                <input name="targetHospitalId" type="hidden" value={selectedHospitalId} />
                <label className="block space-y-2 text-sm font-semibold" htmlFor="patient-import-file">
                  <span>ไฟล์ Excel (.xlsx)</span>
                  <input
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="block min-h-12 w-full rounded-[12px] border border-line bg-white px-3 py-3 text-sm font-normal file:mr-3 file:rounded-[8px] file:border-0 file:bg-brand-soft file:px-3 file:py-2 file:font-semibold file:text-brand-strong focus:outline-none focus:ring-4 focus:ring-brand-soft"
                    id="patient-import-file"
                    name="file"
                    onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
                    required
                    type="file"
                  />
                </label>
                {fileName ? <p className="text-xs leading-5 text-muted">ไฟล์ที่เลือก: {fileName}</p> : null}
                <p className="text-xs leading-5 text-muted">
                  ระบบจะอ่านแถวข้อมูล ตรวจซ้ำและตรวจความขัดแย้งก่อนยืนยันนำเข้า โดยไม่รับ Hospital ID จากไฟล์
                </p>
                {previewState.status === "ERROR" ? <p className="text-sm leading-6 text-danger" role="alert">{previewState.message}</p> : null}
                <button className="flex h-12 w-full items-center justify-center rounded-[12px] border border-brand px-4 text-sm font-semibold text-brand-strong transition hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft disabled:cursor-not-allowed disabled:opacity-60" disabled={previewPending || importPending} type="submit">
                  {previewPending ? "กำลังตรวจสอบไฟล์..." : "ตรวจสอบและแสดงตัวอย่าง"}
                </button>
                {previewState.status === "SUCCESS" ? (
                  <>
                    <div className="space-y-3">
                      <div>
                        <h3 className="text-base font-semibold">ตัวอย่างผลตรวจสอบ</h3>
                        <p className="mt-1 text-sm leading-6 text-muted">ยืนยันแล้วระบบจะประมวลผลทีละแถว แต่ละแถวมี transaction แยกกัน</p>
                      </div>
                      <PreviewTable rows={previewState.preview.rows} />
                    </div>
                    {importState.status === "ERROR" ? <p className="text-sm leading-6 text-danger" role="alert">{importState.message}</p> : null}
                    {importState.status === "SUCCESS" ? <ImportSummary summary={importState.summary} /> : null}
                    <button className="flex h-12 w-full items-center justify-center rounded-[12px] bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft disabled:cursor-not-allowed disabled:bg-brand-muted" disabled={!hasReadyRows || importPending || previewPending} formAction={importAction} type="submit">
                      {importPending ? "กำลังนำเข้า..." : "ยืนยันนำเข้ารายการที่พร้อม"}
                    </button>
                  </>
                ) : null}
              </form>
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
}
