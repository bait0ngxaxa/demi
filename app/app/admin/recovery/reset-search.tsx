"use client";

import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import {
  searchMediatedPasswordResetTargetsAction,
  type MediatedPasswordResetSearchActionResult,
} from "@/modules/account-security/transport/server-actions";

import { hospitalRelationshipStatusPresentation } from "../../users/user-presentation";
import { MediatedPasswordResetControl } from "../../users/mediated-password-reset-control";

import { CaregiverResetHospitalPicker } from "./caregiver-reset-hospital-picker";

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
  const candidateStatusLabel = (candidate: (typeof candidates)[number]): string | null => {
    switch (candidate.targetKind) {
      case "staff": return hospitalRelationshipStatusPresentation("staff", candidate.relationshipStatus).label;
      case "osm": return hospitalRelationshipStatusPresentation("osm", candidate.relationshipStatus).label;
      case "patient": return hospitalRelationshipStatusPresentation("patient", candidate.relationshipStatus).label;
      case "caregiver":
      case "platform_admin": return null;
    }
  };

  return (
    <Panel>
      <h2 className="text-xl font-semibold text-text">ค้นหาบัญชี</h2>
      <p className="mt-2 text-sm leading-6 text-text-muted">ค้นหาผู้ใช้ด้วยเลขบัตรประชาชน หรือค้นหาผู้ดูแลระบบ DEMI ด้วยรหัสเข้าสู่ระบบที่ลงทะเบียนไว้ โดยต้องตรงกันทุกตัว ระบบจะไม่บันทึกรหัสนี้ลงในประวัติการใช้งาน</p>
      <form className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(event) => void search(event)}>
        <label className="grid flex-1 gap-1 text-sm font-medium">
          เลขบัตรประชาชน หรือรหัสเข้าสู่ระบบของผู้ดูแลระบบ DEMI ที่ลงทะเบียนไว้
          <input autoComplete="off" className="min-h-11 rounded-md border border-border bg-surface px-3" maxLength={32} name="nationalId" required />
        </label>
        <button className={buttonClassName({ variant: "primary", size: "compact" })} disabled={pending} type="submit">{pending ? "กำลังค้นหา…" : "ค้นหา"}</button>
      </form>

      {result?.status === "ERROR" ? <Alert className="mt-4" variant="warning">{result.message}</Alert> : null}
      {result?.status === "NO_MATCH" ? <p className="mt-4 text-sm text-text-muted" role="status">ไม่พบรายการที่ดำเนินการได้ กรุณาตรวจสอบข้อมูลแล้วลองอีกครั้ง</p> : null}

      {candidates.length > 0 ? (
        <div className="mt-5 space-y-4">
          <label className="grid gap-1 text-sm font-medium">
            เลือกบัญชีและขอบเขต
            <select className="min-h-11 rounded-md border border-border bg-surface px-3" onChange={(event) => setSelectedIndex(event.target.value)} value={selectedIndex}>
              <option value="">เลือกบัญชี</option>
              {candidates.map((candidate, index) => {
                const statusLabel = candidateStatusLabel(candidate);
                const kindLabel = candidate.targetKind === "staff" ? "เจ้าหน้าที่โรงพยาบาล"
                  : candidate.targetKind === "osm" ? "อสม."
                    : candidate.targetKind === "patient" ? "ผู้ป่วย"
                      : candidate.targetKind === "caregiver" ? "ญาติหรือผู้ดูแล" : "ผู้ดูแลระบบ DEMI";
                return (
                  <option key={`${candidate.targetKind}-${candidate.relationshipId ?? candidate.userId}-${candidate.hospitalId}`} value={String(index)}>
                    {candidate.displayName} · {kindLabel}{candidate.hospitalName ? ` · ${candidate.hospitalName}` : ""}{statusLabel ? ` · ${statusLabel}` : ""}
                  </option>
                );
              })}
            </select>
          </label>
          {selected ? (
            <div className="rounded-lg border border-border p-4">
              <p className="mb-3 text-sm leading-6 text-text-muted">ผู้ดูแลระบบ DEMI ต้องตรวจสอบตัวตนด้วยตนเองก่อนออกลิงก์</p>
              {selected.targetKind === "platform_admin" ? (
                <MediatedPasswordResetControl
                  eligibility="ADMIN_ALLOWED"
                  hospitalId={null}
                  hospitalName={null}
                  relationshipId={null}
                  targetUserId={selected.userId}
                  targetKind="platform_admin"
                  targetName={selected.displayName}
                />
              ) : selected.targetKind === "caregiver" && selected.hospitalId === null ? (
                <CaregiverResetHospitalPicker key={selected.userId} targetName={selected.displayName} targetUserId={selected.userId} />
              ) : selected.targetKind === "caregiver" ? (
                <MediatedPasswordResetControl
                  eligibility="ADMIN_ALLOWED"
                  hospitalId={selected.hospitalId}
                  hospitalName={selected.hospitalName}
                  relationshipId={null}
                  targetUserId={selected.userId}
                  targetKind="caregiver"
                  targetName={selected.displayName}
                />
              ) : (
                <MediatedPasswordResetControl
                  eligibility="ADMIN_ALLOWED"
                  hospitalId={selected.hospitalId}
                  hospitalName={selected.hospitalName}
                  relationshipId={selected.relationshipId}
                  targetKind={selected.targetKind}
                  targetName={selected.displayName}
                />
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}
