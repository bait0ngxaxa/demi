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
        <span className="text-sm font-semibold text-text">Screening ล่าสุด</span>
        <StatusBadge variant="info">{screening.result.level}</StatusBadge>
        <StatusBadge variant={zoneVariant(screening.result.zone)}>{screening.result.zone}</StatusBadge>
      </div>
      <p className="mt-2 text-sm leading-6 text-text-muted">
        ส่งเมื่อ {formatDate(screening.submittedAt)} · ใช้เป็นบริบทหรือค่าเริ่มต้นเท่านั้น
      </p>
      <Link
        className="mt-3 inline-flex min-h-10 items-center text-sm font-semibold text-brand-strong underline decoration-brand-soft underline-offset-4 hover:text-brand focus-visible:rounded-control focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
        href={`/app/patients/${encodeURIComponent(relationshipId)}/screenings/${encodeURIComponent(screening.screeningAssessmentId)}`}
      >
        ดูรายละเอียด Screening
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
  return (
    <li>
      <Link
        className="group block px-5 py-5 transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-focus-ring sm:px-7"
        href={`/app/patients/${encodeURIComponent(relationshipId)}/goals/${encodeURIComponent(item.goalPlanId)}`}
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
                {item.sourceScreening.result.level} · {item.sourceScreening.result.zone}
              </StatusBadge>
            ) : null}
          </div>
        </div>
        <dl className="mt-4 grid gap-3 border-t border-border pt-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-text-muted">กิจกรรม</dt>
            <dd className="mt-1 font-semibold text-text">{item.activityCount} รายการ</dd>
          </div>
          <div>
            <dt className="text-text-muted">Template</dt>
            <dd className="mt-1 break-words font-mono text-xs text-text">{item.templateVersion}</dd>
          </div>
          <div className="sm:text-right">
            <dt className="text-text-muted">สถานะ</dt>
            <dd className="mt-1 font-semibold text-text">ส่งแล้ว</dd>
          </div>
        </dl>
      </Link>
    </li>
  );
}

export function GoalPlanOverviewView({ overview }: { overview: GoalPlanOverview }): React.JSX.Element {
  const relationshipId = overview.patient.patientHospitalRelationshipId;

  return (
    <div className="max-w-5xl">
      <PageHeader
        actions={
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-control bg-action-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-action-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            href={`/app/patients/${encodeURIComponent(relationshipId)}/goals/new`}
          >
            สร้าง Goal Plan รอบใหม่
          </Link>
        }
        breadcrumbs={[
          {
            href: `/app/patients/${encodeURIComponent(relationshipId)}`,
            label: "รายละเอียดผู้ป่วย",
          },
          { label: "Goals / Activity Plan" },
        ]}
        description="แผนเป้าหมายและกิจกรรมของผู้ป่วยในบริบทของโรงพยาบาลนี้ เรียงจากรอบล่าสุด"
        title="Goals / Activity Plan"
      />

      <div className="space-y-6 pt-8">
        <Alert variant="warning">
          <p className="font-semibold">ต้นแบบเพื่อเก็บ Requirement</p>
          <p className="mt-1">
            เป้าหมาย กิจกรรม ค่าเริ่มต้น และความสัมพันธ์กับผล Screening ในหน้านี้เป็นต้นแบบอ้างอิงรูปแบบจากระบบ DEMI เดิม
            และยังไม่ใช่ข้อกำหนดทางคลินิกฉบับสุดท้าย
          </p>
        </Alert>

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
          ) : (
            <p className="mt-5 border-t border-border pt-5 text-sm leading-6 text-text-muted">
              ยังไม่มี Screening ล่าสุดในบริบทนี้ Goal Plan prototype ยังสามารถสร้างได้โดยไม่ผูกกับ Screening
            </p>
          )}
        </Panel>

        <section aria-labelledby="latest-goal-plan-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.02em]" id="latest-goal-plan-heading">
                Goal Plan ล่าสุด
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
              <p className="font-semibold text-text">ยังไม่มี Goal Plan สำหรับผู้ป่วยรายนี้</p>
              <p className="mt-2 text-sm leading-6 text-text-muted">
                สร้างรอบแรกเพื่อทดลองรูปแบบและตรวจสอบ Requirement กับลูกค้า
              </p>
            </div>
          )}
        </section>

        <section aria-labelledby="goal-plan-history-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.02em]" id="goal-plan-history-heading">
                ประวัติ Goal Plan
              </h2>
              <p className="mt-1 text-sm text-text-muted">รายการแสดงสูงสุด 50 รอบ เรียงใหม่ไปเก่า</p>
            </div>
            <p className="text-sm text-text-muted">ทั้งหมด {overview.items.length} รายการ</p>
          </div>

          {overview.items.length > 0 ? (
            <div className="mt-4 overflow-hidden rounded-panel border border-border bg-surface">
              <ul aria-label="ประวัติ Goal Plan" className="divide-y divide-border">
                {overview.items.map((item) => (
                  <HistoryRow item={item} key={item.goalPlanId} relationshipId={relationshipId} />
                ))}
              </ul>
            </div>
          ) : (
            <div className="mt-4 rounded-panel border border-dashed border-border bg-surface px-5 py-8 text-center sm:px-7">
              <p className="font-semibold text-text">ยังไม่มีประวัติ Goal Plan</p>
              <p className="mt-2 text-sm leading-6 text-text-muted">ข้อมูลจะปรากฏหลังจากส่ง Goal Plan รอบแรก</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

