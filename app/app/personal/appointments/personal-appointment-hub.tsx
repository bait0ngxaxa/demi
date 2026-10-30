import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import {
  APPOINTMENT_ACKNOWLEDGEMENT_GUIDANCE,
  APPOINTMENT_CANCELLATION_REQUEST_GUIDANCE,
} from "@/modules/appointments/domain/appointment-interaction-definitions";
import { formatFamilyParticipantName } from "@/modules/family/presentation/caregiver-relationship-presentation";
import type { PatientSelfAppointmentHubTab } from "@/modules/patient-self/services/patient-self-care-query-service";
import type {
  PersonalAppointmentHubPageContext,
  PersonalAppointmentHubSubject,
} from "@/modules/patient-self/transport/patient-self-care-page-context";

import { FAMILY_APPOINTMENT_READ_CONTRACT_V2 } from "@/modules/family/domain/appointment-grant-contract";
import { AppointmentFields } from "../../family/grants/[grantId]/appointments/appointment-fields";
import { familyHealthSummaryHref } from "../../family/members/family-health-summary-href";
import { RefreshDelegatedRead } from "../../family/grants/[grantId]/appointments/refresh-delegated-read";
import { ORDINARY_PATIENT_APPOINTMENT_LINKS, PatientSelfAppointmentRow } from "../patient-self-appointment-content";
import { PatientSelfEmptyState } from "../patient-self-care-presentation";
import { personalAppointmentHubHref } from "./personal-appointment-hub-href";

const tabs: readonly { id: PatientSelfAppointmentHubTab; label: string }[] = [
  { id: "upcoming", label: "ที่จะถึง" },
  { id: "history", label: "ประวัติ" },
];

const pillClassName = (selected: boolean): string =>
  `inline-flex min-h-11 max-w-full flex-col justify-center rounded-control border px-4 py-2 text-left text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring ${
    selected
      ? "border-action-primary bg-brand-soft text-brand-strong"
      : "border-border bg-surface text-text hover:border-action-primary"
  }`;

function subjectLabel(subject: PersonalAppointmentHubSubject): string {
  return subject.kind === "SELF" ? "ฉัน" : formatFamilyParticipantName(subject.patient, "ไม่ระบุชื่อผู้ป่วย");
}

