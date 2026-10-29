import Form from "next/form";
import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { Select } from "@/components/ui/select";
import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";
import { APPOINTMENT_TYPE_LABELS } from "@/modules/appointments/domain/appointment-definitions";
import type { PatientCareNextStep } from "@/modules/care-tracking/domain/care-next-step";
import {
  CARE_SIGNAL_LABELS,
  CARE_SIGNALS,
  CARE_STAGE_LABELS,
  CARE_STAGES,
  ENDED_CARE_STAGES,
  type CareSignal,
  type CareStage,
} from "@/modules/care-tracking/domain/care-stage";
import type {
  CareTrackingItem,
  CareTrackingPage,
  CareTrackingRoundStripEntry,
  CareTrackingScopeOption,
} from "@/modules/care-tracking/services/care-tracking-query-service";
import { PATIENT_DIRECTORY_NAME_MAX_LENGTH } from "@/modules/patient-directory/schemas/patient-directory-schemas";
import type { RoundState } from "@/modules/patient-program-rounds/domain/round-steps";
import { RoundStepTimeline } from "@/modules/patient-program-rounds/presentation/round-step-timeline";

import {
  SERVICES_PATH,
  servicesHref,
  servicesSearchParams,
  toggleValue,
  type ServicesUrlState,
} from "./services-url";

type CareTrackingWorkspaceViewProps = {
  scopes: readonly CareTrackingScopeOption[];
  selectedScope: CareTrackingScopeOption;
  state: ServicesUrlState;
  result: CareTrackingPage | null;
  errorMessage: string | null;
};

const ROUND_STRIP_STATE_LABELS: Readonly<Record<RoundState, string>> = {
  COMPLETED: "จบแล้ว",
  IN_PROGRESS: "กำลังทำ",
  NOT_STARTED: "ยังไม่เริ่ม",
  LOCKED: "ยังเปิดไม่ได้",
};

const ROUND_STRIP_STATE_CLASSES: Readonly<Record<RoundState, string>> = {
  COMPLETED: "border-brand bg-brand text-white",
  IN_PROGRESS: "border-dashed border-brand bg-brand-soft text-brand-strong",
  NOT_STARTED: "border-border-strong bg-surface text-text",
  LOCKED: "border-border bg-surface-muted text-text-subtle",
};

const SIGNAL_VARIANTS: Readonly<Record<CareSignal, StatusVariant>> = {
  overdueAppointment: "danger",
  noUpcomingAppointment: "warning",
  stale: "orange",
};

const dateFormatter = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" });

const linkClassName =
  "inline-flex min-h-11 items-center font-semibold text-brand-strong underline decoration-brand-soft underline-offset-4 hover:text-brand focus-visible:rounded-control focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring";

const pageLinkClassName =
  "inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2";

const pageLinkDisabledClassName =
  "inline-flex min-h-11 items-center justify-center rounded-control border border-border bg-surface-muted px-4 py-2 text-sm font-semibold text-text-subtle";

function formatDate(value: Date): string {
  return dateFormatter.format(value);
}

export type CareNextStepAction = { label: string; href: string };

/** The same destinations as the Patient page's next-step panel; OPEN_PROGRAM opens that panel. */
export function careNextStepAction(relationshipId: string, nextStep: PatientCareNextStep): CareNextStepAction | null {
  const patientPath = `/app/patients/${encodeURIComponent(relationshipId)}`;
  const programPath = "programId" in nextStep
    ? `${patientPath}/programs/${encodeURIComponent(nextStep.programId)}`
    : patientPath;

  switch (nextStep.type) {
    case "NONE":
      return null;
    case "BASELINE":
      return { label: "บันทึก Baseline", href: `${patientPath}/baseline` };
    case "OPEN_PROGRAM":
      return { label: "เปิดโปรแกรม", href: `${patientPath}#patient-next-step-heading` };
    case "ROUND":
      return {
        label: `${nextStep.state === "IN_PROGRESS" ? "ทำต่อ" : "เริ่ม"}ครั้งที่ ${nextStep.roundNumber}`,
        href: `${programPath}/rounds/${nextStep.roundNumber}`,
      };
    case "AFTER":
      return { label: "บันทึกการประเมินสุดท้าย", href: `${programPath}#program-final` };
    case "PROGRAM":
      return { label: "ดูภาพรวมบริการ", href: programPath };
    case "ROUNDS_OVERVIEW":
      return { label: "ดูภาพรวมบริการ", href: `${programPath}/rounds` };
  }
}

