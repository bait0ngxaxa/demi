import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";
import type {
  GoalPlanDetail,
  GoalPlanProgramDetail,
  GoalScreeningContext,
} from "@/modules/goals/services/goal-query-service";
import { getGoalTargetUnitLabel } from "@/modules/goals/presentation/goal-labels";
import {
  SCREENING_LEVEL_LABELS,
  SCREENING_ZONE_LABELS,
} from "@/modules/screening/presentation/screening-labels";

export type GoalPlanDetailViewScope =
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

function zoneVariant(zone: GoalScreeningContext["result"]["zone"]): StatusVariant {
  if (zone === "RED") {
    return "danger";
  }

  if (zone === "YELLOW") {
    return "warning";
  }

  return "success";
}

function isProgramDetail(
  detail: GoalPlanDetail | GoalPlanProgramDetail,
): detail is GoalPlanProgramDetail {
  return detail.patientProgramId !== null;
}

export function GoalPlanDetailView({
  detail,
  scope,
}: {
  detail: GoalPlanDetail | GoalPlanProgramDetail;
  scope: GoalPlanDetailViewScope;
}): React.JSX.Element {
  const relationshipId = scope.relationshipId;
  const linkedProgramId =
    scope.kind === "program"
      ? scope.patientProgramId
      : isProgramDetail(detail)
        ? detail.patientProgramId
        : null;
  const isProgramRoute = scope.kind === "program";
  const canCreateInProgram =
    scope.kind === "program" && scope.programStatus === "ACTIVE" && scope.canManage;
  const canCreateCompatibilityRecord =
    scope.kind === "relationship" && detail.patientProgramId === null;
  const historyHref = linkedProgramId
    ? `/app/patients/${encodeURIComponent(relationshipId)}/programs/${encodeURIComponent(linkedProgramId)}/goals`
    : `/app/patients/${encodeURIComponent(relationshipId)}/goals`;
  const followupHref = linkedProgramId
    ? `/app/patients/${encodeURIComponent(relationshipId)}/programs/${encodeURIComponent(linkedProgramId)}/followups/new?sourceGoalPlanId=${encodeURIComponent(detail.goalPlanId)}`
    : `/app/patients/${encodeURIComponent(relationshipId)}/followups/new?sourceGoalPlanId=${encodeURIComponent(detail.goalPlanId)}`;
  const newGoalHref = linkedProgramId
    ? `/app/patients/${encodeURIComponent(relationshipId)}/programs/${encodeURIComponent(linkedProgramId)}/goals/new`
    : `/app/patients/${encodeURIComponent(relationshipId)}/goals/new`;

  return (
    <div className="max-w-5xl">
      <PageHeader
        actions={
          <StatusBadge variant="info">
            {isProgramRoute ? "Service 2 — แผนสุขภาพและเป้าหมาย" : "แผนเป้าหมาย"}
          </StatusBadge>
        }
        breadcrumbs={
          isProgramRoute
            ? [
                {
                  href: `/app/patients/${encodeURIComponent(relationshipId)}/programs/${encodeURIComponent(scope.patientProgramId)}`,
                  label: "รายละเอียดโปรแกรม",
                },
                {
                  href: historyHref,
                  label: "ประวัติแผนสุขภาพ",
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
                  label: "ประวัติแผนเป้าหมาย",
                },
                { label: "รายละเอียดแผนเป้าหมาย" },
              ]
        }
        description={
          isProgramRoute
            ? "รายละเอียดแผนสุขภาพที่บันทึกเป็นประวัติของโปรแกรมนี้"
            : "รายละเอียดแผนเป้าหมายที่บันทึกเป็นประวัติในบริบทของโรงพยาบาลนี้"
        }
        title={`${isProgramRoute ? "แผนสุขภาพ" : "แผนเป้าหมาย"}รอบที่ ${detail.roundNumber}`}
      />

      <div className="space-y-6 pt-8">
        <Panel>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
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
              <dt className="text-sm text-text-muted">วันที่สร้าง</dt>
              <dd className="mt-1 font-semibold text-text">{formatDate(detail.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-sm text-text-muted">ผู้สร้าง</dt>
              <dd className="mt-1 font-semibold text-text">{detail.createdByDisplayName}</dd>
            </div>
          </dl>
        </Panel>

        {!isProgramRoute && detail.patientProgramId ? (
          <Alert variant="info">
            แผนนี้บันทึกอยู่ในโปรแกรมที่ระบุไว้ ไม่ใช่ประวัติแผนก่อนมีโปรแกรม
            <Link
              className="ml-1 font-semibold underline decoration-brand-soft underline-offset-4"
              href={`/app/patients/${encodeURIComponent(relationshipId)}/programs/${encodeURIComponent(detail.patientProgramId)}`}
            >
              เปิดรายละเอียดโปรแกรม
            </Link>
          </Alert>
        ) : null}

        <Panel>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.02em]">เป้าหมายหลัก</h2>
              <p className="mt-1 text-sm leading-6 text-text-muted">เป้าหมายหลักของรอบนี้</p>
            </div>
            <StatusBadge variant="info">{detail.primaryGoalLabel}</StatusBadge>
          </div>
          <p className="mt-5 text-lg font-semibold text-text">{detail.primaryGoalLabel}</p>
          <dl className="mt-5 grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-text-muted">หมายเหตุเป้าหมายหลัก</dt>
              <dd className="mt-1 whitespace-pre-wrap text-sm leading-6 text-text">
                {detail.primaryGoalNote ?? "ไม่ได้ระบุ"}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-text-muted">หมายเหตุรายสัปดาห์</dt>
              <dd className="mt-1 whitespace-pre-wrap text-sm leading-6 text-text">
                {detail.weeklyNote ?? "ไม่ได้ระบุ"}
              </dd>
            </div>
          </dl>
        </Panel>

        <Panel>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.02em]">กิจกรรมประจำสัปดาห์</h2>
              <p className="mt-1 text-sm leading-6 text-text-muted">รายการกิจกรรมที่บันทึกในแผนรอบนี้</p>
            </div>
            <StatusBadge variant="neutral">{detail.items.length} รายการ</StatusBadge>
          </div>
          <ul className="mt-5 divide-y divide-border border-y border-border" aria-label="รายการกิจกรรม">
            {detail.items.map((item) => (
              <li className="py-5" key={item.goalPlanItemId}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <h3 className="font-semibold text-text">{item.activityLabel}</h3>
                  <p className="text-sm font-semibold text-text">{item.targetDays} วัน/สัปดาห์</p>
                </div>
                <p className="mt-3 text-sm leading-6 text-text-muted">
                  ค่าเป้าหมาย: {item.targetValue !== null && item.targetUnit
                    ? `${item.targetValue} ${getGoalTargetUnitLabel(item.targetUnit)}`
                    : "ไม่ได้ระบุค่าเชิงตัวเลข"}
                </p>
              </li>
            ))}
          </ul>
        </Panel>

        {detail.sourceScreening ? (
          <Panel>
            <h2 className="text-xl font-semibold tracking-[-0.02em]">แบบประเมินที่ใช้เป็นบริบท</h2>
            <div className="mt-5 rounded-control border border-border bg-surface-muted px-4 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge variant="info">{SCREENING_LEVEL_LABELS[detail.sourceScreening.result.level]}</StatusBadge>
                <StatusBadge variant={zoneVariant(detail.sourceScreening.result.zone)}>
                  {SCREENING_ZONE_LABELS[detail.sourceScreening.result.zone]}
                </StatusBadge>
              </div>
              <p className="mt-2 text-sm leading-6 text-text-muted">
                ส่งเมื่อ {formatDate(detail.sourceScreening.submittedAt)} · ใช้เป็นบริบทหรือค่าเริ่มต้นเท่านั้น
              </p>
              <Link
                className="mt-3 inline-flex min-h-10 items-center text-sm font-semibold text-brand-strong underline decoration-brand-soft underline-offset-4 hover:text-brand focus-visible:rounded-control focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
                href={`/app/patients/${encodeURIComponent(relationshipId)}/screenings/${encodeURIComponent(detail.sourceScreening.screeningAssessmentId)}`}
              >
                ดูรายละเอียดแบบประเมินที่อ้างอิง
              </Link>
            </div>
          </Panel>
        ) : null}

        {canCreateInProgram || canCreateCompatibilityRecord ? (
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-control bg-action-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-action-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              href={followupHref}
            >
              บันทึกการติดตามผล
            </Link>
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              href={newGoalHref}
            >
              {isProgramRoute ? "สร้างแผนรอบใหม่" : "สร้างแผนเป้าหมายรอบใหม่"}
            </Link>
          </div>
        ) : scope.kind === "program" ? (
          <Alert variant="neutral">
            โปรแกรมนี้จบแล้วหรือบัญชีนี้ไม่มีสิทธิ์บันทึกข้อมูลใหม่ แต่ประวัติแผนสุขภาพยังอ่านได้
          </Alert>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            href={historyHref}
          >
            กลับไปประวัติแผน{isProgramRoute ? "สุขภาพ" : "เป้าหมาย"}
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
