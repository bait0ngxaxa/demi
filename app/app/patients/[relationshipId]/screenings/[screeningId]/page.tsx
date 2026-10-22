import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { LINE_WEB_NAVIGATION_PATHS } from "@/modules/line/domain/line-navigation-intents";
import {
  decideOsmAssignedPatientReadPolicy,
  PATIENT_READ_CAPABILITY,
} from "@/modules/patient-directory/policies/patient-directory-policy";
import {
  getInstrumentQuestionSet,
  getQuestionSet,
  PROMS_RESULT_RULE_NOTE,
} from "@/modules/screening/domain/question-sets";
import { pamGroupDefinition } from "@/modules/screening/domain/scoring";
import type { ScreeningOutcome } from "@/modules/screening/domain/screening-outcome";
import {
  getScreeningDetail,
  type ScreeningDetail,
} from "@/modules/screening/services/screening-query-service";
import {
  PROMS_RESULT_LABELS,
  SCREENING_INSTRUMENT_LABELS,
  SCREENING_PROTOTYPE_NOTICE_BODY,
  SCREENING_PROTOTYPE_NOTICE_TITLE,
  screeningOutcomeBadges,
} from "@/modules/screening/presentation/screening-labels";
import {
  getPatientProgramPageContext,
  type PatientProgramProjection,
} from "@/modules/patient-program/services/patient-program-query-service";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/shared/errors/application-error";

export const metadata: Metadata = {
  title: "รายละเอียดการประเมิน",
};

type ScreeningDetailPageProps = {
  params: Promise<{ relationshipId: string; screeningId: string }>;
};

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(value);
}

function OutcomeBadges({ outcome }: { outcome: ScreeningOutcome }): React.JSX.Element {
  return (
    <div className="flex flex-wrap gap-2">
      {screeningOutcomeBadges(outcome).map((badge) => (
        <StatusBadge key={badge.label} variant={badge.variant}>
          {badge.label}
        </StatusBadge>
      ))}
    </div>
  );
}

