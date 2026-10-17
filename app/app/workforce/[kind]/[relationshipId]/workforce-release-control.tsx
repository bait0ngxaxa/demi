"use client";

import { Button } from "@/components/ui/button";
import { submitPreservingInput } from "@/components/ui/mutation-action-state";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import {
  initialWorkforceReleaseActionState,
  type WorkforceReleaseActionState,
} from "@/modules/workforce/transport/action-state";
import { releaseWorkforceAction } from "@/modules/workforce/transport/workforce-release-action";

import {
  standardNotice,
  useScopedMutation,
  useScopedMutationSession,
  type MutationVerdict,
} from "../../scoped-mutation";

const releaseNotice = standardNotice({
  success: "นำความสัมพันธ์ออกจากระบบแล้ว",
  conflict: "ไม่สามารถนำออกจากระบบได้ กรุณาโหลดข้อมูลล่าสุด",
  forbidden: "ไม่มีสิทธิ์นำความสัมพันธ์ออกจากระบบ",
});

/** Only the server's typed outcome counts; a bare `{ success: false }` is never read as a conflict or refusal. */
function classifyRelease(state: WorkforceReleaseActionState): MutationVerdict {
  switch (state.outcome) {
    case "RELEASED":
      return state.success ? "SUCCESS" : "UNCONFIRMED";
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

export function WorkforceReleaseControl({ relationshipId, hospitalId, kind, updatedAt }: {
  relationshipId: string; hospitalId: string; kind: "osm" | "staff"; updatedAt: string;
}): React.JSX.Element {
  // The Server Action revalidates the roster itself, and a release is terminal, so it is never refreshed or repeated.
  const session = useScopedMutationSession<WorkforceReleaseActionState>({ scope: relationshipId, lockOnSuccess: true });
  const { action, pending } = useScopedMutation(session, {
    kind: "release",
    action: releaseWorkforceAction,
    initialState: initialWorkforceReleaseActionState,
    classify: classifyRelease,
    notice: releaseNotice,
    message: (state) => state.message,
  });
  const latest = session.latest?.scope === relationshipId ? session.latest : null;
  const released = latest?.status === "SUCCESS";
  const inlineMessage =
    latest?.status === "SUCCESS"
      ? latest.state?.message ?? null
      : latest?.status === "CONFLICT" || latest?.status === "FORBIDDEN" || latest?.status === "REJECTED"
        ? latest.message
        : null;
  const locked = pending || session.locked;
  return <details className="rounded-panel border border-border bg-surface p-5">
    <summary className="min-h-11 cursor-pointer content-center font-semibold text-danger">นำออกจากระบบ</summary>
    <p className="mt-3 text-sm leading-6 text-text">สิทธิ์ในโรงพยาบาลนี้จะสิ้นสุดทันที {kind === "osm" ? "การมอบหมายผู้ป่วยที่ค้างอยู่จะสิ้นสุด " : null}และลิงก์เปิดใช้งาน / ตั้งรหัสผ่านใหม่ที่ค้างอยู่จะถูกเพิกถอน ประวัติทั้งหมดจะเก็บไว้ การนำออกนี้ย้อนกลับไม่ได้ หากต้องการให้ทำงานอีกครั้งต้องเพิ่มใหม่ตามขั้นตอนปกติ</p>
    <form action={action} className="mt-4 space-y-4" onSubmit={submitPreservingInput(action)}>
      <input name="relationshipId" type="hidden" value={relationshipId} />
      <input name="targetHospitalId" type="hidden" value={hospitalId} />
      <input name="kind" type="hidden" value={kind} />
      <input name="expectedUpdatedAt" type="hidden" value={updatedAt} />
      <label htmlFor="release-confirmation" className="block text-sm font-semibold text-text">พิมพ์ “นำออกจากระบบ” เพื่อยืนยัน</label>
      <input id="release-confirmation" name="confirmation" required disabled={locked} className="min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" />
      {inlineMessage ? <p role={released ? "status" : "alert"} className="text-sm text-text">{inlineMessage}</p> : null}
      <UnknownOutcomeAlert active={session.unconfirmed} recovery={{ kind: "reload" }} />
      <Button disabled={locked} loading={pending} type="submit" variant="danger">{pending ? "กำลังนำออก…" : "ยืนยันนำออกจากระบบถาวร"}</Button>
    </form>
  </details>;
}
