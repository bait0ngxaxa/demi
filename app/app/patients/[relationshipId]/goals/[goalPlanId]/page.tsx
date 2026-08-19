import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import {
  getGoalPlanDetail,
  type GoalPlanDetail,
  type GoalScreeningContext,
} from "@/modules/goals/services/goal-query-service";
import { getGoalTargetUnitLabel } from "@/modules/goals/presentation/goal-labels";
import {
  SCREENING_LEVEL_LABELS,
  SCREENING_ZONE_LABELS,
} from "@/modules/screening/presentation/screening-labels";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/shared/errors/application-error";

export const metadata: Metadata = {
  title: "รายละเอียดแผนเป้าหมาย",
};

type GoalPlanDetailPageProps = {
  params: Promise<{ relationshipId: string; goalPlanId: string }>;
};

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "full",
    timeStyle: "short",
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

async function resolveActor() {
  try {
    return await getProtectedApplicationActor();
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) {
      redirect("/login");
    }

    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    throw error;
  }
}

function GoalPlanDetailView({ detail }: { detail: GoalPlanDetail }): React.JSX.Element {
  const relationshipId = detail.patient.patientHospitalRelationshipId;

  return (
    <div className="max-w-5xl">
      <PageHeader
        actions={<StatusBadge variant="info">แผนเป้าหมาย</StatusBadge>}
        breadcrumbs={[
          {
            href: `/app/patients/${encodeURIComponent(relationshipId)}`,
            label: "รายละเอียดผู้ป่วย",
          },
          {
            href: `/app/patients/${encodeURIComponent(relationshipId)}/goals`,
            label: "แผนเป้าหมาย",
          },
          { label: "รายละเอียดแผนเป้าหมาย" },
        ]}
        description="รายละเอียดแผนเป้าหมายที่บันทึกเป็นประวัติในบริบทของโรงพยาบาลนี้"
        title={`แผนเป้าหมายรอบที่ ${detail.roundNumber}`}
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
          <p className="mt-1 text-sm leading-6 text-text-muted">รายการกิจกรรมที่บันทึกในแผนเป้าหมายรอบนี้</p>
            </div>
            <StatusBadge variant="neutral">{detail.items.length} รายการ</StatusBadge>
          </div>
          <ul className="mt-5 divide-y divide-border border-y border-border" aria-label="รายการกิจกรรม">
            {detail.items.map((item) => (
              <li className="py-5" key={item.goalPlanItemId}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="font-semibold text-text">{item.activityLabel}</h3>
                  </div>
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

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-control bg-action-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-action-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            href={`/app/patients/${encodeURIComponent(relationshipId)}/followups/new?sourceGoalPlanId=${encodeURIComponent(detail.goalPlanId)}`}
          >
            บันทึกการติดตาม
          </Link>
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            href={`/app/patients/${encodeURIComponent(relationshipId)}/goals/new`}
          >
            สร้างแผนเป้าหมายรอบใหม่
          </Link>
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            href={`/app/patients/${encodeURIComponent(relationshipId)}/goals`}
          >
            กลับไปประวัติแผนเป้าหมาย
          </Link>
        </div>
      </div>
    </div>
  );
}

export default async function GoalPlanDetailPage({
  params,
}: GoalPlanDetailPageProps): Promise<React.JSX.Element> {
  await connection();
  const actor = await resolveActor();
  const { relationshipId, goalPlanId } = await params;
  let detail;

  try {
    detail = await getGoalPlanDetail(actor, relationshipId, goalPlanId);
  } catch (error: unknown) {
    if (error instanceof NotFoundError) {
      notFound();
    }

    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    throw error;
  }

  return <GoalPlanDetailView detail={detail} />;
}