function noActionLabel(nextStep: Extract<PatientCareNextStep, { type: "NONE" }>): string {
  switch (nextStep.reason) {
    case "READ_ONLY":
      return "ดูข้อมูลได้อย่างเดียว";
    case "PROGRAM_NOT_MANAGEABLE":
      return "ไม่มีสิทธิ์จัดการรอบบริการ";
    case "NO_ACTION":
      return "ไม่มีขั้นตอนที่ต้องทำต่อ";
  }
}

function SignalIcon({ signal }: { signal: CareSignal }): React.JSX.Element {
  return (
    <svg aria-hidden="true" className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      {signal === "overdueAppointment" ? (
        <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.5 2.5" /></>
      ) : signal === "noUpcomingAppointment" ? (
        <><rect height="15" rx="2" width="16" x="4" y="5" /><path d="M4 10h16M9 14l4 4M13 14l-4 4" /></>
      ) : (
        <><path d="M4 12h3l2-5 4 10 2-5h5" /></>
      )}
    </svg>
  );
}

function SignalBadges({ item }: { item: CareTrackingItem }): React.JSX.Element | null {
  const active = CARE_SIGNALS.filter((signal) => item.signals[signal]);
  if (active.length === 0) return null;

  return (
    <ul aria-label="สิ่งที่ต้องติดตาม" className="flex flex-wrap gap-2">
      {active.map((signal) => (
        <li key={signal}>
          <StatusBadge className="gap-1" variant={SIGNAL_VARIANTS[signal]}>
            <SignalIcon signal={signal} />
            {CARE_SIGNAL_LABELS[signal]}
          </StatusBadge>
        </li>
      ))}
    </ul>
  );
}

function RoundStrip({ entries }: { entries: readonly CareTrackingRoundStripEntry[] }): React.JSX.Element | null {
  if (entries.length === 0) return null;

  return (
    <ol aria-label="ความคืบหน้าแต่ละครั้ง" className="flex flex-wrap gap-1.5">
      {entries.map(({ roundNumber, state }) => (
        <li key={roundNumber}>
          <span
            aria-hidden="true"
            className={`flex size-7 items-center justify-center rounded-full border text-xs font-semibold ${ROUND_STRIP_STATE_CLASSES[state]}`}
            title={`ครั้งที่ ${roundNumber} ${ROUND_STRIP_STATE_LABELS[state]}`}
          >
            {roundNumber}
          </span>
          <span className="sr-only">ครั้งที่ {roundNumber} {ROUND_STRIP_STATE_LABELS[state]}</span>
        </li>
      ))}
    </ol>
  );
}

function FilterChip({
  label,
  count,
  pressed,
  target,
}: {
  label: string;
  count?: number;
  pressed: boolean;
  target: ServicesUrlState;
}): React.JSX.Element {
  return (
    <li className="shrink-0">
      <Form action={SERVICES_PATH}>
        {[...servicesSearchParams(target)].map(([name, value], index) => (
          <input key={`${name}-${value}-${index}`} name={name} type="hidden" value={value} />
        ))}
        <button
          aria-pressed={pressed}
          className={`inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2 ${
            pressed
              ? "border-action-primary bg-brand-soft text-brand-strong"
              : "border-border-strong bg-surface text-text hover:border-action-primary hover:text-brand-strong"
          }`}
          type="submit"
        >
          {label}
          {count === undefined ? null : (
            <span className="rounded-full bg-surface-muted px-2 text-xs text-text-muted">{count}</span>
          )}
        </button>
      </Form>
    </li>
  );
}

