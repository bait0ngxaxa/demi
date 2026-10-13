import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";
import {
  APPOINTMENT_LOCATION_LABELS,
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_TYPE_LABELS,
  appointmentResponsiblePresentation,
  type AppointmentStatusValue,
  type AppointmentTypeValue,
  type AppointmentLocationValue,
} from "@/modules/appointments/domain/appointment-definitions";
import {
  APPOINTMENT_CANCELLATION_REQUEST_STATUS_LABELS,
  APPOINTMENT_ACKNOWLEDGEMENT_GUIDANCE,
  APPOINTMENT_CANCELLATION_REQUEST_GUIDANCE,
  APPOINTMENT_INTERACTION_SOURCE_LABELS,
} from "@/modules/appointments/domain/appointment-interaction-definitions";
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
  PatientSelfHistoryMoreLink,
  patientSelfHistoryPageHref,
} from "./patient-self-care-presentation";
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

function statusVariant(status: AppointmentStatusValue): StatusVariant {
  if (status === "COMPLETED") {
    return "success";
  }

  if (status === "CANCELLED") {
    return "danger";
  }

  if (status === "NO_SHOW") {
    return "neutral";
  }

  return "warning";
}

function followupStatusLabel(status: FollowupProgressStatus): string {
  return FOLLOWUP_PROGRESS_STATUS_LABELS[status];
}

