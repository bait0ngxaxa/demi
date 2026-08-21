import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import {
  APPOINTMENT_TYPE_LABELS,
  type AppointmentTypeValue,
} from "@/modules/appointments/domain/appointment-definitions";
import type {
  FollowupHistoryItem,
  FollowupProgramHistory,
} from "@/modules/followups/services/followup-query-service";
import type { PatientProgramDetail } from "@/modules/patient-program/services/patient-program-query-service";

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeZone: "Asia/Bangkok",
  }).format(value);
}

function followupPath(relationshipId: string, programId: string, followupId: string): string {
  return `/app/patients/${encodeURIComponent(relationshipId)}/programs/${encodeURIComponent(programId)}/followups/${encodeURIComponent(followupId)}`;
}

function appointmentSummary(item: FollowupHistoryItem): string {
  if (!item.appointment) {
    return "ไม่มีการเชื่อมโยงนัดหมาย";
  }

  return `${APPOINTMENT_TYPE_LABELS[item.appointment.type as AppointmentTypeValue]} · ${formatDate(item.appointment.scheduledAt)}`;
}

export function FollowupHistoryList({
  items,
  relationshipId,
  programId,
}: {
  items: readonly FollowupHistoryItem[];
  relationshipId: string;
  programId: string;
}): React.JSX.Element {
  return (
    <ul aria-label="ประวัติการติดตามผลในโปรแกรม" className="divide-y divide-border overflow-hidden rounded-panel border border-border bg-surface">
      {items.map((item) => (
        <li key={item.followupId}>
          <Link
            className="group block px-5 py-5 transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-focus-ring sm:px-7"
            href={followupPath(relationshipId, programId, item.followupId)}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
              <div className="min-w-0">
                <p className="font-semibold text-text group-hover:text-brand-strong">รอบที่ {item.roundNumber}</p>
                <p className="mt-1 text-sm leading-6 text-text-muted">บันทึกเมื่อ {formatDate(item.recordedAt)}</p>
              </div>
              <span className="text-sm font-semibold text-brand-strong">ดูรายละเอียด</span>
            </div>
            <dl className="mt-4 grid gap-3 border-t border-border pt-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-text-muted">แผนเป้าหมายที่อ้างอิง</dt>
                <dd className="mt-1 font-semibold text-text">
                  {item.sourceGoalPlan ? `แผนรอบที่ ${item.sourceGoalPlan.roundNumber}` : "ไม่มีการเชื่อมโยงแผนเป้าหมาย"}
                </dd>
              </div>
              <div>
                <dt className="text-text-muted">นัดหมายที่อ้างอิง</dt>
                <dd className="mt-1 break-words font-semibold text-text">{appointmentSummary(item)}</dd>
              </div>
            </dl>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function PatientProgramFollowupWorkspace({
  detail,
  history,
}: {
  detail: PatientProgramDetail;
  history: FollowupProgramHistory;
}): React.JSX.Element {
  const relationshipId = detail.patient.patientHospitalRelationshipId;
  const programId = detail.programId;
  const canCreate = detail.status === "ACTIVE" && history.canRecord;
  const historyPreview = history.items.slice(0, 4);

  return (
    <section aria-labelledby="patient-program-followup-heading">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-text" id="patient-program-followup-heading">
            การติดตามผล
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
            บันทึกการติดตามผลเป็นรอบประวัติของโปรแกรมนี้ แผนเป้าหมายและนัดหมายเป็นบริบทที่เลือกอ้างอิงได้
          </p>
        </div>
        {canCreate ? (
          <Link
            className="inline-flex min-h-11 w-full items-center justify-center rounded-control bg-action-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-action-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2 sm:w-auto"
            href={`/app/patients/${encodeURIComponent(relationshipId)}/programs/${encodeURIComponent(programId)}/followups/new`}
          >
            บันทึกการติดตามผล
          </Link>
        ) : null}
      </div>

      {detail.status === "COMPLETED" ? (
        <Alert className="mt-5" variant="neutral">
          โปรแกรมนี้จบแล้ว จึงอ่านประวัติการติดตามผลได้ แต่ไม่สามารถบันทึกรอบใหม่
        </Alert>
      ) : !history.canRecord ? (
        <Alert className="mt-5" variant="info">
          บัญชีนี้มีสิทธิ์อ่านประวัติการติดตามผลในโปรแกรมนี้ แต่ไม่มีสิทธิ์บันทึกข้อมูลใหม่
        </Alert>
      ) : null}

      {historyPreview.length > 0 ? (
        <div className="mt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold tracking-[-0.02em] text-text">
                ประวัติการติดตามผล
              </h3>
              <p className="mt-1 text-sm leading-6 text-text-muted">
                บันทึกแล้ว {history.totalCount} รอบ
              </p>
            </div>
            <Link
              className="inline-flex min-h-10 items-center text-sm font-semibold text-brand-strong underline decoration-brand-soft underline-offset-4 hover:text-brand focus-visible:rounded-control focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
              href={`/app/patients/${encodeURIComponent(relationshipId)}/programs/${encodeURIComponent(programId)}/followups`}
            >
              ดูประวัติทั้งหมด
            </Link>
          </div>
          <div className="mt-4">
            <FollowupHistoryList
              items={historyPreview}
              programId={programId}
              relationshipId={relationshipId}
            />
          </div>
        </div>
      ) : (
        <div className="mt-5 rounded-panel border border-dashed border-border bg-surface px-5 py-8 sm:px-7">
          <p className="font-semibold text-text">ยังไม่มีการติดตามผลในโปรแกรมนี้</p>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">
            สามารถบันทึกการติดตามผลได้แม้ยังไม่ได้เลือกแผนเป้าหมาย
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
    </section>
  );
}
