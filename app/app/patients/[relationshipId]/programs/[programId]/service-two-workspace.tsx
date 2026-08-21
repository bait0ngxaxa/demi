import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { getGoalTargetUnitLabel } from "@/modules/goals/presentation/goal-labels";
import type {
  GoalHistoryItem,
  GoalPlanProgramDetail,
  GoalPlanProgramOverview,
} from "@/modules/goals/services/goal-query-service";
import type { PatientProgramDetail } from "@/modules/patient-program/services/patient-program-query-service";

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeZone: "Asia/Bangkok",
  }).format(value);
}

function goalPlanPath(relationshipId: string, programId: string, goalPlanId: string): string {
  return `/app/patients/${encodeURIComponent(relationshipId)}/programs/${encodeURIComponent(programId)}/goals/${encodeURIComponent(goalPlanId)}`;
}

export function GoalPlanHistoryList({
  items,
  relationshipId,
  programId,
}: {
  items: readonly GoalHistoryItem[];
  relationshipId: string;
  programId: string;
}): React.JSX.Element {
  return (
    <ul aria-label="ประวัติแผนสุขภาพในโปรแกรม" className="divide-y divide-border overflow-hidden rounded-panel border border-border bg-surface">
      {items.map((item) => (
        <li key={item.goalPlanId}>
          <Link
            className="group block px-5 py-5 transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-focus-ring sm:px-7"
            href={goalPlanPath(relationshipId, programId, item.goalPlanId)}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
              <div className="min-w-0">
                <p className="font-semibold text-text group-hover:text-brand-strong">แผนรอบที่ {item.roundNumber}</p>
                <p className="mt-1 text-sm leading-6 text-text-muted">บันทึกเมื่อ {formatDate(item.createdAt)}</p>
              </div>
              <StatusBadge variant="info">{item.primaryGoalLabel}</StatusBadge>
            </div>
            <dl className="mt-4 grid gap-3 border-t border-border pt-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-text-muted">กิจกรรม</dt>
                <dd className="mt-1 font-semibold text-text">{item.activityCount} รายการ</dd>
              </div>
              <div className="sm:text-right">
                <dt className="text-text-muted">ประวัติ</dt>
                <dd className="mt-1 font-semibold text-brand-strong">ดูรายละเอียด</dd>
              </div>
            </dl>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function LatestGoalPlan({
  detail,
  relationshipId,
  programId,
}: {
  detail: GoalPlanProgramDetail;
  relationshipId: string;
  programId: string;
}): React.JSX.Element {
  return (
    <Panel>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-text-muted">แผนล่าสุด</p>
          <h3 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-text">
            แผนรอบที่ {detail.roundNumber}
          </h3>
          <p className="mt-1 text-sm leading-6 text-text-muted">บันทึกเมื่อ {formatDate(detail.createdAt)}</p>
        </div>
        <StatusBadge variant="info">{detail.primaryGoalLabel}</StatusBadge>
      </div>

      <div className="mt-5 border-t border-border pt-5">
        <p className="text-sm text-text-muted">เป้าหมายหลัก</p>
        <p className="mt-1 font-semibold text-text">{detail.primaryGoalLabel}</p>
      </div>

      <div className="mt-5 border-t border-border pt-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="text-sm text-text-muted">กิจกรรมและค่าเป้าหมาย</p>
          <span className="text-sm font-semibold text-text">{detail.items.length} รายการ</span>
        </div>
        <ul className="mt-4 space-y-3">
          {detail.items.map((item) => (
            <li className="rounded-control border border-border bg-surface-muted px-4 py-3" key={item.goalPlanItemId}>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <span className="break-words font-semibold text-text">{item.activityLabel}</span>
                <span className="shrink-0 text-sm text-text-muted">{item.targetDays} วัน/สัปดาห์</span>
              </div>
              <p className="mt-1 break-words text-sm leading-6 text-text-muted">
                ค่าเป้าหมาย: {item.targetValue !== null && item.targetUnit
                  ? `${item.targetValue} ${getGoalTargetUnitLabel(item.targetUnit)}`
                  : "ไม่ได้ระบุค่าเชิงตัวเลข"}
              </p>
            </li>
          ))}
        </ul>
      </div>

      <Link
        className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2 sm:w-auto"
        href={goalPlanPath(relationshipId, programId, detail.goalPlanId)}
      >
        ดูรายละเอียดแผนรอบนี้
      </Link>
    </Panel>
  );
}

export function PatientProgramServiceTwoWorkspace({
  detail,
  latestGoalPlan,
  overview,
}: {
  detail: PatientProgramDetail;
  latestGoalPlan: GoalPlanProgramDetail | null;
  overview: GoalPlanProgramOverview;
}): React.JSX.Element {
  const relationshipId = detail.patient.patientHospitalRelationshipId;
  const programId = detail.programId;
  const canCreate = detail.status === "ACTIVE" && detail.canManage;
  const historyPreview = overview.items.slice(0, 4);

  return (
    <section aria-labelledby="patient-program-service-two-heading">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-text" id="patient-program-service-two-heading">
            Service 2 — แผนสุขภาพและเป้าหมาย
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
            แผนสุขภาพและกิจกรรมของโปรแกรมนี้เก็บเป็นรอบประวัติแยกกัน รอบใหม่จะไม่แก้ไขรอบเดิม
          </p>
        </div>
        {canCreate ? (
          <Link
            className="inline-flex min-h-11 w-full items-center justify-center rounded-control bg-action-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-action-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2 sm:w-auto"
            href={`/app/patients/${encodeURIComponent(relationshipId)}/programs/${encodeURIComponent(programId)}/goals/new`}
          >
            สร้างแผนรอบใหม่
          </Link>
        ) : null}
      </div>

      {detail.status === "COMPLETED" ? (
        <Alert className="mt-5" variant="neutral">
          โปรแกรมนี้จบแล้ว จึงอ่านประวัติแผนสุขภาพได้ แต่ไม่สามารถสร้างรอบใหม่
        </Alert>
      ) : !detail.canManage ? (
        <Alert className="mt-5" variant="info">
          บัญชีนี้มีสิทธิ์อ่านแผนสุขภาพในโปรแกรมนี้ แต่ไม่มีสิทธิ์สร้างข้อมูลใหม่
        </Alert>
      ) : null}

      {latestGoalPlan ? (
        <div className="mt-5">
          <LatestGoalPlan
            detail={latestGoalPlan}
            programId={programId}
            relationshipId={relationshipId}
          />
        </div>
      ) : (
        <div className="mt-5 rounded-panel border border-dashed border-border bg-surface px-5 py-8 sm:px-7">
          <p className="font-semibold text-text">ยังไม่มีแผนสุขภาพในโปรแกรมนี้</p>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">
            เมื่อพร้อม สามารถบันทึกแผนรอบแรกได้ แผนสุขภาพไม่จำเป็นต้องมีลำดับต่อจาก Service 1
          </p>
          {canCreate ? (
            <Link
              className="mt-5 inline-flex min-h-11 items-center justify-center rounded-control bg-action-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-action-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              href={`/app/patients/${encodeURIComponent(relationshipId)}/programs/${encodeURIComponent(programId)}/goals/new`}
            >
              สร้างแผนสุขภาพ
            </Link>
          ) : null}
        </div>
      )}

      {historyPreview.length > 0 ? (
        <div className="mt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold tracking-[-0.02em] text-text">ประวัติแผนสุขภาพ</h3>
              <p className="mt-1 text-sm leading-6 text-text-muted">แสดงรอบล่าสุดก่อน รอบเก่ายังคงอ่านได้</p>
            </div>
            <Link
              className="inline-flex min-h-10 items-center text-sm font-semibold text-brand-strong underline decoration-brand-soft underline-offset-4 hover:text-brand focus-visible:rounded-control focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
              href={`/app/patients/${encodeURIComponent(relationshipId)}/programs/${encodeURIComponent(programId)}/goals`}
            >
              ดูประวัติทั้งหมด
            </Link>
          </div>
          <div className="mt-4">
            <GoalPlanHistoryList
              items={historyPreview}
              programId={programId}
              relationshipId={relationshipId}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
