import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  formatRoundDate,
  HEALTH_PATH_TIMEPOINT_LABELS,
  roundSkipDescription,
  roundStepStatusLabel,
} from "@/modules/patient-program-rounds/presentation/round-labels";
import { RoundProgressSummary } from "@/modules/patient-program-rounds/presentation/round-progress";
import { RoundVitalsValues } from "@/modules/patient-program-rounds/presentation/round-vitals-display";
import type { PatientSelfProgramRounds } from "@/modules/patient-self/services/patient-self-care-query-service";

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
        description="สรุปสิ่งที่บันทึกไว้ในแต่ละครั้ง ข้อมูลนี้อ่านอย่างเดียวและไม่ใช่การประเมินผลสุขภาพ"
        title="การรับบริการครั้งที่ 1–6"
      />

      <div className="space-y-6 pt-6">
        <PatientSelfHospitalContext relationship={rounds.relationship} />

        {rounds.rounds.map((round) => {
          const summary = rounds.overview.rounds.find((item) => item.roundNumber === round.roundNumber);

          return (
            <Panel key={round.roundNumber}>
              {summary ? <RoundProgressSummary round={summary} /> : <h2 className="text-lg font-semibold text-text">{round.title}</h2>}

              {round.vitals ? (
                <div className="mt-4 border-t border-border pt-4">
                  <p className="mb-3 text-sm font-semibold text-text">
                    {HEALTH_PATH_TIMEPOINT_LABELS[round.roundNumber]}
                  </p>
                  <RoundVitalsValues vitals={round.vitals} />
                </div>
              ) : null}

              {round.status.state === "LOCKED" ? null : (
                <ul className="mt-4 divide-y divide-border border-t border-border">
                  {round.status.steps.map((step) => (
                    <li className="flex flex-wrap items-center justify-between gap-2 py-3" key={step.code}>
                      <span className="min-w-0">
                        <span className="block font-medium text-text">{step.label}</span>
                        {step.status === "SKIPPED" ? (
                          <span className="mt-0.5 block break-words text-xs text-text-muted">เหตุผลที่ข้าม: {roundSkipDescription(step)}</span>
                        ) : null}
                      </span>
                      <StatusBadge variant={step.status === "DONE" ? "success" : step.status === "SKIPPED" ? "warning" : "neutral"}>
                        {roundStepStatusLabel(step)}
                      </StatusBadge>
                    </li>
                  ))}
                </ul>
              )}

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
                ? "ทำได้หลังจบการรับบริการครั้งที่ 6"
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
