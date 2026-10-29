import Link from "next/link";
import { randomUUID } from "node:crypto";
import { AddProgramRoundControl } from "./[roundNumber]/round-plan-editor";

import { Alert } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  buildPatientRoundPath,
  formatRoundDate,
} from "@/modules/patient-program-rounds/presentation/round-labels";
import { RoundProgressSummary } from "@/modules/patient-program-rounds/presentation/round-progress";
import type { ProgramRoundsOverview } from "@/modules/patient-program-rounds/services/round-query-service";

export function ProgramRoundsOverviewView({
  overview,
}: {
  overview: ProgramRoundsOverview & { patientDisplayName: string };
}): React.JSX.Element {
  const relationshipId = overview.patientHospitalRelationshipId;
  const programId = overview.patientProgramId;
  const programPath = `/app/patients/${encodeURIComponent(relationshipId)}/programs/${encodeURIComponent(programId)}`;
  const after = overview.after;

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
          { label: "การจัดบริการรายครั้ง" },
        ]}
        description={`ผู้ป่วย: ${overview.patientDisplayName} · ทำทีละครั้งตามลำดับ ปรับรายการในแผนได้ และจบครั้งนี้ได้เมื่อทำแล้วอย่างน้อย 1 รายการ รายการที่เหลือจะบันทึกเป็นยังไม่ได้ทำเมื่อจบบริการ เพิ่มครั้งบริการหลังครั้งที่ 6 ได้ถึง 12 ครั้ง`}
        title="การจัดบริการรายครั้ง"
      />

      <div className="space-y-6 pt-8">
        {overview.programStatus === "COMPLETED" ? (
          <Alert variant="neutral">โปรแกรมนี้จบแล้ว ครั้งต่าง ๆ อยู่ในประวัติแบบอ่านอย่างเดียว</Alert>
        ) : null}

        <ol className="grid gap-4 md:grid-cols-2">
          {overview.rounds.map((round) => (
            <li key={round.roundNumber}>
              <Link
                className="block h-full rounded-panel border border-border bg-surface p-5 transition-colors hover:border-action-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
                href={buildPatientRoundPath(relationshipId, programId, round.roundNumber)}
              >
                <RoundProgressSummary round={round} />
              </Link>
            </li>
          ))}
        </ol>

        {overview.canManage && overview.programStatus === "ACTIVE" ? overview.addRoundUnavailableReason === null ? <AddProgramRoundControl target={{ patientHospitalRelationshipId: relationshipId, patientProgramId: programId, roundNumber: overview.rounds.length + 1 }} submissionNonce={randomUUID()} /> : <p className="text-sm text-text-muted">เพิ่มครั้งบริการไม่ได้: {overview.addRoundUnavailableReason}</p> : null}
        <Panel>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-text">After · การประเมินสุดท้าย</h2>
              <p className="mt-1 text-sm text-text-muted">
                {after.state === "RECORDED"
                  ? `วันที่ ${formatRoundDate(after.date)} · ผู้บันทึก ${after.recordedByDisplayName ?? "ไม่ระบุ"}`
                  : after.state === "LOCKED"
                    ? "ต้องเปิดอย่างน้อย 6 ครั้ง และจบบริการทุกครั้งก่อน"
                    : "ยังไม่มีการประเมินสุดท้าย"}
              </p>
            </div>
            {after.state === "LOCKED" ? (
              <StatusBadge variant="neutral">ยังเปิดไม่ได้</StatusBadge>
            ) : (
              <Link className={buttonClassName({ size: "compact", variant: "secondary" })} href={`${programPath}#program-final`}>
                {after.state === "RECORDED" ? "ดูการประเมินสุดท้าย" : "บันทึกการประเมินสุดท้าย"}
              </Link>
            )}
          </div>
        </Panel>

        <p className="text-sm leading-6 text-text-muted">
          เมื่อมีรายการที่ทำแล้วอย่างน้อย 1 รายการ กด “จบบริการครั้งที่ n” เมื่อจบแล้วครั้งนั้นเป็นแบบอ่านอย่างเดียว
        </p>

        <Link className={buttonClassName({ variant: "secondary" })} href={programPath}>
          ไปยังรายละเอียดโปรแกรม
        </Link>
      </div>
    </div>
  );
}
