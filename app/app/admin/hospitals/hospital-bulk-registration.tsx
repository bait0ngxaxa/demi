"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useMutationActionState } from "@/components/ui/mutation-action-state";
import { notify } from "@/components/ui/notify";
import { Panel } from "@/components/ui/panel";
import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import {
  initialHospitalBulkRegistrationActionState,
  type HospitalBulkRegistrationActionState,
  type HospitalBulkRegistrationPreviewRowState,
} from "@/modules/hospital-service-areas/transport/action-state";
import {
  applyHospitalBulkRegistrationAction,
  previewHospitalBulkRegistrationAction,
} from "@/modules/hospital-service-areas/transport/server-actions";

const rowStatusCopy: Record<HospitalBulkRegistrationPreviewRowState["status"], { label: string; variant: StatusVariant }> = {
  OK: { label: "พร้อมเพิ่ม", variant: "success" },
  INVALID: { label: "ข้อมูลไม่ถูกต้อง", variant: "danger" },
  DUPLICATE_CODE_IN_FILE: { label: "รหัสซ้ำในไฟล์", variant: "danger" },
  CODE_EXISTS: { label: "รหัสนี้มีในระบบแล้ว", variant: "danger" },
  SIMILAR_NAME: { label: "ชื่อใกล้เคียง · ต้องยืนยัน", variant: "warning" },
};

const BLOCKING = new Set<HospitalBulkRegistrationPreviewRowState["status"]>(["INVALID", "DUPLICATE_CODE_IN_FILE", "CODE_EXISTS"]);

function SimilarMatches({ row }: { row: HospitalBulkRegistrationPreviewRowState }): React.JSX.Element | null {
  if (row.similarTo.length === 0) return null;
  return (
    <ul className="mt-1 space-y-0.5 text-xs leading-5 text-text-muted">
      {row.similarTo.map((match, index) => (
        <li key={`${match.source}-${match.hospitalCode ?? "auto"}-${index}`}>
          {match.source === "EXISTING" ? "มีในระบบ: " : "ซ้ำกับแถวอื่นในไฟล์: "}
          {match.name}
          {match.hospitalCode ? ` (${match.hospitalCode})` : ""}
        </li>
      ))}
    </ul>
  );
}

/**
 * O1-A: ADMIN imports Parent Hospitals from a UTF-8 CSV (`name,hospitalCode`). Preview first; apply creates every row
 * as a pending Parent in one transaction or none. The server re-parses and re-evaluates the file at apply.
 */
