import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import {
  formatRoundDate,
  HEALTH_PATH_TIMEPOINT_LABELS,
} from "@/modules/patient-program-rounds/presentation/round-labels";
import { RoundStepTimeline } from "@/modules/patient-program-rounds/presentation/round-step-timeline";
import { RoundProgressSummary } from "@/modules/patient-program-rounds/presentation/round-progress";
import { RoundVitalsValues } from "@/modules/patient-program-rounds/presentation/round-vitals-display";
import {
  FloatingChartComparison,
  FloatingChartVisualization,
} from "@/modules/patient-program/presentation/floating-chart-display";
import type { PatientSelfProgramRounds } from "@/modules/patient-self/services/patient-self-care-query-service";

import { isRecordedByStaff, PatientRoundRecording } from "./patient-round-recording";
import { ROUND_ITEM_CATALOG } from "@/modules/patient-program-rounds/domain/round-steps";
import { roundStepStatusLabel } from "@/modules/patient-program-rounds/presentation/round-labels";

import { PatientSelfHospitalContext } from "./patient-self-care-presentation";

const linkClassName =
  "font-semibold text-brand-strong underline decoration-brand-soft underline-offset-4 hover:text-brand focus-visible:rounded-control focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring";

export function PatientSelfProgramRoundsView({
  programId,
  relationshipId,
  rounds,
}: {
  programId: string;
  relationshipId: string;
  rounds: PatientSelfProgramRounds;
}): React.JSX.Element {
  const careHref = `/app/personal/care/${encodeURIComponent(relationshipId)}`;
  const programHref = `${careHref}/programs/${encodeURIComponent(programId)}`;

  return (
    <div className="max-w-5xl">
      <PageHeader
        breadcrumbs={[
          { href: "/app/personal", label: "พื้นที่ส่วนตัว" },
          { href: "/app/personal/care", label: "ข้อมูลการดูแล" },
          { href: careHref, label: rounds.relationship.hospitalName },
          { href: programHref, label: "Program" },
          { label: "ประวัติการรับบริการรายครั้ง" },
        ]}
        description={rounds.rounds.some((round) => round.canSelfRecord) ? "บันทึกรายการของคุณในครั้งที่เปิดอยู่ และดูประวัติการรับบริการ" : "สรุปสิ่งที่บันทึกไว้ในแต่ละครั้ง ข้อมูลนี้อ่านอย่างเดียวและไม่ใช่การประเมินผลสุขภาพ"}
        title="การรับบริการรายครั้ง"
      />

      <div className="space-y-6 pt-6">
        <PatientSelfHospitalContext relationship={rounds.relationship} />

        {rounds.rounds.map((round) => {
          const summary = rounds.overview.rounds.find((item) => item.roundNumber === round.roundNumber);

          return (
            <Panel key={round.roundNumber}>
              <span id={`round-${round.roundNumber}`} />
              {round.canSelfRecord ? <h2 className="mb-3 text-lg font-semibold text-text">ครั้งบริการปัจจุบัน</h2> : null}
              {summary ? <RoundProgressSummary round={summary} /> : <h2 className="text-lg font-semibold text-text">{round.title}</h2>}

              {round.vitals ? (
                <div className="mt-4 border-t border-border pt-4">
                  <p className="mb-3 text-sm font-semibold text-text">
                    {HEALTH_PATH_TIMEPOINT_LABELS[round.roundNumber]}
                  </p>
                  <RoundVitalsValues audience="PATIENT" vitals={round.vitals} />
                </div>
              ) : null}

              {round.serviceOne.floatingChart.recorded ? (
                <section aria-label="กราฟวัดลอยจม" className="mt-4 space-y-4 border-t border-border pt-4">
                  <h3 className="font-semibold text-text">กราฟวัดลอยจม</h3>
                  <FloatingChartVisualization scores={round.serviceOne.floatingChart.scores} />
                  {round.serviceOne.floatingChart.summary ? (
                    <p className="whitespace-pre-wrap text-sm leading-6 text-text">
                      {round.serviceOne.floatingChart.summary}
                    </p>
                  ) : null}
                  {round.roundNumber === 4 && round.serviceOne.floatingChart.scores ? (
                    <FloatingChartComparison
                      currentScores={round.serviceOne.floatingChart.scores}
                      roundOneScores={round.serviceOne.floatingChart.roundOneScores}
                    />
                  ) : null}
                </section>
              ) : null}

              <div className="mt-4 border-t border-border pt-4">
                {round.canSelfRecord && round.status.steps.length === 0 ? <p className="text-sm text-text-muted">ยังไม่มีรายการในแผน เจ้าหน้าที่/อสม. จะเพิ่มรายการให้</p> : null}
                {round.canSelfRecord ? <ol className="divide-y divide-border">{round.status.steps.map((step) => <li className="py-4" key={step.planItemId ?? step.code}>
                  <h3 className="font-semibold text-text">{step.label}</h3>
                  <p className="mt-1 text-sm text-text-muted">{step.evidence?.byPatient ? "คุณบันทึกแล้ว" : roundStepStatusLabel(step)}</p>
                  {!ROUND_ITEM_CATALOG[step.code].patientRecordable ? <p className="mt-1 text-sm text-text-muted">{step.status === "DONE" ? "เจ้าหน้าที่/อสม. บันทึกให้แล้ว" : "เจ้าหน้าที่/อสม. จะบันทึกให้"}</p> : isRecordedByStaff(round, step) ? <p className="mt-1 text-sm text-text-muted">เจ้าหน้าที่/อสม. บันทึกให้แล้ว</p> : null}
                  {step.doneNote ? <p className="mt-2 whitespace-pre-wrap text-sm text-text">{step.doneNote}</p> : null}
                  <PatientRoundRecording round={round} step={step} relationship={rounds.relationship} />
                </li>)}</ol> : <RoundStepTimeline
                  audience="PATIENT"
                  completion={round.status.completion}
                  locked={round.status.state === "LOCKED"}
                  roundNumber={round.roundNumber}
                  steps={round.status.steps}
                />}
              </div>

              {round.followupId || (round.roundNumber === 2 && round.goalPlan.firstGoalPlanId) ? (
                <p className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4 text-sm">
                  {round.followupId ? (
                    <Link className={linkClassName} href={`${careHref}/followups/${encodeURIComponent(round.followupId)}`}>
                      ดูรายละเอียดการติดตามผล
                    </Link>
                  ) : null}
                  {round.roundNumber === 2 && round.goalPlan.firstGoalPlanId ? (
                    <Link className={linkClassName} href={`${careHref}/goal-plans/${encodeURIComponent(round.goalPlan.firstGoalPlanId)}`}>
                      ดูแผนสุขภาพ
                    </Link>
                  ) : null}
                </p>
              ) : null}
            </Panel>
          );
        })}

        <Panel>
          <h2 className="text-lg font-semibold text-text">After · การประเมินสุดท้าย</h2>
          <p className="mt-1 text-sm text-text-muted">
            {rounds.overview.after.state === "RECORDED"
              ? `บันทึกวันที่ ${formatRoundDate(rounds.overview.after.date)}`
              : rounds.overview.after.state === "LOCKED"
                ? "ทำได้เมื่อเปิดอย่างน้อย 6 ครั้ง และจบทุกครั้งที่เปิดไว้"
                : "ยังไม่มีการประเมินสุดท้าย"}
          </p>
        </Panel>

        <Link className={linkClassName} href={programHref}>
          กลับไปหน้า Program
        </Link>
      </div>
    </div>
  );
}
