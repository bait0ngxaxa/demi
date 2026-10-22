"use client";

import Link from "next/link";

import { Button, buttonClassName } from "@/components/ui/button";
import { submitPreservingInput } from "@/components/ui/mutation-action-state";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import type { UserKind } from "@/modules/user-management/domain/user-management-values";
import {
  DELETION_BLOCKER_LABELS,
  initialUserRecordDeletionActionState,
  type UserRecordDeletionActionState,
} from "@/modules/user-management/transport/action-state";
import { deleteUserRecordAction } from "@/modules/user-management/transport/server-actions";

import {
  standardNotice,
  useScopedMutation,
  useScopedMutationSession,
  type MutationVerdict,
} from "../../../workforce/scoped-mutation";

const deleteNotice = standardNotice({
  success: "ลบรายการแล้ว",
  conflict: "ลบรายการนี้ไม่ได้ กรุณาตรวจสอบเหตุผลที่แสดง",
  forbidden: "ไม่มีสิทธิ์ลบรายการนี้",
});

function classifyDelete(state: UserRecordDeletionActionState): MutationVerdict {
  switch (state.outcome) {
    case "DELETED":
      return state.success ? "SUCCESS" : "UNCONFIRMED";
    case "NOT_DELETABLE":
    case "CONFLICT":
    case "NOT_FOUND":
      return "CONFLICT";
    case "FORBIDDEN":
      return "FORBIDDEN";
    case "INVALID_CONFIRMATION":
      return "REJECTED";
    default:
      return "UNCONFIRMED";
  }
}

/** UM-D2a "ลบรายการ": shown only when the server found the record unused; the action re-checks everything. */
export function UserRecordDeleteControl({ kind, relationshipId, hospitalId, updatedAt, directoryHref }: {
  kind: UserKind;
  relationshipId: string;
  hospitalId: string;
  updatedAt: string;
  directoryHref: string;
}): React.JSX.Element {
  const session = useScopedMutationSession<UserRecordDeletionActionState>({ scope: relationshipId, lockOnSuccess: true });
  const { action, pending } = useScopedMutation(session, {
    kind: "delete-record",
    action: deleteUserRecordAction,
    initialState: initialUserRecordDeletionActionState,
    classify: classifyDelete,
    notice: deleteNotice,
    message: (state) => state.message,
  });
  const latest = session.latest?.scope === relationshipId ? session.latest : null;
  const deleted = latest?.status === "SUCCESS";
  const refusal = latest && latest.status !== "SUCCESS" && latest.status !== "PENDING" && latest.status !== "UNCONFIRMED" ? latest : null;
  const locked = pending || session.locked;

  return <details className="rounded-panel border border-border bg-surface p-5">
    <summary className="min-h-11 cursor-pointer content-center font-semibold text-danger">ลบรายการ</summary>
    <p className="mt-3 text-sm leading-6 text-text">
      ใช้เมื่อเพิ่มรายการผิด เช่น เลขบัตรประชาชนผิด รายการนี้ยังไม่เคยเปิดใช้งานและไม่มีข้อมูลใด ๆ
      ระบบจะลบรายการ บัญชีที่ยังไม่เปิดใช้งาน และยกเลิกลิงก์เปิดใช้งาน / การลงทะเบียนเองที่ค้างอยู่ทันที
      <strong> การลบย้อนกลับไม่ได้</strong> หลังลบแล้วเพิ่มใหม่ด้วยเลขบัตรที่ถูกต้องได้
    </p>
    {deleted ? (
      <div className="mt-4 space-y-3" role="status">
        <p className="text-sm text-text">{latest?.state?.message}</p>
        <Link className={buttonClassName({ variant: "secondary", size: "compact" })} href={directoryHref}>กลับไปรายชื่อ</Link>
      </div>
    ) : (
      <form action={action} className="mt-4 space-y-4" onSubmit={submitPreservingInput(action)}>
        <input name="kind" type="hidden" value={kind} />
        <input name="relationshipId" type="hidden" value={relationshipId} />
        <input name="targetHospitalId" type="hidden" value={hospitalId} />
        <input name="expectedUpdatedAt" type="hidden" value={updatedAt} />
        <label className="block text-sm font-semibold text-text" htmlFor={`delete-confirmation-${relationshipId}`}>พิมพ์ “ลบรายการ” เพื่อยืนยัน</label>
        <input
          className="min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
          disabled={locked}
          id={`delete-confirmation-${relationshipId}`}
          name="confirmation"
          required
        />
        {refusal ? (
          <div className="text-sm text-text" role="alert">
            <p>{refusal.message}</p>
            {refusal.state?.blockers.length ? (
              <ul className="mt-2 list-disc pl-5">
                {refusal.state.blockers.map((blocker) => <li key={blocker}>{DELETION_BLOCKER_LABELS[blocker]}</li>)}
              </ul>
            ) : null}
          </div>
        ) : null}
        <UnknownOutcomeAlert active={session.unconfirmed} recovery={{ kind: "reload" }} />
        <Button disabled={locked} loading={pending} type="submit" variant="danger">{pending ? "กำลังลบ…" : "ยืนยันลบรายการถาวร"}</Button>
      </form>
    )}
  </details>;
}
