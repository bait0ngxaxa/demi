import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import type { AppointmentStatusValue } from "@/modules/appointments/domain/appointment-definitions";
import type { getAppointmentRescheduleHistory } from "@/modules/appointments/services/appointment-reschedule-history-service";
import {
  FOLLOWUP_PROGRESS_STATUS_LABELS,
  type FollowupProgressStatus,
} from "@/modules/followups/domain/followup-definitions";
import {
  followupAchievementLine,
  followupAchievementThresholdLabel,
} from "@/modules/followups/presentation/followup-achievement-summary";
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
  patientFollowupRoundLabel,
  patientFollowupServiceRound,
} from "./patient-self-care-presentation";
import {
  ORDINARY_PATIENT_APPOINTMENT_LINKS,
  PatientSelfAppointmentDetailContent,
  PatientSelfAppointmentHistoryContent,
} from "./patient-self-appointment-content";
import { AppointmentStatusBadge } from "../appointment-summary";
import { PatientAppointmentInteractionControls } from "./appointments/patient-appointment-interaction-controls";
import { PatientAppointmentRequests, patientAppointmentRequestCards } from "./appointments/patient-appointment-requests";

type PatientAppointmentRescheduleHistory = Awaited<ReturnType<typeof getAppointmentRescheduleHistory>>;

const linkClassName =
  "inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2";

