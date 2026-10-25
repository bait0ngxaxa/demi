import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import Link from "next/link";

import { decidePatientOsmAssignmentPolicy } from "@/modules/patient-assignment/policies/patient-osm-assignment-policy";
import { decideAccountRecoveryIssuePolicy } from "@/modules/account-security/policies/account-recovery-policy";
import { hasPatientActivationHospitalScope } from "@/modules/patient-activation/policies/patient-activation-policy";
import { getPatientActivationCandidateForRelationship } from "@/modules/patient-activation/services/patient-activation-query-service";
import type { PatientActivationCandidate } from "@/modules/patient-activation/services/patient-activation-query-service";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Alert } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";
import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";
import { getPatientClassificationLabel } from "@/modules/patient-classification/presentation/patient-classification-labels";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { getPatientBaselineNavigationState } from "@/modules/patient-baseline/services/patient-baseline-query-service";
import type { PatientBaselineNavigationState } from "@/modules/patient-baseline/services/patient-baseline-query-service";
import {
  getPatientDirectoryDetail,
  getPatientResponsibleOsm,
} from "@/modules/patient-directory/services/patient-directory-query-service";
import type {
  PatientDirectoryDetail,
  PatientDirectorySummary,
} from "@/modules/patient-directory/services/patient-directory-query-service";
import { hasDirectHospitalPatientReadScope } from "@/modules/patient-directory/policies/patient-directory-policy";
import { getPatientClassificationPageContext } from "@/modules/patient-classification/services/patient-classification-query-service";
import type { PatientClassificationPageContext } from "@/modules/patient-classification/services/patient-classification-query-service";
import { getPatientProgramPageContext } from "@/modules/patient-program/services/patient-program-query-service";
import type { PatientProgramProjection } from "@/modules/patient-program/services/patient-program-query-service";
import { getProgramRoundsOverview } from "@/modules/patient-program-rounds/services/round-query-service";
import type { ProgramRoundsOverview } from "@/modules/patient-program-rounds/services/round-query-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, InfrastructureError, NotFoundError, UnauthenticatedError } from "@/shared/errors/application-error";

import { PatientHealthHistorySection } from "./patient-health-history-section";
import { PatientSelfMeasurementSection } from "./patient-self-measurement-section";
import { PatientProfileView } from "./patient-profile-view";
import { PatientAccountRecoveryPanel } from "./account-recovery-panel";
import { PatientClassificationView } from "./patient-classification-view";
import { CompletedPatientPrograms, PatientProgramView } from "./programs/patient-program-view";
import { PatientProgramOpenControl } from "./programs/program-mutation-controls";
import { resolvePatientCareNextStep } from "./patient-care-next-step";
import { PatientResponsibleOsmSection, type PatientResponsibleOsmSectionState } from "./patient-responsible-osm-section";

export const metadata: Metadata = {
  title: "รายละเอียดผู้ป่วย",
};

type PatientDetailTab = "overview" | "history" | "profile" | "manage";

