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
import type {
  FollowupDetail,
  FollowupProgramDetail,
} from "@/modules/followups/services/followup-query-service";

export type FollowupDetailViewScope =
  | {
      kind: "relationship";
      relationshipId: string;
    }
  | {
      kind: "program";
      relationshipId: string;
      patientProgramId: string;
      canManage: boolean;
      programStatus: "ACTIVE" | "COMPLETED";
    };

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

export function FollowupDetailView({
  detail,
  scope,
}: {
  detail: FollowupDetail | FollowupProgramDetail;
  scope: FollowupDetailViewScope;
}): React.JSX.Element {
  const relationshipId = scope.relationshipId;
  const linkedProgramId = scope.kind === "program" ? scope.patientProgramId : detail.patientProgramId;
  const isProgramRoute = scope.kind === "program";
  const historyHref = linkedProgramId
    ? `/app/patients/${encodeURIComponent(relationshipId)}/programs/${encodeURIComponent(linkedProgramId)}/followups`
    : `/app/patients/${encodeURIComponent(relationshipId)}/followups`;
  const activityLabels = new Map(
    detail.sourceGoalPlan?.items.map((item) => [item.activityCode, item.activityLabel]) ?? [],
  );

  return (
    <div className="max-w-5xl">
      <PageHeader
        actions={<StatusBadge variant="info">บันทึกแล้ว</StatusBadge>}
        breadcrumbs={
          isProgramRoute
            ? [
                {
                  href: `/app/patients/${encodeURIComponent(relationshipId)}/programs/${encodeURIComponent(scope.patientProgramId)}`,
                  label: "รายละเอียดโปรแกรม",
                },
                {
                  href: historyHref,
                  label: "ประวัติการติดตามผล",
                },
                { label: `รอบที่ ${detail.roundNumber}` },
              ]
            : [
                {
                  href: `/app/patients/${encodeURIComponent(relationshipId)}`,
                  label: "รายละเอียดผู้ป่วย",
                },
                {
                  href: historyHref,
                  label: "ประวัติการติดตามผลทั้งหมด",
                },
                { label: `รอบที่ ${detail.roundNumber}` },
              ]
        }
        description={
          isProgramRoute
            ? "รายละเอียดการติดตามผลรอบที่บันทึกไว้ในโปรแกรมนี้"
            : "รายละเอียดการติดตามผลรอบที่บันทึกไว้ในประวัติของผู้ป่วย"
        }
        title={`การติดตามผลรอบที่ ${detail.roundNumber}`}
      />

      <div className="space-y-6 pt-8">
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

        {!isProgramRoute && detail.patientProgramId ? (
          <Alert variant="info">
            รอบนี้บันทึกอยู่ในโปรแกรมที่ระบุไว้ จึงแสดงแยกจากประวัติก่อนมีโปรแกรม
            <Link
              className="ml-1 font-semibold underline decoration-brand-soft underline-offset-4"
              href={`/app/patients/${encodeURIComponent(relationshipId)}/programs/${encodeURIComponent(detail.patientProgramId)}`}
            >
              เปิดรายละเอียดโปรแกรม
            </Link>
          </Alert>
        ) : null}

        <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em]">รายการที่อ้างอิง</h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <p className="text-sm text-text-muted">นัดหมาย</p>
              {detail.appointment ? (
                <p className="mt-1 font-semibold text-text">
                  {APPOINTMENT_TYPE_LABELS[detail.appointment.type as AppointmentTypeValue]} · {formatDate(detail.appointment.scheduledAt)}
                </p>
              ) : (
                <p className="mt-1 font-semibold text-text">ไม่มีการเชื่อมโยงนัดหมาย</p>
              )}
            </div>
            <div>
              <p className="text-sm text-text-muted">แผนเป้าหมาย</p>
              {detail.sourceGoalPlan ? (
                <p className="mt-1 font-semibold text-text">
                  รอบที่ {detail.sourceGoalPlan.roundNumber} · {detail.sourceGoalPlan.primaryGoalLabel}
                </p>
              ) : (
                <p className="mt-1 font-semibold text-text">ไม่มีการเชื่อมโยงแผนเป้าหมาย</p>
              )}
            </div>
          </div>
          {detail.sourceGoalPlan ? (
            <div className="mt-5 border-t border-border pt-5">
              <p className="text-sm leading-6 text-text-muted">
                กิจกรรมและเป้าหมายด้านล่างอ้างอิงจากแผนเป้าหมายรอบนี้โดยตรง ไม่ได้เปลี่ยนตามแผนเป้าหมายล่าสุด
              </p>
              <p className="mt-2 text-sm text-text-muted">
                {detail.sourceGoalPlan.primaryGoalNote ?? "ไม่มีหมายเหตุเป้าหมายหลัก"} · {detail.sourceGoalPlan.weeklyNote ?? "ไม่มีหมายเหตุรายสัปดาห์"}
              </p>
            </div>
          ) : null}
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em]">ค่าที่บันทึกในการติดตามผล</h2>
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
            แสดงเฉพาะค่าที่บันทึกไว้ ไม่มีการคำนวณผลหรือคำแนะนำอัตโนมัติ
          </p>
        </Panel>

        {detail.sourceGoalPlan ? (
          <Panel>
            <h2 className="text-xl font-semibold tracking-[-0.02em]">ความคืบหน้าตามแผนเป้าหมาย</h2>
            <ul className="mt-6 space-y-5">
              {detail.activityProgress.map((progress) => (
                <li className="border-t border-border pt-5 first:border-t-0 first:pt-0" key={progress.progressId}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <h3 className="font-semibold text-text">
                      {activityLabels.get(progress.goalActivityCode) ?? progress.goalActivityCode}
                    </h3>
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
              <p className="mt-5 text-sm leading-6 text-text-muted">รอบนี้ไม่มีรายการความคืบหน้าที่บันทึกไว้</p>
            ) : null}
          </Panel>
        ) : null}

        <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em]">ความมั่นใจ / สิ่งที่ต้องการสะท้อน / หมายเหตุ</h2>
          <dl className="mt-5 space-y-5 border-y border-border py-5">
            <div>
              <dt className="text-sm text-text-muted">คะแนนความมั่นใจ (0–10)</dt>
              <dd className="mt-1 font-semibold text-text">
                {detail.confidenceScore === null ? "ไม่ได้ระบุ" : detail.confidenceScore}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-text-muted">สิ่งที่ต้องการสะท้อน</dt>
              <dd className="mt-1 whitespace-pre-wrap text-sm leading-6 text-text">
                {detail.reflectionNote ?? "ไม่ได้ระบุ"}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-text-muted">แผนต่อเนื่อง</dt>
              <dd className="mt-1 whitespace-pre-wrap text-sm leading-6 text-text">
                {detail.confidencePlan ?? "ไม่ได้ระบุ"}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-text-muted">หมายเหตุทั่วไป</dt>
              <dd className="mt-1 whitespace-pre-wrap text-sm leading-6 text-text">
                {detail.generalNote ?? "ไม่ได้ระบุ"}
              </dd>
            </div>
          </dl>
        </Panel>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            href={historyHref}
          >
            กลับไปประวัติการติดตามผล
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