function appointmentLocationLabel(type: AppointmentLocationValue | null): string {
  return type ? APPOINTMENT_LOCATION_LABELS[type] : "ไม่ระบุสถานที่";
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
  const relationshipId = history.relationship.relationshipId;
  const historyHref =
    "/app/personal/appointments/" + encodeURIComponent(relationshipId);

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
      <div className="space-y-6 pt-6">
        <PatientSelfHospitalContext relationship={history.relationship} />
        <div className="space-y-2 text-sm leading-6 text-text-muted">
          <p>{APPOINTMENT_ACKNOWLEDGEMENT_GUIDANCE}</p>
          <p>{APPOINTMENT_CANCELLATION_REQUEST_GUIDANCE}</p>
          <p>แสดงรายการในหน้านี้ตามวันนัด เปิดรายละเอียดเพื่อดูผลล่าสุดและการดำเนินการที่มีสิทธิ์</p>
        </div>
        {history.appointments.length > 0 ? (
          <ul className="divide-y divide-border overflow-hidden rounded-panel border border-border bg-surface">
            {history.appointments.map((appointment) => (
              <li key={appointment.appointmentId}>
                <Link
                  className="group block min-w-0 px-5 py-5 transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-focus-ring sm:px-7"
                  href={`/app/personal/appointments/${encodeURIComponent(relationshipId)}/${encodeURIComponent(appointment.appointmentId)}`}
                  prefetch={false}
                >
                  <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="break-words font-semibold text-text group-hover:text-brand-strong">
                        {formatPatientDateTime(appointment.scheduledAt)}
                      </p>
                      <p className="mt-1 break-words text-sm leading-6 text-text-muted">
                        {APPOINTMENT_TYPE_LABELS[appointment.type as AppointmentTypeValue]} · {appointmentLocationLabel(appointment.locationType as AppointmentLocationValue | null)}
                      </p>
                      {appointment.locationDetail ? (
                        <p className="mt-1 break-words text-sm leading-6 text-text-muted">
                          {appointment.locationDetail}
                        </p>
                      ) : null}
                      <p className="mt-1 break-words text-sm leading-6 text-text-muted">
                        {appointmentResponsiblePresentation(
                          appointment.responsibleDisplayName,
                          appointment.responsibleProfession,
                        ).heading}: {appointmentResponsiblePresentation(
                          appointment.responsibleDisplayName,
                          appointment.responsibleProfession,
                        ).displayName}
                      </p>
                      {appointment.osmAtCreationDisplayName ? (
                        <p className="mt-1 break-words text-sm leading-6 text-text-muted">
                          OSM ที่เกี่ยวข้องเมื่อนัดถูกสร้าง: {appointment.osmAtCreationDisplayName}
                        </p>
                      ) : null}
                    </div>
                    <StatusBadge variant={statusVariant(appointment.status as AppointmentStatusValue)}>
                      {APPOINTMENT_STATUS_LABELS[appointment.status as AppointmentStatusValue]}
                    </StatusBadge>
                  </div>
                  {appointment.durationMinutes !== null ? (
                    <p className="mt-3 break-words text-sm text-text-muted">
                      ระยะเวลา {appointment.durationMinutes} นาที
                    </p>
                  ) : null}
                  {appointment.acknowledgement ? (
                    <p className="mt-2 break-words text-sm text-text-muted">
                      รับทราบนัดหมายแล้ว · {APPOINTMENT_INTERACTION_SOURCE_LABELS[appointment.acknowledgement.source]}
                    </p>
                  ) : (
                    <p className="mt-2 break-words text-sm text-text-muted">ยังไม่มีการรับทราบสำหรับกำหนดการนี้</p>
                  )}
                  {appointment.cancellationRequests[0] ? (
                    <p className="mt-2 break-words text-sm text-text-muted">
                      คำขอยกเลิกล่าสุด: {APPOINTMENT_CANCELLATION_REQUEST_STATUS_LABELS[appointment.cancellationRequests[0].status]}
                    </p>
                  ) : null}
                  <p className="mt-3 text-sm font-semibold text-brand-strong">เปิดรายละเอียดนัดหมาย</p>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <PatientSelfEmptyState title="ยังไม่มีรายการนัดหมาย" />
        )}
        {history.historyPage.hasMore ? (
          <PatientSelfHistoryMoreLink
            href={patientSelfHistoryPageHref(
              historyHref,
              { page: history.historyPage.page },
              "page",
            )}
          />
        ) : null}
      </div>
    </div>
  );
}

export function PatientSelfAppointmentDetailView({
  detail,
  cancellationRequestNonce,
}: {
  detail: PatientSelfAppointmentDetail;
  cancellationRequestNonce: string;
}): React.JSX.Element {
  const relationshipId = detail.relationship.relationshipId;
  const historyHref = `/app/personal/appointments/${encodeURIComponent(relationshipId)}`;

  return (
    <div className="max-w-5xl">
      <PageHeader
        actions={
          <StatusBadge variant={statusVariant(detail.status as AppointmentStatusValue)}>
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
        <PatientSelfHospitalContext relationship={detail.relationship} />
        <Panel>
          <h2 className="mb-5 text-lg font-semibold">กำหนดการและสถานะนัดหมาย</h2>
          <dl className="grid min-w-0 gap-x-8 gap-y-5 sm:grid-cols-2">
            <div className="min-w-0 sm:col-span-2">
              <dt className="text-sm font-semibold text-text-muted">วันและเวลานัด</dt>
              <dd className="mt-1 break-words font-semibold text-text">
                {formatPatientDateTime(detail.scheduledAt)}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-sm font-semibold text-text-muted">ประเภทนัดหมาย</dt>
              <dd className="mt-1 break-words font-semibold text-text">
                {APPOINTMENT_TYPE_LABELS[detail.type as AppointmentTypeValue]}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-sm font-semibold text-text-muted">สถานะนัดหมาย</dt>
              <dd className="mt-1 break-words font-semibold text-text">
                {APPOINTMENT_STATUS_LABELS[detail.status as AppointmentStatusValue]}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-sm font-semibold text-text-muted">ระยะเวลา</dt>
              <dd className="mt-1 break-words font-semibold text-text">
                {detail.durationMinutes === null ? "ไม่ระบุ" : `${detail.durationMinutes} นาที`}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-sm font-semibold text-text-muted">รูปแบบสถานที่</dt>
              <dd className="mt-1 break-words font-semibold text-text">
                {appointmentLocationLabel(detail.locationType as AppointmentLocationValue | null)}
              </dd>
            </div>
            {detail.locationDetail ? (
              <div className="min-w-0 sm:col-span-2">
                <dt className="text-sm font-semibold text-text-muted">รายละเอียดสถานที่</dt>
                <dd className="mt-1 break-words whitespace-pre-wrap font-semibold leading-6 text-text">
                  {detail.locationDetail}
                </dd>
              </div>
            ) : null}
          </dl>
          {detail.status !== "SCHEDULED" ? (
            <p className="mt-5 border-t border-border pt-4 text-sm leading-6 text-text-muted">
              เป็นประวัติผลนัด ไม่เปิดรับการรับทราบหรือคำขอยกเลิกใหม่
              {detail.status === "COMPLETED" ? " สถานะเสร็จสิ้นไม่ได้ยืนยันว่ามีบันทึกการติดตามผลหรือจบโปรแกรมแล้ว" : ""}
            </p>
          ) : null}
        </Panel>
        <Panel>
          <dl className="grid min-w-0 gap-4 sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-sm font-semibold text-text-muted">
                {appointmentResponsiblePresentation(
                  detail.responsibleDisplayName,
                  detail.responsibleProfession,
                ).heading}
              </dt>
              <dd className="mt-1 break-words font-semibold text-text">
                {appointmentResponsiblePresentation(
                  detail.responsibleDisplayName,
                  detail.responsibleProfession,
                ).displayName}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-sm font-semibold text-text-muted">OSM ที่เกี่ยวข้องเมื่อนัดถูกสร้าง</dt>
              <dd className="mt-1 break-words font-semibold text-text">
                {detail.osmAtCreationDisplayName ?? "ไม่มีข้อมูล OSM ณ วันที่สร้างนัด"}
              </dd>
              <dd className="mt-1 text-sm leading-6 text-text-muted">เป็นข้อมูลเมื่อสร้างนัด ไม่ยืนยันผู้รับผิดชอบปัจจุบันหรือการตอบรับงาน</dd>
            </div>
          </dl>
        </Panel>
        <PatientAppointmentInteractionControls
          appointment={detail}
          cancellationRequestNonce={cancellationRequestNonce}
          hospitalStatus={detail.relationship.hospitalStatus}
          relationshipId={relationshipId}
        />
        <nav aria-label="กลับจากรายละเอียดนัดหมาย" className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Link className={linkClassName} href={historyHref} prefetch={false}>กลับไปนัดหมายของโรงพยาบาลนี้</Link>
          <Link className={linkClassName} href="/app/personal" prefetch={false}>กลับพื้นที่ส่วนตัว</Link>
        </nav>
      </div>
    </div>
  );
}
