import { AppointmentServiceSource, OneOffVisitNote } from "../appointment-service-source";
import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { Button, buttonClassName } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";
import {
  APPOINTMENT_LOCATION_LABELS,
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_TYPE_LABELS,
  appointmentResponsiblePresentation,
  type AppointmentStatusValue,
} from "@/modules/appointments/domain/appointment-definitions";
import type {
  WorkAppointmentPage,
  WorkAppointmentListItem,
} from "@/modules/appointments/services/work-appointment-query-service";
import type { WorkAppointmentTab } from "@/modules/appointments/schemas/work-appointment-schemas";

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(value);
}

function statusVariant(status: AppointmentStatusValue): StatusVariant {
  if (status === "COMPLETED") return "success";
  if (status === "CANCELLED") return "danger";
  if (status === "NO_SHOW") return "neutral";
  return "warning";
}

function buildHref(
  page: WorkAppointmentPage,
  tab: WorkAppointmentTab,
  overrides: { cursor?: string } = {},
): string {
  const params = new URLSearchParams({ hospitalId: page.hospital.hospitalId, tab });
  const { filters } = page;
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.status) params.set("status", filters.status);
  if (filters.type) params.set("type", filters.type);
  if (filters.locationType) params.set("locationType", filters.locationType);
  if (filters.responsibleUserId) params.set("responsibleUserId", filters.responsibleUserId);
  if (filters.awaitingOsmAcceptance) params.set("awaitingOsmAcceptance", filters.awaitingOsmAcceptance);
  if (filters.unassignedOsm) params.set("unassignedOsm", filters.unassignedOsm);
  if (overrides.cursor) params.set("cursor", overrides.cursor);
  return `/app/appointments?${params.toString()}`;
}

