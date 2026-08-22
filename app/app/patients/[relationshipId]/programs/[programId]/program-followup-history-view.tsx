import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import type { FollowupProgramHistory } from "@/modules/followups/services/followup-query-service";
import type { PatientProgramDetail } from "@/modules/patient-program/services/patient-program-query-service";

import { FollowupHistoryList } from "./followup-workspace";

export function ProgramFollowupHistoryView({
  detail,
  history,
}: {
  detail: PatientProgramDetail;
  history: FollowupProgramHistory;
}): React.JSX.Element {
  const relationshipId = detail.patient.patientHospitalRelationshipId;
  const programId = detail.programId;
  const canCreate = detail.status === "ACTIVE" && history.canRecord;

  return (
    <div>
      <PageHeader
        actions={
          canCreate ? (
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-control bg-action-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-action-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              href={`/app/patients/${encodeURIComponent(relationshipId)}/programs/${encodeURIComponent(programId)}/followups/new`}
            >
              บันทึกการติดตามผล
            </Link>
          ) : null
        }
        breadcrumbs={[
          {
            href: `/app/patients/${encodeURIComponent(relationshipId)}/programs/${encodeURIComponent(programId)}`,
            label: "รายละเอียดโปรแกรม",
          },
          { label: "ประวัติการติดตามผล" },
        ]}
        description="ประวัติการติดตามผลที่บันทึกไว้ในโปรแกรมนี้ เรียงจากรอบล่าสุด"
        title="ประวัติการติดตามผล"
      />

      <div className="space-y-6 pt-8">
        <Panel>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-text">
                {history.patient.displayName}
              </h2>
              <p className="mt-1 text-sm leading-6 text-text-muted">{history.patient.hospital.name}</p>
            </div>
            <StatusBadge variant="neutral">
              {detail.status === "ACTIVE" ? "กำลังดำเนินการ" : "เสร็จสิ้นแล้ว"}
            </StatusBadge>
          </div>
          {detail.status === "COMPLETED" ? (
            <p className="mt-5 border-t border-border pt-5 text-sm leading-6 text-text-muted">
              โปรแกรมนี้จบแล้ว ประวัติยังอ่านได้และไม่มีการบันทึกรอบใหม่จากหน้านี้
            </p>
          ) : null}
          <p className="mt-3 text-sm leading-6 text-text-muted">
            บันทึกแล้ว {history.totalCount} รอบ · แสดงรายการล่าสุดไม่เกิน {history.items.length} รอบ
          </p>
        </Panel>

        {history.items.length > 0 ? (
          <FollowupHistoryList
            items={history.items}
            programId={programId}
            relationshipId={relationshipId}
          />
        ) : (
          <div className="rounded-panel border border-dashed border-border bg-surface px-5 py-8 text-center sm:px-7">
            <p className="font-semibold text-text">ยังไม่มีการติดตามผลในโปรแกรมนี้</p>
            <p className="mt-2 text-sm leading-6 text-text-muted">
              การติดตามผลไม่จำเป็นต้องอ้างอิงแผนเป้าหมาย และจะปรากฏในประวัติหลังจากบันทึกสำเร็จ
            </p>
            {canCreate ? (
              <Link
                className="mt-5 inline-flex min-h-11 items-center justify-center rounded-control bg-action-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-action-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                href={`/app/patients/${encodeURIComponent(relationshipId)}/programs/${encodeURIComponent(programId)}/followups/new`}
              >
                บันทึกการติดตามผล
              </Link>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
