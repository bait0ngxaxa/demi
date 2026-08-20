import Link from "next/link";

import { Panel } from "@/components/ui/panel";
import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";
import {
  PatientProgramOpenControl,
} from "./program-mutation-controls";
import type {
  PatientProgramPageContext,
  PatientProgramProjection,
} from "@/modules/patient-program/services/patient-program-query-service";

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

function ProgramLink({
  program,
  children,
}: {
  program: PatientProgramProjection;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Link
      className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
      href={`/app/patients/${encodeURIComponent(program.patientHospitalRelationshipId)}/programs/${encodeURIComponent(program.programId)}`}
    >
      {children}
    </Link>
  );
}

function InitialBaselineText({
  program,
}: {
  program: PatientProgramProjection;
}): React.JSX.Element {
  if (!program.initialBaseline) {
    return <span>ยังไม่มีข้อมูลตั้งต้นที่เชื่อมโยง</span>;
  }

  return <span>บันทึกเมื่อ {formatDate(program.initialBaseline.recordedOn)}</span>;
}

export function PatientProgramView({
  context,
}: {
  context: PatientProgramPageContext;
}): React.JSX.Element {
  const completedPrograms = context.history.filter((program) => program.status === "COMPLETED");

  return (
    <section aria-labelledby="patient-program-heading" className="mt-6">
      <Panel>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2
              className="text-xl font-semibold tracking-[-0.02em] text-text"
              id="patient-program-heading"
            >
              โปรแกรมการดูแล
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-text-muted">
              โปรแกรมเป็นช่วงการเข้าร่วมของผู้ป่วยในความสัมพันธ์กับโรงพยาบาลนี้
              ข้อมูลตั้งต้นจะแสดงเฉพาะเมื่อมีรายการที่เชื่อมโยงแล้ว
            </p>
          </div>
          {context.canOpen ? (
            <PatientProgramOpenControl
              relationshipId={context.patient.patientHospitalRelationshipId}
            />
          ) : null}
        </div>

        {context.active ? (
          <div className="mt-6 border-t border-border pt-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-lg font-semibold tracking-[-0.02em] text-text">
                    โปรแกรมปัจจุบัน
                  </h3>
                  <StatusBadge variant={statusVariant(context.active.status)}>
                    {statusLabel(context.active.status)}
                  </StatusBadge>
                </div>
                <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-sm font-semibold text-text-muted">เริ่มโปรแกรม</dt>
                    <dd className="mt-1 font-semibold text-text">{formatDateTime(context.active.startedAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-semibold text-text-muted">ข้อมูลตั้งต้น</dt>
                    <dd className="mt-1 font-semibold text-text">
                      <InitialBaselineText program={context.active} />
                    </dd>
                  </div>
                </dl>
              </div>
              <ProgramLink program={context.active}>เปิดรายละเอียดโปรแกรม</ProgramLink>
            </div>
          </div>
        ) : (
          <div className="mt-6 border-t border-border pt-5">
            <h3 className="text-lg font-semibold tracking-[-0.02em] text-text">
              ยังไม่มีโปรแกรมที่กำลังดำเนินการ
            </h3>
            <p className="mt-1 text-sm leading-6 text-text-muted">
              สามารถเปิด episode ใหม่ได้เมื่อพร้อมดำเนินการ โดยระบบจะกำหนดเวลาเริ่มจากฝั่ง server
            </p>
            {!context.canOpen ? (
              <p className="mt-4 text-sm leading-6 text-text-muted">
                บัญชีนี้มีสิทธิ์อ่านข้อมูล แต่ไม่มีสิทธิ์เปิดหรือจบโปรแกรมในขอบเขตนี้
              </p>
            ) : null}
          </div>
        )}

        <div className="mt-6 border-t border-border pt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold tracking-[-0.02em] text-text">
                ประวัติโปรแกรมที่เสร็จสิ้น
              </h3>
              <p className="mt-1 text-sm leading-6 text-text-muted">
                เก็บเป็นประวัติแยก episode และไม่เปิดให้แก้ไขหรือเปิดซ้ำในขั้นตอนนี้
              </p>
            </div>
            {completedPrograms.length > 0 ? (
              <span className="text-sm text-text-muted">{completedPrograms.length} episode</span>
            ) : null}
          </div>

          {completedPrograms.length > 0 ? (
            <ul className="mt-5 divide-y divide-border border-y border-border">
              {completedPrograms.map((program) => (
                <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between" key={program.programId}>
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <StatusBadge variant={statusVariant(program.status)}>
                        {statusLabel(program.status)}
                      </StatusBadge>
                      <span className="text-sm font-semibold text-text">
                        เริ่ม {formatDate(program.startedAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-text-muted">
                      สิ้นสุดเมื่อ {program.completedAt ? formatDate(program.completedAt) : "ไม่ระบุ"} · <InitialBaselineText program={program} />
                    </p>
                  </div>
                  <ProgramLink program={program}>ดูรายละเอียด</ProgramLink>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-5 text-sm leading-6 text-text-muted">ยังไม่มีประวัติโปรแกรมที่เสร็จสิ้น</p>
          )}
        </div>
      </Panel>
    </section>
  );
}
