"use client";

import { useState } from "react";
import { useActionState } from "react";

import { Panel } from "@/components/ui/panel";
import { issuePatientAccountRecoveryAction } from "@/modules/account-security/transport/server-actions";
import {
  initialAccountRecoveryIssueActionState,
  type AccountRecoveryIssueActionState,
} from "@/modules/account-security/transport/action-state";

export function PatientAccountRecoveryPanel({
  relationshipId,
}: {
  relationshipId: string;
}): React.JSX.Element {
  const action = issuePatientAccountRecoveryAction.bind(null, relationshipId);
  const [state, formAction, pending] = useActionState<AccountRecoveryIssueActionState, FormData>(
    action,
    initialAccountRecoveryIssueActionState,
  );
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const handoffLink = state.handoffUrl
    ? typeof window === "undefined"
      ? state.handoffUrl
      : new URL(state.handoffUrl, window.location.origin).toString()
    : null;

  async function copyHandoffLink(): Promise<void> {
    if (!handoffLink) {
      return;
    }

    try {
      await navigator.clipboard.writeText(handoffLink);
      setCopyMessage("คัดลอกลิงก์แล้ว");
    } catch {
      setCopyMessage("คัดลอกอัตโนมัติไม่ได้ กรุณาเลือกและคัดลอกลิงก์ด้วยตนเอง");
    }
  }

  return (
    <section aria-labelledby="patient-account-recovery-heading" className="mt-6">
      <Panel>
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-text" id="patient-account-recovery-heading">
          กู้คืนบัญชีผู้ป่วย
        </h2>
        <p className="mt-2 break-words text-sm leading-6 text-text-muted">
          ใช้หลังจากตรวจสอบตัวตนผู้ป่วยตามกระบวนการช่วยเหลือของโรงพยาบาลแล้วเท่านั้น
          ผู้ป่วยเป็นผู้ตั้งรหัสผ่านใหม่เอง ลิงก์นี้เปลี่ยนรหัสผ่านของบัญชี DEMI เดียวที่ใช้ร่วมกันทุกบทบาทและทุกโรงพยาบาล
        </p>

        <form action={formAction} className="mt-5 grid min-w-0 gap-4">
          <div className="min-w-0">
            <label className="block text-sm font-semibold text-text" htmlFor="nationalId">
              เลขประจำตัวประชาชนของผู้ป่วย
            </label>
            <input
              autoComplete="off"
              className="mt-2 block min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-base text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
              id="nationalId"
              inputMode="numeric"
              maxLength={13}
              name="nationalId"
              required
              type="password"
            />
          </div>
          <div className="min-w-0">
            <label className="block text-sm font-semibold text-text" htmlFor="nationalIdConfirmation">
              ยืนยันเลขประจำตัวประชาชนอีกครั้ง
            </label>
            <input
              autoComplete="off"
              className="mt-2 block min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-base text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
              id="nationalIdConfirmation"
              inputMode="numeric"
              maxLength={13}
              name="nationalIdConfirmation"
              required
              type="password"
            />
          </div>
          <label className="flex min-w-0 items-start gap-3 rounded-control border border-border px-3 py-3 text-sm leading-6 text-text">
            <input
              className="mt-1 size-4 shrink-0 accent-brand"
              name="identityVerified"
              required
              type="checkbox"
              value="true"
            />
            <span className="break-words">
              ข้าพเจ้าได้ตรวจสอบตัวตนของผู้ป่วยด้วยตนเองตามกระบวนการช่วยเหลือที่โรงพยาบาลอนุมัติแล้ว
            </span>
          </label>

          {state.message ? (
            <p
              aria-live="polite"
              className={`break-words rounded-control border px-4 py-3 text-sm leading-6 ${
                state.status === "ISSUED"
                  ? "border-success/20 bg-success-soft text-success"
                  : "border-danger/20 bg-danger-soft text-danger"
              }`}
              role={state.status === "ERROR" ? "alert" : "status"}
            >
              {state.message}
            </p>
          ) : null}

          {state.status === "ISSUED" && handoffLink ? (
            <div className="min-w-0 rounded-control border border-border bg-surface-muted p-4">
              <label className="block text-sm font-semibold text-text" htmlFor="recoveryHandoffLink">
                ลิงก์สำหรับส่งให้ผู้ป่วย
              </label>
              <input
                className="mt-2 block min-h-11 w-full min-w-0 rounded-control border border-border-strong bg-surface px-3 py-2 text-sm text-text"
                id="recoveryHandoffLink"
                readOnly
                value={handoffLink}
              />
              {state.expiresAt ? (
                <p className="mt-2 break-words text-xs leading-5 text-text-muted">
                  หมดอายุ {new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(state.expiresAt))}
                </p>
              ) : null}
              <button
                className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring sm:w-auto"
                onClick={() => void copyHandoffLink()}
                type="button"
              >
                คัดลอกลิงก์
              </button>
              {copyMessage ? <p aria-live="polite" className="mt-2 text-sm text-text-muted">{copyMessage}</p> : null}
            </div>
          ) : null}

          <button
            className="inline-flex min-h-11 w-full items-center justify-center rounded-control bg-action-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-action-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 sm:w-fit"
            disabled={pending}
            type="submit"
          >
            {pending ? "กำลังตรวจสอบและออกลิงก์…" : "ออกลิงก์กู้คืนบัญชี"}
          </button>
        </form>
      </Panel>
    </section>
  );
}
