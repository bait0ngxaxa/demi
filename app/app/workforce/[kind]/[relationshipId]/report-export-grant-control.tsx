"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { useMutationActionState } from "@/components/ui/mutation-action-state";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import type { WorkforceDetail } from "@/modules/workforce/services/workforce-service";
import { setHospitalMembershipReportExportGrantAction } from "@/modules/workforce/transport/server-actions";
import { initialWorkforceReportExportGrantActionState } from "@/modules/workforce/transport/action-state";

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
  const router = useRouter();
  const [state, formAction, pending, unknownOutcome] = useMutationActionState(
    setHospitalMembershipReportExportGrantAction,
    initialWorkforceReportExportGrantActionState,
  );

  useEffect(() => {
    if (state.status === "SUCCESS") router.refresh();
  }, [router, state]);

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
            disabled={pending || unknownOutcome}
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
      {state.status === "ERROR" ? (
        <Alert className="mt-4" role="alert" variant={state.code === "CONFLICT" ? "warning" : "danger"}>
          {state.message}
        </Alert>
      ) : null}
      {state.status === "SUCCESS" ? (
        <Alert className="mt-4" variant="success">
          {state.granted ? "ให้สิทธิ์ส่งออกรายงานแล้ว" : "ยกเลิกสิทธิ์ส่งออกรายงานแล้ว มีผลตั้งแต่คำขอถัดไป"}
        </Alert>
      ) : null}
      <UnknownOutcomeAlert active={unknownOutcome} className="mt-4" recovery={{ kind: "reload" }} />
    </Panel>
  );
}
