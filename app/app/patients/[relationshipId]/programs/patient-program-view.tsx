import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { Panel } from "@/components/ui/panel";
import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";
import {
  buildPatientRoundPath,
  formatRoundDate,
} from "@/modules/patient-program-rounds/presentation/round-labels";
import type { ProgramRoundsOverview, RoundSummary } from "@/modules/patient-program-rounds/services/round-query-service";
import type {
  PatientProgramPageContext,
  PatientProgramProjection,
} from "@/modules/patient-program/services/patient-program-query-service";
import type { PatientBaselineNavigationState } from "@/modules/patient-baseline/services/patient-baseline-query-service";

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "long",
    timeZone: "Asia/Bangkok",
  }).format(value);
}

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(value);
}

function statusLabel(status: PatientProgramProjection["status"]): string {
  return status === "ACTIVE" ? "กำลังดำเนินการ" : "เสร็จสิ้นแล้ว";
}

function statusVariant(status: PatientProgramProjection["status"]): StatusVariant {
  return status === "ACTIVE" ? "success" : "neutral";
}

function roundStateLabel(state: RoundSummary["state"]): string {
  switch (state) {
    case "COMPLETED":
      return "เสร็จแล้ว";
    case "IN_PROGRESS":
      return "กำลังทำ";
    case "NOT_STARTED":
      return "ยังไม่เริ่ม";
    case "LOCKED":
      return "รอครั้งก่อน";
  }
}

function roundStateVariant(state: RoundSummary["state"]): StatusVariant {
  switch (state) {
    case "COMPLETED":
      return "success";
    case "IN_PROGRESS":
      return "info";
    case "NOT_STARTED":
    case "LOCKED":
      return "neutral";
  }
}

function roundAriaLabel(round: RoundSummary): string {
  return `ครั้งที่ ${round.roundNumber}: ${roundStateLabel(round.state)}`;
}

function RoundStep({
  currentRoundNumber,
  programId,
  relationshipId,
  round,
}: {
  currentRoundNumber: number | null;
  programId: string;
  relationshipId: string;
  round: RoundSummary;
}): React.JSX.Element {
  const canOpen = round.state === "COMPLETED" || (
    round.roundNumber === currentRoundNumber && round.state !== "LOCKED"
  );
  const content = (
    <span className="block min-w-24 space-y-2">
      <span className="block text-sm font-semibold text-text">ครั้งที่ {round.roundNumber}</span>
      <StatusBadge variant={roundStateVariant(round.state)}>{roundStateLabel(round.state)}</StatusBadge>
      {round.state === "LOCKED" ? (
        <span className="block text-xs leading-5 text-text-muted">จบครั้งก่อนหน้าเพื่อเปิดครั้งนี้</span>
      ) : null}
    </span>
  );

  return (
    <li>
      {canOpen ? (
        <Link
          aria-label={roundAriaLabel(round)}
          className="block min-h-24 rounded-control border border-border bg-surface p-3 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring hover:border-action-primary"
          href={buildPatientRoundPath(relationshipId, programId, round.roundNumber)}
          prefetch={false}
        >
          {content}
        </Link>
      ) : (
        <span
          aria-disabled="true"
          aria-label={`${roundAriaLabel(round)} ยังเปิดไม่ได้`}
          className="block min-h-24 rounded-control border border-border bg-surface-muted p-3"
        >
          {content}
        </span>
      )}
    </li>
  );
}

