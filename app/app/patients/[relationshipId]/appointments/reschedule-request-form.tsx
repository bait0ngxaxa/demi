"use client";

import { useActionState } from "react";
import { submitRescheduleRequestAction, rejectRescheduleRequestAction, type RescheduleRequestActionState } from "@/modules/appointments/transport/reschedule-request-actions";

export function RescheduleRequestForm({ relationshipId, appointmentId, expectedUpdatedAt, nonce, requestId }: {
  relationshipId: string; appointmentId: string; expectedUpdatedAt?: string; nonce?: string; requestId?: string;
}): React.JSX.Element {
  const [state, action, pending] = useActionState<RescheduleRequestActionState, FormData>(requestId ? rejectRescheduleRequestAction : submitRescheduleRequestAction, { status: "IDLE", message: "" });
  const control = "mt-2 min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring";
  const prefix = requestId ?? "reschedule";
  return <form action={action} className="mt-4 space-y-4">
    <input type="hidden" name="patientHospitalRelationshipId" value={relationshipId} />
    <input type="hidden" name="appointmentId" value={appointmentId} />
    {requestId ? <input type="hidden" name="requestId" value={requestId} /> : <>
      <input type="hidden" name="expectedUpdatedAt" value={expectedUpdatedAt} />
      <input type="hidden" name="submissionNonce" value={nonce} />
      <p className="text-sm text-text-muted">วันเวลาที่สะดวก 1–3 ตัวเลือก (เวลาประเทศไทย) ภายใน 366 วัน เจ้าหน้าที่จะพิจารณาและแก้นัดหมาย</p>
      <div className="grid gap-4 sm:grid-cols-3">{[1, 2, 3].map((index) => <div key={index}>
        <label htmlFor={`${prefix}-${index}`} className="text-sm font-semibold text-text">ตัวเลือก {index}{index === 1 ? " (จำเป็น)" : ""}</label>
        <input id={`${prefix}-${index}`} name="preferredDatetimes" type="datetime-local" required={index === 1} disabled={pending} className={control} />
      </div>)}</div>
    </>}
    <div><label htmlFor={`${prefix}-reason`} className="text-sm font-semibold text-text">{requestId ? "เหตุผลที่ปฏิเสธ" : "เหตุผลที่ขอเลื่อนนัด"}</label>
      <textarea id={`${prefix}-reason`} name={requestId ? "rejectionReason" : "reason"} maxLength={500} required disabled={pending} className={control} /></div>
    {state.message ? <p role={state.status === "ERROR" ? "alert" : "status"} className="text-sm text-text">{state.message}</p> : null}
    <button disabled={pending} className="min-h-11 rounded-control bg-action-primary px-5 py-2 font-semibold text-white hover:bg-action-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring disabled:opacity-60">{pending ? "กำลังส่ง…" : requestId ? "ปฏิเสธคำขอ" : "ส่งคำขอเลื่อนนัด"}</button>
  </form>;
}
