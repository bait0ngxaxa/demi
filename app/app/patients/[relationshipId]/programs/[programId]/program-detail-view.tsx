import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";
import type {
  GoalPlanProgramDetail,
  GoalPlanProgramOverview,
} from "@/modules/goals/services/goal-query-service";
import type { FollowupProgramHistory } from "@/modules/followups/services/followup-query-service";
import type { PatientFinalAssessmentProjection } from "@/modules/patient-final-assessment/services/patient-final-assessment-query-service";
import type { PatientProgramDetail } from "@/modules/patient-program/services/patient-program-query-service";

import { PatientProgramCompleteControl } from "../program-mutation-controls";

import { PatientProgramServiceOneWorkspace } from "./service-one-workspace";
import { PatientProgramFollowupWorkspace } from "./followup-workspace";
import { PatientProgramServiceTwoWorkspace } from "./service-two-workspace";
import { PatientProgramFinalAssessmentWorkspace } from "./final-assessment-workspace";

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(value);
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "long",
    timeZone: "Asia/Bangkok",
  }).format(value);
}

function statusLabel(status: PatientProgramDetail["status"]): string {
  return status === "ACTIVE" ? "กำลังดำเนินการ" : "เสร็จสิ้นแล้ว";
}

function statusVariant(status: PatientProgramDetail["status"]): StatusVariant {
  return status === "ACTIVE" ? "success" : "neutral";
}

export function PatientProgramDetailView({
  detail,
  finalAssessment,
  followupHistory,
  goalPlanOverview,
  latestGoalPlan,
}: {
  detail: PatientProgramDetail;
  finalAssessment: PatientFinalAssessmentProjection;
  followupHistory: FollowupProgramHistory;
  goalPlanOverview: GoalPlanProgramOverview;
  latestGoalPlan: GoalPlanProgramDetail | null;
}): React.JSX.Element {
  const relationshipId = detail.patient.patientHospitalRelationshipId;

  return (
    <div className="max-w-5xl">
      <PageHeader
        actions={<StatusBadge variant={statusVariant(detail.status)}>{statusLabel(detail.status)}</StatusBadge>}
        breadcrumbs={[
          { href: `/app/patients/${encodeURIComponent(relationshipId)}`, label: "รายละเอียดผู้ป่วย" },
          { label: "รายละเอียดโปรแกรม" },
        ]}
        description="ภาพรวมช่วงการดำเนินโปรแกรมของผู้ป่วยในความสัมพันธ์กับโรงพยาบาลนี้"
        title="รายละเอียดโปรแกรม"
      />

      <div className="space-y-6 pt-8">
        <Alert variant="info">
          <p className="font-semibold">ขอบเขตของโปรแกรม</p>
          <p className="mt-1">
            โปรแกรมเป็นช่วงการเข้าร่วมหนึ่งรอบ ข้อมูล Service 1 แผนสุขภาพ และการติดตามผลที่บันทึกผ่านเส้นทางนี้
            จึงอยู่ภายใต้โปรแกรมรอบนี้ ส่วนข้อมูลตัวตนผู้ป่วย ความสัมพันธ์กับโรงพยาบาล ประวัติหลักฐานทั่วไป
            ประวัติการประเมิน และประวัตินัดหมายเชิงปฏิบัติการยังคงเป็นข้อมูลคนละขอบเขต
          </p>
        </Alert>

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
              <dt className="text-sm font-semibold text-text-muted">เริ่มโปรแกรม</dt>
              <dd className="mt-1 font-semibold text-text">{formatDateTime(detail.startedAt)}</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-text-muted">สิ้นสุดโปรแกรม</dt>
              <dd className="mt-1 font-semibold text-text">
                {detail.completedAt ? formatDateTime(detail.completedAt) : "ยังไม่สิ้นสุด"}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-text-muted">ข้อมูลตั้งต้น</dt>
              <dd className="mt-1 font-semibold text-text">
                {detail.initialBaseline ? (
                  <span>
                    บันทึกเมื่อ {formatDate(detail.initialBaseline.recordedOn)} ·{" "}
                    <Link
                      className="text-brand-strong underline decoration-brand-muted underline-offset-4"
                      href={`/app/patients/${encodeURIComponent(relationshipId)}/baseline`}
                    >
                      ดูข้อมูลตั้งต้น
                    </Link>
                  </span>
                ) : (
                  "ยังไม่มีข้อมูลตั้งต้นที่เชื่อมโยง"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-text-muted">ผู้เปิดโปรแกรม</dt>
              <dd className="mt-1 font-semibold text-text">{detail.createdBy.displayName}</dd>
            </div>
          </dl>
        </Panel>

        <PatientProgramServiceOneWorkspace detail={detail} />

        <PatientProgramServiceTwoWorkspace
          detail={detail}
          latestGoalPlan={latestGoalPlan}
          overview={goalPlanOverview}
        />

        <PatientProgramFollowupWorkspace detail={detail} history={followupHistory} />

        <PatientProgramFinalAssessmentWorkspace
          detail={detail}
          finalAssessment={finalAssessment}
        />

        {detail.status === "ACTIVE" && detail.canManage ? (
          <Panel>
            <h2 className="text-xl font-semibold tracking-[-0.02em] text-text">การดำเนินการของโปรแกรม</h2>
            <p className="mt-2 text-sm leading-6 text-text-muted">
              เมื่อจบแล้ว โปรแกรมจะเปลี่ยนเป็นประวัติอ่านอย่างเดียว ไม่สามารถบันทึกข้อมูลใน Service 1 แผนสุขภาพ
              หรือการติดตามผลเพิ่มได้ และจะไม่สามารถเปิดโปรแกรมเดิมซ้ำได้
            </p>
            <p className="mt-3 text-sm leading-6 text-text-muted">
              การจบโปรแกรมเป็นเพียงการเปลี่ยนสถานะของโปรแกรม ไม่ได้หมายถึงผลสำเร็จหรือผลลัพธ์ทางคลินิก
            </p>
            <div className="mt-5">
              <PatientProgramCompleteControl programId={detail.programId} />
            </div>
          </Panel>
        ) : detail.status === "COMPLETED" ? (
          <Alert variant="neutral">
            <p className="font-semibold">โปรแกรมนี้จบแล้วและอยู่ในประวัติแบบอ่านอย่างเดียว</p>
            <p className="mt-1">ประวัติ Service 1 แผนสุขภาพ และการติดตามผลเดิมยังอ่านได้ แต่ไม่สามารถบันทึกข้อมูลใหม่</p>
          </Alert>
        ) : null}

        <Link
          className="inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          href={`/app/patients/${encodeURIComponent(relationshipId)}`}
        >
          กลับไปยังรายละเอียดผู้ป่วย
        </Link>
      </div>
    </div>
  );
}
