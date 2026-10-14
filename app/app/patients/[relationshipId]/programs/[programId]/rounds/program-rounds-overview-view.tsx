import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  buildPatientRoundPath,
  formatRoundDate,
} from "@/modules/patient-program-rounds/presentation/round-labels";
import type { ProgramRoundsOverview } from "@/modules/patient-program-rounds/services/round-query-service";

export function ProgramRoundsOverviewView({
  overview,
}: {
  overview: ProgramRoundsOverview & { patientDisplayName: string };
}): React.JSX.Element {
  const relationshipId = overview.patientHospitalRelationshipId;
  const programId = overview.patientProgramId;
  const programPath = `/app/patients/${encodeURIComponent(relationshipId)}/programs/${encodeURIComponent(programId)}`;

  return (
    <div>
      <PageHeader
        actions={
          <StatusBadge variant={overview.programStatus === "ACTIVE" ? "success" : "neutral"}>
            {overview.programStatus === "ACTIVE" ? "กำลังดำเนินการ" : "เสร็จสิ้นแล้ว"}
          </StatusBadge>
        }
        breadcrumbs={[
          { href: `/app/patients/${encodeURIComponent(relationshipId)}`, label: "รายละเอียดผู้ป่วย" },
          { href: programPath, label: "รายละเอียดโปรแกรม" },
          { label: "การจัดบริการครั้งที่ 1–6" },
        ]}
        description={`ผู้ป่วย: ${overview.patientDisplayName} · เลือกครั้งที่ต้องการบันทึกหรือดูประวัติ`}
        title="การจัดบริการครั้งที่ 1–6"
      />

      <div className="space-y-6 pt-8">
        {overview.programStatus === "COMPLETED" ? (
          <Alert variant="neutral">โปรแกรมนี้จบแล้ว ครั้งต่าง ๆ อยู่ในประวัติแบบอ่านอย่างเดียว</Alert>
        ) : null}

        <Panel>
          <ol className="divide-y divide-border">
            {overview.rounds.map((round) => (
              <li className="py-4 first:pt-0 last:pb-0" key={round.roundNumber}>
                <Link
                  className="flex flex-col gap-3 rounded-control focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring sm:flex-row sm:items-center sm:justify-between"
                  href={buildPatientRoundPath(relationshipId, programId, round.roundNumber)}
                >
                  <span className="min-w-0">
                    <span className="block text-base font-semibold text-text">{round.title}</span>
                    <span className="mt-1 block text-sm text-text-muted">
                      {round.status === "RECORDED"
                        ? `วันที่ ${formatRoundDate(round.date)} · ผู้บันทึก ${round.recordedByDisplayName ?? "ไม่ระบุ"}`
                        : "ยังไม่มีสัญญาณชีพหรือกิจกรรมในครั้งนี้"}
                    </span>
                    {round.status === "RECORDED" ? (
                      <span className="mt-1 block text-xs text-text-subtle">
                        {round.hasVitals ? "มีสัญญาณชีพ" : "ไม่มีสัญญาณชีพ"} · กิจกรรม {round.activityCount} รายการ
                      </span>
                    ) : null}
                  </span>
                  <StatusBadge variant={round.status === "RECORDED" ? "success" : "neutral"}>
                    {round.status === "RECORDED" ? "บันทึกแล้ว" : "ไม่ได้บันทึก"}
                  </StatusBadge>
                </Link>
              </li>
            ))}
            <li className="py-4 last:pb-0">
              <Link
                className={buttonClassName({
                  variant: "secondary",
                  className: "w-full justify-between text-left",
                })}
                href={`${programPath}#program-final`}
              >
                <span className="min-w-0">
                  <span className="block font-semibold">After · การประเมินสุดท้าย</span>
                  <span className="mt-1 block text-sm font-normal text-text-muted">
                    {overview.after.status === "RECORDED"
                      ? `วันที่ ${formatRoundDate(overview.after.date)} · ผู้บันทึก ${overview.after.recordedByDisplayName ?? "ไม่ระบุ"}`
                      : "ยังไม่มีการประเมินสุดท้าย"}
                  </span>
                </span>
                <StatusBadge variant={overview.after.status === "RECORDED" ? "success" : "neutral"}>
                  {overview.after.status === "RECORDED" ? "บันทึกแล้ว" : "ไม่ได้บันทึก"}
                </StatusBadge>
              </Link>
            </li>
          </ol>
        </Panel>

        <p className="text-sm leading-6 text-text-muted">
          รายการในแต่ละครั้งเป็นรายการแนะนำ ไม่บังคับทำครบ ครั้งหนึ่งนับว่าบันทึกแล้วเมื่อมีสัญญาณชีพหรือกิจกรรมอย่างน้อย 1 รายการ
        </p>

        <Link className={buttonClassName({ variant: "secondary" })} href={programPath}>
          ไปยังรายละเอียดโปรแกรมแบบเดิม
        </Link>
      </div>
    </div>
  );
}
