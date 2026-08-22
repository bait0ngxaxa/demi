import Link from "next/link";
import type { FollowupActivityProgressStatus } from "@prisma/client";
import type { ReactNode } from "react";

import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";
import { getGoalActivity, getGoalTemplate } from "@/modules/goals/domain/goal-templates";
import type {
  ProgramReportBaselineMeasurements,
  ProgramReportFollowup,
  ProgramReportGoalPlan,
  ProgramReportMeasurements,
  ProgramReportPage,
  ProgramReportServiceOneActivity,
  ProgramReportingProjection,
  ReportFact,
} from "@/modules/reporting/projections/program-report-projection";

const MISSING_VALUE_LABEL = "ไม่มีข้อมูล";

const progressStatusLabels: Record<FollowupActivityProgressStatus, string> = {
  DONE: "ทำได้",
  PARTIAL: "ทำได้บางส่วน",
  NOT_DONE: "ยังไม่ได้ทำ",
  NOT_APPLICABLE: "ไม่เกี่ยวข้อง",
};

type MeasurementDisplay = {
  label: string;
  unit: string;
  value: ReportFact<number>;
};

type ReportCursorParams = {
  goalCursor?: string;
  followupCursor?: string;
};

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "long",
    timeZone: "Asia/Bangkok",
  }).format(value);
}

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(value);
}

function statusLabel(status: ProgramReportingProjection["lifecycle"]["status"]): string {
  return status === "ACTIVE" ? "กำลังดำเนินการ" : "เสร็จสิ้นแล้ว";
}

function statusVariant(status: ProgramReportingProjection["lifecycle"]["status"]): StatusVariant {
  return status === "ACTIVE" ? "success" : "neutral";
}

function factValue<T>(fact: ReportFact<T>): string {
  return fact.state === "RECORDED" ? String(fact.value) : MISSING_VALUE_LABEL;
}

function reportPath(
  relationshipId: string,
  programId: string,
  cursors: ReportCursorParams = {},
): string {
  const path = `/app/patients/${encodeURIComponent(relationshipId)}/programs/${encodeURIComponent(programId)}/report`;
  const searchParams = new URLSearchParams();

  if (cursors.goalCursor) {
    searchParams.set("goalCursor", cursors.goalCursor);
  }

  if (cursors.followupCursor) {
    searchParams.set("followupCursor", cursors.followupCursor);
  }

  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
}

function ReportSection({
  children,
  description,
  id,
  title,
}: {
  children: ReactNode;
  description: string;
  id: string;
  title: string;
}): React.JSX.Element {
  return (
    <section aria-labelledby={id} className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-text" id={id}>
          {title}
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">{description}</p>
      </div>
      {children}
    </section>
  );
}

