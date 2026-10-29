import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { APPOINTMENT_TYPE_LABELS } from "@/modules/appointments/domain/appointment-definitions";
import { formatFamilyParticipantName } from "@/modules/family/presentation/caregiver-relationship-presentation";
import type { FamilyHealthSummary } from "@/modules/family/services/family-health-summary-query-service";
import { ServiceProgressCard } from "@/modules/patient-self/presentation/service-progress-card";

import { RefreshDelegatedRead } from "../grants/[grantId]/appointments/refresh-delegated-read";
import { personalAppointmentHubHref } from "../../personal/appointments/personal-appointment-hub-href";

const linkClassName = "inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring";

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(value);
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" }).format(value);
}

function Block({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  const id = `family-summary-${title}`;
  return (
    <section aria-labelledby={id}>
      <Panel>
        <h2 className="text-lg font-semibold text-text" id={id}>{title}</h2>
        <div className="mt-3 space-y-3 text-sm leading-6 text-text">{children}</div>
      </Panel>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <p className="text-text-muted">{children}</p>;
}

/**
 * AF-5 family health summary. Each block renders only when the server returned it, i.e. its grant is currently
 * active; an absent block is never shown as empty.
 */
export function FamilyHealthSummaryView({ summary }: { summary: FamilyHealthSummary }): React.JSX.Element {
  const name = formatFamilyParticipantName(summary.patient, "ไม่ระบุชื่อผู้ป่วย");
  const nothingShared = !summary.profile && !summary.nextAppointment && !summary.healthPlan && !summary.medications;

  return (
    <div className="max-w-4xl">
      <RefreshDelegatedRead />
      <PageHeader
        breadcrumbs={[{ label: "ครอบครัวและผู้ดูแล", href: "/app/family" }, { label: "สรุปสุขภาพ" }]}
        description="ข้อมูลที่ผู้ป่วยเลือกแชร์ให้คุณแบบอ่านอย่างเดียว"
        title={name}
      />
      <div className="mt-6 space-y-4">
        <Panel>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div className="min-w-0"><dt className="text-sm text-text-muted">ชื่อ</dt><dd className="mt-1 break-words font-semibold text-text">{name}</dd></div>
            {summary.relationshipLabel ? (
              <div className="min-w-0"><dt className="text-sm text-text-muted">ความสัมพันธ์</dt><dd className="mt-1 break-words font-semibold text-text">{summary.relationshipLabel}</dd></div>
            ) : null}
            {summary.profile?.age != null ? (
              <div className="min-w-0"><dt className="text-sm text-text-muted">อายุ</dt><dd className="mt-1 font-semibold text-text">{summary.profile.age} ปี</dd></div>
            ) : null}
          </dl>
        </Panel>

        {nothingShared ? (
          <Empty>ผู้ป่วยยังไม่ได้แชร์ข้อมูลสุขภาพกับคุณ หรือสิทธิ์ถูกยกเลิกแล้ว</Empty>
        ) : null}

        {summary.nextAppointment ? (
          <Block title="นัดถัดไป">
            {summary.nextAppointment.appointment ? (
              <>
                <p className="font-semibold">{APPOINTMENT_TYPE_LABELS[summary.nextAppointment.appointment.type]} · {formatDateTime(summary.nextAppointment.appointment.scheduledAt)}</p>
                <p className="text-text-muted">{summary.nextAppointment.appointment.hospitalName}</p>
                <Link className={linkClassName} href={`/app/family/grants/${encodeURIComponent(summary.nextAppointment.appointment.grantId)}/appointments/${encodeURIComponent(summary.nextAppointment.appointment.appointmentId)}`} prefetch={false}>
                  ดูรายละเอียดนัดหมาย
                </Link>
              </>
            ) : (
              <Empty>ไม่มีนัดหมายที่จะถึงในช่วง 90 วันข้างหน้า</Empty>
            )}
            {summary.nextAppointment.appointment ? (
              <Link className={linkClassName} href={personalAppointmentHubHref({ subject: summary.nextAppointment.appointment.grantId, tab: "upcoming" })} prefetch={false}>
                ดูนัดหมายทั้งหมด
              </Link>
            ) : null}
          </Block>
        ) : null}

        {summary.profile ? (
          <Block title="ผู้ดูแลและการติดต่อ">
            {summary.profile.careTeams.length === 0 ? <Empty>ยังไม่มีหน่วยบริการที่ดูแลอยู่</Empty> : (
              <ul className="divide-y divide-border">
                {summary.profile.careTeams.map((team, index) => (
                  <li className="py-3 first:pt-0" key={`${team.hospitalName}-${index}`}>
                    <p className="font-semibold">{team.parentHospitalName ? `${team.hospitalName} · ${team.parentHospitalName}` : team.hospitalName}</p>
                    <p className="text-text-muted">อสม. ที่ดูแล: {team.osmDisplayName ?? "ยังไม่มี อสม. ที่ดูแล"}</p>
                    <p className="text-text-muted">
                      โทรติดต่อหน่วยบริการ: {team.hospitalPhone ? <a className="font-semibold text-brand-strong underline underline-offset-4" href={`tel:${team.hospitalPhone}`}>{team.hospitalPhone}</a> : "ยังไม่มีเบอร์โทร"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Block>
        ) : null}

        {summary.healthPlan ? (
          <section aria-labelledby="family-current-service-heading">
            <h2 className="text-xl font-semibold text-text" id="family-current-service-heading">บริการปัจจุบัน</h2>
            <div className="mt-4 space-y-4">
              {summary.healthPlan.serviceProgress.length === 0 ? <Empty>ยังไม่มีหน่วยบริการที่ดูแลอยู่</Empty> : summary.healthPlan.serviceProgress.map((progress) => (
                <ServiceProgressCard key={progress.relationshipId} progress={progress} />
              ))}
            </div>
          </section>
        ) : null}

        {summary.healthPlan ? (
          <Block title="แผนสุขภาพปัจจุบัน">
            {summary.healthPlan.plans.length === 0 ? <Empty>ยังไม่มีแผนสุขภาพ</Empty> : summary.healthPlan.plans.map((plan, index) => (
              <div className="space-y-2" key={`${plan.hospitalName}-${index}`}>
                <p className="font-semibold">{plan.primaryGoalLabel}</p>
                <p className="text-text-muted">{plan.hospitalName} · ครั้งที่ {plan.roundNumber} · {formatDate(plan.createdAt)}</p>
                <ul className="list-disc space-y-1 pl-5">
                  {plan.targets.weightLossKg !== null ? <li>ลดน้ำหนัก {plan.targets.weightLossKg} กก.</li> : null}
                  {plan.targets.waistCm !== null ? <li>รอบเอวเป้าหมาย {plan.targets.waistCm} ซม.</li> : null}
                  {plan.targets.bloodSugarMgDl !== null ? <li>ระดับน้ำตาลเป้าหมาย {plan.targets.bloodSugarMgDl} มก./ดล.</li> : null}
                  {plan.targets.hba1cPercent !== null ? <li>HbA1c เป้าหมาย {plan.targets.hba1cPercent}%</li> : null}
                  {plan.activities.map((activity) => (
                    <li key={activity.activityLabel}>
                      {activity.activityLabel} {activity.targetDays} วัน/สัปดาห์{activity.targetValue !== null ? ` · ${activity.targetValue}${activity.targetUnit ? ` ${activity.targetUnit}` : ""}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </Block>
        ) : null}

        {summary.medications ? (
          <Block title="ยาที่ใช้อยู่">
            {summary.medications.items.length === 0 ? <Empty>ยังไม่มีรายการยาที่ใช้อยู่</Empty> : (
              <ul className="divide-y divide-border">
                {summary.medications.items.map((medication) => (
                  <li className="py-3 first:pt-0" key={medication.medicationId}>
                    <p className="break-words font-semibold">{medication.medicationName}</p>
                    <p className="text-text-muted">{medication.times.length > 0 ? `เวลา ${medication.times.join(", ")} น.` : "ไม่ได้ตั้งเวลา"}</p>
                  </li>
                ))}
              </ul>
            )}
          </Block>
        ) : null}
      </div>
    </div>
  );
}
