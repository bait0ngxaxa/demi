"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import {
  reconcileMediatedPasswordResetAction,
  type MediatedPasswordResetReconcileActionResult,
} from "@/modules/account-security/transport/server-actions";

export type QuarantinedResetRow = {
  resetId: string;
  displayName: string;
  hospitalName: string;
  mode: "IN_PERSON" | "ONLINE";
  verificationMethod: string;
  claimedAt: string;
};

const VERIFICATION_METHOD_LABELS: Record<string, string> = {
  IN_PERSON_ID_CARD: "ตรวจบัตรประชาชนต่อหน้า",
  VIDEO_CALL_FACE_AND_ID_CARD: "วิดีโอคอลและบัตรประชาชน",
  CALLBACK_PHONE_ON_HOSPITAL_RECORD: "โทรกลับหมายเลขในประวัติโรงพยาบาล",
  BREAK_GLASS_CLI: "กู้คืนฉุกเฉินผ่าน CLI",
};

const OUTCOME_MESSAGES = {
  COMPLETED: "ยืนยันแล้วว่ารหัสผ่านใหม่ใช้งานอยู่ ปลดการกักบัญชีแล้ว เจ้าของบัญชีเข้าสู่ระบบด้วยรหัสผ่านใหม่ได้",
  ROLLED_BACK: "ยกเลิกการรีเซ็ตแล้ว เจ้าของบัญชีเข้าสู่ระบบด้วยรหัสผ่านเดิมได้ และออกลิงก์รีเซ็ตใหม่ได้",
} as const;

function formatThaiDate(value: string): string {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(value));
}

export function QuarantinedMediatedResets({ resets }: { resets: QuarantinedResetRow[] }): React.JSX.Element {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [result, setResult] = useState<{ resetId: string; state: MediatedPasswordResetReconcileActionResult } | null>(null);

  async function reconcile(resetId: string): Promise<void> {
    if (pendingId) return;
    setPendingId(resetId);
    try {
      const state = await reconcileMediatedPasswordResetAction(resetId);
      setResult({ resetId, state });
      if (state.status === "SUCCESS") router.refresh();
    } catch {
      setResult({ resetId, state: { status: "ERROR", message: "ระบบไม่พร้อมตรวจสอบ กรุณาลองอีกครั้ง" } });
    } finally {
      setPendingId(null);
    }
  }

  return (
    <Panel>
      <h2 className="text-xl font-semibold text-text">บัญชีที่ถูกกักระหว่างรีเซ็ต</h2>
      <p className="mt-2 text-sm leading-6 text-text-muted">
        ระบบไม่ทราบผลการตั้งรหัสผ่านกับผู้ให้บริการยืนยันตัวตน จึงกักบัญชีไว้ การตรวจสอบจะเช็กสถานะจริงกับผู้ให้บริการ แล้วทำต่อให้เสร็จหรือยกเลิกให้กลับไปใช้รหัสผ่านเดิม หากยืนยันไม่ได้ บัญชีจะยังถูกกักไว้
      </p>
      {result?.state.status === "SUCCESS" ? <Alert className="mt-4" variant="success">{OUTCOME_MESSAGES[result.state.outcome]}</Alert> : null}
      {resets.length === 0 ? (
        <p className="mt-4 text-sm text-text-muted">ไม่มีบัญชีที่ถูกกัก</p>
      ) : (
        <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
          {resets.map((reset) => (
            <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between" key={reset.resetId}>
              <div className="min-w-0">
                <p className="break-words font-medium text-text">{reset.displayName} · {reset.hospitalName}</p>
                <p className="text-sm text-text-muted">
                  {reset.verificationMethod === "BREAK_GLASS_CLI" ? VERIFICATION_METHOD_LABELS.BREAK_GLASS_CLI : `${reset.mode === "IN_PERSON" ? "ต่อหน้า" : "ออนไลน์"} · ${VERIFICATION_METHOD_LABELS[reset.verificationMethod] ?? "วิธีที่บันทึกไว้"}`} · เริ่มตั้งรหัสผ่านเมื่อ {formatThaiDate(reset.claimedAt)}
                </p>
                {result?.resetId === reset.resetId && result.state.status === "ERROR" ? (
                  <Alert className="mt-2" variant="warning">{result.state.message}</Alert>
                ) : null}
              </div>
              <button
                className={buttonClassName({ variant: "secondary", size: "compact" })}
                disabled={pendingId !== null}
                onClick={() => void reconcile(reset.resetId)}
                type="button"
              >
                {pendingId === reset.resetId ? "กำลังตรวจสอบ…" : "ตรวจสอบและแก้ไข"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
