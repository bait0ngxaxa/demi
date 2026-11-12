"use client";

import { useActionState, useId, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { PATIENT_HOSPITAL_RELATIONSHIP_REOPEN_REASON_MAX_LENGTH } from "@/modules/patient-hospital-relationship/schemas/patient-hospital-relationship-reopen-schemas";
import {
  previewPatientCareReopenAction,
  reopenPatientCareAction,
  type PatientCareReopenPreviewState,
  type PatientCareReopenState,
} from "@/modules/patient-hospital-relationship/transport/reopen-actions";

const control = "mt-2 min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring disabled:bg-surface-muted";

function formatEndedAt(value: string): string {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(value));
}

/** ADR-0032: a platform ADMIN reopens a Patient's ended care with this Hospital after confirming the masked name. */
export function PatientCareReopenSection({ hospitalId }: { hospitalId: string }): React.JSX.Element {
  const id = useId();
  const [nationalId, setNationalId] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const [preview, previewAction, previewPending] = useActionState<PatientCareReopenPreviewState, FormData>(
    previewPatientCareReopenAction.bind(null, hospitalId),
    { status: "IDLE" },
  );
  const [result, reopenAction, reopenPending] = useActionState<PatientCareReopenState, FormData>(
    reopenPatientCareAction.bind(null, hospitalId),
    { status: "IDLE" },
  );
  const [confirmedPreview, setConfirmedPreview] = useState<PatientCareReopenPreviewState | null>(null);
  const [lookedUpNationalId, setLookedUpNationalId] = useState<string | null>(null);
  const reopened = result.status === "REOPENED";
  // A lookup result belongs to the national ID it was made for; editing the ID returns to the first step.
  const found = preview.status === "FOUND" && lookedUpNationalId === nationalId.trim();
  const confirming = found && confirmedPreview === preview && !reopened;
  const locked = previewPending || reopenPending || reopened || confirming;

  return (
    <section aria-labelledby={`${id}-heading`}>
      <Panel>
        <h2 className="text-xl font-semibold tracking-[-0.02em]" id={`${id}-heading`}>
          เปิดการดูแลผู้ป่วยที่สิ้นสุดแล้วกลับมา
        </h2>
        <p className="mt-2 text-sm leading-6 text-text-muted">
          ใช้เมื่อแอดมินโรงพยาบาลสิ้นสุดการดูแลผู้ป่วยผิดพลาด หรือผู้ป่วยกลับมารับการดูแลที่โรงพยาบาลนี้ แอดมินโรงพยาบาลยกเลิกการสิ้นสุดเองไม่ได้
        </p>

        <form
          action={(formData) => {
            setConfirmedPreview(null);
            setLookedUpNationalId(nationalId.trim());
            previewAction(formData);
          }}
          className="mt-5 space-y-4"
        >
          <div>
            <label className="text-sm font-semibold text-text" htmlFor={`${id}-national-id`}>เลขบัตรประชาชนของผู้ป่วย</label>
            <input
              autoComplete="off"
              className={control}
              disabled={locked}
              id={`${id}-national-id`}
              inputMode="numeric"
              maxLength={13}
              name="nationalId"
              onChange={(event) => setNationalId(event.target.value)}
              pattern="\d{13}"
              required
              value={nationalId}
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-text" htmlFor={`${id}-reason`}>เหตุผลที่เปิดการดูแลกลับมา</label>
            <textarea
              className={`${control} min-h-24`}
              disabled={locked}
              id={`${id}-reason`}
              maxLength={PATIENT_HOSPITAL_RELATIONSHIP_REOPEN_REASON_MAX_LENGTH}
              name="reopenReason"
              onChange={(event) => setReopenReason(event.target.value)}
              required
              value={reopenReason}
            />
          </div>
          {!confirming && !reopened ? (
            <Button loading={previewPending} size="compact" type="submit" variant="secondary">
              {previewPending ? "กำลังค้นหา…" : "ค้นหาผู้ป่วย"}
            </Button>
          ) : null}
        </form>

        {preview.status === "ERROR" ? <Alert className="mt-4" role="alert" variant="warning">{preview.message}</Alert> : null}

        {found && preview.status === "FOUND" && !confirming && !reopened ? (
          <div className="mt-6 border-t border-border pt-5">
            <p className="text-sm text-text">
              พบ <span className="font-semibold">{preview.maskedName}</span> · สิ้นสุดการดูแลเมื่อ{" "}
              <time dateTime={preview.endedAt}>{formatEndedAt(preview.endedAt)}</time>
            </p>
            <Button className="mt-4" disabled={locked || reopenReason.trim().length === 0} onClick={() => setConfirmedPreview(preview)} size="compact" type="button" variant="secondary">
              ตรวจสอบก่อนเปิดการดูแล
            </Button>
          </div>
        ) : null}

        {confirming && preview.status === "FOUND" ? (
          <form action={reopenAction} className="mt-6 space-y-4 border-t border-border pt-5">
            <input name="nationalId" type="hidden" value={nationalId} />
            <input name="reopenReason" type="hidden" value={reopenReason} />
            <input name="expectedEndedAt" type="hidden" value={preview.endedAt} />
            <p className="text-sm font-semibold text-text">เปิดการดูแล {preview.maskedName} กับโรงพยาบาลนี้อีกครั้ง</p>
            <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-text-muted">
              <li>ผู้ป่วยจะกลับมาอยู่ในรายชื่อผู้ป่วยของโรงพยาบาลนี้ และโปรแกรมที่ยังดำเนินอยู่จะดำเนินต่อ</li>
              <li>ระบบไม่คืนสิ่งอื่น: การมอบหมาย อสม. นัดหมายที่ถูกยกเลิก คำขอบริการที่ถูกปฏิเสธ และลิงก์เปิดใช้งานที่ถูกเพิกถอนยังคงเดิม</li>
              <li>หากผู้ป่วยยังไม่มีบัญชีที่ใช้งานได้และพ้นช่วงที่ลงทะเบียนเองได้แล้ว โรงพยาบาลต้องออกลิงก์เปิดใช้งานให้</li>
              <li>ประวัติการสิ้นสุดการดูแลครั้งก่อนและเหตุผลที่เปิดกลับจะถูกเก็บไว้</li>
            </ul>
            {result.status === "ERROR" ? <Alert role="alert" variant="warning">{result.message}</Alert> : null}
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button className="w-full sm:w-auto" disabled={reopenPending} onClick={() => setConfirmedPreview(null)} size="compact" type="button" variant="secondary">
                ยกเลิก
              </Button>
              <Button className="w-full sm:w-auto" loading={reopenPending} size="compact" type="submit">
                {reopenPending ? "กำลังเปิดการดูแล…" : "ยืนยันเปิดการดูแลอีกครั้ง"}
              </Button>
            </div>
          </form>
        ) : null}

        {reopened ? <Alert className="mt-4" role="status" variant={result.patientAccount === "ACTIVATION_LINK_REQUIRED" || result.patientAccount === "ACCOUNT_SUSPENDED" ? "warning" : "success"}>{result.message}</Alert> : null}
      </Panel>
    </section>
  );
}
