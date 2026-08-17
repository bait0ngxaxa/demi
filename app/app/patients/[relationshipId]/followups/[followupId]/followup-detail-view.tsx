import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";
import {
  APPOINTMENT_TYPE_LABELS,
  type AppointmentTypeValue,
} from "@/modules/appointments/domain/appointment-definitions";
import {
  FOLLOWUP_PROGRESS_STATUS_LABELS,
  type FollowupProgressStatus,
} from "@/modules/followups/domain/followup-definitions";
import type { FollowupDetail } from "@/modules/followups/services/followup-query-service";

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(value);
}

function progressVariant(status: FollowupProgressStatus): StatusVariant {
  if (status === "DONE") {
    return "success";
  }

  if (status === "PARTIAL") {
    return "warning";
  }

  if (status === "NOT_DONE") {
    return "danger";
  }

  return "neutral";
}

function measurementValue(value: number | null, unit: string): string {
  return value === null ? "ไม่ได้ระบุ" : `${value} ${unit}`;
}

export function FollowupDetailView({ detail }: { detail: FollowupDetail }): React.JSX.Element {
  const relationshipId = detail.patient.patientHospitalRelationshipId;
  const activityLabels = new Map(
    detail.sourceGoalPlan?.items.map((item) => [item.activityCode, item.activityLabel]) ?? [],
  );

  return (
    <div className="max-w-5xl">
      <PageHeader
        actions={<StatusBadge variant="info">Historical round · immutable</StatusBadge>}
        breadcrumbs={[
          {
            href: `/app/patients/${encodeURIComponent(relationshipId)}`,
            label: "รายละเอียดผู้ป่วย",
          },
          {
            href: `/app/patients/${encodeURIComponent(relationshipId)}/followups`,
            label: "Follow-ups",
          },
          { label: `รอบที่ ${detail.roundNumber}` },
        ]}
        description="รายละเอียด Follow-up รอบประวัติศาสตร์ใน relationship เดียวกัน"
        title={`Follow-up รอบที่ ${detail.roundNumber}`}
      />

      <div className="space-y-6 pt-8">
        <Alert variant="warning">
          <p className="font-semibold">ต้นแบบเพื่อเก็บ Requirement</p>
          <p className="mt-1">
            measurement semantics, progress statuses และ confidence behavior ที่แสดงเป็น provisional และยังรอการยืนยันจากลูกค้า
          </p>
          <p className="mt-2">
            รอบนี้แก้ไข ลบ หรือ overwrite ไม่ได้ใน Phase 9C.0 และระบบไม่แปลผล ไม่ให้คำแนะนำ หรือสร้าง clinical conclusion อัตโนมัติ
          </p>
        </Alert>

        <Panel>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-text">
                {detail.patient.displayName}
              </h2>
              <p className="mt-1 text-sm leading-6 text-text-muted">{detail.patient.hospital.name}</p>
            </div>
            <p className="text-sm text-text-muted">
              HN ของโรงพยาบาลนี้: {detail.patient.hospitalNumber ?? "ไม่ระบุ"}
            </p>
          </div>
          <dl className="mt-6 grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-text-muted">บันทึกเมื่อ</dt>
              <dd className="mt-1 font-semibold text-text">{formatDate(detail.recordedAt)}</dd>
            </div>
            <div>
              <dt className="text-sm text-text-muted">ผู้บันทึก</dt>
              <dd className="mt-1 font-semibold text-text">{detail.createdByDisplayName}</dd>
            </div>
          </dl>
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em]">Context</h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <p className="text-sm text-text-muted">Appointment</p>
              {detail.appointment ? (
                <p className="mt-1 font-semibold text-text">
                  {APPOINTMENT_TYPE_LABELS[detail.appointment.type as AppointmentTypeValue]} · {formatDate(detail.appointment.scheduledAt)}
                </p>
              ) : (
                <p className="mt-1 font-semibold text-text">ไม่มี Appointment context</p>
              )}
            </div>
            <div>
              <p className="text-sm text-text-muted">Goal Plan</p>
              {detail.sourceGoalPlan ? (
                <p className="mt-1 font-semibold text-text">
                  รอบที่ {detail.sourceGoalPlan.roundNumber} · {detail.sourceGoalPlan.primaryGoalLabel}
                </p>
              ) : (
                <p className="mt-1 font-semibold text-text">ไม่มี Goal Plan context</p>
              )}
            </div>
          </div>
          {detail.sourceGoalPlan ? (
            <div className="mt-5 border-t border-border pt-5">
              <p className="text-sm leading-6 text-text-muted">
                กิจกรรมและเป้าหมายด้านล่างอ้างอิงจาก Goal Plan รอบนี้โดยตรง ไม่ได้เปลี่ยนตาม Goal Plan ล่าสุด
              </p>
              <p className="mt-2 text-sm text-text-muted">
                {detail.sourceGoalPlan.primaryGoalNote ?? "ไม่มีหมายเหตุ Primary Goal"} · {detail.sourceGoalPlan.weeklyNote ?? "ไม่มีหมายเหตุรายสัปดาห์"}
              </p>
            </div>
          ) : null}
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em]">Measurements (provisional)</h2>
          <dl className="mt-5 grid gap-4 border-y border-border py-5 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-text-muted">น้ำหนัก</dt>
              <dd className="mt-1 font-semibold text-text">{measurementValue(detail.weight, "kg")}</dd>
            </div>
            <div>
              <dt className="text-sm text-text-muted">รอบเอว</dt>
              <dd className="mt-1 font-semibold text-text">{measurementValue(detail.waistCircumference, "cm")}</dd>
            </div>
            <div>
              <dt className="text-sm text-text-muted">ความดันตัวบน</dt>
              <dd className="mt-1 font-semibold text-text">
                {measurementValue(detail.systolicBloodPressure, "mmHg")}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-text-muted">ความดันตัวล่าง</dt>
              <dd className="mt-1 font-semibold text-text">
                {measurementValue(detail.diastolicBloodPressure, "mmHg")}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-text-muted">น้ำตาลในเลือด / DTX</dt>
              <dd className="mt-1 font-semibold text-text">
                {measurementValue(detail.bloodSugar, "DTX / mg%")}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-sm leading-6 text-text-muted">
            ค่าที่แสดงเป็นค่าที่บันทึกไว้เท่านั้น ไม่มีการคำนวณ BMI, threshold, trend, alert หรือคำแนะนำ
          </p>
        </Panel>

        {detail.sourceGoalPlan ? (
          <Panel>
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Goal Activity Progress (provisional)</h2>
            <ul className="mt-6 space-y-5">
              {detail.activityProgress.map((progress) => (
                <li className="border-t border-border pt-5 first:border-t-0 first:pt-0" key={progress.progressId}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="font-semibold text-text">
                        {activityLabels.get(progress.goalActivityCode) ?? progress.goalActivityCode}
                      </h3>
                      <p className="mt-1 text-sm text-text-muted">รหัสกิจกรรม: {progress.goalActivityCode}</p>
                    </div>
                    <StatusBadge variant={progressVariant(progress.status)}>
                      {FOLLOWUP_PROGRESS_STATUS_LABELS[progress.status]}
                    </StatusBadge>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-text">
                    {progress.note ?? "ไม่มีหมายเหตุกิจกรรม"}
                  </p>
                </li>
              ))}
            </ul>
            {detail.activityProgress.length === 0 ? (
              <p className="mt-5 text-sm leading-6 text-text-muted">รอบนี้ไม่มีรายการ activity progress ที่บันทึกไว้</p>
            ) : null}
          </Panel>
        ) : null}

        <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em]">Confidence / Reflection / Notes</h2>
          <dl className="mt-5 space-y-5 border-y border-border py-5">
            <div>
              <dt className="text-sm text-text-muted">Confidence score (provisional 0–10)</dt>
              <dd className="mt-1 font-semibold text-text">
                {detail.confidenceScore === null ? "ไม่ได้ระบุ" : detail.confidenceScore}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-text-muted">Reflection</dt>
              <dd className="mt-1 whitespace-pre-wrap text-sm leading-6 text-text">
                {detail.reflectionNote ?? "ไม่ได้ระบุ"}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-text-muted">Confidence plan</dt>
              <dd className="mt-1 whitespace-pre-wrap text-sm leading-6 text-text">
                {detail.confidencePlan ?? "ไม่ได้ระบุ"}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-text-muted">General note</dt>
              <dd className="mt-1 whitespace-pre-wrap text-sm leading-6 text-text">
                {detail.generalNote ?? "ไม่ได้ระบุ"}
              </dd>
            </div>
          </dl>
        </Panel>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            href={`/app/patients/${encodeURIComponent(relationshipId)}/followups`}
          >
            กลับไปประวัติ Follow-up
          </Link>
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            href={`/app/patients/${encodeURIComponent(relationshipId)}`}
          >
            กลับไปยังรายละเอียดผู้ป่วย
          </Link>
        </div>
      </div>
    </div>
  );
}