async function resolveActor() {
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

function LegacyAnswerList({
  detail,
  section,
}: {
  detail: ScreeningDetail;
  section: "PAM" | "PROMs";
}): React.JSX.Element | null {
  if (detail.responses.kind !== "LEGACY") {
    return null;
  }

  const responses = detail.responses;
  const questionSet = getQuestionSet(detail.questionSetKey, detail.questionSetVersion);
  const questions = questionSet?.questions.filter((question) => question.section === section) ?? [];

  return (
    <dl className="mt-5 divide-y divide-border border-y border-border">
      {questions.map((question) => {
        const value = responses[section === "PAM" ? "pam" : "proms"][question.key];
        const label = question.options.find((option) => option.value === value)?.label ?? "ไม่พบคำตอบ";

        return (
          <div className="grid gap-1 py-4 sm:grid-cols-[minmax(0,1fr)_14rem] sm:gap-6" key={question.key}>
            <dt className="text-sm leading-6 text-text-muted">{question.prompt}</dt>
            <dd className="text-sm font-semibold text-text sm:text-right">
              {value}. {label}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/** A booklet instrument (R2-A/B): each answer with its own option text; assessor guidance for staff. */
function InstrumentAnswerList({ detail }: { detail: ScreeningDetail }): React.JSX.Element | null {
  if (detail.responses.kind !== "INSTRUMENT") {
    return null;
  }

  const answers = detail.responses.answers;
  const questionSet = getInstrumentQuestionSet(detail.questionSetKey, detail.questionSetVersion);

  return (
    <Panel>
      <h2 className="text-xl font-semibold tracking-[-0.02em]">{questionSet?.title ?? "คำตอบ"}</h2>
      {questionSet?.scaleLabel ? (
        <p className="mt-2 text-sm leading-6 text-text-muted">{questionSet.scaleLabel}</p>
      ) : null}
      <ol className="mt-5 divide-y divide-border border-y border-border">
        {(questionSet?.questions ?? []).map((question, index) => {
          const value = answers[question.key];
          const label = question.options.find((option) => option.value === value)?.label ?? "ไม่พบคำตอบ";

          return (
            <li className="py-4" key={question.key}>
              <div className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_16rem] sm:gap-6">
                <p className="text-sm leading-6 text-text">
                  {index + 1}. {question.prompt}
                  {question.hint ? <span className="block text-text-muted">{question.hint}</span> : null}
                </p>
                <p className="text-sm font-semibold text-text sm:text-right">
                  {label === String(value) ? value : `${value}. ${label}`}
                </p>
              </div>
              {question.guidance ? (
                <p className="mt-2 rounded-control bg-surface-muted px-3 py-2 text-xs leading-5 text-text-muted">
                  คำแนะนำสำหรับผู้ประเมิน: {question.guidance}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}

function InstrumentResult({ outcome }: { outcome: ScreeningOutcome }): React.JSX.Element | null {
  if (outcome.kind === "PAM") {
    const group = pamGroupDefinition(outcome.group);

    return (
      <dl className="mt-6 grid gap-4 border-y border-border py-5">
        <div>
          <dt className="text-sm text-text-muted">คะแนนรวม PAM</dt>
          <dd className="mt-1 text-xl font-semibold text-text">{outcome.total}</dd>
        </div>
        <div>
          <dt className="text-sm text-text-muted">{group.name}</dt>
          <dd className="mt-1 text-sm leading-6 text-text">{group.description}</dd>
        </div>
        {group.recommendation ? (
          <div>
            <dt className="text-sm text-text-muted">แนะนำ</dt>
            <dd className="mt-1 text-sm leading-6 text-text">{group.recommendation}</dd>
          </div>
        ) : null}
      </dl>
    );
  }

  if (outcome.kind === "PROMS") {
    return (
      <div className="mt-6 border-y border-border py-5">
        <p className="text-xl font-semibold text-text">
          {outcome.hasProblem ? PROMS_RESULT_LABELS.problem : PROMS_RESULT_LABELS.noProblem}
        </p>
        {outcome.hasProblem ? (
          <p className="mt-2 text-sm leading-6 text-text-muted">
            ข้อที่ได้คะแนนไม่เกิน 2: {outcome.problemItemKeys.map((key) => `ข้อ ${key.replace("proms-", "")}`).join(", ")}
          </p>
        ) : null}
        <p className="mt-3 text-xs leading-5 text-text-subtle">{PROMS_RESULT_RULE_NOTE}</p>
      </div>
    );
  }

  return null;
}

function ScreeningDetailView({
  activeProgram,
  canContinueAssignedScreening,
  canManageProgram,
  detail,
}: {
  activeProgram: PatientProgramProjection | null;
  canContinueAssignedScreening: boolean;
  canManageProgram: boolean;
  detail: ScreeningDetail;
}): React.JSX.Element {
  const relationshipId = detail.patient.patientHospitalRelationshipId;
  const programHref = activeProgram
    ? `/app/patients/${encodeURIComponent(relationshipId)}/programs/${encodeURIComponent(activeProgram.programId)}`
    : null;
  // PROMs never sources a Goal Plan (R2-C), so it links to the plan page without a screening.
  const screeningQuery =
    detail.instrument === "PROMS" ? "" : `?screeningId=${encodeURIComponent(detail.screeningAssessmentId)}`;
  const goalPlanHref = activeProgram
    ? canManageProgram
      ? `${programHref ?? `/app/patients/${encodeURIComponent(relationshipId)}`}/goals/new${screeningQuery}`
      : programHref ?? `/app/patients/${encodeURIComponent(relationshipId)}`
    : `/app/patients/${encodeURIComponent(relationshipId)}/goals/new${screeningQuery}`;
  const legacy = detail.outcome.kind === "LEGACY" ? detail.outcome : null;
  const legacyResponses = detail.responses.kind === "LEGACY" ? detail.responses : null;
  return (
    <div className="max-w-5xl">
      <PageHeader
        actions={<OutcomeBadges outcome={detail.outcome} />}
        breadcrumbs={[
          {
            href: `/app/patients/${encodeURIComponent(detail.patient.patientHospitalRelationshipId)}`,
            label: "รายละเอียดผู้ป่วย",
          },
          {
            href: `/app/patients/${encodeURIComponent(detail.patient.patientHospitalRelationshipId)}/screenings`,
            label: "ประวัติการประเมิน",
          },
          { label: "รายละเอียดการประเมิน" },
        ]}
        description="ผลลัพธ์และคำตอบของแบบประเมินที่บันทึกไว้ในบริบทของโรงพยาบาลนี้"
        title="รายละเอียดการประเมิน"
      />

      <div className="space-y-6 pt-8">
        {legacy ? (
          <Alert variant="info">
            <p className="font-semibold">{SCREENING_PROTOTYPE_NOTICE_TITLE}</p>
            <p className="mt-1">{SCREENING_PROTOTYPE_NOTICE_BODY}</p>
          </Alert>
        ) : null}

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
              <dt className="text-sm text-text-muted">วันที่ส่ง</dt>
              <dd className="mt-1 font-semibold text-text">{formatDate(detail.submittedAt)}</dd>
            </div>
            <div>
              <dt className="text-sm text-text-muted">ผู้ทำแบบประเมิน</dt>
              <dd className="mt-1 font-semibold text-text">{detail.conductedByDisplayName}</dd>
            </div>
            <div>
              <dt className="text-sm text-text-muted">แบบประเมิน</dt>
              <dd className="mt-1 font-semibold text-text">{SCREENING_INSTRUMENT_LABELS[detail.instrument]}</dd>
            </div>
          </dl>
        </Panel>

        <Panel>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.02em]">ผลลัพธ์การประเมิน</h2>
              <p className="mt-1 text-sm leading-6 text-text-muted">คำนวณจากคำตอบที่บันทึกไว้</p>
            </div>
            <OutcomeBadges outcome={detail.outcome} />
          </div>
          {legacy ? (
            <dl className="mt-6 grid gap-4 border-y border-border py-5 sm:grid-cols-2">
              <div>
                <dt className="text-sm text-text-muted">คะแนนรวม PAM</dt>
                <dd className="mt-1 text-xl font-semibold text-text">{legacy.pamTotal}</dd>
              </div>
              <div>
                <dt className="text-sm text-text-muted">คะแนนรวม PROMs</dt>
                <dd className="mt-1 text-xl font-semibold text-text">{legacy.promsTotal}</dd>
              </div>
            </dl>
          ) : (
            <InstrumentResult outcome={detail.outcome} />
          )}
        </Panel>

        {legacyResponses ? (
          <>
            <Panel>
              <h2 className="text-xl font-semibold tracking-[-0.02em]">คำตอบ PAM</h2>
              <LegacyAnswerList detail={detail} section="PAM" />
            </Panel>

            <Panel>
              <h2 className="text-xl font-semibold tracking-[-0.02em]">คำตอบ PROMs</h2>
              <LegacyAnswerList detail={detail} section="PROMs" />
            </Panel>

            <Panel>
              <h2 className="text-xl font-semibold tracking-[-0.02em]">ความมั่นใจ</h2>
              <dl className="mt-5 divide-y divide-border border-y border-border">
                <div className="grid gap-1 py-4 sm:grid-cols-[14rem_minmax(0,1fr)] sm:gap-6">
                  <dt className="text-sm text-text-muted">คะแนนความมั่นใจ</dt>
                  <dd className="font-semibold text-text">{legacyResponses.confidenceScore} / 10</dd>
                </div>
                <div className="grid gap-1 py-4 sm:grid-cols-[14rem_minmax(0,1fr)] sm:gap-6">
                  <dt className="text-sm text-text-muted">แผนพัฒนาความมั่นใจ</dt>
                  <dd className="whitespace-pre-wrap text-sm leading-6 text-text">
                    {legacyResponses.confidenceImprovementPlan ?? "ไม่ได้ระบุ"}
                  </dd>
                </div>
              </dl>
            </Panel>
          </>
        ) : (
          <InstrumentAnswerList detail={detail} />
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-control bg-action-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-action-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            href={goalPlanHref}
          >
            {activeProgram
              ? canManageProgram
                ? "ไปยังแผนสุขภาพในโปรแกรมปัจจุบัน"
                : "ดูโปรแกรมปัจจุบัน"
              : "ไปยังแผนเป้าหมาย"}
          </Link>
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            href={`/app/patients/${encodeURIComponent(detail.patient.patientHospitalRelationshipId)}/screenings`}
          >
            กลับไปประวัติการประเมิน
          </Link>
          {canContinueAssignedScreening ? (
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              href={LINE_WEB_NAVIGATION_PATHS.START_OSM_SCREENING}
            >
              เลือกผู้ป่วยรายถัดไปเพื่อคัดกรอง
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default async function ScreeningDetailPage({
  params,
}: ScreeningDetailPageProps): Promise<React.JSX.Element> {
  await connection();
  const actor = await resolveActor();
  const { relationshipId, screeningId } = await params;
  let detail;
  let programContext;

  try {
    [detail, programContext] = await Promise.all([
      getScreeningDetail(actor, relationshipId, screeningId),
      getPatientProgramPageContext(actor, relationshipId),
    ]);
  } catch (error: unknown) {
    if (error instanceof NotFoundError) {
      notFound();
    }

    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    throw error;
  }

  return (
    <ScreeningDetailView
      activeProgram={programContext.active}
      canContinueAssignedScreening={
        decideOsmAssignedPatientReadPolicy({ actor, capability: PATIENT_READ_CAPABILITY }).allowed
      }
      canManageProgram={programContext.canManage}
      detail={detail}
    />
  );
}
