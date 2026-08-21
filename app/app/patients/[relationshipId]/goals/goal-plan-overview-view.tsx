import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";
import type {
  GoalHistoryItem,
  GoalPlanOverview,
  GoalScreeningContext,
} from "@/modules/goals/services/goal-query-service";
import type { PatientProgramProjection } from "@/modules/patient-program/services/patient-program-query-service";
import {
  SCREENING_LEVEL_LABELS,
  SCREENING_ZONE_LABELS,
} from "@/modules/screening/presentation/screening-labels";

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
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

function ScreeningSummary({
  screening,
  relationshipId,
}: {
  screening: NonNullable<GoalPlanOverview["latestScreening"]>;
  relationshipId: string;
}): React.JSX.Element {
  return (
    <div className="rounded-control border border-border bg-surface-muted px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-text">แบบประเมินล่าสุด</span>
        <StatusBadge variant="info">{SCREENING_LEVEL_LABELS[screening.result.level]}</StatusBadge>
        <StatusBadge variant={zoneVariant(screening.result.zone)}>
          {SCREENING_ZONE_LABELS[screening.result.zone]}
        </StatusBadge>
      </div>
      <p className="mt-2 text-sm leading-6 text-text-muted">
        ส่งเมื่อ {formatDate(screening.submittedAt)} · ใช้เป็นบริบทหรือค่าเริ่มต้นเท่านั้น
      </p>
      <Link
        className="mt-3 inline-flex min-h-10 items-center text-sm font-semibold text-brand-strong underline decoration-brand-soft underline-offset-4 hover:text-brand focus-visible:rounded-control focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
        href={`/app/patients/${encodeURIComponent(relationshipId)}/screenings/${encodeURIComponent(screening.screeningAssessmentId)}`}
      >
        ดูรายละเอียดแบบประเมิน
      </Link>
    </div>
  );
}

