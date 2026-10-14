import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  formatRoundDate,
  formatRoundNumber,
  ROUND_AWAITING_FORM_LABEL,
  roundActivitySourceLabel,
  roundActivityStatusLabel,
} from "@/modules/patient-program-rounds/presentation/round-labels";
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
          const doneActivities = round.activities.filter((activity) => activity.status === "DONE");

          return (
            <Panel key={round.roundNumber}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-text">{round.title}</h2>
                  <p className="mt-1 text-sm text-text-muted">
                    {summary?.status === "RECORDED"
                      ? `วันที่ ${formatRoundDate(summary.date)}`
                      : "ยังไม่มีบันทึกในครั้งนี้"}
                  </p>
                </div>
                <StatusBadge variant={summary?.status === "RECORDED" ? "success" : "neutral"}>
                  {summary?.status === "RECORDED" ? "บันทึกแล้ว" : "ไม่ได้บันทึก"}
                </StatusBadge>
              </div>

              {round.vitals ? (
                <dl className="mt-4 grid gap-3 border-t border-border pt-4 text-sm sm:grid-cols-3">
                  {[
                    ["น้ำหนัก (kg)", formatRoundNumber(round.vitals.weight)],
                    ["ส่วนสูง (cm)", formatRoundNumber(round.vitals.heightCm)],
                    ["BMI (kg/m²)", formatRoundNumber(round.vitals.bmi)],
                    ["รอบเอว (cm)", formatRoundNumber(round.vitals.waistCircumference)],
                    ["น้ำตาลในเลือด / DTX (mg/dL)", formatRoundNumber(round.vitals.bloodSugar)],
                    [
                      "ความดัน (mmHg)",
                      `${formatRoundNumber(round.vitals.systolicBloodPressure)} / ${formatRoundNumber(round.vitals.diastolicBloodPressure)}`,
                    ],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-text-muted">{label}</dt>
                      <dd className="mt-0.5 font-semibold text-text">{value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}

              {round.followupId ? (
                <p className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4 text-sm">
                  <span className="font-medium text-text">มีบันทึกการติดตามผล</span>
                  <Link className={linkClassName} href={`${careHref}/followups/${encodeURIComponent(round.followupId)}`}>
                    ดูรายละเอียดการติดตามผล
                  </Link>
                </p>
              ) : null}

              {doneActivities.length > 0 ? (
                <ul className="mt-4 divide-y divide-border border-t border-border">
                  {doneActivities.map((activity) => {
                    const sourceLabel = roundActivitySourceLabel(activity);
                    const detailHref =
                      activity.linkedRecord?.type === "GOAL_PLAN"
                        ? `${careHref}/goal-plans/${encodeURIComponent(activity.linkedRecord.id)}`
                        : activity.linkedRecord?.type === "FOLLOWUP"
                          ? `${careHref}/followups/${encodeURIComponent(activity.linkedRecord.id)}`
                          : null;

                    return (
                      <li className="flex flex-wrap items-center gap-2 py-3" key={activity.toolCode}>
                        <span className="font-medium text-text">{activity.label}</span>
                        <StatusBadge variant="success">{roundActivityStatusLabel(activity)}</StatusBadge>
                        {sourceLabel ? <StatusBadge variant="info">{sourceLabel}</StatusBadge> : null}
                        {detailHref ? (
                          <Link className={linkClassName} href={detailHref}>
                            ดูรายละเอียด
                          </Link>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : null}

              {round.activities.some((activity) => activity.status === "AWAITING_FORM") ? (
                <p className="mt-3 text-xs text-text-subtle">
                  บางเครื่องมือในครั้งนี้ {ROUND_AWAITING_FORM_LABEL}
                </p>
              ) : null}
            </Panel>
          );
        })}

        <Panel>
          <h2 className="text-lg font-semibold text-text">After · การประเมินสุดท้าย</h2>
          <p className="mt-1 text-sm text-text-muted">
            {rounds.overview.after.status === "RECORDED"
              ? `บันทึกวันที่ ${formatRoundDate(rounds.overview.after.date)}`
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
