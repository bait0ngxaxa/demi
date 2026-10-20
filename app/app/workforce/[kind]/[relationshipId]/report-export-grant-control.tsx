"use client";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import type { WorkforceDetail } from "@/modules/workforce/services/workforce-service";
import {
  setHospitalMembershipNetworkPatientReadGrantAction,
  setHospitalMembershipReportExportGrantAction,
} from "@/modules/workforce/transport/server-actions";
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

type GrantKind = "REPORT_EXPORT" | "NETWORK_PATIENT_READ";

const grantCopy = {
  REPORT_EXPORT: {
    action: setHospitalMembershipReportExportGrantAction,
    title: "สิทธิ์ส่งออกรายงาน",
    grantedBadge: "ส่งออกได้",
    description:
      "สมาชิกที่ได้รับสิทธิ์ดาวน์โหลดไฟล์รายงานโรงพยาบาล (Excel) ได้ แต่ไม่เห็นหน้ารายงาน ทุกการส่งออกถูกบันทึกไว้ และสิทธิ์จะไม่มีผลระหว่างที่ความสัมพันธ์ถูกระงับหรือสิ้นสุด",
    grant: "ให้สิทธิ์ส่งออกรายงาน",
    revoke: "ยกเลิกสิทธิ์ส่งออกรายงาน",
    granted: "ให้สิทธิ์ส่งออกรายงานแล้ว",
    revoked: "ยกเลิกสิทธิ์ส่งออกรายงานแล้ว",
    conflict: "สถานะสิทธิ์ส่งออกเปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลล่าสุด",
    forbidden: "ไม่มีสิทธิ์จัดการสิทธิ์ส่งออกรายงาน",
  },
  NETWORK_PATIENT_READ: {
    action: setHospitalMembershipNetworkPatientReadGrantAction,
    title: "สิทธิ์ดูผู้ป่วยในเครือข่าย",
    grantedBadge: "ดูได้ (อ่านอย่างเดียว)",
    description:
      "สมาชิกที่ได้รับสิทธิ์เห็นรายชื่อและข้อมูลผู้ป่วยของโรงพยาบาลลูกข่ายในเครือข่ายนี้แบบอ่านอย่างเดียว แก้ไขหรือบันทึกข้อมูลของลูกข่ายไม่ได้ ทุกการเปิดดูถูกบันทึกไว้ และสิทธิ์จะไม่มีผลระหว่างที่ความสัมพันธ์ถูกระงับหรือสิ้นสุด",
    grant: "ให้สิทธิ์ดูผู้ป่วยในเครือข่าย",
    revoke: "ยกเลิกสิทธิ์ดูผู้ป่วยในเครือข่าย",
    granted: "ให้สิทธิ์ดูผู้ป่วยในเครือข่ายแล้ว",
    revoked: "ยกเลิกสิทธิ์ดูผู้ป่วยในเครือข่ายแล้ว",
    conflict: "สถานะสิทธิ์ดูผู้ป่วยในเครือข่ายเปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลล่าสุด",
    forbidden: "ไม่มีสิทธิ์จัดการสิทธิ์ดูผู้ป่วยในเครือข่าย",
  },
} as const satisfies Record<GrantKind, Record<string, unknown>>;

function grantNotice(
  kind: GrantKind,
  verdict: MutationVerdict,
  state: WorkforceReportExportGrantActionState,
): MutationNotice | null {
  const copy = grantCopy[kind];
  if (verdict === "SUCCESS" && state.status === "SUCCESS") {
    return { level: "success", message: state.granted ? copy.granted : copy.revoked };
  }

  if (verdict === "CONFLICT") {
    return { level: "warning", message: copy.conflict };
  }

  return verdict === "FORBIDDEN" ? { level: "error", message: copy.forbidden } : null;
}

/** E1 (ก-15) report export and ADR-0016 network Patient read: the OWNER grants or revokes it for this MEMBER. */
export function ReportExportGrantControl({
  expectedUpdatedAt,
  grant,
  kind = "REPORT_EXPORT",
  relationshipId,
  targetHospitalId,
}: {
  expectedUpdatedAt: string;
  grant: NonNullable<WorkforceDetail["reportExportGrant"]>;
  kind?: GrantKind;
  relationshipId: string;
  targetHospitalId: string;
}): React.JSX.Element {
  const copy = grantCopy[kind];
  const session = useScopedMutationSession<WorkforceReportExportGrantActionState>({
    scope: `${kind}:${relationshipId}`,
    // The status badge is the authoritative state; the form unlocks once the refreshed grant reflects the result.
    snapshot: String(grant.granted),
    refreshOnSuccess: true,
  });
  const { action: formAction, pending } = useScopedMutation(session, {
    kind: "grant",
    action: copy.action,
    initialState: initialWorkforceReportExportGrantActionState,
    classify: (state, formData) => classifyWorkforceState(state, grantConfirms(state, formData)),
    notice: (verdict, state) => grantNotice(kind, verdict, state),
    message: workforceStateMessage,
    resultSnapshot: (state) => (state.status === "SUCCESS" ? String(state.granted) : null),
  });
  const locked = pending || session.locked;
  const canChange = grant.granted ? grant.canRevoke : grant.canGrant;

  return (
    <Panel>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold tracking-[-0.02em]">{copy.title}</h2>
        <StatusBadge variant={grant.granted ? "success" : "neutral"}>
          {grant.granted ? copy.grantedBadge : "ยังไม่ได้รับสิทธิ์"}
        </StatusBadge>
      </div>
      <p className="mt-2 text-sm leading-6 text-text-muted">{copy.description}</p>
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
            {pending ? "กำลังบันทึก..." : grant.granted ? copy.revoke : copy.grant}
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
            ? copy.granted
            : `${copy.revoked} มีผลตั้งแต่คำขอถัดไป`
        }
      />
      <UnknownOutcomeAlert active={session.unconfirmed} className="mt-4" recovery={{ kind: "reload" }} />
    </Panel>
  );
}