function HistoryRow({
  item,
  relationshipId,
}: {
  item: GoalHistoryItem;
  relationshipId: string;
}): React.JSX.Element {
  const detailHref = item.patientProgramId
    ? `/app/patients/${encodeURIComponent(relationshipId)}/programs/${encodeURIComponent(item.patientProgramId)}/goals/${encodeURIComponent(item.goalPlanId)}`
    : `/app/patients/${encodeURIComponent(relationshipId)}/goals/${encodeURIComponent(item.goalPlanId)}`;

  return (
    <li>
      <Link
        className="group block px-5 py-5 transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-focus-ring sm:px-7"
        href={detailHref}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
          <div className="min-w-0">
            <p className="text-base font-semibold text-text group-hover:text-brand-strong">
              รอบที่ {item.roundNumber}
            </p>
            <p className="mt-1 text-sm leading-6 text-text-muted">บันทึกเมื่อ {formatDate(item.createdAt)}</p>
            <p className="mt-1 text-sm leading-6 text-text-muted">
              ผู้สร้าง: {item.createdByDisplayName}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <StatusBadge variant="info">{item.primaryGoalLabel}</StatusBadge>
            {item.sourceScreening ? (
              <StatusBadge variant={zoneVariant(item.sourceScreening.result.zone)}>
                {SCREENING_LEVEL_LABELS[item.sourceScreening.result.level]} · {SCREENING_ZONE_LABELS[item.sourceScreening.result.zone]}
              </StatusBadge>
            ) : null}
          </div>
        </div>
        <dl className="mt-4 grid gap-3 border-t border-border pt-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-text-muted">กิจกรรม</dt>
            <dd className="mt-1 font-semibold text-text">{item.activityCount} รายการ</dd>
          </div>
          <div className="sm:text-right">
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

export function GoalPlanOverviewView({
  activeProgram,
  canManage,
  overview,
}: {
  activeProgram: PatientProgramProjection | null;
  canManage: boolean;
  overview: GoalPlanOverview;
}): React.JSX.Element {
  const relationshipId = overview.patient.patientHospitalRelationshipId;
  const activeProgramHref = activeProgram
    ? `/app/patients/${encodeURIComponent(relationshipId)}/programs/${encodeURIComponent(activeProgram.programId)}`
    : null;
  const createHref = activeProgram
    ? `${activeProgramHref}/goals/new`
    : `/app/patients/${encodeURIComponent(relationshipId)}/goals/new`;
  const showCreateAction = activeProgram === null || canManage;

  return (
    <div className="max-w-5xl">
      <PageHeader
        actions={
          showCreateAction ? (
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-control bg-action-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-action-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              href={createHref}
            >
              {activeProgram ? "สร้างแผนในโปรแกรมปัจจุบัน" : "สร้างแผนเป้าหมายรอบใหม่"}
            </Link>
          ) : null
        }
        breadcrumbs={[
          {
            href: `/app/patients/${encodeURIComponent(relationshipId)}`,
            label: "รายละเอียดผู้ป่วย",
          },
          { label: "แผนเป้าหมาย" },
        ]}
        description="ประวัติรวมแผนเป้าหมายและกิจกรรมของผู้ป่วย เรียงจากรอบล่าสุด"
        title="ประวัติแผนเป้าหมายทั้งหมด"
      />

      <div className="space-y-6 pt-8">
        {activeProgram && activeProgramHref ? (
          <Alert variant="info">
            หน้านี้เป็นประวัติรวมของความสัมพันธ์กับโรงพยาบาล แผนที่บันทึกในโปรแกรมปัจจุบันให้ดูและสร้างต่อจากหน้าโปรแกรม
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
                {overview.patient.displayName}
              </h2>
              <p className="mt-1 text-sm leading-6 text-text-muted">{overview.patient.hospital.name}</p>
            </div>
            <p className="text-sm text-text-muted">
              HN ของโรงพยาบาลนี้: {overview.patient.hospitalNumber ?? "ไม่ระบุ"}
            </p>
          </div>
          {overview.latestScreening ? (
            <div className="mt-5 border-t border-border pt-5">
              <ScreeningSummary
                relationshipId={relationshipId}
                screening={overview.latestScreening}
              />
            </div>
          ) : null}
        </Panel>

        <section aria-labelledby="latest-goal-plan-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.02em]" id="latest-goal-plan-heading">
                แผนเป้าหมายล่าสุด
              </h2>
              <p className="mt-1 text-sm text-text-muted">รอบล่าสุดเป็นข้อมูลอ้างอิงเท่านั้น รอบเก่ายังคงอ่านได้</p>
            </div>
          </div>
          {overview.latest ? (
            <div className="mt-4 rounded-panel border border-border bg-surface">
              <HistoryRow item={overview.latest} relationshipId={relationshipId} />
            </div>
          ) : (
            <div className="mt-4 rounded-panel border border-dashed border-border bg-surface px-5 py-8 text-center sm:px-7">
              <p className="font-semibold text-text">ยังไม่มีแผนเป้าหมายสำหรับผู้ป่วยรายนี้</p>
              <p className="mt-2 text-sm leading-6 text-text-muted">
                สร้างรอบแรกเพื่อบันทึกเป้าหมายและกิจกรรมของผู้ป่วย
              </p>
            </div>
          )}
        </section>

        <section aria-labelledby="goal-plan-history-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.02em]" id="goal-plan-history-heading">
                ประวัติแผนเป้าหมาย
              </h2>
              <p className="mt-1 text-sm text-text-muted">แสดงล่าสุดไม่เกิน 50 รอบ เรียงใหม่ไปเก่า</p>
            </div>
          </div>

          {overview.items.length > 0 ? (
            <div className="mt-4 overflow-hidden rounded-panel border border-border bg-surface">
              <ul aria-label="ประวัติแผนเป้าหมาย" className="divide-y divide-border">
                {overview.items.map((item) => (
                  <HistoryRow item={item} key={item.goalPlanId} relationshipId={relationshipId} />
                ))}
              </ul>
            </div>
          ) : (
            <div className="mt-4 rounded-panel border border-dashed border-border bg-surface px-5 py-8 text-center sm:px-7">
              <p className="font-semibold text-text">ยังไม่มีประวัติแผนเป้าหมาย</p>
              <p className="mt-2 text-sm leading-6 text-text-muted">ข้อมูลจะปรากฏหลังจากบันทึกแผนเป้าหมายรอบแรก</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

