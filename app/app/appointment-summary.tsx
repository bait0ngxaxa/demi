import Link from "next/link";

import { Panel } from "@/components/ui/panel";
import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";
import type { AppointmentContactPhones } from "@/modules/appointments/domain/appointment-contact-phones";
import {
  APPOINTMENT_STATUS_LABELS,
  type AppointmentStatusValue,
} from "@/modules/appointments/domain/appointment-definitions";

import { AppointmentContactPhoneEntries } from "./appointment-contact-phones";

/*
 * PATIENT-APPT-DISTILL: the read-only appointment summary and list row that the Patient and the
 * family (caregiver) screens share. Both take plain values, never a domain record, so a caller's
 * projection decides what exists: a value that is absent is simply not rendered (no placeholder).
 */

const BANGKOK = "Asia/Bangkok";

/** "วันพุธที่ 19 พฤศจิกายน พ.ศ. 2569" in Thailand time. */
export function formatAppointmentDateLine(value: Date): string {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "full", timeZone: BANGKOK }).format(value);
}

/** "เวลา 09:30 น." in Thailand time. */
export function formatAppointmentTimeLine(value: Date): string {
  const time = new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: BANGKOK,
  }).format(value);
  return `เวลา ${time} น.`;
}

/** Compact date and time for list rows and request history. */
export function formatAppointmentDateTime(value: Date): string {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: BANGKOK }).format(value);
}

/**
 * SCHEDULED reads as information, not as a warning: on the Patient list the only warning cue is the
 * "รอคุณรับทราบ" chip, which is the one state that asks the Patient to act.
 */
export function appointmentStatusVariant(status: AppointmentStatusValue): StatusVariant {
  if (status === "COMPLETED") return "success";
  if (status === "CANCELLED") return "danger";
  if (status === "NO_SHOW") return "neutral";
  return "info";
}

export function AppointmentStatusBadge({ status }: { status: AppointmentStatusValue }): React.JSX.Element {
  return <StatusBadge variant={appointmentStatusVariant(status)}>{APPOINTMENT_STATUS_LABELS[status]}</StatusBadge>;
}

export type AppointmentSummaryValues = {
  scheduledAt: Date;
  /** The rendered service line (type, service and source as the caller's projection allows). */
  service: React.ReactNode;
  locationLabel: string | null;
  locationDetail: string | null;
  hospitalName: string;
  parentHospitalName: string | null;
  durationMinutes: number | null;
  responsible: { heading: string; displayName: string } | null;
  contactPhones: AppointmentContactPhones | null;
};

function SummaryEntry({ label, children, wide = false }: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}): React.JSX.Element {
  return (
    <div className={wide ? "min-w-0 sm:col-span-2" : "min-w-0"}>
      <dt className="text-sm text-text-muted">{label}</dt>
      <dd className="mt-1 break-words font-semibold text-text">{children}</dd>
    </div>
  );
}

/** What, when and where: one panel, only the fields that have a value. `notice` is one info line. */
export function AppointmentSummary({ values, notice }: {
  values: AppointmentSummaryValues;
  notice?: React.ReactNode;
}): React.JSX.Element {
  const hasPlace = values.locationLabel !== null || values.locationDetail !== null;

  return (
    <Panel>
      <p className="text-xl font-semibold leading-8 tracking-[-0.01em] text-text">
        <time dateTime={values.scheduledAt.toISOString()}>{formatAppointmentDateLine(values.scheduledAt)}</time>
      </p>
      <p className="mt-1 text-lg font-semibold text-text">{formatAppointmentTimeLine(values.scheduledAt)}</p>
      <div className="mt-3 break-words text-text">{values.service}</div>

      <dl className="mt-5 grid min-w-0 gap-x-8 gap-y-4 border-t border-border pt-5 sm:grid-cols-2">
        {hasPlace ? (
          <SummaryEntry label="สถานที่" wide>
            {values.locationLabel ? <span className="block">{values.locationLabel}</span> : null}
            {values.locationDetail ? (
              <span className={`block whitespace-pre-wrap leading-6 ${values.locationLabel ? "mt-1 font-normal text-text-muted" : ""}`}>
                {values.locationDetail}
              </span>
            ) : null}
          </SummaryEntry>
        ) : null}
        <SummaryEntry label="โรงพยาบาล">
          {values.parentHospitalName ? `${values.hospitalName} · ${values.parentHospitalName}` : values.hospitalName}
        </SummaryEntry>
        {values.durationMinutes !== null ? (
          <SummaryEntry label="ระยะเวลา">ใช้เวลาประมาณ {values.durationMinutes} นาที</SummaryEntry>
        ) : null}
        {values.responsible ? (
          <SummaryEntry label={values.responsible.heading}>{values.responsible.displayName}</SummaryEntry>
        ) : null}
        {values.contactPhones ? (
          <AppointmentContactPhoneEntries contactPhones={values.contactPhones} omitMissing showPatientPhone={false} />
        ) : null}
      </dl>

      {notice ? (
        <p className="mt-5 border-t border-border pt-4 text-sm leading-6 text-text-muted" role="note">{notice}</p>
      ) : null}
    </Panel>
  );
}

export type AppointmentRowChip = { label: string; variant: StatusVariant };

function Chevron(): React.JSX.Element {
  return (
    <svg aria-hidden="true" className="size-5 shrink-0 text-text-subtle group-hover:text-brand-strong" fill="none" viewBox="0 0 20 20">
      <path d="m7.5 4.5 5.5 5.5-5.5 5.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" />
    </svg>
  );
}

/** One appointment as a single link: when, what · where, status and at most one state chip. */
export function AppointmentListRow({ href, scheduledAt, hospitalName, service, place, status, chip }: {
  href: string;
  scheduledAt: Date;
  /** Shown only when the list spans several Hospitals. */
  hospitalName?: string;
  service: string;
  place: string | null;
  status: AppointmentStatusValue;
  chip?: AppointmentRowChip | null;
}): React.JSX.Element {
  return (
    <li>
      <Link
        className="group flex min-h-11 min-w-0 items-center gap-3 px-5 py-4 transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-focus-ring sm:px-7"
        href={href}
        prefetch={false}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <p className="break-words font-semibold text-text group-hover:text-brand-strong">
              <time dateTime={scheduledAt.toISOString()}>{formatAppointmentDateTime(scheduledAt)}</time>
            </p>
            {hospitalName ? <p className="mt-1 break-words text-sm font-semibold leading-6 text-text">{hospitalName}</p> : null}
            <p className="mt-1 break-words text-sm leading-6 text-text-muted">{place ? `${service} · ${place}` : service}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-end">
            <AppointmentStatusBadge status={status} />
            {chip ? <StatusBadge variant={chip.variant}>{chip.label}</StatusBadge> : null}
          </div>
        </div>
        <Chevron />
      </Link>
    </li>
  );
}