export function HospitalBulkRegistration({ submissionNonce }: { submissionNonce: string }): React.JSX.Element {
  const router = useRouter();
  const [preview, previewDispatch, previewPending] = useMutationActionState(previewHospitalBulkRegistrationAction, initialHospitalBulkRegistrationActionState);
  const [applied, applyDispatch, applyPending, applyUnknown, resendApply] = useMutationActionState(applyHospitalBulkRegistrationAction, initialHospitalBulkRegistrationActionState);
  const handled = useRef<HospitalBulkRegistrationActionState | null>(null);

  useEffect(() => {
    if (applied === handled.current) return;
    handled.current = applied;
    if (applied.status === "APPLIED") {
      notify.success(applied.replayed ? "ไฟล์นี้ถูกนำเข้าไปแล้ว ไม่ได้เพิ่มซ้ำ" : "เพิ่มโรงพยาบาลแม่ข่ายจากไฟล์แล้ว");
      router.refresh();
    }
  }, [applied, router]);

  // A rejected apply carries the re-evaluated rows; they replace the preview the ADMIN confirmed.
  const current = applied.status === "PREVIEW" && preview.status === "PREVIEW" && applied.csvText === preview.csvText ? applied : preview;
  const rows = current.status === "PREVIEW" ? current.rows : [];
  const blocked = rows.some(({ status }) => BLOCKING.has(status));
  // A preview belongs to the nonce rendered with it; after an apply the refreshed page renders a new nonce.
  const showPreview = current.status === "PREVIEW" && current.submissionNonce === submissionNonce &&
    !(applied.status === "APPLIED" && applied.submissionNonce === current.submissionNonce);

  return (
    <Panel aria-labelledby="bulk-hospital-heading">
      <h2 className="text-xl font-semibold tracking-[-0.02em]" id="bulk-hospital-heading">นำเข้าโรงพยาบาลแม่ข่ายจากไฟล์</h2>
      <p className="mt-2 text-sm leading-6 text-text-muted">
        ไฟล์ .csv แบบ UTF-8 บรรทัดแรกเป็น <code className="rounded bg-surface-muted px-1">name,hospitalCode</code> ไม่เกิน 200 รายการ
        เว้นรหัสว่างเพื่อให้ระบบสร้างให้ ทุกรายการจะเป็นแม่ข่ายในสถานะรอขึ้นทะเบียน รพ.สต. และหน่วยบริการลูกข่ายให้แม่ข่ายสร้างเอง
      </p>
      <form action={previewDispatch} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <input name="submissionNonce" type="hidden" value={submissionNonce} />
        <div className="min-w-0 flex-1">
          <label className="text-sm font-semibold text-text" htmlFor="bulk-hospital-file">ไฟล์ CSV</label>
          <input
            accept=".csv,text/csv"
            className="mt-2 block w-full min-w-0 text-sm text-text file:mr-3 file:min-h-11 file:rounded-control file:border file:border-border-strong file:bg-surface file:px-3 file:font-semibold"
            id="bulk-hospital-file"
            name="file"
            required
            type="file"
          />
        </div>
        <Button disabled={previewPending} loading={previewPending} size="compact" type="submit" variant="secondary">
          {previewPending ? "กำลังตรวจสอบ..." : "ตรวจสอบไฟล์"}
        </Button>
      </form>
      {preview.status === "ERROR" ? <Alert className="mt-3" role="alert" variant="danger">{preview.message}</Alert> : null}

      {showPreview && current.status === "PREVIEW" ? (
        <form action={applyDispatch} className="mt-6">
          <input name="csvText" type="hidden" value={current.csvText} />
          <input name="submissionNonce" type="hidden" value={current.submissionNonce} />
          {current.message ? <Alert className="mb-3" role="alert" variant="warning">{current.message}</Alert> : null}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <caption className="sr-only">ผลตรวจสอบไฟล์ก่อนนำเข้า</caption>
              <thead className="border-b border-border text-text-muted">
                <tr>
                  <th className="py-2 pr-3 font-semibold" scope="col">บรรทัด</th>
                  <th className="py-2 pr-3 font-semibold" scope="col">ชื่อโรงพยาบาล</th>
                  <th className="py-2 pr-3 font-semibold" scope="col">รหัส</th>
                  <th className="py-2 font-semibold" scope="col">ผลตรวจสอบ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.rowNumber}>
                    <td className="py-2 pr-3 align-top tabular-nums">{row.rowNumber}</td>
                    <td className="py-2 pr-3 align-top break-words">{row.name || "-"}<SimilarMatches row={row} /></td>
                    <td className="py-2 pr-3 align-top">{row.hospitalCode ?? <span className="text-text-muted">สร้างอัตโนมัติ</span>}</td>
                    <td className="py-2 align-top">
                      <StatusBadge variant={rowStatusCopy[row.status].variant}>{rowStatusCopy[row.status].label}</StatusBadge>
                      {row.status === "SIMILAR_NAME" ? (
                        <label className="mt-2 flex min-h-11 items-center gap-2 text-sm" htmlFor={`confirm-row-${row.rowNumber}`}>
                          <input id={`confirm-row-${row.rowNumber}`} name="confirmRow" type="checkbox" value={row.rowNumber} />
                          ยืนยันว่าเป็นโรงพยาบาลคนละแห่ง
                        </label>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {blocked ? (
            <p className="mt-3 text-sm text-danger">แก้ไขรายการที่ไม่ถูกต้องในไฟล์แล้วตรวจสอบใหม่ ระบบจะไม่เพิ่มรายการใดจนกว่าไฟล์จะถูกต้องทั้งหมด</p>
          ) : null}
          <Button className="mt-4" disabled={blocked || applyPending || applyUnknown} loading={applyPending} size="compact" type="submit" variant="primary">
            {applyPending ? "กำลังเพิ่ม..." : `เพิ่ม ${rows.length.toLocaleString("th-TH")} แห่ง`}
          </Button>
          {applied.status === "ERROR" ? <Alert className="mt-3" role="alert" variant="danger">{applied.message}</Alert> : null}
          <UnknownOutcomeAlert active={applyUnknown} className="mt-3" recovery={{ kind: "resend", onResend: resendApply, resending: applyPending }} />
        </form>
      ) : null}

      {applied.status === "APPLIED" && !showPreview ? (
        <Alert className="mt-4" variant="success">
          {applied.replayed
            ? "ไฟล์นี้ถูกนำเข้าไปแล้ว ระบบไม่ได้เพิ่มซ้ำ"
            : `เพิ่มโรงพยาบาลแม่ข่าย ${applied.count.toLocaleString("th-TH")} แห่งแล้ว ผู้รับผิดชอบสมัครใช้งานผ่านหน้าขึ้นทะเบียนได้ทันที`}
        </Alert>
      ) : null}
    </Panel>
  );
}
