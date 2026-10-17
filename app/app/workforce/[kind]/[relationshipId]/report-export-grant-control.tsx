"use client";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import type { WorkforceDetail } from "@/modules/workforce/services/workforce-service";
import { setHospitalMembershipReportExportGrantAction } from "@/modules/workforce/transport/server-actions";
import {
  initialWorkforceReportExportGrantActionState,
  type WorkforceReportExportGrantActionState,
} from "@/modules/workforce/transport/action-state";

import {
  classifyWorkforceState,
  formString,
  ScopedMutationFeedback,
  useScopedMutation,
  useScopedMutationSession,
  workforceStateMessage,
  type MutationNotice,
  type MutationVerdict,
} from "../../scoped-mutation";

/** The returned `granted` must be the state this submission asked for, not a stale or opposite grant. */
function grantConfirms(state: WorkforceReportExportGrantActionState, formData: FormData): boolean {
  return state.status === "SUCCESS" && state.granted === (formString(formData, "granted") === "true");
}

function grantNotice(
  verdict: MutationVerdict,
  state: WorkforceReportExportGrantActionState,
): MutationNotice | null {
  if (verdict === "SUCCESS" && state.status === "SUCCESS") {
    return {
      level: "success",
      message: state.granted ? "ให้สิทธิ์ส่งออกรายงานแล้ว" : "ยกเลิกสิทธิ์ส่งออกรายงานแล้ว",
    };
  }

  if (verdict === "CONFLICT") {
    return { level: "warning", message: "สถานะสิทธิ์ส่งออกเปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลล่าสุด" };
  }

  return verdict === "FORBIDDEN"
    ? { level: "error", message: "ไม่มีสิทธิ์จัดการสิทธิ์ส่งออกรายงาน" }
    : null;
}

/** Customer decision E1 (ก-15): the OWNER grants or revokes report export for this MEMBER. */
export function ReportExportGrantControl({
  expectedUpdatedAt,
  grant,
  relationshipId,
  targetHospitalId,
}: {
  expectedUpdatedAt: string;
  grant: NonNullable<WorkforceDetail["reportExportGrant"]>;
  relationshipId: string;
  targetHospitalId: string;
}): React.JSX.Element {
  const session = useScopedMutationSession<WorkforceReportExportGrantActionState>({
    scope: relationshipId,
    // The status badge is the authoritative state; the form unlocks once the refreshed grant reflects the result.
    snapshot: String(grant.granted),
    refreshOnSuccess: true,
  });
  const { action: formAction, pending } = useScopedMutation(session, {
    kind: "grant",
    action: setHospitalMembershipReportExportGrantAction,
    initialState: initialWorkforceReportExportGrantActionState,
    classify: (state, formData) => classifyWorkforceState(state, grantConfirms(state, formData)),
    notice: grantNotice,
    message: workforceStateMessage,
    resultSnapshot: (state) => (state.status === "SUCCESS" ? String(state.granted) : null),
  });
  const locked = pending || session.locked;
  const canChange = grant.granted ? grant.canRevoke : grant.canGrant;

  return (
    <Panel>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold tracking-[-0.02em]">สิทธิ์ส่งออกรายงาน</h2>
        <StatusBadge variant={grant.granted ? "success" : "neutral"}>
          {grant.granted ? "ส่งออกได้" : "ยังไม่ได้รับสิทธิ์"}
        </StatusBadge>
      </div>
      <p className="mt-2 text-sm leading-6 text-text-muted">
        สมาชิกที่ได้รับสิทธิ์ดาวน์โหลดไฟล์รายงานโรงพยาบาล (Excel) ได้ แต่ไม่เห็นหน้ารายงาน
        ทุกการส่งออกถูกบันทึกไว้ และสิทธิ์จะไม่มีผลระหว่างที่ความสัมพันธ์ถูกระงับหรือสิ้นสุด
      </p>
      {canChange ? (
        <form action={formAction} className="mt-4">
          <input name="relationshipId" type="hidden" value={relationshipId} />
          <input name="targetHospitalId" type="hidden" value={targetHospitalId} />
          <input name="expectedUpdatedAt" type="hidden" value={expectedUpdatedAt} />
          <input name="granted" type="hidden" value={grant.granted ? "false" : "true"} />
          <Button
            disabled={locked}
            loading={pending}
            size="compact"
            type="submit"
            variant={grant.granted ? "danger" : "secondary"}
          >
            {pending ? "กำลังบันทึก..." : grant.granted ? "ยกเลิกสิทธิ์ส่งออกรายงาน" : "ให้สิทธิ์ส่งออกรายงาน"}
          </Button>
        </form>
      ) : (
        <p className="mt-4 text-sm leading-6 text-text-muted">
          ให้สิทธิ์ได้เมื่อบัญชีและความสัมพันธ์กับโรงพยาบาลนี้พร้อมใช้งาน
        </p>
      )}
      <ScopedMutationFeedback
        session={session}
        success={(submission) =>
          submission.state?.status === "SUCCESS" && submission.state.granted
            ? "ให้สิทธิ์ส่งออกรายงานแล้ว"
            : "ยกเลิกสิทธิ์ส่งออกรายงานแล้ว มีผลตั้งแต่คำขอถัดไป"
        }
      />
      <UnknownOutcomeAlert active={session.unconfirmed} className="mt-4" recovery={{ kind: "reload" }} />
    </Panel>
  );
}