type PatientDetailPageProps = {
  params: Promise<{ relationshipId: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

const patientTabs: readonly { id: PatientDetailTab; label: string }[] = [
  { id: "overview", label: "ภาพรวม" },
  { id: "history", label: "ประวัติ" },
  { id: "profile", label: "ข้อมูลผู้ป่วย" },
  { id: "manage", label: "จัดการ" },
];

async function resolveActor(): Promise<ActorContext> {
  try {
    return await getProtectedApplicationActor();
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) {
      redirect("/login");
    }

    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    throw error;
  }
}

function resolveTab(value: unknown, canManage: boolean): PatientDetailTab {
  if (value === "history" || value === "profile" || value === "overview") {
    return value;
  }

  return value === "manage" && canManage ? "manage" : "overview";
}

function patientTabHref(relationshipId: string, tab: PatientDetailTab, cursor?: string): string {
  const query = new URLSearchParams({ tab });
  if (cursor) query.set("selfMeasurementCursor", cursor);
  return `/app/patients/${encodeURIComponent(relationshipId)}?${query.toString()}`;
}

function formatDateOnly(value: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(value);
}

function programStatusLabel(program: PatientProgramProjection | null): string {
  if (!program) return "ยังไม่มีโปรแกรม";
  return program.status === "ACTIVE" ? "กำลังดำเนินการ" : "เสร็จสิ้นแล้ว";
}

function programStatusVariant(program: PatientProgramProjection | null): StatusVariant {
  if (!program) return "neutral";
  return program.status === "ACTIVE" ? "success" : "neutral";
}

function roundProgressLabel(
  program: PatientProgramProjection | null,
  overview: ProgramRoundsOverview | null,
  roundsError: boolean,
): string {
  if (!program) return "ยังไม่มีรอบบริการ";
  if (roundsError || !overview || overview.patientProgramId !== program.programId) {
    return "โหลดความคืบหน้าไม่ได้";
  }

  if (overview.rounds.length !== 6) return "ข้อมูลรอบไม่ครบ";
  const completedRounds = overview.rounds.filter((round) => round.state === "COMPLETED").length;
  return `จัดบริการแล้ว ${completedRounds}/6`;
}

function roundProgressVariant(
  program: PatientProgramProjection | null,
  overview: ProgramRoundsOverview | null,
  roundsError: boolean,
): StatusVariant {
  if (!program) return "neutral";
  if (roundsError || !overview || overview.patientProgramId !== program.programId) return "warning";
  return "info";
}

function PatientSummary({
  classification,
  latestProgram,
  patient,
  roundsError,
  roundsOverview,
}: {
  classification: PatientClassificationPageContext["current"];
  latestProgram: PatientProgramProjection | null;
  patient: PatientDirectoryDetail | PatientDirectorySummary;
  roundsError: boolean;
  roundsOverview: ProgramRoundsOverview | null;
}): React.JSX.Element {
  return (
    <Panel aria-label="ข้อมูลสรุปผู้ป่วย" className="mt-6">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 xl:grid-cols-5">
        <div className="min-w-0">
          <dt className="text-xs font-semibold text-text-muted sm:text-sm">HN</dt>
          <dd className="mt-1 break-words font-semibold text-text">{patient.hospitalNumber ?? "ไม่ระบุ"}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-semibold text-text-muted sm:text-sm">โรงพยาบาล</dt>
          <dd className="mt-1 break-words font-semibold text-text">{patient.hospital.name}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-semibold text-text-muted sm:text-sm">สถานะผู้ป่วย</dt>
          <dd className="mt-1"><StatusBadge variant={classification ? "info" : "neutral"}>{getPatientClassificationLabel(classification?.classification)}</StatusBadge></dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-semibold text-text-muted sm:text-sm">สถานะโปรแกรม</dt>
          <dd className="mt-1"><StatusBadge variant={programStatusVariant(latestProgram)}>{programStatusLabel(latestProgram)}</StatusBadge></dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-semibold text-text-muted sm:text-sm">ความคืบหน้ารอบ</dt>
          <dd className="mt-1"><StatusBadge variant={roundProgressVariant(latestProgram, roundsOverview, roundsError)}>{roundProgressLabel(latestProgram, roundsOverview, roundsError)}</StatusBadge></dd>
        </div>
      </dl>
    </Panel>
  );
}

function PatientActivationStatusPanel({
  candidate,
  relationshipId,
  hospitalId,
  loadFailed,
  canIssueRecovery,
}: {
  candidate: PatientActivationCandidate | null;
  relationshipId: string;
  hospitalId: string;
  loadFailed: boolean;
  canIssueRecovery: boolean;
}): React.JSX.Element {
  if (loadFailed) {
    return (
      <Alert role="alert" variant="warning">
        <p className="font-semibold">โหลดสถานะบัญชีไม่สำเร็จ</p>
        <p className="mt-1">ขณะนี้ยังยืนยันสถานะการเปิดใช้งานไม่ได้ กรุณาลองใหม่ภายหลัง</p>
      </Alert>
    );
  }
  if (!candidate) {
    return (
      <Alert role="status" variant="warning">
        <p className="font-semibold">ไม่พบความสัมพันธ์ผู้ป่วยที่พร้อมจัดการบัญชี</p>
        <p className="mt-1">ตรวจสอบสถานะผู้ป่วยและโรงพยาบาลก่อนดำเนินการ</p>
      </Alert>
    );
  }

  const accountLabel = candidate.accountStatus === "ACTIVE"
    ? "ใช้งานอยู่"
    : candidate.accountStatus === "PROVISIONED"
      ? "ยังไม่เปิดใช้งาน"
      : candidate.accountStatus === "SUSPENDED"
        ? "บัญชีถูกระงับ"
        : "ต้องตรวจสอบสถานะ";
  const activationLabel = {
    ACTIVE: "เปิดใช้งานแล้ว",
    NOT_ISSUED: "ยังไม่ได้ออกลิงก์",
    ISSUED: "ออกลิงก์แล้ว",
    IN_PROGRESS: "กำลังเปิดใช้งาน",
    EXPIRED: "ลิงก์หมดอายุ",
    RECONCILIATION_REQUIRED: "ต้องตรวจสอบบัญชีก่อนดำเนินการ",
  }[candidate.activationStatus];
  const statusVariant: StatusVariant = candidate.activationStatus === "ACTIVE"
    ? "success"
    : candidate.activationStatus === "RECONCILIATION_REQUIRED" || candidate.accountStatus === "SUSPENDED"
      ? "warning"
      : candidate.activationStatus === "IN_PROGRESS" || candidate.activationStatus === "ISSUED"
        ? "info"
        : "neutral";
  const activationHref = `/app/patients/activation?hospitalId=${encodeURIComponent(hospitalId)}&relationshipId=${encodeURIComponent(relationshipId)}`;

  return (
    <Panel aria-labelledby="patient-activation-status-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-text" id="patient-activation-status-heading">บัญชีผู้ป่วย</h3>
          <p className="mt-1 text-sm leading-6 text-text-muted">ตรวจสอบสถานะบัญชีและดำเนินการเปิดใช้งานในโรงพยาบาลนี้</p>
        </div>
        <StatusBadge variant={statusVariant}>{activationLabel}</StatusBadge>
      </div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-text-muted">สถานะบัญชี</dt>
          <dd className="mt-1 font-semibold text-text">{accountLabel}</dd>
        </div>
        {candidate.activationExpiresAt ? (
          <div>
            <dt className="text-text-muted">ลิงก์หมดอายุ</dt>
            <dd className="mt-1 font-semibold text-text">{new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(candidate.activationExpiresAt)}</dd>
          </div>
        ) : null}
      </dl>
      {candidate.activationStatus === "ACTIVE" ? (
        <p className="mt-4 text-sm leading-6 text-text-muted">บัญชีนี้เปิดใช้งานแล้ว ไม่ต้องออกลิงก์เปิดใช้งาน</p>
      ) : candidate.accountStatus === "SUSPENDED" ? (
        <p className="mt-4 text-sm leading-6 text-text-muted">
          บัญชีถูกระงับ การเปิดใช้งานใหม่ไม่พร้อมใช้
          {canIssueRecovery ? " หากต้องคืนบัญชี ให้ใช้ขั้นตอนยืนยันตัวตนในส่วนคืนบัญชีด้านล่าง" : " กรุณาติดต่อผู้ดูแลที่มีสิทธิ์"}
        </p>
      ) : candidate.activationStatus === "RECONCILIATION_REQUIRED" ? (
        <p className="mt-4 text-sm leading-6 text-text-muted">ระบบต้องตรวจสอบข้อมูลบัญชีก่อน ไม่สามารถออกลิงก์เปิดใช้งานได้{canIssueRecovery ? " การคืนรหัสผ่านยังเป็นอีกขั้นตอนหนึ่งที่ต้องยืนยันตัวตน" : ""}</p>
      ) : candidate.activationStatus === "IN_PROGRESS" ? (
        <p className="mt-4 text-sm leading-6 text-text-muted">ผู้ป่วยเริ่มเปิดใช้งานบัญชีแล้ว กรุณารอให้ขั้นตอนเสร็จสิ้น</p>
      ) : null}
      {candidate.activationMayBeIssued ? (
        <Link className={`${buttonClassName({ variant: "secondary" })} mt-4`} href={activationHref} prefetch={false}>
          {candidate.activationStatus === "NOT_ISSUED" ? "ออกลิงก์เปิดใช้งาน" : "ออกหรือส่งลิงก์ใหม่"}
        </Link>
      ) : null}
    </Panel>
  );
}

function PatientNextStepPanel({
  canOpenProgram,
  isNetworkRead,
  nextStep,
  patientName,
  relationshipId,
}: {
  canOpenProgram: boolean;
  isNetworkRead: boolean;
  nextStep: ReturnType<typeof resolvePatientCareNextStep>;
  patientName: string;
  relationshipId: string;
}): React.JSX.Element {
  let description: string;
  switch (nextStep.type) {
    case "NONE":
      description = isNetworkRead
        ? "การอ่านข้อมูลจากเครือข่ายเป็นแบบอ่านอย่างเดียว จึงไม่มีรายการที่บันทึกต่อได้"
        : nextStep.reason === "PROGRAM_NOT_MANAGEABLE"
          ? "บัญชีนี้อ่านโปรแกรมปัจจุบันได้ แต่ไม่มีสิทธิ์จัดการรอบบริการ"
          : nextStep.reason === "READ_ONLY"
            ? "บัญชีนี้ไม่มีสิทธิ์บันทึกข้อมูลตั้งต้นหรือจัดการโปรแกรมในขอบเขตนี้"
            : "ไม่มีรายการดูแลที่ต้องดำเนินการต่อในขณะนี้";
      break;
    case "BASELINE":
      description = "แนะนำให้บันทึกข้อมูลตั้งต้น แต่สามารถเปิดโปรแกรมได้โดยไม่ต้องมีข้อมูลตั้งต้น";
      break;
    case "OPEN_PROGRAM":
      description = "เปิดโปรแกรมใหม่ได้ตามสิทธิ์ ข้อมูลตั้งต้นไม่ใช่เงื่อนไขของการเปิดโปรแกรม";
      break;
    case "ROUND":
      description = nextStep.state === "IN_PROGRESS"
        ? `ทำงานต่อจากครั้งที่ ${nextStep.roundNumber} โดยเปิดครั้งถัดไปเมื่อจบครั้งนี้`
        : `เริ่มครั้งที่ ${nextStep.roundNumber} แล้วทำตามลำดับทีละครั้ง`;
      break;
    case "AFTER":
      description = "ครบการจัดบริการทั้ง 6 ครั้งแล้ว บันทึก After เพื่อประเมินผลหลังการดูแล";
      break;
    case "PROGRAM":
      description = "บันทึก After แล้ว เปิดโปรแกรมเพื่อตรวจสอบและจบโปรแกรม";
      break;
    case "ROUNDS_OVERVIEW":
      description = "ยังโหลดความคืบหน้ารอบไม่ได้ เปิดภาพรวมการจัดบริการเพื่อตรวจสอบอีกครั้ง";
      break;
  }

  const patientPath = `/app/patients/${encodeURIComponent(relationshipId)}`;
  const programPath = "programId" in nextStep
    ? `${patientPath}/programs/${encodeURIComponent(nextStep.programId)}`
    : null;

  return (
    <Panel aria-labelledby="patient-next-step-heading" className="mt-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-text" id="patient-next-step-heading">ขั้นตอนถัดไป</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-text-muted">{description}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          {nextStep.type === "BASELINE" ? (
            <>
              <Link
                aria-label={`บันทึกข้อมูลตั้งต้นให้${patientName}`}
                className={buttonClassName({ variant: "primary" })}
                href={`${patientPath}/baseline`}
                prefetch={false}
              >
                บันทึกข้อมูลตั้งต้น
              </Link>
              {canOpenProgram ? (
                <PatientProgramOpenControl
                  label="เปิดโปรแกรมโดยไม่บันทึกข้อมูลตั้งต้น"
                  relationshipId={relationshipId}
                  variant="secondary"
                />
              ) : null}
            </>
          ) : null}
          {nextStep.type === "OPEN_PROGRAM" ? (
            <PatientProgramOpenControl relationshipId={relationshipId} variant="primary" />
          ) : null}
          {nextStep.type === "ROUND" ? (
            <Link
              aria-label={`${nextStep.state === "IN_PROGRESS" ? "ทำต่อ" : "เริ่ม"}การจัดบริการครั้งที่ ${nextStep.roundNumber} สำหรับ${patientName}`}
              className={buttonClassName({ variant: "primary" })}
              href={`${programPath}/rounds/${nextStep.roundNumber}`}
              prefetch={false}
            >
              {nextStep.state === "IN_PROGRESS" ? "ทำต่อ" : "เริ่ม"}ครั้งที่ {nextStep.roundNumber}
            </Link>
          ) : null}
          {nextStep.type === "AFTER" ? (
            <Link className={buttonClassName({ variant: "primary" })} href={`${programPath}#program-final`} prefetch={false}>
              บันทึก After
            </Link>
          ) : null}
          {nextStep.type === "PROGRAM" ? (
            <Link className={buttonClassName({ variant: "primary" })} href={programPath ?? patientPath} prefetch={false}>
              ไปยังโปรแกรมเพื่อจบโปรแกรม
            </Link>
          ) : null}
          {nextStep.type === "ROUNDS_OVERVIEW" ? (
            <Link className={buttonClassName({ variant: "primary" })} href={`${programPath}/rounds`} prefetch={false}>
              ดูการจัดบริการทั้งหมด
            </Link>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}

function HistoryTab({
  baseline,
  programs,
  relationshipId,
}: {
  baseline: PatientBaselineNavigationState;
  programs: PatientProgramProjection[];
  relationshipId: string;
}): React.JSX.Element {
  const active = programs.find((program) => program.status === "ACTIVE") ?? null;
  const patientPath = `/app/patients/${encodeURIComponent(relationshipId)}`;
  const simpleDestinations = [
    { label: "นัดหมาย", href: `${patientPath}/appointments`, action: "ดูนัดหมาย" },
    { label: "การคัดกรอง/ประเมิน", href: `${patientPath}/screenings`, action: "ดูประวัติการประเมิน" },
    { label: "แผนเป้าหมาย", href: `${patientPath}/goals`, action: "ดูแผนเป้าหมาย" },
    { label: "การติดตามผล", href: `${patientPath}/followups`, action: "ดูการติดตามผล" },
    { label: "หลักฐาน/รูปภาพ", href: `${patientPath}/evidence`, action: "ดูหลักฐาน" },
  ] as const;

  return (
    <section aria-labelledby="patient-history-heading" className="scroll-mt-24" id="patient-history" tabIndex={-1}>
      <Panel>
        <h2 className="text-xl font-semibold text-text" id="patient-history-heading">ประวัติและรายการที่เกี่ยวข้อง</h2>
        <ol className="mt-4 divide-y divide-border border-y border-border">
          <li className="py-4">
            <h3 className="font-semibold text-text">การจัดบริการ</h3>
            {active ? (
              <Link className="mt-1 inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-4 focus-visible:rounded-control focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" href={`${patientPath}/programs/${encodeURIComponent(active.programId)}/rounds`} prefetch={false}>
                ดูการจัดบริการของโปรแกรมปัจจุบัน
              </Link>
            ) : (
              <p className="mt-1 text-sm leading-6 text-text-muted">ไม่มีโปรแกรมที่กำลังดำเนินการ</p>
            )}
          </li>
          <li className="py-4">
            <h3 className="font-semibold text-text">โปรแกรมที่จบแล้ว · อ่านอย่างเดียว</h3>
            <p className="mt-1 text-sm leading-6 text-text-muted">โปรแกรมที่จบแล้วเปิดดูได้โดยไม่แก้ไขข้อมูลเดิม</p>
            <CompletedPatientPrograms programs={programs} relationshipId={relationshipId} />
          </li>
          {simpleDestinations.map((destination) => (
            <li className="flex flex-col gap-1 py-4 sm:flex-row sm:items-center sm:justify-between" key={destination.label}>
              <h3 className="font-semibold text-text">{destination.label}</h3>
              <Link className="inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-4 focus-visible:rounded-control focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" href={destination.href} prefetch={false}>
                {destination.action}
              </Link>
            </li>
          ))}
          {baseline.baseline ? (
            <li className="flex flex-col gap-1 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-semibold text-text">ข้อมูลตั้งต้น</h3>
                <p className="text-sm text-text-muted">บันทึกเมื่อ {formatDateOnly(baseline.baseline.recordedOn)}</p>
              </div>
              <Link className="inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-4 focus-visible:rounded-control focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" href={`${patientPath}/baseline`} prefetch={false}>
                ดูข้อมูลตั้งต้น
              </Link>
            </li>
          ) : null}
        </ol>
      </Panel>
    </section>
  );
}

export default async function PatientDetailPage({
  params,
  searchParams,
}: PatientDetailPageProps): Promise<React.JSX.Element> {
  await connection();
  const { relationshipId } = await params;
  if (relationshipId === "access-requests") {
    notFound();
  }

  const actor = await resolveActor();
  const query = searchParams ? await searchParams : {};
  const requestedTab = typeof query.tab === "string" ? query.tab : undefined;
  const selfMeasurementCursor = typeof query.selfMeasurementCursor === "string"
    ? query.selfMeasurementCursor
    : undefined;
  let patient: PatientDirectoryDetail | PatientDirectorySummary;

  try {
    patient = await getPatientDirectoryDetail(
      actor,
      relationshipId,
      {},
      { includeProfile: requestedTab === "profile" },
    );
  } catch (error: unknown) {
    if (error instanceof NotFoundError) {
      notFound();
    }

    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    throw error;
  }

  const canManageAssignment = decidePatientOsmAssignmentPolicy({
    actor,
    capability: "patient:assign-osm",
    targetHospitalId: patient.hospital.id,
  }).allowed;
  const canIssueAccountRecovery = decideAccountRecoveryIssuePolicy(actor, patient.hospital.id).allowed;
  const canManageActivation = hasPatientActivationHospitalScope(actor, patient.hospital.id);
  const hasManagementTab = canManageAssignment || canIssueAccountRecovery || canManageActivation;
  const tab = resolveTab(query.tab, hasManagementTab);
  let activationCandidate: PatientActivationCandidate | null = null;
  let activationLoadFailed = false;
  if (canManageActivation && tab === "manage") {
    try {
      activationCandidate = await getPatientActivationCandidateForRelationship(actor, {
        targetHospitalId: patient.hospital.id,
        patientHospitalRelationshipId: patient.patientHospitalRelationshipId,
      });
    } catch (error: unknown) {
      if (error instanceof NotFoundError) notFound();
      if (error instanceof ForbiddenError) redirect("/app");
      if (error instanceof InfrastructureError) activationLoadFailed = true;
      else throw error;
    }
  }
  const hasHospitalDirectoryAccess = hasDirectHospitalPatientReadScope(actor, patient.hospital.id);
  const isNetworkRead = patient.access === "NETWORK";
  const backLabel = hasHospitalDirectoryAccess
    ? "รายชื่อผู้ป่วยของโรงพยาบาล"
    : isNetworkRead ? "รายชื่อผู้ป่วยของลูกข่าย" : "ผู้ป่วยที่รับผิดชอบ";
  const backHref = hasHospitalDirectoryAccess || isNetworkRead
    ? `/app/patients?hospitalId=${encodeURIComponent(patient.hospital.id)}`
    : "/app/patients/assigned";
  const responsibleOsmStatePromise: Promise<PatientResponsibleOsmSectionState | null> = tab !== "overview"
    ? Promise.resolve(null)
    : isNetworkRead
      ? Promise.resolve({ status: "NETWORK_RESTRICTED" })
      : getPatientResponsibleOsm(actor, {
        hospitalId: patient.hospital.id,
        patientHospitalRelationshipId: patient.patientHospitalRelationshipId,
      }).catch((error: unknown) => {
        if (error instanceof NotFoundError || error instanceof ForbiddenError || error instanceof InfrastructureError) {
          return { status: "ERROR" } as const;
        }

        throw error;
      });

  const [classificationContext, baselineNavigation, programContext, responsibleOsmState] = await Promise.all([
    getPatientClassificationPageContext(actor, relationshipId, undefined, { includeHistory: tab === "profile" })
      .catch((error: unknown) => {
        if (error instanceof NotFoundError) notFound();
        if (error instanceof ForbiddenError) redirect("/app");
        throw error;
      }),
    getPatientBaselineNavigationState(actor, relationshipId)
      .catch((error: unknown) => {
        if (error instanceof NotFoundError) notFound();
        if (error instanceof ForbiddenError) redirect("/app");
        throw error;
      }),
    getPatientProgramPageContext(actor, relationshipId, undefined, { includeHistory: tab === "history" })
      .catch((error: unknown) => {
        if (error instanceof NotFoundError) notFound();
        if (error instanceof ForbiddenError) redirect("/app");
        throw error;
      }),
    responsibleOsmStatePromise,
  ]);

  const latestProgram = programContext.active ?? programContext.latest ?? programContext.history[0] ?? null;
  let roundsOverview: ProgramRoundsOverview | null = null;
  let roundsError = false;
  if (latestProgram) {
    try {
      const loadedOverview = await getProgramRoundsOverview(actor, relationshipId, latestProgram.programId);
      if (loadedOverview.patientProgramId === latestProgram.programId) {
        roundsOverview = loadedOverview;
      } else {
        roundsError = true;
      }
    } catch (error: unknown) {
      if (error instanceof NotFoundError || error instanceof ForbiddenError || error instanceof InfrastructureError) {
        roundsError = true;
      } else {
        throw error;
      }
    }
  }

  const nextStep = resolvePatientCareNextStep({
    access: patient.access,
    baselineExists: Boolean(baselineNavigation.baseline),
    canCreateBaseline: baselineNavigation.canCreate,
    activeProgram: programContext.active
      ? { programId: programContext.active.programId, canManage: programContext.canManage }
      : null,
    canOpenProgram: programContext.canOpen,
    roundsOverview: programContext.active && roundsOverview?.patientProgramId === programContext.active.programId
      ? roundsOverview
      : null,
  });

  const visibleTabs = patientTabs.filter(({ id }) => id !== "manage" || hasManagementTab);

  return (
    <div className="content-detail">
      <PageHeader
        breadcrumbs={[
          { href: backHref, label: backLabel },
          { label: "รายละเอียดผู้ป่วย" },
        ]}
        description="ข้อมูลผู้ป่วยและเส้นทางการดูแลในโรงพยาบาลนี้"
        title={patient.displayName}
      />

      <PatientSummary
        classification={classificationContext.current}
        latestProgram={latestProgram}
        patient={patient}
        roundsError={roundsError}
        roundsOverview={roundsOverview}
      />

      {isNetworkRead ? (
        <Alert className="mt-5" variant="info">
          ผู้ป่วยของ {patient.hospital.name} ซึ่งเป็นลูกข่ายในเครือข่ายของคุณ ดูข้อมูลได้อย่างเดียว แก้ไขหรือบันทึกข้อมูลไม่ได้ และทุกการเปิดดูจะถูกบันทึกไว้
        </Alert>
      ) : null}

      <PatientNextStepPanel
        canOpenProgram={programContext.canOpen}
        isNetworkRead={isNetworkRead}
        nextStep={nextStep}
        patientName={patient.displayName}
        relationshipId={patient.patientHospitalRelationshipId}
      />

      <nav aria-label="แท็บรายละเอียดผู้ป่วย" className="mt-6 overflow-x-auto border-b border-border">
        <ul className="flex min-w-max gap-2">
          {visibleTabs.map(({ id, label }) => (
            <li key={id}>
              <Link
                aria-current={tab === id ? "page" : undefined}
                className={`inline-flex min-h-12 items-center border-b-2 px-4 text-sm font-semibold ${tab === id ? "border-action-primary text-brand-strong" : "border-transparent text-text-muted hover:text-text"}`}
                href={patientTabHref(patient.patientHospitalRelationshipId, id)}
                prefetch={false}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="pt-6">
        {tab === "overview" ? (
          <>
            {responsibleOsmState ? (
              <PatientResponsibleOsmSection
                canManageAssignment={canManageAssignment}
                relationshipId={patient.patientHospitalRelationshipId}
                state={responsibleOsmState}
              />
            ) : null}
            <PatientProgramView
              baseline={baselineNavigation}
              context={programContext}
              overview={roundsOverview?.patientProgramId === programContext.active?.programId ? roundsOverview : null}
              roundsError={roundsError}
            />
          </>
        ) : null}

        {tab === "history" ? (
          <HistoryTab
            baseline={baselineNavigation}
            programs={programContext.history}
            relationshipId={patient.patientHospitalRelationshipId}
          />
        ) : null}

        {tab === "profile" ? (
          <section aria-label="ข้อมูลผู้ป่วยและประวัติสุขภาพ" className="space-y-6">
            {"profile" in patient ? (
              <PatientProfileView profile={patient.profile} profileSource={patient.profileSource} />
            ) : (
              <Alert role="alert" variant="warning">โหลดข้อมูลโปรไฟล์ไม่สำเร็จ ลองเปิดแท็บข้อมูลผู้ป่วยอีกครั้ง</Alert>
            )}
            <PatientHealthHistorySection actor={actor} relationshipId={relationshipId} />
            <p className="rounded-control bg-info-soft px-4 py-3 text-sm leading-6 text-info">
              สถานะนี้เป็นสถานะปัจจุบันของผู้ป่วยและใช้ร่วมกันทุกโรงพยาบาลที่ดูแลผู้ป่วยรายนี้
            </p>
            <PatientClassificationView context={classificationContext} />
            <PatientSelfMeasurementSection actor={actor} cursor={selfMeasurementCursor} relationshipId={relationshipId} />
            {hasHospitalDirectoryAccess ? (
              <Link
                className={buttonClassName({ variant: "secondary" })}
                href={`/app/patients/${encodeURIComponent(patient.patientHospitalRelationshipId)}/profile`}
                prefetch={false}
              >
                แก้ไขข้อมูลโปรไฟล์และประวัติสุขภาพ
              </Link>
            ) : null}
          </section>
        ) : null}

        {tab === "manage" ? (
          <section aria-labelledby="patient-management-heading" className="space-y-6">
            <h2 className="text-xl font-semibold text-text" id="patient-management-heading">จัดการผู้ป่วย</h2>
            {canManageAssignment ? (
              <Panel>
                <h3 className="font-semibold text-text">ผู้รับผิดชอบ</h3>
                <p className="mt-1 text-sm leading-6 text-text-muted">ดูหรือจัดการการมอบหมาย อสม. ให้ผู้ป่วยรายนี้</p>
                <Link
                  className={`${buttonClassName({ variant: "secondary" })} mt-4`}
                  href={`/app/patients/${encodeURIComponent(patient.patientHospitalRelationshipId)}/assignment`}
                  prefetch={false}
                >
                  จัดการผู้รับผิดชอบ
                </Link>
              </Panel>
            ) : null}
            {canManageActivation ? (
              <PatientActivationStatusPanel
                candidate={activationCandidate}
                canIssueRecovery={canIssueAccountRecovery}
                hospitalId={patient.hospital.id}
                loadFailed={activationLoadFailed}
                relationshipId={patient.patientHospitalRelationshipId}
              />
            ) : null}
            {canIssueAccountRecovery ? <PatientAccountRecoveryPanel relationshipId={patient.patientHospitalRelationshipId} /> : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