function AppointmentRow({ item }: { item: WorkAppointmentListItem }): React.JSX.Element {
  const responsible = appointmentResponsiblePresentation(
    item.responsibleDisplayName,
    item.responsibleProfession,
  );
  return (
    <li>
      <Link
        className="group block min-h-11 px-5 py-5 transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-focus-ring sm:px-7"
        href={`/app/patients/${encodeURIComponent(item.relationshipId)}/appointments/${encodeURIComponent(item.appointmentId)}`}
        prefetch={false}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-base font-semibold text-text group-hover:text-brand-strong">
              {item.patientDisplayName}
            </p>
            <p className="mt-1 text-sm leading-6 text-text-muted">{item.hospitalName}</p>
            <p className="mt-2 text-sm font-semibold text-text">{formatDate(item.scheduledAt)}</p>
            <p className="mt-1 text-sm leading-6 text-text-muted">
              <AppointmentServiceSource type={item.type} serviceCode={item.serviceCode} source={item.source} /> · {item.locationType ? APPOINTMENT_LOCATION_LABELS[item.locationType] : "ไม่ระบุสถานที่"}
              {item.durationMinutes ? ` · ${item.durationMinutes} นาที` : ""}
            </p>
            <OneOffVisitNote visible={item.isOneOffVisit} />
            <p className="mt-1 break-words text-sm leading-6 text-text-muted">
              {responsible.heading}: {responsible.displayName}
            </p>
            <p className="mt-1 break-words text-sm leading-6 text-text-muted">
              OSM ณ เวลาสร้างนัด: {item.osmAtCreationDisplayName ?? "ไม่มีข้อมูล"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge variant={statusVariant(item.status)}>{APPOINTMENT_STATUS_LABELS[item.status]}</StatusBadge>
            {item.pendingRequestBadges.reschedule ? <StatusBadge variant="warning">{item.pendingRequestBadges.staleReschedule ? "คำขอก่อนแก้ไขนัด" : "รอเลื่อนนัด"}</StatusBadge> : null}
            {item.pendingRequestBadges.cancellation ? <StatusBadge variant="warning">รอยกเลิก</StatusBadge> : null}
            {item.hasUnassignedOsm ? <StatusBadge variant="warning">ไม่มี อสม. รับผิดชอบ</StatusBadge> : null}
            {item.osmAcceptanceStatus === "WAITING" ? <StatusBadge variant="warning">รอ อสม. ตอบรับ</StatusBadge> : null}
            {item.osmAcceptanceStatus === "RESCHEDULE_REQUESTED" ? <StatusBadge variant="warning">อสม. ขอเลื่อนนัด</StatusBadge> : null}
            {item.osmAcceptanceStatus === "ACCEPTED" ? <StatusBadge variant="success">อสม. ตอบรับแล้ว</StatusBadge> : null}
          </div>
        </div>
        <p className="mt-4 border-t border-border pt-3 text-sm font-semibold text-brand-strong">
          เปิดรายละเอียดนัดหมาย
        </p>
      </Link>
    </li>
  );
}

const tabs: readonly { id: WorkAppointmentTab; label: string }[] = [
  { id: "UPCOMING", label: "นัดหมาย" },
  { id: "HISTORY", label: "ประวัติการนัดหมาย" },
  { id: "PENDING_REQUESTS", label: "คำขอที่รอดำเนินการ" },
  { id: "AWAITING_MY_ACCEPTANCE", label: "รอฉันตอบรับ" },
];

export function WorkAppointmentView({
  page,
  queryError,
}: {
  page: WorkAppointmentPage;
  queryError: string | null;
}): React.JSX.Element {
  const visibleTabs = tabs.filter(({ id }) =>
    id === "PENDING_REQUESTS" ? page.canResolveRequests
      : id === "AWAITING_MY_ACCEPTANCE" ? page.canAcceptAssignments
        : true,
  );
  const emptyCopy = page.tab === "PENDING_REQUESTS"
    ? "ไม่มีคำขอเลื่อนหรือยกเลิกนัดหมายที่รอดำเนินการ"
    : page.tab === "AWAITING_MY_ACCEPTANCE"
      ? "ไม่มีนัดหมายที่รอคุณตอบรับ"
      : page.tab === "HISTORY"
      ? "ยังไม่มีประวัติการนัดหมายตามตัวกรองนี้"
      : "ยังไม่มีนัดหมายที่กำลังจะมาถึงตามตัวกรองนี้";

  return (
    <div className="content-workspace space-y-6">
      <PageHeader
        actions={page.canCreate ? (
          <Link className={buttonClassName()} href={`/app/appointments/new?hospitalId=${encodeURIComponent(page.hospital.hospitalId)}`} prefetch={false}>
            สร้างนัด
          </Link>
        ) : null}
        breadcrumbs={[{ label: "รายการนัดหมาย" }]}
        description="ดูนัดหมายที่อ่านได้ในโรงพยาบาลที่เลือก และตรวจคำขอที่รอดำเนินการตามสิทธิ์"
        title="รายการนัดหมาย"
      />

      {queryError ? <Alert role="alert" variant="warning">{queryError}</Alert> : null}

      <Panel>
        <form action="/app/appointments" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" method="get">
          <input name="tab" type="hidden" value={page.tab} />
          <label className="block space-y-2 text-sm font-semibold text-text">
            โรงพยาบาล
            <Select defaultValue={page.hospital.hospitalId} name="hospitalId">
              {page.hospitals.map((hospital) => (
                <option key={hospital.hospitalId} value={hospital.hospitalId}>{hospital.hospitalName}</option>
              ))}
            </Select>
          </label>
          <label className="block space-y-2 text-sm font-semibold text-text">
            วันที่นัดตั้งแต่
            <input className="min-h-12 w-full rounded-control border border-border bg-surface px-4 text-base text-text focus:border-action-primary focus:ring-4 focus:ring-focus-ring" defaultValue={page.filters.dateFrom ?? ""} name="dateFrom" type="date" />
          </label>
          <label className="block space-y-2 text-sm font-semibold text-text">
            ถึงวันที่
            <input className="min-h-12 w-full rounded-control border border-border bg-surface px-4 text-base text-text focus:border-action-primary focus:ring-4 focus:ring-focus-ring" defaultValue={page.filters.dateTo ?? ""} name="dateTo" type="date" />
          </label>
          <label className="block space-y-2 text-sm font-semibold text-text">
            สถานะ
            <Select defaultValue={page.filters.status ?? ""} name="status">
              <option value="">ทุกสถานะ</option>
              {Object.entries(APPOINTMENT_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </label>
          <label className="block space-y-2 text-sm font-semibold text-text">
            ประเภทนัด
            <Select defaultValue={page.filters.type ?? ""} name="type">
              <option value="">ทุกประเภท</option>
              {Object.entries(APPOINTMENT_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </label>
          <label className="block space-y-2 text-sm font-semibold text-text">
            สถานที่
            <Select defaultValue={page.filters.locationType ?? ""} name="locationType">
              <option value="">ทุกสถานที่</option>
              {Object.entries(APPOINTMENT_LOCATION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </label>
          <label className="block space-y-2 text-sm font-semibold text-text">
            ผู้รับผิดชอบ
            <Select defaultValue={page.filters.responsibleUserId ?? ""} name="responsibleUserId">
              <option value="">ทุกคน</option>
              {page.responsibleOptions.map((person) => <option key={person.userId} value={person.userId}>{person.displayName}</option>)}
            </Select>
          </label>
          {page.canResolveRequests && page.tab === "UPCOMING" ? (
            <>
              <label className="block space-y-2 text-sm font-semibold text-text">
                การตอบรับของ อสม.
                <Select defaultValue={page.filters.awaitingOsmAcceptance ?? ""} name="awaitingOsmAcceptance">
                  <option value="">ทุกนัดหมาย</option>
                  <option value="true">รอ อสม. ตอบรับ</option>
                </Select>
              </label>
              <label className="block space-y-2 text-sm font-semibold text-text">
                การมอบหมาย อสม.
                <Select defaultValue={page.filters.unassignedOsm ?? ""} name="unassignedOsm">
                  <option value="">ทุกนัดหมาย</option>
                  <option value="true">ไม่มี อสม. รับผิดชอบ</option>
                </Select>
              </label>
            </>
          ) : null}
          <div className="flex flex-wrap items-end gap-3">
            <Button type="submit">ค้นหา</Button>
            <Link className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-brand-strong underline" href={buildHref(page, page.tab)}>ล้างตัวกรอง</Link>
          </div>
        </form>
      </Panel>

      <nav aria-label="ส่วนของรายการนัดหมาย" className="overflow-x-auto border-b border-border">
        <ul className="flex min-w-max gap-2">
          {visibleTabs.map(({ id, label }) => (
            <li key={id}>
              <Link
                aria-current={page.tab === id ? "page" : undefined}
                className={`inline-flex min-h-12 items-center border-b-2 px-4 text-sm font-semibold ${page.tab === id ? "border-action-primary text-brand-strong" : "border-transparent text-text-muted hover:text-text"}`}
                href={buildHref(page, id)}
                prefetch={false}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <section aria-label={visibleTabs.find(({ id }) => id === page.tab)?.label ?? "รายการนัดหมาย"}>
        {page.items.length > 0 ? (
          <ul className="divide-y divide-border overflow-hidden rounded-panel border border-border bg-surface">
            {page.items.map((item) => <AppointmentRow item={item} key={item.appointmentId} />)}
          </ul>
        ) : (
          <div className="rounded-panel border border-dashed border-border bg-surface px-5 py-9 text-center sm:px-7">
            <p className="font-semibold text-text">{emptyCopy}</p>
            <p className="mt-2 text-sm leading-6 text-text-muted">ลองปรับตัวกรอง หรือเลือกโรงพยาบาลที่ต้องการดู</p>
          </div>
        )}
      </section>

      {page.hasNextPage && page.nextCursor ? (
        <div className="flex justify-center">
          <Link className={buttonClassName({ variant: "secondary" })} href={buildHref(page, page.tab, { cursor: page.nextCursor })} prefetch={false}>
            ดูรายการถัดไป
          </Link>
        </div>
      ) : null}
    </div>
  );
}
