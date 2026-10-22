"use client";

import { Button } from "@/components/ui/button";
import { submitPreservingInput } from "@/components/ui/mutation-action-state";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import type { UserKind } from "@/modules/user-management/domain/user-management-values";
import {
  initialUserTakeoverActionState,
  type UserTakeoverActionState,
} from "@/modules/user-management/transport/action-state";
import { lockSuspectedTakeoverAction } from "@/modules/user-management/transport/server-actions";

import {
  standardNotice,
  useScopedMutation,
  useScopedMutationSession,
  type MutationVerdict,
} from "../../../workforce/scoped-mutation";

const takeoverNotice = standardNotice({
  success: "ล็อกบัญชีแล้ว",
  conflict: "ล็อกบัญชีนี้ไม่ได้ กรุณาตรวจสอบข้อความที่แสดง",
  forbidden: "ไม่มีสิทธิ์ล็อกบัญชีนี้",
});

function classifyTakeover(state: UserTakeoverActionState): MutationVerdict {
  switch (state.outcome) {
    case "LOCKED":
      return state.success ? "SUCCESS" : "UNCONFIRMED";
    case "NOT_ELIGIBLE":
    case "REQUIRES_ADMIN":
    case "CONFLICT":
      return "CONFLICT";
    case "FORBIDDEN":
      return "FORBIDDEN";
    case "INVALID_CONFIRMATION":
      return "REJECTED";
    default:
      return "UNCONFIRMED";
  }
}

/** UM-D5 "บัญชีนี้ไม่ใช่เจ้าของจริง". `retry` repeats only the provider session revocation of an existing lock. */
export function UserTakeoverControl({ kind, relationshipId, hospitalId, updatedAt, retry }: {
  kind: UserKind;
  relationshipId: string;
  hospitalId: string;
  updatedAt: string;
  retry: boolean;
}): React.JSX.Element {
  const session = useScopedMutationSession<UserTakeoverActionState>({ scope: relationshipId });
  const { action, pending } = useScopedMutation(session, {
    kind: "takeover-lock",
    action: lockSuspectedTakeoverAction,
    initialState: initialUserTakeoverActionState,
    classify: classifyTakeover,
    notice: takeoverNotice,
    message: (state) => state.message,
  });
  const latest = session.latest?.scope === relationshipId ? session.latest : null;
  const inlineMessage = latest && latest.status !== "PENDING" && latest.status !== "UNCONFIRMED"
    ? latest.state?.message ?? latest.message
    : null;
  const locked = pending || session.locked;

  return <details className="rounded-panel border border-border bg-surface p-5" open={retry || undefined}>
    <summary className="min-h-11 cursor-pointer content-center font-semibold text-danger">
      {retry ? "ยืนยันการตัดการเข้าสู่ระบบอีกครั้ง" : "บัญชีนี้ไม่ใช่เจ้าของจริง"}
    </summary>
    <p className="mt-3 text-sm leading-6 text-text">
      ใช้เมื่อสงสัยว่าคนอื่นลงทะเบียนหรือใช้บัญชีนี้แทนเจ้าของจริง ระบบจะล็อกบัญชีทันที ระงับสิทธิ์ในโรงพยาบาลนี้
      ตัดการเข้าสู่ระบบทุกอุปกรณ์ ยกเลิกการเชื่อม LINE ที่เกิดหลังเปิดใช้งาน และบันทึกประวัติไว้
      <strong> หลังล็อกแล้วให้ใช้ “คืนบัญชีให้เจ้าของจริง” ด้านบน</strong> ระบบจะขอให้ยืนยันตัวตนก่อนตั้งรหัสผ่านใหม่
    </p>
    <form action={action} className="mt-4 space-y-4" onSubmit={submitPreservingInput(action)}>
      <input name="kind" type="hidden" value={kind} />
      <input name="relationshipId" type="hidden" value={relationshipId} />
      <input name="targetHospitalId" type="hidden" value={hospitalId} />
      <input name="expectedUpdatedAt" type="hidden" value={updatedAt} />
      <label className="block text-sm font-semibold text-text" htmlFor={`takeover-confirmation-${relationshipId}`}>พิมพ์ “ไม่ใช่เจ้าของจริง” เพื่อยืนยัน</label>
      <input
        className="min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
        disabled={locked}
        id={`takeover-confirmation-${relationshipId}`}
        name="confirmation"
        required
      />
      {inlineMessage ? <p className="text-sm text-text" role={latest?.status === "SUCCESS" ? "status" : "alert"}>{inlineMessage}</p> : null}
      <UnknownOutcomeAlert active={session.unconfirmed} recovery={{ kind: "reload" }} />
      <Button disabled={locked} loading={pending} type="submit" variant="danger">
        {pending ? "กำลังดำเนินการ…" : retry ? "ลองยกเลิกการเข้าสู่ระบบอีกครั้ง" : "ยืนยันล็อกบัญชี"}
      </Button>
    </form>
  </details>;
}