function SubjectSwitcher({ context }: { context: PersonalAppointmentHubPageContext }): React.JSX.Element | null {
  if (context.subjects.length < 2) {
    return null;
  }

  return (
    <nav aria-label="เลือกผู้รับบริการ">
      <p className="mb-2 text-sm font-semibold text-text-muted">นัดหมายของ</p>
      <ul className="flex flex-wrap gap-2">
        {context.subjects.map((subject) => {
          const selected = context.selected?.key === subject.key;
          return (
            <li className="min-w-0 max-w-full" key={subject.key}>
              <Link
                aria-current={selected ? "page" : undefined}
                className={pillClassName(selected)}
                href={personalAppointmentHubHref({ subject: subject.key, tab: context.tab })}
                prefetch={false}
              >
                <span className="break-words">{subjectLabel(subject)}</span>
                {subject.kind === "FAMILY" ? (
                  <span className="break-words text-xs font-medium text-text-muted">สมาชิกครอบครัว · {subject.hospitalName}</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function HubTabs({ context }: { context: PersonalAppointmentHubPageContext }): React.JSX.Element {
  return (
    <nav aria-label="ส่วนของรายการนัดหมาย" className="overflow-x-auto border-b border-border">
      <ul className="flex min-w-max gap-2">
        {tabs.map(({ id, label }) => (
          <li key={id}>
            <Link
              aria-current={context.tab === id ? "page" : undefined}
              className={`inline-flex min-h-12 items-center border-b-2 px-4 text-sm font-semibold ${context.tab === id ? "border-action-primary text-brand-strong" : "border-transparent text-text-muted hover:text-text"}`}
              href={personalAppointmentHubHref({
                subject: context.selected?.key,
                tab: id,
                hospital: context.self?.selectedRelationshipId,
              })}
              prefetch={false}
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function SelfAppointments({
  context,
  self,
}: {
  context: PersonalAppointmentHubPageContext;
  self: NonNullable<PersonalAppointmentHubPageContext["self"]>;
}): React.JSX.Element {
  const hrefFor = (hospital: string | null, cursor?: string | null): string =>
    personalAppointmentHubHref({ subject: "me", tab: self.tab, hospital, cursor });

  return (
    <div className="space-y-6">
      {self.relationships.length > 1 ? (
        <nav aria-label="กรองตามโรงพยาบาล">
          <ul className="flex flex-wrap gap-2">
            {[{ relationshipId: null, hospitalName: "ทุกโรงพยาบาล" }, ...self.relationships].map((relationship) => {
              const selected = self.selectedRelationshipId === relationship.relationshipId;
              return (
                <li className="min-w-0 max-w-full" key={relationship.relationshipId ?? "all"}>
                  <Link
                    aria-current={selected ? "page" : undefined}
                    className={pillClassName(selected)}
                    href={hrefFor(relationship.relationshipId)}
                    prefetch={false}
                  >
                    <span className="break-words">{relationship.hospitalName}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
      <div className="space-y-2 text-sm leading-6 text-text-muted">
        <p>{APPOINTMENT_ACKNOWLEDGEMENT_GUIDANCE}</p>
        <p>{APPOINTMENT_CANCELLATION_REQUEST_GUIDANCE}</p>
      </div>
      {self.appointments.length > 0 ? (
        <ul className="divide-y divide-border overflow-hidden rounded-panel border border-border bg-surface">
          {self.appointments.map((appointment) => (
            <PatientSelfAppointmentRow
              appointment={appointment}
              hospitalName={self.relationships.length > 1 ? appointment.hospitalName : undefined}
              href={ORDINARY_PATIENT_APPOINTMENT_LINKS.detail(appointment.relationshipId, appointment.appointmentId)}
              key={appointment.appointmentId}
            />
          ))}
        </ul>
      ) : self.relationships.length > 0 ? (
        <PatientSelfEmptyState title={context.tab === "upcoming" ? "ยังไม่มีนัดหมายที่จะถึง" : "ยังไม่มีประวัติการนัดหมาย"} />
      ) : null}
      {self.nextCursor ? (
        <div className="flex justify-center">
          <Link className={buttonClassName({ variant: "secondary" })} href={hrefFor(self.selectedRelationshipId, self.nextCursor)} prefetch={false}>
            ดูรายการถัดไป
          </Link>
        </div>
      ) : null}
      {self.endedRelationships.length > 0 ? (
        <section aria-labelledby="ended-hospital-appointments" className="border-t border-border pt-4">
          <h2 className="text-sm font-semibold text-text" id="ended-hospital-appointments">
            ประวัติจากโรงพยาบาลที่สิ้นสุดการดูแลแล้ว
          </h2>
          <ul className="mt-2 space-y-1">
            {self.endedRelationships.map((relationship) => (
              <li key={relationship.relationshipId}>
                <Link
                  className="inline-flex min-h-11 items-center break-words text-sm font-semibold text-brand-strong underline underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
                  href={ORDINARY_PATIENT_APPOINTMENT_LINKS.history(relationship.relationshipId)}
                  prefetch={false}
                >
                  {relationship.hospitalName}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function FamilyAppointments({
  context,
  subject,
}: {
  context: PersonalAppointmentHubPageContext;
  subject: Extract<PersonalAppointmentHubSubject, { kind: "FAMILY" }>;
}): React.JSX.Element {
  const intro = (
    <div className="space-y-2">
      <p className="text-sm leading-6 text-text-muted">
        นัดหมายของ {subjectLabel(subject)} ที่ {subject.hospitalName} แบบอ่านอย่างเดียว ตามสิทธิ์ที่ผู้ป่วยแชร์
      </p>
      <Link
        className="inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
        href={familyHealthSummaryHref(subject.caregiverRelationshipId)}
        prefetch={false}
      >
        ดูสรุปสุขภาพของ {subjectLabel(subject)}
      </Link>
    </div>
  );

  if (context.tab === "history" && subject.contractVersion !== FAMILY_APPOINTMENT_READ_CONTRACT_V2) {
    return (
      <div className="space-y-4">
        {intro}
        <Alert variant="info">ภายใต้ความยินยอมปัจจุบัน ผู้ป่วยแชร์เฉพาะนัดหมายที่จะถึงในช่วง 90 วันข้างหน้า จึงไม่มีประวัติการนัดหมายให้ดู</Alert>
      </div>
    );
  }

  if (context.family === "UNAVAILABLE" || context.family === null) {
    return (
      <div className="space-y-4">
        {intro}
        <Alert role="alert" variant="warning">ไม่สามารถแสดงนัดหมายของสมาชิกนี้ได้ สิทธิ์อาจถูกยกเลิกแล้ว</Alert>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {intro}
      {context.family.appointments.length > 0 ? (
        <ul className="space-y-4">
          {context.family.appointments.map((appointment) => (
            <li key={appointment.appointmentId}>
              <Panel>
                <AppointmentFields appointment={appointment} />
                <Link
                  className="mt-4 inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
                  href={`/app/family/grants/${encodeURIComponent(subject.grantId)}/appointments/${encodeURIComponent(appointment.appointmentId)}`}
                  prefetch={false}
                >
                  ดูรายละเอียดนัดหมาย
                </Link>
              </Panel>
            </li>
          ))}
        </ul>
      ) : (
        <PatientSelfEmptyState title={context.tab === "history" ? "ไม่มีประวัติการนัดหมายในช่วง 90 วันที่ผ่านมา" : "ไม่มีนัดหมายที่เข้าเกณฑ์ในช่วง 90 วันข้างหน้า"} />
      )}
      {context.family.nextCursor ? (
        <div className="flex justify-center">
          <Link
            className={buttonClassName({ variant: "secondary" })}
            href={personalAppointmentHubHref({ subject: subject.key, tab: context.tab, cursor: context.family.nextCursor })}
            prefetch={false}
          >
            ดูนัดหมายถัดไป
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export function PersonalAppointmentHub({ context }: { context: PersonalAppointmentHubPageContext }): React.JSX.Element {
  const selected = context.selected;

  return (
    <div className="max-w-5xl">
      {selected?.kind === "FAMILY" ? <RefreshDelegatedRead /> : null}
      <PageHeader
        actions={selected?.kind === "SELF" ? <Link className={buttonClassName({ variant: "primary" })} href="/app/personal/services" prefetch={false}>ขอรับบริการ</Link> : null}
        breadcrumbs={[{ href: "/app/personal", label: "พื้นที่ส่วนตัว" }, { label: "นัดหมาย" }]}
        description="นัดหมายที่จะถึงและประวัติการนัดหมายของคุณและสมาชิกครอบครัวที่แชร์ให้คุณ"
        title="นัดหมาย"
      />
      <div className="space-y-6 pt-6">
        {selected === null ? (
          <Alert variant="info">
            <p className="font-semibold">ยังไม่มีข้อมูลโรงพยาบาลที่เชื่อมกับข้อมูลผู้ป่วย</p>
            <p className="mt-1">เมื่อมีข้อมูลความสัมพันธ์กับโรงพยาบาล รายการนัดหมายจะปรากฏที่นี่</p>
          </Alert>
        ) : (
          <>
            <SubjectSwitcher context={context} />
            <HubTabs context={context} />
            <section aria-label={tabs.find(({ id }) => id === context.tab)?.label ?? "รายการนัดหมาย"}>
              {selected.kind === "SELF" && context.self ? (
                <SelfAppointments context={context} self={context.self} />
              ) : selected.kind === "FAMILY" ? (
                <FamilyAppointments context={context} subject={selected} />
              ) : null}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