function programContextText(
  program: PatientSelfGoalPlanDetail["program"] | PatientSelfFollowupDetail["program"],
): string {
  return program
    ? `โปรแกรมเริ่ม ${formatPatientDateOnly(program.startedAt)} · ${patientProgramStatusLabels[program.status]}`
    : "ไม่ได้เชื่อมกับโปรแกรม";
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
        actions={<Link className={linkClassName} href={careHref}>กลับประวัติการรับบริการ</Link>}
        breadcrumbs={[
          { href: "/app/personal", label: "พื้นที่ส่วนตัว" },
          { href: "/app/personal/care", label: "บริการ" },
          { href: careHref, label: relationship.hospitalName },
          { label: `แผนสุขภาพ รอบที่ ${detail.roundNumber}` },
        ]}
        title={`แผนสุขภาพ รอบที่ ${detail.roundNumber}`}
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
              <dt className="text-sm font-semibold text-text-muted">โปรแกรม</dt>
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
  const hubHref = `/app/personal/care?tab=followups&relationshipId=${encodeURIComponent(relationship.relationshipId)}`;
  const title = `${patientFollowupRoundLabel(patientFollowupServiceRound(detail.roundNumber, detail.program !== null))} · การติดตาม`;
  const achievement = detail.achievement;

  return (
    <div className="max-w-5xl">
      <PageHeader
        breadcrumbs={[
          { href: hubHref, label: "บริการ" },
          { label: title },
        ]}
        title={title}
      />

      <div className="space-y-6 pt-6">
        <PatientSelfHospitalContext relationship={relationship} />
        <Panel>
          <dl className="grid min-w-0 gap-x-8 gap-y-4 sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-sm font-semibold text-text-muted">{detail.serviceDate ? "วันที่ติดตาม" : "วันที่บันทึก"}</dt>
              <dd className="mt-1 break-words font-semibold text-text">
                {detail.serviceDate ? formatPatientDateOnly(detail.serviceDate) : formatPatientDateTime(detail.recordedAt)}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-sm font-semibold text-text-muted">โปรแกรม</dt>
              <dd className="mt-1 break-words font-semibold text-text">
                {programContextText(detail.program)}
              </dd>
            </div>
            {detail.planAdjusted === null ? null : (
              <div className="min-w-0">
                <dt className="text-sm font-semibold text-text-muted">ปรับแผน</dt>
                <dd className="mt-1 font-semibold text-text">{detail.planAdjusted ? "ปรับ" : "ไม่ปรับ"}</dd>
              </div>
            )}
            {detail.hasObstacle === null ? null : (
              <div className="min-w-0">
                <dt className="text-sm font-semibold text-text-muted">อุปสรรค</dt>
                <dd className="mt-1 font-semibold text-text">{detail.hasObstacle ? "มี" : "ไม่มี"}</dd>
              </div>
            )}
          </dl>
        </Panel>

        <section aria-labelledby="patient-self-followup-progress-heading">
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-text" id="patient-self-followup-progress-heading">
            ผลการทำตามแผน
          </h2>
          {achievement ? (
            <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-text">
              <span className="font-semibold tabular-nums">{followupAchievementLine(achievement)}</span>
              {achievement.aboveThreshold ? (
                <StatusBadge variant="success">{followupAchievementThresholdLabel(achievement)}</StatusBadge>
              ) : null}
            </p>
          ) : null}
          {detail.activityProgress.length > 0 ? (
            <ul className="mt-4 divide-y divide-border border-y border-border">
              {detail.activityProgress.map((item, index) => (
                <li className="flex min-w-0 flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between" key={`${item.activityLabel}-${index}`}>
                  <div className="min-w-0">
                    <p className="break-words font-medium text-text">{item.activityLabel}</p>
                    {item.status !== "NOT_APPLICABLE" && item.achievedDays !== null && item.targetDays !== null ? (
                      <p className="mt-1 text-sm tabular-nums text-text-muted">ทำได้ {item.achievedDays} จาก {item.targetDays} วัน</p>
                    ) : null}
                  </div>
                  <StatusBadge variant="neutral">
                    {followupStatusLabel(item.status as FollowupProgressStatus)}
                  </StatusBadge>
                </li>
              ))}
            </ul>
          ) : (
            <PatientSelfEmptyState title="ยังไม่มีข้อมูลกิจกรรมในครั้งนี้" />
          )}
        </section>

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
  cancellationRequestNonce,
  rescheduleHistory,
  rescheduleNonce,
}: {
  detail: PatientSelfAppointmentDetail;
  cancellationRequestNonce: string;
  rescheduleHistory: PatientAppointmentRescheduleHistory;
  rescheduleNonce: string;
}): React.JSX.Element {
  const relationshipId = detail.relationship.relationshipId;
  const careEnded = detail.relationship.careEndedAt !== null;
  const hospitalActive = detail.relationship.hospitalStatus === "ACTIVE";
  const canAct = detail.status === "SCHEDULED" && hospitalActive && !careEnded;
  const notice = careEnded
    ? "โรงพยาบาลนี้สิ้นสุดการดูแลแล้ว ดูนัดหมายเดิมได้อย่างเดียว"
    : !hospitalActive ? "นัดหมายนี้ดูได้อย่างเดียว" : undefined;
  const pendingReschedule = rescheduleHistory.requests.some((request) => request.status === "PENDING");
  const appointmentSummary = `${detail.relationship.hospitalName} · ${new Intl.DateTimeFormat("th-TH", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(detail.scheduledAt)}`;
  const requestCards = patientAppointmentRequestCards({
    appointmentUpdatedAt: detail.updatedAt,
    rescheduleRequests: rescheduleHistory.requests,
    cancellationRequests: detail.cancellationRequests,
  });

  return (
    <div className="max-w-5xl">
      <PageHeader
        actions={<AppointmentStatusBadge status={detail.status as AppointmentStatusValue} />}
        breadcrumbs={[
          { href: "/app/personal/appointments", label: "นัดหมาย" },
          { label: "รายละเอียด" },
        ]}
        title="นัดหมาย"
      />
      <div className="space-y-6 pt-6">
        <PatientSelfAppointmentDetailContent detail={detail} notice={notice} />
        {canAct ? (
          <PatientAppointmentInteractionControls
            appointment={detail}
            appointmentSummary={appointmentSummary}
            cancellationRequestNonce={cancellationRequestNonce}
            relationshipId={relationshipId}
            reschedule={rescheduleHistory.canRequest && rescheduleHistory.scheduled && !pendingReschedule
              ? { nonce: rescheduleNonce, expectedUpdatedAt: rescheduleHistory.updatedAt.toISOString() }
              : null}
          />
        ) : null}
        <PatientAppointmentRequests cards={requestCards} />
      </div>
    </div>
  );
}
