import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  APPOINTMENT_STATUS_LABELS,
  type AppointmentStatusValue,
} from "@/modules/appointments/domain/appointment-definitions";
import {
  FOLLOWUP_PROGRESS_STATUS_LABELS,
  type FollowupProgressStatus,
} from "@/modules/followups/domain/followup-definitions";
import type {
  PatientSelfAppointmentDetail,
  PatientSelfAppointmentHistory,
  PatientSelfFollowupDetail,
  PatientSelfGoalPlanDetail,
} from "@/modules/patient-self/services/patient-self-care-query-service";

import {
  displayPatientBloodPressure,
  displayPatientMeasurement,
  formatPatientDateOnly,
  formatPatientDateTime,
  patientProgramStatusLabels,
  PatientSelfEmptyState,
  PatientSelfHospitalContext,
} from "./patient-self-care-presentation";
import {
  appointmentStatusVariant,
  ORDINARY_PATIENT_APPOINTMENT_LINKS,
  PatientSelfAppointmentDetailContent,
  PatientSelfAppointmentHistoryContent,
} from "./patient-self-appointment-content";
import { PatientAppointmentInteractionControls } from "./appointments/patient-appointment-interaction-controls";

const linkClassName =
  "inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2";

function programContextText(
  program: PatientSelfGoalPlanDetail["program"] | PatientSelfFollowupDetail["program"],
): string {
  return program
    ? `Program เริ่ม ${formatPatientDateOnly(program.startedAt)} · ${patientProgramStatusLabels[program.status]}`
    : "ไม่ได้เชื่อมกับ Program";
}

function followupStatusLabel(status: FollowupProgressStatus): string {
  return FOLLOWUP_PROGRESS_STATUS_LABELS[status];
}


