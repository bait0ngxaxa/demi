import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import type {
  PatientSelfCareJourney,
  PatientSelfFollowupHistoryItem,
  PatientSelfGoalPlanHistoryItem,
  PatientSelfProgramHistoryItem,
} from "@/modules/patient-self/services/patient-self-care-query-service";

import {
  displayPatientBloodPressure,
  displayPatientMeasurement,
  formatPatientDateOnly,
  formatPatientDateTime,
  patientProgramStatusLabels,
  PatientSelfEmptyState,
  PatientSelfHospitalContext,
} from "./patient-self-care-presentation";

const linkClassName =
  "font-semibold text-brand-strong underline decoration-brand-soft underline-offset-4 hover:text-brand focus-visible:rounded-control focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring";

function programContextText(program: PatientSelfGoalPlanHistoryItem["program"]): string {
  if (!program) {
    return "ไม่ได้เชื่อมกับ Program";
  }

  return `Program เริ่ม ${formatPatientDateOnly(program.startedAt)} · ${patientProgramStatusLabels[program.status]}`;
}

function ProgramHistoryItem({
  item,
  relationshipId,
}: {
  item: PatientSelfProgramHistoryItem;
  relationshipId: string;
}): React.JSX.Element {
  const href = `/app/personal/care/${encodeURIComponent(relationshipId)}/programs/${encodeURIComponent(item.programId)}`;

  return (
    <li className="min-w-0 py-4 first:pt-0 last:pb-0">
      <Link className={`${linkClassName} break-words`} href={href}>
        Program · {formatPatientDateOnly(item.startedAt)}
      </Link>
      <p className="mt-1 text-sm leading-6 text-text-muted">
        <StatusBadge variant={item.status === "ACTIVE" ? "info" : "neutral"}>
          {patientProgramStatusLabels[item.status]}
        </StatusBadge>
        {item.completedAt ? (
          <span className="ml-2">สิ้นสุด {formatPatientDateOnly(item.completedAt)}</span>
        ) : null}
      </p>
    </li>
  );
}

function GoalPlanHistoryItem({
  item,
  relationshipId,
}: {
  item: PatientSelfGoalPlanHistoryItem;
  relationshipId: string;
}): React.JSX.Element {
  const href = `/app/personal/care/${encodeURIComponent(relationshipId)}/goal-plans/${encodeURIComponent(item.goalPlanId)}`;

  return (
    <li className="min-w-0 py-4 first:pt-0 last:pb-0">
      <Link className={`${linkClassName} break-words`} href={href}>
        แผนเป้าหมาย รอบที่ {item.roundNumber}
      </Link>
      <p className="mt-1 break-words text-sm leading-6 text-text">
        เป้าหมายหลัก: {item.primaryGoalLabel}
      </p>
      <p className="mt-1 break-words text-sm leading-6 text-text-muted">
        บันทึก {formatPatientDateTime(item.createdAt)} · {programContextText(item.program)}
      </p>
    </li>
  );
}

function FollowupHistoryItem({
  item,
  relationshipId,
}: {
  item: PatientSelfFollowupHistoryItem;
  relationshipId: string;
}): React.JSX.Element {
  const href = `/app/personal/care/${encodeURIComponent(relationshipId)}/followups/${encodeURIComponent(item.followupId)}`;

  return (
    <li className="min-w-0 py-4 first:pt-0 last:pb-0">
      <Link className={`${linkClassName} break-words`} href={href}>
        ติดตาม รอบที่ {item.roundNumber}
      </Link>
      <p className="mt-1 break-words text-sm leading-6 text-text-muted">
        บันทึก {formatPatientDateTime(item.recordedAt)} · {programContextText(item.program)}
      </p>
    </li>
  );
}