function MetadataGrid({
  items,
}: {
  items: readonly { label: string; value: ReactNode }[];
}): React.JSX.Element {
  return (
    <dl className="grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-sm text-text-muted">{item.label}</dt>
          <dd className="mt-1 break-words font-semibold text-text">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function MeasurementFactGrid({
  items,
}: {
  items: readonly MeasurementDisplay[];
}): React.JSX.Element {
  return (
    <dl className="grid gap-x-6 gap-y-5 border-t border-border pt-5 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-sm text-text-muted">
            {item.label} · {item.unit}
          </dt>
          <dd className="mt-1 break-words font-semibold text-text">{factValue(item.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function BaselineMeasurementGrid({
  measurements,
}: {
  measurements: ProgramReportBaselineMeasurements;
}): React.JSX.Element {
  return (
    <MeasurementFactGrid
      items={[
        { label: "น้ำหนัก", unit: "kg", value: measurements.weight },
        { label: "รอบเอว", unit: "cm", value: measurements.waistCircumference },
        {
          label: "ความดันตัวบน",
          unit: "mmHg",
          value: measurements.bloodPressureSystolic,
        },
        {
          label: "ความดันตัวล่าง",
          unit: "mmHg",
          value: measurements.bloodPressureDiastolic,
        },
        { label: "น้ำตาลในเลือด / DTX", unit: "DTX / mg%", value: measurements.bloodSugarDtx },
      ]}
    />
  );
}

function ProgramMeasurementGrid({
  measurements,
}: {
  measurements: ProgramReportMeasurements;
}): React.JSX.Element {
  return (
    <MeasurementFactGrid
      items={[
        { label: "น้ำหนัก", unit: "kg", value: measurements.weight },
        { label: "รอบเอว", unit: "cm", value: measurements.waistCircumference },
        {
          label: "ความดันตัวบน",
          unit: "mmHg",
          value: measurements.systolicBloodPressure,
        },
        {
          label: "ความดันตัวล่าง",
          unit: "mmHg",
          value: measurements.diastolicBloodPressure,
        },
        { label: "น้ำตาลในเลือด / DTX", unit: "DTX / mg%", value: measurements.bloodSugar },
      ]}
    />
  );
}

function LinkedBaselineSection({
  report,
}: {
  report: ProgramReportingProjection;
}): React.JSX.Element {
  const baseline = report.linkedBaseline;

  return (
    <ReportSection
      description="แสดงเฉพาะข้อมูล Baseline ที่โปรแกรมเชื่อมไว้โดยตรง ไม่มีการใช้ข้อมูล Baseline รายการอื่นมาแทน"
      id="program-report-linked-baseline"
      title="ข้อมูล Baseline ที่เชื่อมกับโปรแกรม"
    >
      {baseline.state === "MISSING" ? (
        <Alert variant="neutral">โปรแกรมนี้ไม่มีข้อมูล Baseline ที่เชื่อมไว้</Alert>
      ) : (
        <Panel>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold tracking-[-0.02em] text-text">Baseline ที่เชื่อมกับโปรแกรม</h3>
              <p className="mt-1 text-sm leading-6 text-text-muted">
                แหล่งข้อมูลนี้แสดงตามค่าที่บันทึกไว้ โดยไม่เพิ่มการแปลผล
              </p>
            </div>
            <StatusBadge variant="info">มีข้อมูล</StatusBadge>
          </div>

          <MetadataGrid
            items={[
              {
                label: "วันที่บันทึกข้อมูล",
                value: <time dateTime={baseline.recordedOn.toISOString().slice(0, 10)}>{formatDate(baseline.recordedOn)}</time>,
              },
              { label: "ผู้บันทึก", value: baseline.recordedBy.displayName },
            ]}
          />

          <div className="mt-5">
            <p className="text-sm font-semibold text-text">ค่าที่บันทึกไว้</p>
            <p className="mt-1 text-xs leading-5 text-text-muted">
              หน่วยและคำเรียกแสดงตามป้ายกำกับปัจจุบันของต้นแบบ
            </p>
            <div className="mt-4">
              <BaselineMeasurementGrid measurements={baseline.measurements} />
            </div>
          </div>
        </Panel>
      )}
    </ReportSection>
  );
}

function ServiceOneActivityCard({
  activity,
  title,
}: {
  activity: ProgramReportServiceOneActivity;
  title: string;
}): React.JSX.Element {
  return (
    <li className="rounded-panel border border-border bg-surface p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <h3 className="break-words font-semibold text-text">{title}</h3>
        <StatusBadge variant={activity.state === "PRESENT" ? "info" : "neutral"}>
          {activity.state === "PRESENT" ? "มีข้อมูล" : "ยังไม่มีข้อมูล"}
        </StatusBadge>
      </div>

      {activity.state === "PRESENT" ? (
        <>
          <MetadataGrid
            items={[
              {
                label: "บันทึกในระบบเมื่อ",
                value: <time dateTime={activity.recordedAt.toISOString()}>{formatDateTime(activity.recordedAt)}</time>,
              },
              { label: "ผู้บันทึก", value: activity.recordedBy.displayName },
            ]}
          />
          {activity.evidence ? (
            <div className="mt-5 border-t border-border pt-5">
              <p className="text-sm text-text-muted">ข้อมูลหลักฐานประกอบที่บันทึกไว้</p>
              <p className="mt-1 break-words font-semibold text-text">
                {activity.evidence.mediaType} · {activity.evidence.byteSize} ไบต์
              </p>
              <p className="mt-1 text-sm leading-6 text-text-muted">
                อัปโหลดในระบบเมื่อ {formatDateTime(activity.evidence.uploadedAt)}
              </p>
            </div>
          ) : null}
        </>
      ) : (
        <p className="mt-4 text-sm leading-6 text-text-muted">ยังไม่มีการบันทึกกิจกรรมนี้ในโปรแกรม</p>
      )}
    </li>
  );
}

function ServiceOneSection({
  report,
}: {
  report: ProgramReportingProjection;
}): React.JSX.Element {
  return (
    <ReportSection
      description="แสดงการมีหรือไม่มีข้อมูลของกิจกรรม Service 1 ตามที่บันทึกไว้ในโปรแกรมนี้"
      id="program-report-service-one"
      title="บริการครั้งที่ 1 (Service 1)"
    >
      <ul className="grid gap-4 lg:grid-cols-2" aria-label="ข้อมูลบริการครั้งที่ 1">
        <ServiceOneActivityCard activity={report.serviceOne.routine} title="ตารางกิจวัตร (Routine)" />
        <ServiceOneActivityCard
          activity={report.serviceOne.floatingChart}
          title="กราฟวัดลอยจม (Floating Chart)"
        />
        <ServiceOneActivityCard activity={report.serviceOne.dreamCard} title="การ์ดความฝัน (Dream Card)" />
        <ServiceOneActivityCard activity={report.serviceOne.confidence} title="ไม้บรรทัดวัดใจ (Confidence)" />
      </ul>
    </ReportSection>
  );
}

function goalPlanTemplateLabel(plan: ProgramReportGoalPlan): string {
  const template = getGoalTemplate(plan.templateKey, plan.templateVersion);
  return template?.primaryGoals.find((goal) => goal.code === plan.primaryGoalCode)?.label ?? plan.primaryGoalCode;
}

function goalActivityLabel(plan: ProgramReportGoalPlan, activityCode: string): string {
  const template = getGoalTemplate(plan.templateKey, plan.templateVersion);
  return template ? getGoalActivity(template, activityCode)?.label ?? activityCode : activityCode;
}

function GoalPlanCard({ plan }: { plan: ProgramReportGoalPlan }): React.JSX.Element {
  return (
    <li className="rounded-panel border border-border bg-surface p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold tracking-[-0.02em] text-text">แผนรอบที่ {plan.roundNumber}</h3>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            บันทึกเมื่อ {formatDateTime(plan.createdAt)} · ผู้บันทึก: {plan.createdByDisplayName}
          </p>
        </div>
        <StatusBadge variant="info">{goalPlanTemplateLabel(plan)}</StatusBadge>
      </div>

      <div className="mt-5 border-t border-border pt-5">
        <p className="text-sm text-text-muted">เป้าหมายหลักที่บันทึกไว้</p>
        <p className="mt-1 break-words font-semibold text-text">
          {goalPlanTemplateLabel(plan)} <span className="font-normal text-text-muted">({plan.primaryGoalCode})</span>
        </p>
      </div>

      <div className="mt-5 grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
        <div>
          <p className="text-sm text-text-muted">หมายเหตุเป้าหมาย</p>
          <p className="mt-1 break-words whitespace-pre-wrap text-sm leading-6 text-text">{factValue(plan.primaryGoalNote)}</p>
        </div>
        <div>
          <p className="text-sm text-text-muted">หมายเหตุรายสัปดาห์</p>
          <p className="mt-1 break-words whitespace-pre-wrap text-sm leading-6 text-text">{factValue(plan.weeklyNote)}</p>
        </div>
      </div>

      <div className="mt-5 border-t border-border pt-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h4 className="text-sm font-semibold text-text">กิจกรรมและค่าที่บันทึกไว้</h4>
          <span className="text-sm text-text-muted">{plan.items.length} รายการ</span>
        </div>
        {plan.items.length > 0 ? (
          <ul className="mt-4 space-y-3">
            {plan.items.map((item) => (
              <li className="rounded-control border border-border bg-surface-muted px-4 py-3" key={item.goalPlanItemId}>
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <span className="break-words font-semibold text-text">
                    {goalActivityLabel(plan, item.activityCode)}
                    <span className="font-normal text-text-muted"> ({item.activityCode})</span>
                  </span>
                  <span className="shrink-0 text-sm text-text-muted">{item.targetDays} วัน/สัปดาห์</span>
                </div>
                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-text-muted">ค่าเป้าหมาย</dt>
                    <dd className="mt-1 break-words font-semibold text-text">{factValue(item.targetValue)}</dd>
                  </div>
                  <div>
                    <dt className="text-text-muted">หน่วยที่บันทึก</dt>
                    <dd className="mt-1 break-words font-semibold text-text">{factValue(item.targetUnit)}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm leading-6 text-text-muted">แผนนี้ยังไม่มีรายการกิจกรรม</p>
        )}
      </div>

      <p className="mt-5 border-t border-border pt-4 text-xs leading-5 text-text-muted">
        เทมเพลตที่บันทึกไว้: {plan.templateKey} · รุ่น {plan.templateVersion}
      </p>
    </li>
  );
}

function ReportPagination({
  currentCursors,
  label,
  page,
  relationshipId,
  programId,
  source,
}: {
  currentCursors: ReportCursorParams;
  label: string;
  page: ProgramReportPage<unknown>;
  relationshipId: string;
  programId: string;
  source: "goal" | "followup";
}): React.JSX.Element | null {
  if (page.totalCount === 0) {
    return null;
  }

  const nextHref =
    page.hasMore && page.nextCursor
      ? reportPath(relationshipId, programId, {
          goalCursor: source === "goal" ? page.nextCursor : currentCursors.goalCursor,
          followupCursor: source === "followup" ? page.nextCursor : currentCursors.followupCursor,
        })
      : null;

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm leading-6 text-text-muted">
        แสดงหน้านี้ {page.items.length} รายการ จากทั้งหมด {page.totalCount} รายการ
      </p>
      {nextHref ? (
        <Link
          className="inline-flex min-h-11 w-full items-center justify-center rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2 sm:w-auto"
          href={nextHref}
        >
          ดู{label}รายการถัดไป
        </Link>
      ) : (
        <span className="text-sm font-semibold text-text-muted">แสดงข้อมูลครบตามจำนวนที่บันทึกไว้</span>
      )}
    </div>
  );
}

function GoalPlansSection({
  currentCursors,
  programId,
  relationshipId,
  report,
}: {
  currentCursors: ReportCursorParams;
  programId: string;
  relationshipId: string;
  report: ProgramReportingProjection;
}): React.JSX.Element {
  return (
    <ReportSection
      description="แสดงประวัติ Goal Plan ที่ผูกกับโปรแกรมนี้โดยตรงเป็นรอบ ๆ และใช้การแบ่งหน้าตามข้อมูลที่มี"
      id="program-report-goal-plans"
      title="แผนเป้าหมาย (Goal Plan)"
    >
      {report.goalPlans.items.length > 0 ? (
        <>
          <ol className="space-y-4" aria-label="ประวัติแผนเป้าหมายในโปรแกรม">
            {report.goalPlans.items.map((plan) => (
              <GoalPlanCard key={plan.goalPlanId} plan={plan} />
            ))}
          </ol>
          <ReportPagination
            currentCursors={currentCursors}
            label="แผน"
            page={report.goalPlans}
            programId={programId}
            relationshipId={relationshipId}
            source="goal"
          />
        </>
      ) : report.goalPlans.totalCount > 0 ? (
        <Alert variant="neutral">
          ไม่พบรายการแผนในหน้าที่เลือก จากทั้งหมด {report.goalPlans.totalCount} รายการ
        </Alert>
      ) : (
        <Alert variant="neutral">ยังไม่มี Goal Plan ที่บันทึกในโปรแกรมนี้</Alert>
      )}
    </ReportSection>
  );
}

function FollowupActivityProgressList({
  activityProgress,
}: {
  activityProgress: ProgramReportFollowup["activityProgress"];
}): React.JSX.Element {
  if (activityProgress.length === 0) {
    return <p className="mt-4 text-sm leading-6 text-text-muted">รอบนี้ยังไม่มีข้อมูลความคืบหน้ากิจกรรม</p>;
  }

  return (
    <ul className="mt-4 space-y-3">
      {activityProgress.map((progress) => (
        <li className="rounded-control border border-border bg-surface-muted px-4 py-3" key={progress.goalActivityCode}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <p className="break-words font-semibold text-text">{progress.goalActivityCode}</p>
            <StatusBadge variant="neutral">{progressStatusLabels[progress.status]}</StatusBadge>
          </div>
          <p className="mt-2 break-words whitespace-pre-wrap text-sm leading-6 text-text-muted">
            หมายเหตุ: {factValue(progress.note)}
          </p>
        </li>
      ))}
    </ul>
  );
}

function FollowupCard({ followup }: { followup: ProgramReportFollowup }): React.JSX.Element {
  return (
    <li className="rounded-panel border border-border bg-surface p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold tracking-[-0.02em] text-text">ครั้งที่ {followup.roundNumber}</h3>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            บันทึกในระบบเมื่อ {formatDateTime(followup.recordedAt)} · ผู้บันทึก: {followup.createdByDisplayName}
          </p>
        </div>
        <StatusBadge variant="neutral">ข้อมูลที่บันทึกไว้</StatusBadge>
      </div>

      <div className="mt-5">
        <p className="text-sm font-semibold text-text">ค่าที่บันทึกไว้ในรอบนี้</p>
        <div className="mt-4">
          <ProgramMeasurementGrid measurements={followup.measurements} />
        </div>
      </div>

      <div className="mt-5 border-t border-border pt-5">
        <h4 className="text-sm font-semibold text-text">ความคืบหน้ากิจกรรมที่บันทึกไว้</h4>
        <FollowupActivityProgressList activityProgress={followup.activityProgress} />
      </div>
    </li>
  );
}

function FollowupsSection({
  currentCursors,
  programId,
  relationshipId,
  report,
}: {
  currentCursors: ReportCursorParams;
  programId: string;
  relationshipId: string;
  report: ProgramReportingProjection;
}): React.JSX.Element {
  return (
    <ReportSection
      description="แสดงประวัติการติดตามผลแบบหลายรอบตามข้อมูลที่บันทึกไว้ในโปรแกรมนี้"
      id="program-report-followups"
      title="ประวัติการติดตามผล"
    >
      {report.followups.items.length > 0 ? (
        <>
          <ol className="space-y-4" aria-label="ประวัติการติดตามผลในโปรแกรม">
            {report.followups.items.map((followup) => (
              <FollowupCard followup={followup} key={followup.followupId} />
            ))}
          </ol>
          <ReportPagination
            currentCursors={currentCursors}
            label="การติดตามผล"
            page={report.followups}
            programId={programId}
            relationshipId={relationshipId}
            source="followup"
          />
        </>
      ) : report.followups.totalCount > 0 ? (
        <Alert variant="neutral">
          ไม่พบรายการติดตามผลในหน้าที่เลือก จากทั้งหมด {report.followups.totalCount} รายการ
        </Alert>
      ) : (
        <Alert variant="neutral">ยังไม่มีการติดตามผลที่บันทึกในโปรแกรมนี้</Alert>
      )}
    </ReportSection>
  );
}

function FinalAssessmentSection({
  report,
}: {
  report: ProgramReportingProjection;
}): React.JSX.Element {
  const finalAssessment = report.finalAssessment;

  return (
    <ReportSection
      description="แสดงข้อมูล Final Assessment ที่บันทึกไว้กับโปรแกรมนี้โดยตรงในรูปแบบอ่านอย่างเดียว"
      id="program-report-final-assessment"
      title="ข้อมูล Final Assessment"
    >
      {finalAssessment.state === "MISSING" ? (
        <Alert variant="neutral">
          {report.lifecycle.status === "ACTIVE"
            ? "ยังไม่มีข้อมูล Final Assessment ที่บันทึกในโปรแกรมนี้"
            : "โปรแกรมนี้ไม่มีข้อมูล Final Assessment ที่บันทึกไว้"}
        </Alert>
      ) : (
        <Panel>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold tracking-[-0.02em] text-text">Final Assessment ที่บันทึกไว้</h3>
              <p className="mt-1 text-sm leading-6 text-text-muted">ข้อมูลนี้เป็นข้อมูลอ่านอย่างเดียวของโปรแกรมนี้</p>
            </div>
            <StatusBadge variant="info">มีข้อมูล</StatusBadge>
          </div>

          <MetadataGrid
            items={[
              {
                label: "บันทึกในระบบเมื่อ",
                value: <time dateTime={finalAssessment.recordedAt.toISOString()}>{formatDateTime(finalAssessment.recordedAt)}</time>,
              },
              { label: "ผู้บันทึก", value: finalAssessment.recordedBy.displayName },
            ]}
          />

          <div className="mt-5">
            <p className="text-sm font-semibold text-text">ค่าที่บันทึกไว้</p>
            <p className="mt-1 text-xs leading-5 text-text-muted">
              หน่วยและคำเรียกแสดงตามป้ายกำกับปัจจุบันของต้นแบบ
            </p>
            <div className="mt-4">
              <ProgramMeasurementGrid measurements={finalAssessment.measurements} />
            </div>
          </div>
        </Panel>
      )}
    </ReportSection>
  );
}

export function ProgramReportView({
  currentGoalCursor,
  currentFollowupCursor,
  programId,
  relationshipId,
  report,
}: {
  currentGoalCursor?: string;
  currentFollowupCursor?: string;
  programId: string;
  relationshipId: string;
  report: ProgramReportingProjection;
}): React.JSX.Element {
  const currentCursors: ReportCursorParams = {
    goalCursor: currentGoalCursor,
    followupCursor: currentFollowupCursor,
  };

  return (
    <div className="max-w-5xl">
      <PageHeader
        actions={
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              href={`/app/patients/${encodeURIComponent(relationshipId)}/programs/${encodeURIComponent(programId)}`}
            >
              กลับรายละเอียดโปรแกรม
            </Link>
            <StatusBadge variant={statusVariant(report.lifecycle.status)}>
              {statusLabel(report.lifecycle.status)}
            </StatusBadge>
          </div>
        }
        breadcrumbs={[
          {
            href: `/app/patients/${encodeURIComponent(relationshipId)}`,
            label: "รายละเอียดผู้ป่วย",
          },
          {
            href: `/app/patients/${encodeURIComponent(relationshipId)}/programs/${encodeURIComponent(programId)}`,
            label: "รายละเอียดโปรแกรม",
          },
          { label: "รายงานข้อมูลโปรแกรม" },
        ]}
        description="ข้อมูลที่บันทึกไว้ในโปรแกรมนี้ แยกตามแหล่งข้อมูลและแสดงแบบอ่านอย่างเดียว"
        title="รายงานข้อมูลโปรแกรม"
      />

      <div className="space-y-8 pt-8">
        <Panel>
          <h2 className="text-2xl font-semibold tracking-[-0.03em] text-text">ข้อมูลผู้ป่วยและโรงพยาบาล</h2>
          <MetadataGrid
            items={[
              { label: "ผู้ป่วย", value: report.patient.displayName },
              { label: "โรงพยาบาล", value: report.hospital.name },
            ]}
          />
        </Panel>

        <Alert variant="info">
          หน้านี้แสดงข้อมูลที่บันทึกไว้แยกตามแหล่งข้อมูลของโปรแกรม ไม่คำนวณหรือตีความค่าทางคลินิก และไม่ใช้ข้อมูลจากโปรแกรมอื่นมาแทน
        </Alert>

        <ReportSection
          description="วันที่ในส่วนนี้เป็นเวลาตามวงจรของโปรแกรม ไม่ใช่เวลาการสังเกตหรือการวัดค่า"
          id="program-report-lifecycle"
          title="วงจรโปรแกรม"
        >
          <Panel>
            <MetadataGrid
              items={[
                { label: "สถานะโปรแกรม", value: statusLabel(report.lifecycle.status) },
                {
                  label: "เริ่มโปรแกรมเมื่อ",
                  value: <time dateTime={report.lifecycle.startedAt.toISOString()}>{formatDateTime(report.lifecycle.startedAt)}</time>,
                },
                {
                  label: "จบโปรแกรมเมื่อ",
                  value: report.lifecycle.completedAt ? (
                    <time dateTime={report.lifecycle.completedAt.toISOString()}>{formatDateTime(report.lifecycle.completedAt)}</time>
                  ) : (
                    "ยังไม่จบโปรแกรม"
                  ),
                },
              ]}
            />
          </Panel>
        </ReportSection>

        <LinkedBaselineSection report={report} />
        <ServiceOneSection report={report} />
        <GoalPlansSection
          currentCursors={currentCursors}
          programId={programId}
          relationshipId={relationshipId}
          report={report}
        />
        <FollowupsSection
          currentCursors={currentCursors}
          programId={programId}
          relationshipId={relationshipId}
          report={report}
        />
        <FinalAssessmentSection report={report} />

        <Link
          className="inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          href={`/app/patients/${encodeURIComponent(relationshipId)}/programs/${encodeURIComponent(programId)}`}
        >
          กลับไปยังรายละเอียดโปรแกรม
        </Link>
      </div>
    </div>
  );
}

export const programReportViewInternals = {
  factValue,
  formatDate,
  formatDateTime,
  reportPath,
  statusLabel,
};
