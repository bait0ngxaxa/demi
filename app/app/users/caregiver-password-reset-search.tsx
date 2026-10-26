"use client";

import { useState } from "react";

import { buttonClassName } from "@/components/ui/button";
import type { MediatedPasswordResetCandidate } from "@/modules/account-security/services/mediated-password-reset-service";
import {
  searchMediatedPasswordResetTargetsAction,
  type MediatedPasswordResetSearchActionResult,
} from "@/modules/account-security/transport/server-actions";

import { MediatedPasswordResetControl } from "./mediated-password-reset-control";

export function CaregiverPasswordResetSearch({ hospitalId, hospitalName }: { hospitalId: string; hospitalName: string }): React.JSX.Element {
  const [result, setResult] = useState<MediatedPasswordResetSearchActionResult | null>(null);
  const [pending, setPending] = useState(false);
  const [candidate, setCandidate] = useState<MediatedPasswordResetCandidate | null>(null);

  async function search(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending) return;
    const formData = new FormData(event.currentTarget);
    const nationalId = String(formData.get("nationalId") ?? "");
    setPending(true);
    setCandidate(null);
    try {
      const next = await searchMediatedPasswordResetTargetsAction(nationalId, hospitalId);
      setResult(next);
      setCandidate(next.status === "MATCH" ? next.candidates[0] ?? null : null);
    } catch {
      setResult({ status: "ERROR", message: "ระบบไม่พร้อมค้นหา กรุณาลองอีกครั้ง" });
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-labelledby="caregiver-reset-heading" className="mt-6 border-t border-line pt-6">
      <h2 className="text-lg font-semibold text-ink" id="caregiver-reset-heading">รีเซ็ตรหัสผ่านบัญชีผู้ดูแลญาติ</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">ค้นหาด้วยเลขบัตรประชาชนแบบตรงกัน ระบบจะแสดงเฉพาะบัญชีที่มีบทบาทผู้ดูแลญาติอย่างเดียวและดูแลผู้ป่วยของโรงพยาบาลนี้เท่านั้น</p>
      <form className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(event) => void search(event)}>
        <label className="grid flex-1 gap-1 text-sm font-medium" htmlFor="caregiver-reset-national-id">
          เลขบัตรประชาชน
          <input autoComplete="off" className="min-h-11 rounded-md border border-border bg-surface px-3" id="caregiver-reset-national-id" inputMode="numeric" maxLength={13} minLength={13} name="nationalId" pattern="[0-9]{13}" required />
        </label>
        <button className={buttonClassName({ variant: "secondary", size: "compact" })} disabled={pending} type="submit">{pending ? "กำลังค้นหา…" : "ค้นหา"}</button>
      </form>
      {result?.status === "NO_MATCH" ? <p className="mt-3 text-sm text-muted" role="status">ไม่พบรายการที่ดำเนินการได้ ตรวจสอบข้อมูลแล้วลองอีกครั้ง</p> : null}
      {result?.status === "ERROR" ? <p className="mt-3 text-sm text-danger" role="alert">{result.message}</p> : null}
      {candidate?.targetKind === "caregiver" ? (
        <div className="mt-4 rounded-lg border border-border p-4">
          <p className="mb-3 text-sm font-medium text-text">{candidate.displayName} · {hospitalName}</p>
          <MediatedPasswordResetControl
            eligibility="OWNER_ELIGIBLE"
            hospitalId={candidate.hospitalId}
            hospitalName={candidate.hospitalName}
            relationshipId={null}
            targetKind="caregiver"
            targetName={candidate.displayName}
            targetUserId={candidate.userId}
          />
        </div>
      ) : null}
    </section>
  );
}