function HistoryList({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <ul className="mt-4 divide-y divide-border border-y border-border">{children}</ul>;
}

export function PatientSelfCareJourneyView({
  journey,
}: {
  journey: PatientSelfCareJourney;
}): React.JSX.Element {
  const relationshipId = journey.relationship.relationshipId;
  const appointmentsHref = `/app/personal/appointments/${encodeURIComponent(relationshipId)}`;

  return (
    <div className="max-w-5xl">
      <PageHeader
        actions={
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            href={appointmentsHref}
          >
            นัดหมายของโรงพยาบาลนี้
          </Link>
        }
        breadcrumbs={[
          { href: "/app/personal", label: "พื้นที่ส่วนตัว" },
          { href: "/app/personal/care", label: "ข้อมูลการดูแล" },
          { label: journey.relationship.hospitalName },
        ]}
        description="แสดงรายการที่บันทึกไว้สำหรับความสัมพันธ์กับโรงพยาบาลนี้"
        title="ข้อมูลการดูแล"
      />

      <div className="space-y-8 pt-6">
        <PatientSelfHospitalContext relationship={journey.relationship} />

        <section aria-labelledby="patient-self-screening-heading">
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-text" id="patient-self-screening-heading">
            การคัดกรอง
          </h2>
          {journey.screenings.length > 0 ? (
            <HistoryList>
              {journey.screenings.map((screening, index) => (
                <li className="flex min-w-0 flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between" key={`${screening.submittedAt.toISOString()}-${index}`}>
                  <time className="break-words font-medium text-text" dateTime={screening.submittedAt.toISOString()}>
                    บันทึก {formatPatientDateTime(screening.submittedAt)}
                  </time>
                  <StatusBadge variant="neutral">บันทึกแล้ว</StatusBadge>
                </li>
              ))}
            </HistoryList>
          ) : (
            <PatientSelfEmptyState title="ยังไม่มีข้อมูลการคัดกรอง" />
          )}
        </section>

        <section aria-labelledby="patient-self-baseline-heading">
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-text" id="patient-self-baseline-heading">
            ข้อมูลเริ่มต้น / Baseline
          </h2>
          {journey.baseline ? (
            <Panel className="mt-4">
              <p className="text-sm text-text-muted">
                วันที่บันทึก: {formatPatientDateOnly(journey.baseline.recordedOn)}
              </p>
              <dl className="mt-5 grid min-w-0 gap-x-8 gap-y-4 sm:grid-cols-2">
                <div className="min-w-0">
                  <dt className="text-sm font-semibold text-text-muted">น้ำหนัก</dt>
                  <dd className="mt-1 break-words font-semibold text-text">
                    {displayPatientMeasurement(journey.baseline.measurements.weight, "kg")}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-sm font-semibold text-text-muted">ส่วนสูง</dt>
                  <dd className="mt-1 break-words font-semibold text-text">
                    {displayPatientMeasurement(journey.baseline.measurements.heightCm, "cm")}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-sm font-semibold text-text-muted">รอบเอว</dt>
                  <dd className="mt-1 break-words font-semibold text-text">
                    {displayPatientMeasurement(journey.baseline.measurements.waistCircumference, "cm")}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-sm font-semibold text-text-muted">ความดันโลหิต</dt>
                  <dd className="mt-1 break-words font-semibold text-text">
                    {displayPatientBloodPressure(
                      journey.baseline.measurements.systolicBloodPressure,
                      journey.baseline.measurements.diastolicBloodPressure,
                    )}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-sm font-semibold text-text-muted">ระดับน้ำตาลในเลือด (DTX)</dt>
                  <dd className="mt-1 break-words font-semibold text-text">
                    {displayPatientMeasurement(journey.baseline.measurements.bloodSugarDtx, "DTX / mg/dL")}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-sm font-semibold text-text-muted">HbA1c</dt>
                  <dd className="mt-1 break-words font-semibold text-text">
                    {displayPatientMeasurement(journey.baseline.measurements.hba1c, "%")}
                  </dd>
                </div>
              </dl>
            </Panel>
          ) : (
            <PatientSelfEmptyState title="ยังไม่มีข้อมูลเริ่มต้น" />
          )}
        </section>

        <section aria-labelledby="patient-self-programs-heading">
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-text" id="patient-self-programs-heading">
            โปรแกรมการดูแล
          </h2>
          {journey.programs.length > 0 ? (
            <HistoryList>
              {journey.programs.map((item) => (
                <ProgramHistoryItem item={item} key={item.programId} relationshipId={relationshipId} />
              ))}
            </HistoryList>
          ) : (
            <PatientSelfEmptyState title="ยังไม่มีโปรแกรมการดูแล" />
          )}
        </section>

        <section aria-labelledby="patient-self-goals-heading">
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-text" id="patient-self-goals-heading">
            แผนเป้าหมาย
          </h2>
          {journey.goalPlans.length > 0 ? (
            <HistoryList>
              {journey.goalPlans.map((item) => (
                <GoalPlanHistoryItem item={item} key={item.goalPlanId} relationshipId={relationshipId} />
              ))}
            </HistoryList>
          ) : (
            <PatientSelfEmptyState title="ยังไม่มีแผนเป้าหมาย" />
          )}
        </section>

        <section aria-labelledby="patient-self-followups-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-semibold tracking-[-0.02em] text-text" id="patient-self-followups-heading">
              การติดตาม
            </h2>
            {journey.followups.length > 0 ? (
              <p className="text-sm text-text-muted">แสดง {journey.followups.length} รายการ</p>
            ) : null}
          </div>
          {journey.followups.length > 0 ? (
            <HistoryList>
              {journey.followups.map((item) => (
                <FollowupHistoryItem item={item} key={item.followupId} relationshipId={relationshipId} />
              ))}
            </HistoryList>
          ) : (
            <PatientSelfEmptyState title="ยังไม่มีข้อมูลติดตาม" />
          )}
        </section>

        <Alert variant="info">
          <p className="font-semibold">แสดงข้อมูลตามที่บันทึกไว้</p>
          <p className="mt-1">
            ข้อมูลในหน้านี้ไม่มีการคำนวณหรือแปลผลทางคลินิก และแต่ละรายการยังคงอยู่ภายใต้โรงพยาบาลที่แสดงด้านบน
          </p>
        </Alert>
      </div>
    </div>
  );
}
