"use client";

import { useActionState } from "react";
import { releaseWorkforceAction } from "@/modules/workforce/transport/workforce-release-action";

export function WorkforceReleaseControl({ relationshipId, hospitalId, kind, updatedAt }: {
  relationshipId: string; hospitalId: string; kind: "osm" | "staff"; updatedAt: string;
}): React.JSX.Element {
  const [state, action, pending] = useActionState(releaseWorkforceAction, { message: "", success: false });
  return <details className="rounded-panel border border-border bg-surface p-5">
    <summary className="min-h-11 cursor-pointer content-center font-semibold text-danger">นำออกจากระบบ</summary>
    <p className="mt-3 text-sm leading-6 text-text">สิทธิ์ในโรงพยาบาลนี้จะสิ้นสุดทันที การมอบหมายผู้ป่วยที่ค้างอยู่จะสิ้นสุด และลิงก์เปิดใช้งาน / ตั้งรหัสผ่านใหม่ที่ค้างอยู่จะถูกเพิกถอน ประวัติทั้งหมดจะเก็บไว้ การนำออกนี้ย้อนกลับไม่ได้ หากต้องการให้ทำงานอีกครั้งต้องเพิ่มใหม่ตามขั้นตอนปกติ</p>
    <form action={action} className="mt-4 space-y-4">
      <input name="relationshipId" type="hidden" value={relationshipId} />
      <input name="targetHospitalId" type="hidden" value={hospitalId} />
      <input name="kind" type="hidden" value={kind} />
      <input name="expectedUpdatedAt" type="hidden" value={updatedAt} />
      <label htmlFor="release-confirmation" className="block text-sm font-semibold text-text">พิมพ์ “นำออกจากระบบ” เพื่อยืนยัน</label>
      <input id="release-confirmation" name="confirmation" required disabled={pending || state.success} className="min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" />
      {state.message ? <p role={state.success ? "status" : "alert"} className="text-sm text-text">{state.message}</p> : null}
      <button disabled={pending || state.success} className="min-h-11 rounded-control bg-danger px-5 py-2 font-semibold text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring disabled:opacity-60">{pending ? "กำลังนำออก…" : "ยืนยันนำออกจากระบบถาวร"}</button>
    </form>
  </details>;
}