function FilterChips({ state, result }: { state: ServicesUrlState; result: CareTrackingPage }): React.JSX.Element {
  const firstPage = { ...state, page: 1 };
  const stages: readonly CareStage[] = state.includeEnded
    ? CARE_STAGES
    : CARE_STAGES.filter((stage) => !ENDED_CARE_STAGES.has(stage));

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-text-muted" id="services-stage-filter">สถานะการดูแล</h3>
        <ul aria-labelledby="services-stage-filter" className="mt-2 flex gap-2 overflow-x-auto pb-1 lg:flex-wrap">
          <FilterChip
            count={result.summary.total}
            label="ทั้งหมด"
            pressed={state.stages.length === 0}
            target={{ ...firstPage, stages: [] }}
          />
          {stages.map((stage) => (
            <FilterChip
              count={result.summary.stages[stage]}
              key={stage}
              label={CARE_STAGE_LABELS[stage]}
              pressed={state.stages.includes(stage)}
              target={{ ...firstPage, stages: toggleValue(CARE_STAGES, state.stages, stage) }}
            />
          ))}
        </ul>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-text-muted" id="services-signal-filter">สิ่งที่ต้องติดตาม</h3>
        <ul aria-labelledby="services-signal-filter" className="mt-2 flex gap-2 overflow-x-auto pb-1 lg:flex-wrap">
          {CARE_SIGNALS.map((signal) => (
            <FilterChip
              count={result.summary.signals[signal]}
              key={signal}
              label={CARE_SIGNAL_LABELS[signal]}
              pressed={state.signals.includes(signal)}
              target={{ ...firstPage, signals: toggleValue(CARE_SIGNALS, state.signals, signal) }}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

function CareTrackingRow({ item }: { item: CareTrackingItem }): React.JSX.Element {
  const patientPath = `/app/patients/${encodeURIComponent(item.relationshipId)}`;
  const action = careNextStepAction(item.relationshipId, item.nextStep);

  return (
    <li className="grid gap-4 px-5 py-5 sm:px-7 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,11rem)] lg:gap-6">
      <div className="min-w-0">
        <h3 className="break-words text-lg font-semibold text-text">{item.displayName}</h3>
        <p className="mt-1 text-sm text-text-muted">HN {item.hospitalNumber ?? "ไม่ระบุ"}</p>
        {item.assignedOsmDisplayName ? (
          <p className="mt-1 break-words text-sm text-text-muted">อสม. {item.assignedOsmDisplayName}</p>
        ) : null}
      </div>

      <div className="min-w-0 space-y-2">
        <p className="text-xs text-text-muted lg:sr-only">สถานะการดูแล</p>
        <StatusBadge variant={ENDED_CARE_STAGES.has(item.stage) ? "neutral" : "info"}>{item.stageLabel}</StatusBadge>
        <SignalBadges item={item} />
      </div>

      <div className="min-w-0 space-y-2">
        <p className="text-xs text-text-muted lg:sr-only">ความคืบหน้า</p>
        {item.currentRound ? (
          <p className="text-sm font-semibold text-text">
            ครั้งที่ {item.currentRound.roundNumber} · ทำแล้ว {item.currentRound.doneItems}/{item.currentRound.plannedItems} รายการ
          </p>
        ) : item.roundStrip.length === 0 ? (
          <p className="text-sm text-text-muted">ยังไม่มีครั้งบริการ</p>
        ) : null}
        <RoundStrip entries={item.roundStrip} />
      </div>

      <dl className="min-w-0 space-y-2 text-sm">
        <div>
          <dt className="text-xs text-text-muted">ความเคลื่อนไหวล่าสุด</dt>
          <dd className="text-text">{item.lastActivityAt ? formatDate(item.lastActivityAt) : "ยังไม่มีการบันทึก"}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted">นัดถัดไป</dt>
          <dd className="text-text">
            {item.nextAppointment
              ? `${formatDate(item.nextAppointment.scheduledAt)} · ${APPOINTMENT_TYPE_LABELS[item.nextAppointment.type]}`
              : "ยังไม่มีนัด"}
          </dd>
        </div>
      </dl>

      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 lg:flex-col lg:items-stretch">
        {action ? (
          <Link
            aria-label={`${action.label} สำหรับ${item.displayName}`}
            className={buttonClassName({ size: "compact", variant: "primary" })}
            href={action.href}
            prefetch={false}
          >
            {action.label}
          </Link>
        ) : item.nextStep.type === "NONE" ? (
          <p className="text-sm text-text-muted">{noActionLabel(item.nextStep)}</p>
        ) : null}
        <Link aria-label={`ข้อมูลผู้ป่วย ${item.displayName}`} className={linkClassName} href={patientPath} prefetch={false}>
          ข้อมูลผู้ป่วย
        </Link>
      </div>

      {item.currentRound && item.currentRound.steps.length > 0 ? (
        <details className="group min-w-0 rounded-control border border-border bg-surface-muted/40 lg:col-span-full">
          <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-semibold text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring">
            ดูขั้นตอน
            <span className="sr-only"> ครั้งที่ {item.currentRound.roundNumber} ของ{item.displayName}</span>
          </summary>
          <div className="px-2 pb-3">
            <RoundStepTimeline
              completion={null}
              locked={false}
              roundNumber={item.currentRound.roundNumber}
              steps={item.currentRound.steps}
            />
          </div>
        </details>
      ) : null}
    </li>
  );
}

function CareTrackingPagination({ state, result }: { state: ServicesUrlState; result: CareTrackingPage }): React.JSX.Element | null {
  if (result.totalPages <= 1) return null;

  return (
    <nav
      aria-label="หน้ารายการจัดบริการ"
      className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-sm text-text-muted">หน้า {result.page} จาก {result.totalPages}</p>
      <div className="flex gap-3">
        {result.page > 1 ? (
          <Link className={pageLinkClassName} href={servicesHref({ ...state, page: result.page - 1 })}>ก่อนหน้า</Link>
        ) : (
          <span className={pageLinkDisabledClassName}>ก่อนหน้า</span>
        )}
        {result.page < result.totalPages ? (
          <Link className={pageLinkClassName} href={servicesHref({ ...state, page: result.page + 1 })}>ถัดไป</Link>
        ) : (
          <span className={pageLinkDisabledClassName}>ถัดไป</span>
        )}
      </div>
    </nav>
  );
}

function hasFilters(state: ServicesUrlState): boolean {
  return state.stages.length > 0 || state.signals.length > 0 || state.search !== "" || state.includeEnded;
}

function EmptyState({ state, result }: { state: ServicesUrlState; result: CareTrackingPage }): React.JSX.Element {
  const noPatientsInScope = result.summary.total === 0 && !hasFilters(state);
  const clearHref = servicesHref({ hospitalId: state.hospitalId, stages: [], signals: [], search: "", includeEnded: false, page: 1 });

  return (
    <div className="mt-4 rounded-panel border border-dashed border-border bg-surface px-5 py-8 text-center sm:px-7">
      {noPatientsInScope ? (
        <>
          <p className="font-semibold text-text">ยังไม่มีผู้ป่วยที่ต้องจัดบริการในโรงพยาบาลนี้</p>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            ผู้ป่วยที่จบโปรแกรมหรือสิ้นสุดการดูแลแล้วจะแสดงเมื่อเลือก &ldquo;แสดงผู้ป่วยที่จบโปรแกรม/สิ้นสุดการดูแล&rdquo;
          </p>
        </>
      ) : (
        <>
          <p className="font-semibold text-text">ไม่พบผู้ป่วยตามตัวกรองที่เลือก</p>
          <p className="mt-2 text-sm leading-6 text-text-muted">ลองเปลี่ยนคำค้นหาหรือสถานะที่เลือก</p>
          <Link className={`${linkClassName} mt-3`} href={clearHref}>ล้างตัวกรอง</Link>
        </>
      )}
    </div>
  );
}

export function CareTrackingWorkspaceView({
  scopes,
  selectedScope,
  state,
  result,
  errorMessage,
}: CareTrackingWorkspaceViewProps): React.JSX.Element {
  return (
    <div className="content-workspace">
      <PageHeader
        breadcrumbs={[
          { label: "งานโรงพยาบาล", href: `/app?hospitalId=${encodeURIComponent(selectedScope.hospitalId)}` },
          { label: "จัดบริการ" },
        ]}
        description="ติดตามความคืบหน้าและเริ่มขั้นตอนถัดไปของผู้ป่วยแต่ละคน"
        title="จัดบริการ"
      />

      <div className="space-y-6 pt-8">
        <Panel>
          <p className="text-sm font-semibold text-text-muted">โรงพยาบาลที่ดำเนินการ</p>
          {scopes.length > 1 ? (
            <Form action={SERVICES_PATH} className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="block min-w-0 flex-1 space-y-2 text-sm font-semibold sm:max-w-md">
                <span className="sr-only">เลือกโรงพยาบาล</span>
                <Select defaultValue={selectedScope.hospitalId} key={selectedScope.hospitalId} name="hospitalId">
                  {scopes.map((scope) => (
                    <option key={scope.hospitalId} value={scope.hospitalId}>{scope.hospitalName}</option>
                  ))}
                </Select>
              </label>
              <PendingSubmitButton pendingLabel="กำลังเปลี่ยนโรงพยาบาล..." size="compact" variant="secondary">
                เลือกโรงพยาบาล
              </PendingSubmitButton>
            </Form>
          ) : (
            <p className="mt-2 text-lg font-semibold text-brand-strong">{selectedScope.hospitalName}</p>
          )}
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em]">ค้นหาผู้ป่วย</h2>
          <Form action={SERVICES_PATH} className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <input name="hospitalId" type="hidden" value={state.hospitalId} />
            {state.stages.map((stage) => <input key={stage} name="stage" type="hidden" value={stage} />)}
            {state.signals.map((signal) => <input key={signal} name="signal" type="hidden" value={signal} />)}
            <label className="block space-y-2 text-sm font-semibold">
              <span>ชื่อผู้ป่วยหรือ HN</span>
              <Input
                defaultValue={state.search}
                key={state.search}
                maxLength={PATIENT_DIRECTORY_NAME_MAX_LENGTH}
                name="search"
                placeholder="เช่น สมชาย หรือ HN-001"
                type="search"
              />
            </label>
            <PendingSubmitButton pendingLabel="กำลังค้นหา...">ค้นหา</PendingSubmitButton>
            <label className="flex min-h-11 items-center gap-3 text-sm text-text lg:col-span-full">
              <input
                className="size-5 shrink-0 accent-action-primary"
                defaultChecked={state.includeEnded}
                key={String(state.includeEnded)}
                name="includeEnded"
                type="checkbox"
                value="1"
              />
              แสดงผู้ป่วยที่จบโปรแกรม/สิ้นสุดการดูแล
            </label>
          </Form>
          <p className="mt-2 text-xs leading-5 text-text-subtle">
            พิมพ์ชื่อบางส่วนได้ ส่วน HN ต้องตรงกับข้อมูลในโรงพยาบาลที่เลือก เปลี่ยนตัวเลือกแล้วกดค้นหาเพื่อใช้ตัวกรอง
          </p>
          {errorMessage ? (
            <Alert className="mt-5" variant="danger">
              <p className="font-semibold">ไม่สามารถค้นหาได้</p>
              <p className="mt-1">{errorMessage}</p>
            </Alert>
          ) : null}
        </Panel>

        {result ? (
          <section aria-labelledby="services-results-heading" aria-live="polite" className="space-y-5">
            <FilterChips result={result} state={state} />
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-xl font-semibold tracking-[-0.02em]" id="services-results-heading">ผู้ป่วยที่ติดตาม</h2>
              <p className="text-sm text-text-muted">พบ {result.total} คน จากทั้งหมด {result.summary.total} คน</p>
            </div>

            {result.items.length > 0 ? (
              <>
                <div className="overflow-hidden rounded-panel border border-border bg-surface">
                  <div
                    aria-hidden="true"
                    className="hidden gap-6 border-b border-border bg-surface-muted px-7 py-3 text-xs font-semibold text-text-muted lg:grid lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,11rem)]"
                  >
                    <span>ผู้ป่วย</span>
                    <span>สถานะการดูแล</span>
                    <span>ความคืบหน้า</span>
                    <span>วันที่</span>
                    <span>ขั้นตอนถัดไป</span>
                  </div>
                  <ul aria-label="รายชื่อผู้ป่วยสำหรับจัดบริการ" className="divide-y divide-border">
                    {result.items.map((item) => <CareTrackingRow item={item} key={item.relationshipId} />)}
                  </ul>
                </div>
                <CareTrackingPagination result={result} state={state} />
              </>
            ) : (
              <EmptyState result={result} state={state} />
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}