export function PatientProgramView({
  baseline,
  context,
  overview,
  roundsError,
}: {
  baseline: PatientBaselineNavigationState;
  context: PatientProgramPageContext;
  overview: ProgramRoundsOverview | null;
  roundsError: boolean;
}): React.JSX.Element {
  const active = context.active;
  const programPath = active
    ? `/app/patients/${encodeURIComponent(context.patient.patientHospitalRelationshipId)}/programs/${encodeURIComponent(active.programId)}`
    : null;
  const roundsPath = programPath ? `${programPath}/rounds` : null;
  const nextRoundNumber = overview?.rounds.find((round) => round.state !== "COMPLETED")?.roundNumber ?? null;

  return (
    <section aria-labelledby="patient-care-journey-heading" className="scroll-mt-24" id="patient-care" tabIndex={-1}>
      <Panel>
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-text" id="patient-care-journey-heading">
          เส้นทางการดูแล
        </h2>

        <dl className="mt-5 grid gap-4 border-y border-border py-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-semibold text-text-muted">ข้อมูลตั้งต้น</dt>
            <dd className="mt-1 font-semibold text-text">
              {baseline.baseline
                ? `บันทึกเมื่อ ${formatDate(baseline.baseline.recordedOn)}`
                : "ยังไม่มีข้อมูลตั้งต้น"}
            </dd>
            <p className="mt-1 text-sm leading-6 text-text-muted">
              ข้อมูลตั้งต้นแนะนำสำหรับการดูแล แต่ไม่ใช่เงื่อนไขของการเปิดโปรแกรม
            </p>
          </div>
          <div>
            <dt className="text-sm font-semibold text-text-muted">โปรแกรมที่กำลังดำเนินการ</dt>
            <dd className="mt-1 font-semibold text-text">
              {active ? statusLabel(active.status) : "ยังไม่มีโปรแกรมที่กำลังดำเนินการ"}
            </dd>
            {active ? (
              <p className="mt-1 text-sm leading-6 text-text-muted">
                เริ่ม {formatDateTime(active.startedAt)} · ข้อมูลตั้งต้นที่เชื่อมโยง: {active.initialBaseline ? formatDate(active.initialBaseline.recordedOn) : "ไม่มี"}
              </p>
            ) : null}
          </div>
        </dl>

        {active && overview ? (
          <>
            <div className="mt-5">
              <h3 className="font-semibold text-text">ความคืบหน้าการจัดบริการ</h3>
              <div className="mt-3 overflow-x-auto pb-2">
                <ol aria-label="การจัดบริการตามลำดับ" className="flex min-w-max gap-2">
                  {overview.rounds.map((round) => (
                    <RoundStep
                      currentRoundNumber={nextRoundNumber}
                      key={round.roundNumber}
                      programId={active.programId}
                      relationshipId={context.patient.patientHospitalRelationshipId}
                      round={round}
                    />
                  ))}
                </ol>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="font-semibold text-text">After · การประเมินสุดท้าย</h3>
                <p className="mt-1 text-sm leading-6 text-text-muted">
                  {overview.after.state === "RECORDED"
                    ? `บันทึกเมื่อ ${overview.after.date ? formatRoundDate(overview.after.date) : "ไม่ระบุวันที่"}`
                    : overview.after.state === "LOCKED"
                      ? "ต้องเปิดอย่างน้อย 6 ครั้ง และจบทุกครั้งที่เปิดไว้ก่อนบันทึก After"
                      : "ยังไม่มีการประเมินสุดท้าย"}
                </p>
              </div>
              {overview.after.state === "LOCKED" ? (
                <StatusBadge variant="neutral">ยังเปิดไม่ได้</StatusBadge>
              ) : (
                <Link
                  className="inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-4 focus-visible:rounded-control focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
                  href={`${programPath}#program-final`}
                  prefetch={false}
                >
                  {overview.after.state === "RECORDED" ? "ดู After" : "เปิด After"}
                </Link>
              )}
            </div>
          </>
        ) : active ? (
          <div className="mt-5 border-t border-border pt-4">
            {roundsError ? (
              <Alert role="alert" variant="warning">
                โหลดความคืบหน้าการจัดบริการไม่สำเร็จ ลองเปิดภาพรวมการจัดบริการอีกครั้ง
              </Alert>
            ) : (
              <p className="text-sm leading-6 text-text-muted">ยังไม่มีข้อมูลความคืบหน้าการจัดบริการ</p>
            )}
          </div>
        ) : (
          <p className="mt-5 border-t border-border pt-4 text-sm leading-6 text-text-muted">
            เริ่มโปรแกรมเมื่อพร้อม ระบบจะแนะนำการจัดบริการทีละขั้นตามลำดับ
          </p>
        )}

        {active && programPath && roundsPath ? (
          <nav aria-label="หน้าที่เกี่ยวกับโปรแกรมปัจจุบัน" className="mt-5 border-t border-border pt-4">
            <ul className="flex flex-wrap gap-x-6 gap-y-3">
              <li>
                <Link className="inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-4 focus-visible:rounded-control focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" href={roundsPath} prefetch={false}>
                  ดูการจัดบริการทั้งหมด
                </Link>
              </li>
              <li>
                <Link className="inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-4 focus-visible:rounded-control focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" href={programPath} prefetch={false}>
                  รายละเอียดโปรแกรม
                </Link>
              </li>
              <li>
                <Link className="inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-4 focus-visible:rounded-control focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" href={`${programPath}/report`} prefetch={false}>
                  รายงานโปรแกรม
                </Link>
              </li>
            </ul>
          </nav>
        ) : null}
      </Panel>
    </section>
  );
}

export function CompletedPatientPrograms({
  programs,
  relationshipId,
}: {
  programs: readonly PatientProgramProjection[];
  relationshipId: string;
}): React.JSX.Element {
  const completedPrograms = programs.filter((program) => program.status === "COMPLETED");

  return completedPrograms.length > 0 ? (
    <ul className="mt-3 divide-y divide-border border-y border-border">
      {completedPrograms.map((program) => (
        <li className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between" key={program.programId}>
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge variant={statusVariant(program.status)}>{statusLabel(program.status)}</StatusBadge>
              <span className="text-sm font-semibold text-text">เริ่ม {formatDate(program.startedAt)}</span>
            </div>
            <p className="mt-1 text-sm text-text-muted">
              สิ้นสุดเมื่อ {program.completedAt ? formatDate(program.completedAt) : "ไม่ระบุ"} · ข้อมูลตั้งต้นที่เชื่อมโยง: {program.initialBaseline ? formatDate(program.initialBaseline.recordedOn) : "ไม่มี"}
            </p>
          </div>
          <Link
            className="inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-4 focus-visible:rounded-control focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
            href={`/app/patients/${encodeURIComponent(relationshipId)}/programs/${encodeURIComponent(program.programId)}`}
            prefetch={false}
          >
            ดูโปรแกรมที่จบแล้ว
          </Link>
        </li>
      ))}
    </ul>
  ) : (
    <p className="mt-2 text-sm leading-6 text-text-muted">ยังไม่มีโปรแกรมที่จบแล้ว</p>
  );
}
