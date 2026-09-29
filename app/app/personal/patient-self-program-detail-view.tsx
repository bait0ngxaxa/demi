import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import type {
  PatientSelfProgramDetail,
} from "@/modules/patient-self/services/patient-self-care-query-service";

import {
  displayPatientBloodPressure,
  displayPatientMeasurement,
  formatPatientDateTime,
  patientProgramStatusLabels,
  PatientSelfEmptyState,
  PatientSelfHospitalContext,
} from "./patient-self-care-presentation";

const linkClassName =
  "font-semibold text-brand-strong underline decoration-brand-soft underline-offset-4 hover:text-brand focus-visible:rounded-control focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring";

export function PatientSelfProgramDetailView({
  relationshipId,
  detail,
}: {
  relationshipId: string;
  detail: PatientSelfProgramDetail;
}): React.JSX.Element {
  const relationship = detail.relationship;

  return (
    <div className="max-w-5xl">
      <PageHeader
        breadcrumbs={[
          { href: "/app/personal", label: "พื้นที่ส่วนตัว" },
          { href: "/app/personal/care", label: "ข้อมูลการดูแล" },
          {
            href: `/app/personal/care/${encodeURIComponent(relationshipId)}`,
            label: relationship.hospitalName,
          },
          { label: "รายละเอียดโปรแกรม" },
        ]}
        description="ข้อมูลสถานะและประวัติที่บันทึกไว้ใน Program นี้"
        title="Program"
      />

      <div className="space-y-8 pt-6">
        <PatientSelfHospitalContext relationship={relationship} />

        <section aria-labelledby="patient-self-program-status-heading">
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-text" id="patient-self-program-status-heading">
            สถานะ Program
          </h2>
          <Panel className="mt-4">
            <StatusBadge variant={detail.status === "ACTIVE" ? "info" : "neutral"}>
              {patientProgramStatusLabels[detail.status]}
            </StatusBadge>
            <dl className="mt-5 grid min-w-0 gap-x-8 gap-y-4 sm:grid-cols-2">
              <div className="min-w-0">
                <dt className="text-sm font-semibold text-text-muted">เริ่มเมื่อ</dt>
                <dd className="mt-1 break-words font-semibold text-text">
                  {formatPatientDateTime(detail.startedAt)}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-sm font-semibold text-text-muted">สิ้นสุดเมื่อ</dt>
                <dd className="mt-1 break-words font-semibold text-text">
                  {detail.completedAt ? formatPatientDateTime(detail.completedAt) : "ยังไม่มีวันที่สิ้นสุด"}
                </dd>
              </div>
            </dl>
            <p className="mt-5 border-t border-border pt-4 text-sm leading-6 text-text-muted">
              สถานะนี้แสดงขั้นตอนการดำเนินงานที่บันทึกไว้ ไม่ใช่การประเมินผลสุขภาพ
            </p>
          </Panel>
        </section>

        <section aria-labelledby="patient-self-service-one-heading">
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-text" id="patient-self-service-one-heading">
            ความคืบหน้ากิจกรรม Service 1
          </h2>
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {detail.serviceOne.map((activity) => (
              <li className="flex min-w-0 flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between" key={activity.label}>
                <span className="break-words font-medium text-text">{activity.label}</span>
                {activity.recordedAt ? (
                  <span className="break-words text-sm text-text-muted">
                    บันทึก {formatPatientDateTime(activity.recordedAt)}
                  </span>
                ) : (
                  <span className="text-sm text-text-muted">ยังไม่มีบันทึก</span>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="patient-self-program-goals-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-semibold tracking-[-0.02em] text-text" id="patient-self-program-goals-heading">
              แผนเป้าหมายใน Program นี้
            </h2>
            {detail.goalPlans.length > 0 ? (
              <p className="text-sm text-text-muted">แสดง {detail.goalPlans.length} รายการ</p>
            ) : null}
          </div>
          {detail.goalPlans.length > 0 ? (
            <ul className="mt-4 divide-y divide-border border-y border-border">
              {detail.goalPlans.map((plan) => (
                <li className="min-w-0 py-4 first:pt-0 last:pb-0" key={plan.goalPlanId}>
                  <Link
                    className={`${linkClassName} break-words`}
                    href={`/app/personal/care/${encodeURIComponent(relationshipId)}/goal-plans/${encodeURIComponent(plan.goalPlanId)}`}
                  >
                    แผนเป้าหมาย รอบที่ {plan.roundNumber}
                  </Link>
                  <p className="mt-1 break-words text-sm leading-6 text-text">
                    เป้าหมายหลัก: {plan.primaryGoalLabel}
                  </p>
                  <p className="mt-1 text-sm text-text-muted">
                    บันทึก {formatPatientDateTime(plan.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <PatientSelfEmptyState title="ยังไม่มีแผนเป้าหมายใน Program นี้" />
          )}
        </section>

        <section aria-labelledby="patient-self-program-followups-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-semibold tracking-[-0.02em] text-text" id="patient-self-program-followups-heading">
              การติดตามใน Program นี้
            </h2>
            {detail.followups.length > 0 ? (
              <p className="text-sm text-text-muted">แสดง {detail.followups.length} รายการ</p>
            ) : null}
          </div>
          {detail.followups.length > 0 ? (
            <ul className="mt-4 divide-y divide-border border-y border-border">
              {detail.followups.map((followup) => (
                <li className="min-w-0 py-4 first:pt-0 last:pb-0" key={followup.followupId}>
                  <Link
                    className={`${linkClassName} break-words`}
                    href={`/app/personal/care/${encodeURIComponent(relationshipId)}/followups/${encodeURIComponent(followup.followupId)}`}
                  >
                    ติดตาม รอบที่ {followup.roundNumber}
                  </Link>
                  <p className="mt-1 break-words text-sm leading-6 text-text-muted">
                    บันทึก {formatPatientDateTime(followup.recordedAt)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <PatientSelfEmptyState title="ยังไม่มีข้อมูลติดตามใน Program นี้" />
          )}
        </section>

        <section aria-labelledby="patient-self-final-heading">
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-text" id="patient-self-final-heading">
            การประเมินสิ้นสุด
          </h2>
          {detail.finalAssessment ? (
            <Panel className="mt-4">
              <p className="text-sm text-text-muted">
                บันทึก {formatPatientDateTime(detail.finalAssessment.recordedAt)}
              </p>
              <dl className="mt-5 grid min-w-0 gap-x-8 gap-y-4 sm:grid-cols-2">
                <div className="min-w-0">
                  <dt className="text-sm font-semibold text-text-muted">น้ำหนัก</dt>
                  <dd className="mt-1 break-words font-semibold text-text">
                    {displayPatientMeasurement(detail.finalAssessment.measurements.weight, "kg")}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-sm font-semibold text-text-muted">รอบเอว</dt>
                  <dd className="mt-1 break-words font-semibold text-text">
                    {displayPatientMeasurement(detail.finalAssessment.measurements.waistCircumference, "cm")}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-sm font-semibold text-text-muted">ความดันโลหิต</dt>
                  <dd className="mt-1 break-words font-semibold text-text">
                    {displayPatientBloodPressure(
                      detail.finalAssessment.measurements.systolicBloodPressure,
                      detail.finalAssessment.measurements.diastolicBloodPressure,
                    )}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-sm font-semibold text-text-muted">ระดับน้ำตาลในเลือด</dt>
                  <dd className="mt-1 break-words font-semibold text-text">
                    {displayPatientMeasurement(detail.finalAssessment.measurements.bloodSugar, "DTX / mg%")}
                  </dd>
                </div>
              </dl>
            </Panel>
          ) : (
            <PatientSelfEmptyState title="ยังไม่มีการประเมินสิ้นสุด" />
          )}
        </section>
      </div>
    </div>
  );
}
