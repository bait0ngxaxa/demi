"use client";

import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import {
  searchMediatedPasswordResetTargetsAction,
  type MediatedPasswordResetSearchActionResult,
} from "@/modules/account-security/transport/server-actions";

import { MediatedPasswordResetControl } from "../../users/mediated-password-reset-control";

export function AdminMediatedPasswordResetSearch(): React.JSX.Element {
  const [result, setResult] = useState<MediatedPasswordResetSearchActionResult | null>(null);
  const [selectedIndex, setSelectedIndex] = useState("");
  const [pending, setPending] = useState(false);

  async function search(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending) return;
    const formData = new FormData(event.currentTarget);
    const nationalId = String(formData.get("nationalId") ?? "");
    setPending(true);
    setSelectedIndex("");
    try {
      setResult(await searchMediatedPasswordResetTargetsAction(nationalId));
    } catch {
      setResult({ status: "ERROR", message: "ระบบไม่พร้อมค้นหา กรุณาลองอีกครั้ง" });
    } finally {
      setPending(false);
    }
  }

  const candidates = result?.status === "MATCH" ? result.candidates : [];
  const selected = selectedIndex === "" ? null : candidates[Number(selectedIndex)] ?? null;

  return (
    <Panel>
      <h2 className="text-xl font-semibold text-text">ค้นหาบัญชี</h2>
      <p className="mt-2 text-sm leading-6 text-text-muted">ค้นด้วยเลขบัตรประชาชนแบบตรงกันทุกหลัก การค้นหาและผลลัพธ์จะถูกบันทึกเป็น audit โดยไม่บันทึกเลขบัตรหรือ hash</p>
      <form className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(event) => void search(event)}>
        <label className="grid flex-1 gap-1 text-sm font-medium">
          เลขบัตรประชาชน
          <input autoComplete="off" className="min-h-11 rounded-md border border-border bg-surface px-3" inputMode="numeric" maxLength={13} minLength={13} name="nationalId" pattern="[0-9]{13}" required />
        </label>
        <button className={buttonClassName({ variant: "primary", size: "compact" })} disabled={pending} type="submit">{pending ? "กำลังค้นหา…" : "ค้นหา"}</button>
      </form>

      {result?.status === "ERROR" ? <Alert className="mt-4" variant="warning">{result.message}</Alert> : null}
      {result?.status === "NO_MATCH" ? <p className="mt-4 text-sm text-text-muted" role="status">ไม่พบรายการที่ดำเนินการได้ กรุณาตรวจสอบข้อมูลแล้วลองอีกครั้ง</p> : null}

      {candidates.length > 0 ? (
        <div className="mt-5 space-y-4">
          <label className="grid gap-1 text-sm font-medium">
            เลือกบัญชีและโรงพยาบาล
            <select className="min-h-11 rounded-md border border-border bg-surface px-3" onChange={(event) => setSelectedIndex(event.target.value)} value={selectedIndex}>
              <option value="">เลือกบัญชี</option>
              {candidates.map((candidate, index) => (
                <option key={`${candidate.targetKind}-${candidate.relationshipId ?? candidate.userId}-${candidate.hospitalId}`} value={String(index)}>
                  {candidate.displayName} · {candidate.targetKind === "staff" ? "บุคลากร" : candidate.targetKind === "osm" ? "อสม." : candidate.targetKind === "patient" ? "ผู้ป่วย" : candidate.targetKind === "caregiver" ? "ผู้ดูแลญาติ" : "บัญชี ADMIN"} · {candidate.hospitalName} · {candidate.relationshipStatus}
                </option>
              ))}
            </select>
          </label>
          {selected ? (
            <div className="rounded-lg border border-border p-4">
              <p className="mb-3 text-sm leading-6 text-text-muted">ผู้ดูแลระบบต้องตรวจสอบตัวตนด้วยตนเองก่อนออกลิงก์</p>
              <MediatedPasswordResetControl
                eligibility="ADMIN_ALLOWED"
                hospitalId={selected.hospitalId}
                hospitalName={selected.hospitalName}
                relationshipId={selected.relationshipId}
                targetUserId={selected.targetKind === "platform_admin" || selected.targetKind === "caregiver" ? selected.userId : undefined}
                targetKind={selected.targetKind}
                targetName={selected.displayName}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}
