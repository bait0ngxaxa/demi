import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import {
  APPOINTMENT_TYPE_LABELS,
  type AppointmentTypeValue,
} from "@/modules/appointments/domain/appointment-definitions";
import type {
  FollowupHistory,
  FollowupHistoryItem,
} from "@/modules/followups/services/followup-query-service";
import type { PatientProgramProjection } from "@/modules/patient-program/services/patient-program-query-service";

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(value);
}

function appointmentSummary(item: FollowupHistoryItem): string {
  if (!item.appointment) {
    return "ไม่มีการเชื่อมโยงนัดหมาย";
  }

  return `${APPOINTMENT_TYPE_LABELS[item.appointment.type as AppointmentTypeValue]} · ${formatDate(item.appointment.scheduledAt)}`;
}

function FollowupHistoryRow({
  item,
  relationshipId,
}: {
  item: FollowupHistoryItem;
  relationshipId: string;
}): React.JSX.Element {
  const detailHref = item.patientProgramId
    ? `/app/patients/${encodeURIComponent(relationshipId)}/programs/${encodeURIComponent(item.patientProgramId)}/followups/${encodeURIComponent(item.followupId)}`
    : `/app/patients/${encodeURIComponent(relationshipId)}/followups/${encodeURIComponent(item.followupId)}`;

  return (
    <li>
      <Link
        className="group block px-5 py-5 transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-focus-ring sm:px-7"
        href={detailHref}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
          <div className="min-w-0">
            <p className="text-base font-semibold text-text group-hover:text-brand-strong">
              รอบติดตามที่ {item.roundNumber}
            </p>
            <p className="mt-1 text-sm leading-6 text-text-muted">
              บันทึกเมื่อ {formatDate(item.recordedAt)} · ผู้บันทึก: {item.createdByDisplayName}
            </p>
          </div>
          <span className="text-sm font-semibold text-brand-strong">ดูรายละเอียด</span>
        </div>
        <dl className="mt-4 grid gap-3 border-t border-border pt-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-text-muted">นัดหมายที่อ้างอิง</dt>
            <dd className="mt-1 font-semibold text-text">{appointmentSummary(item)}</dd>
          </div>
          <div>
            <dt className="text-text-muted">แผนเป้าหมายที่อ้างอิง</dt>
            <dd className="mt-1 font-semibold text-text">
              {item.sourceGoalPlan ? `รอบที่ ${item.sourceGoalPlan.roundNumber}` : "ไม่มีการเชื่อมโยงแผนเป้าหมาย"}
            </dd>
          </div>
          <div>
            <dt className="text-text-muted">ขอบเขตประวัติ</dt>
            <dd className="mt-1 font-semibold text-text">
              {item.patientProgramId ? "บันทึกผ่านโปรแกรม" : "ประวัติก่อนมีโปรแกรม"}
            </dd>
          </div>
        </dl>
      </Link>
    </li>
  );
}

export function FollowupHistoryView({
  activeProgram,
  canManage,
  history,
}: {
  activeProgram: PatientProgramProjection | null;
  canManage: boolean;
  history: FollowupHistory;
}): React.JSX.Element {
  const relationshipId = history.patient.patientHospitalRelationshipId;
  const activeProgramHref = activeProgram
    ? `/app/patients/${encodeURIComponent(relationshipId)}/programs/${encodeURIComponent(activeProgram.programId)}`
    : null;
  const createHref = activeProgram
    ? `${activeProgramHref}/followups/new`
    : `/app/patients/${encodeURIComponent(relationshipId)}/followups/new`;
  const showCreateAction = activeProgram === null || canManage;

  return (
    <div className="max-w-5xl">
      <PageHeader
        actions={
          showCreateAction && history.canRecord ? (
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-control bg-action-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-action-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              href={createHref}
            >
              {activeProgram ? "บันทึกในโปรแกรมปัจจุบัน" : "บันทึกการติดตามผล"}
            </Link>
          ) : null
        }
        breadcrumbs={[
          {
            href: `/app/patients/${encodeURIComponent(relationshipId)}`,
            label: "รายละเอียดผู้ป่วย",
          },
          { label: "ประวัติการติดตามผล" },
        ]}
        description="ประวัติรวมการติดตามผลของผู้ป่วย เรียงจากรอบล่าสุด"
        title="ประวัติการติดตามผลทั้งหมด"
      />

      <div className="space-y-6 pt-8">
        {activeProgram && activeProgramHref ? (
          <Alert variant="info">
            หน้านี้เป็นประวัติรวมของความสัมพันธ์กับโรงพยาบาล การติดตามผลรอบใหม่ให้บันทึกจากโปรแกรมปัจจุบัน
            <Link
              className="ml-1 font-semibold underline decoration-brand-soft underline-offset-4 hover:text-brand-strong focus-visible:rounded-control focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
              href={activeProgramHref}
            >
              ไปที่โปรแกรมปัจจุบัน
            </Link>
          </Alert>
        ) : null}

        <Panel>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-text">
                {history.patient.displayName}
              </h2>
              <p className="mt-1 text-sm leading-6 text-text-muted">{history.patient.hospital.name}</p>
            </div>
            <p className="text-sm text-text-muted">
              HN ของโรงพยาบาลนี้: {history.patient.hospitalNumber ?? "ไม่ระบุ"}
            </p>
          </div>
        </Panel>

        <section aria-labelledby="followup-history-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.02em]" id="followup-history-heading">
                ประวัติการติดตามผล
              </h2>
              <p className="mt-1 text-sm text-text-muted">แสดงรายการล่าสุดไม่เกิน 50 รอบ เรียงใหม่ไปเก่า</p>
            </div>
            <p className="text-sm text-text-muted">แสดง {history.items.length} รายการ</p>
          </div>

          {history.items.length > 0 ? (
            <div className="mt-4 overflow-hidden rounded-panel border border-border bg-surface">
              <ul aria-label="ประวัติการติดตามผล" className="divide-y divide-border">
                {history.items.map((item) => (
                  <FollowupHistoryRow item={item} key={item.followupId} relationshipId={relationshipId} />
                ))}
              </ul>
            </div>
          ) : (
            <div className="mt-4 rounded-panel border border-dashed border-border bg-surface px-5 py-8 text-center sm:px-7">
              <p className="font-semibold text-text">ยังไม่มีรายการติดตามผลสำหรับผู้ป่วยรายนี้</p>
              <p className="mt-2 text-sm leading-6 text-text-muted">
                บันทึกรอบแรกเพื่อเริ่มติดตามข้อมูลของผู้ป่วย
              </p>
              {showCreateAction && history.canRecord ? (
                <Link
                  className="mt-5 inline-flex min-h-11 items-center justify-center rounded-control bg-action-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-action-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                  href={createHref}
                >
                  {activeProgram ? "บันทึกในโปรแกรมปัจจุบัน" : "บันทึกการติดตามผลรอบแรก"}
                </Link>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