export function PatientSelfGoalPlanDetailView({
  detail,
}: {
  detail: PatientSelfGoalPlanDetail;
}): React.JSX.Element {
  const relationship = detail.relationship;
  const careHref = `/app/personal/care/${encodeURIComponent(relationship.relationshipId)}`;

  return (
    <div className="max-w-5xl">
      <PageHeader
        actions={<Link className={linkClassName} href={careHref}>กลับข้อมูลการดูแล</Link>}
        breadcrumbs={[
          { href: "/app/personal", label: "พื้นที่ส่วนตัว" },
          { href: "/app/personal/care", label: "ข้อมูลการดูแล" },
          { href: careHref, label: relationship.hospitalName },
          { label: `แผนเป้าหมาย รอบที่ ${detail.roundNumber}` },
        ]}
        description="แสดงรายละเอียดแผนเป้าหมายตามข้อมูลที่บันทึกไว้"
        title={`แผนเป้าหมาย รอบที่ ${detail.roundNumber}`}
      />

      <div className="space-y-6 pt-6">
        <PatientSelfHospitalContext relationship={relationship} />
        <Panel>
          <dl className="grid min-w-0 gap-x-8 gap-y-4 sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-sm font-semibold text-text-muted">วันที่บันทึก</dt>
              <dd className="mt-1 break-words font-semibold text-text">
                {formatPatientDateTime(detail.createdAt)}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-sm font-semibold text-text-muted">Program</dt>
              <dd className="mt-1 break-words font-semibold text-text">
                {programContextText(detail.program)}
              </dd>
            </div>
            <div className="min-w-0 sm:col-span-2">
              <dt className="text-sm font-semibold text-text-muted">เป้าหมายหลัก</dt>
              <dd className="mt-1 break-words font-semibold text-text">
                {detail.primaryGoalLabel}
              </dd>
            </div>
          </dl>
        </Panel>

        {detail.primaryGoalNote || detail.weeklyNote ? (
          <Panel>
            <h2 className="text-lg font-semibold text-text">บันทึก</h2>
            <dl className="mt-4 space-y-4">
              {detail.primaryGoalNote ? (
                <div className="min-w-0">
                  <dt className="text-sm font-semibold text-text-muted">รายละเอียดเป้าหมาย</dt>
                  <dd className="mt-1 break-words whitespace-pre-wrap text-sm leading-6 text-text">
                    {detail.primaryGoalNote}
                  </dd>
                </div>
              ) : null}
              {detail.weeklyNote ? (
                <div className="min-w-0">
                  <dt className="text-sm font-semibold text-text-muted">บันทึกรายสัปดาห์</dt>
                  <dd className="mt-1 break-words whitespace-pre-wrap text-sm leading-6 text-text">
                    {detail.weeklyNote}
                  </dd>
                </div>
              ) : null}
            </dl>
          </Panel>
        ) : null}

        <section aria-labelledby="patient-self-goal-items-heading">
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-text" id="patient-self-goal-items-heading">
            กิจกรรมที่บันทึกไว้
          </h2>
          {detail.items.length > 0 ? (
            <ul className="mt-4 divide-y divide-border border-y border-border">
              {detail.items.map((item, index) => (
                <li className="min-w-0 py-4 first:pt-0 last:pb-0" key={`${item.activityLabel}-${index}`}>
                  <p className="break-words font-semibold text-text">{item.activityLabel}</p>
                  <p className="mt-1 break-words text-sm leading-6 text-text-muted">
                    เป้าหมาย {item.targetDays} วัน
                    {item.targetValue !== null && item.targetUnit
                      ? ` · ${item.targetValue} ${item.targetUnit}`
                      : ""}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <PatientSelfEmptyState title="ยังไม่มีรายการกิจกรรมในแผนนี้" />
          )}
        </section>
      </div>
    </div>
  );
}

export function PatientSelfFollowupDetailView({
  detail,
}: {
  detail: PatientSelfFollowupDetail;
}): React.JSX.Element {
  const relationship = detail.relationship;
  const careHref = `/app/personal/care/${encodeURIComponent(relationship.relationshipId)}`;

  return (
    <div className="max-w-5xl">
      <PageHeader
        actions={<Link className={linkClassName} href={careHref}>กลับข้อมูลการดูแล</Link>}
        breadcrumbs={[
          { href: "/app/personal", label: "พื้นที่ส่วนตัว" },
          { href: "/app/personal/care", label: "ข้อมูลการดูแล" },
          { href: careHref, label: relationship.hospitalName },
          { label: `การติดตาม รอบที่ ${detail.roundNumber}` },
        ]}
        description="แสดงข้อมูลที่บันทึกไว้ในรอบการติดตามนี้"
        title={`การติดตาม รอบที่ ${detail.roundNumber}`}
      />

      <div className="space-y-6 pt-6">
        <PatientSelfHospitalContext relationship={relationship} />
        <Panel>
          <dl className="grid min-w-0 gap-x-8 gap-y-4 sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-sm font-semibold text-text-muted">วันที่บันทึก</dt>
              <dd className="mt-1 break-words font-semibold text-text">
                {formatPatientDateTime(detail.recordedAt)}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-sm font-semibold text-text-muted">Program</dt>
              <dd className="mt-1 break-words font-semibold text-text">
                {programContextText(detail.program)}
              </dd>
            </div>
          </dl>
        </Panel>

        <Panel>
          <h2 className="text-lg font-semibold text-text">ค่าที่บันทึก</h2>
          <dl className="mt-5 grid min-w-0 gap-x-8 gap-y-4 sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-sm font-semibold text-text-muted">น้ำหนัก</dt>
              <dd className="mt-1 break-words font-semibold text-text">
                {displayPatientMeasurement(detail.measurements.weight, "kg")}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-sm font-semibold text-text-muted">รอบเอว</dt>
              <dd className="mt-1 break-words font-semibold text-text">
                {displayPatientMeasurement(detail.measurements.waistCircumference, "cm")}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-sm font-semibold text-text-muted">ความดันโลหิต</dt>
              <dd className="mt-1 break-words font-semibold text-text">
                {displayPatientBloodPressure(
                  detail.measurements.systolicBloodPressure,
                  detail.measurements.diastolicBloodPressure,
                )}
              </dd>
            </div>
          </dl>
        </Panel>

        <section aria-labelledby="patient-self-followup-progress-heading">
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-text" id="patient-self-followup-progress-heading">
            ความคืบหน้ากิจกรรมที่บันทึก
          </h2>
          {detail.activityProgress.length > 0 ? (
            <ul className="mt-4 divide-y divide-border border-y border-border">
              {detail.activityProgress.map((item, index) => (
                <li className="flex min-w-0 flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between" key={`${item.activityLabel}-${index}`}>
                  <span className="break-words font-medium text-text">{item.activityLabel}</span>
                  <StatusBadge variant="neutral">
                    {followupStatusLabel(item.status as FollowupProgressStatus)}
                  </StatusBadge>
                </li>
              ))}
            </ul>
          ) : (
            <PatientSelfEmptyState title="ยังไม่มีข้อมูลกิจกรรมในรอบนี้" />
          )}
        </section>
      </div>
    </div>
  );
}


export function PatientSelfAppointmentHistoryView({
  history,
}: {
  history: PatientSelfAppointmentHistory;
}): React.JSX.Element {
  return (
    <div className="max-w-5xl">
      <PageHeader
        breadcrumbs={[
          { href: "/app/personal", label: "พื้นที่ส่วนตัว" },
          { href: "/app/personal/appointments", label: "นัดหมาย" },
          { label: history.relationship.hospitalName },
        ]}
        description="รายการนัดหมายของโรงพยาบาลนี้ เรียงจากวันนัดล่าสุด"
        title="นัดหมาย"
      />
      <PatientSelfAppointmentHistoryContent history={history} links={ORDINARY_PATIENT_APPOINTMENT_LINKS} />
    </div>
  );
}

export function PatientSelfAppointmentDetailView({
  detail,
  cancellationRequestNonce, rescheduleRequests,
}: {
  detail: PatientSelfAppointmentDetail;
  cancellationRequestNonce: string;
  rescheduleRequests?: React.ReactNode;
}): React.JSX.Element {
  const relationshipId = detail.relationship.relationshipId;
  const historyHref = ORDINARY_PATIENT_APPOINTMENT_LINKS.history(relationshipId);

  return (
    <div className="max-w-5xl">
      <PageHeader
        actions={
          <StatusBadge variant={appointmentStatusVariant(detail.status as AppointmentStatusValue)}>
            {APPOINTMENT_STATUS_LABELS[detail.status as AppointmentStatusValue]}
          </StatusBadge>
        }
        breadcrumbs={[
          { href: "/app/personal", label: "พื้นที่ส่วนตัว" },
          { href: "/app/personal/appointments", label: "นัดหมาย" },
          { href: historyHref, label: detail.relationship.hospitalName },
          { label: "รายละเอียดนัดหมาย" },
        ]}
        description="นัดหมายของคุณตามข้อมูลที่โรงพยาบาลบันทึกไว้"
        title="รายละเอียดนัดหมาย"
      />
      <div className="space-y-6 pt-6">
        <PatientSelfAppointmentDetailContent
          detail={detail}
          interactions={
            <PatientAppointmentInteractionControls
              appointment={detail}
              cancellationRequestNonce={cancellationRequestNonce}
              hospitalStatus={detail.relationship.hospitalStatus}
              careEnded={detail.relationship.careEndedAt !== null}
              relationshipId={relationshipId}
            />
          }
          rescheduleRequests={rescheduleRequests}
        />
        <nav aria-label="กลับจากรายละเอียดนัดหมาย" className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Link className={linkClassName} href={historyHref} prefetch={false}>กลับไปนัดหมายของโรงพยาบาลนี้</Link>
          <Link className={linkClassName} href="/app/personal" prefetch={false}>กลับพื้นที่ส่วนตัว</Link>
        </nav>
      </div>
    </div>
  );
}
