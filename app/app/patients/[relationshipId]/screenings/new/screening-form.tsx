"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { useMutationActionState } from "@/components/ui/mutation-action-state";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import type { InstrumentQuestion, InstrumentQuestionSet } from "@/modules/screening/domain/question-sets";
import {
  initialScreeningActionState,
  type ScreeningActionState,
} from "@/modules/screening/transport/action-state";
import { submitScreeningAction } from "@/modules/screening/transport/server-actions";
import type { ScreeningPatientSummary } from "@/modules/screening/services/screening-access-service";

type ScreeningFormProps = {
  relationshipId: string;
  patient: Pick<ScreeningPatientSummary, "displayName" | "hospitalNumber"> & { hospital: Pick<ScreeningPatientSummary["hospital"], "name"> };
  questionSet: InstrumentQuestionSet;
  submissionNonce: string;
  /** Present when the screening is performed from round 1 of a Program (WB-DF-01). */
  programId?: string;
  programRoundNumber?: number;
  patientMode?: boolean;
  embedded?: boolean;
  nextHref?: string;
};

/** R2-B: the booklet shows five faces from worst (1) to best (5). */
const PROMS_FACES: Readonly<Record<number, string>> = { 1: "😣", 2: "🙁", 3: "😐", 4: "🙂", 5: "😄" };

function QuestionGroup({
  number,
  question,
  value,
  disabled,
  faces,
  onChange,
  patientMode = false,
}: {
  patientMode?: boolean;
  number: number;
  question: InstrumentQuestion;
  value: string | undefined;
  disabled: boolean;
  faces: boolean;
  onChange: (value: string) => void;
}): React.JSX.Element {
  return (
    <fieldset className="border-t border-border pt-5" disabled={disabled}>
      <legend className="w-full text-base font-semibold leading-7 text-text">
        <span className="block">
          {number}. {question.prompt}
        </span>
        {question.hint ? <span className="mt-1 block text-sm font-normal text-text-muted">{question.hint}</span> : null}
        <span className="mt-1 block text-xs font-normal text-text-muted">ต้องตอบ</span>
      </legend>
      {question.guidance && !patientMode ? (
        <p className="mt-3 rounded-control bg-surface-muted px-3 py-2 text-sm leading-6 text-text-muted">
          คำแนะนำสำหรับผู้ประเมิน: {question.guidance}
        </p>
      ) : null}
      <div className={`mt-4 grid gap-2 ${faces ? "grid-cols-5" : "sm:grid-cols-2"}`}>
        {question.options.map((option, index) => {
          const optionValue = String(option.value);
          const selected = value === optionValue;

          return (
            <label
              className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-control border px-4 py-3 text-sm transition-colors ${
                faces ? "flex-col justify-center gap-1 px-2 text-center" : ""
              } ${
                selected
                  ? "border-action-primary bg-brand-soft text-brand-strong"
                  : "border-border bg-surface hover:border-action-primary hover:bg-brand-soft/50"
              }`}
              key={option.value}
            >
              <input
                checked={selected}
                className={faces ? "sr-only" : "h-4 w-4 accent-brand"}
                name={question.key}
                onChange={() => onChange(optionValue)}
                required={index === 0}
                type="radio"
                value={option.value}
              />
              {faces ? (
                <>
                  <span aria-hidden="true" className="text-2xl leading-none">
                    {PROMS_FACES[option.value]}
                  </span>
                  <span className="font-semibold">{option.label}</span>
                </>
              ) : (
                <span>{option.label}</span>
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function ActionFeedback({ state }: { state: ScreeningActionState }): React.JSX.Element | null {
  if (state.status !== "ERROR") {
    return null;
  }

  return (
    <Alert className="mt-5" variant={state.code === "CONFLICT" ? "warning" : "danger"}>
      <p className="font-semibold">บันทึกแบบประเมินไม่สำเร็จ</p>
      <p className="mt-1">{state.message}</p>
    </Alert>
  );
}

export function ScreeningForm({
  relationshipId,
  patient,
  questionSet,
  submissionNonce,
  programId,
  programRoundNumber = 1,
  patientMode = false,
  embedded = false,
  nextHref,
}: ScreeningFormProps): React.JSX.Element {
  const router = useRouter();
  const [state, action, pending, unknownOutcome, resendUnconfirmed] = useMutationActionState<ScreeningActionState, FormData>(
    submitScreeningAction,
    initialScreeningActionState,
  );
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const instrumentLabel = questionSet.instrument === "PAM" ? "PAM" : "PROMs";

  useEffect(() => {
    if (state.status === "SUCCESS") {
      router.push(
        nextHref ?? (programId
          ? `/app/patients/${encodeURIComponent(relationshipId)}/programs/${encodeURIComponent(programId)}/rounds/${programRoundNumber}?after=${questionSet.instrument}`
          : `/app/patients/${encodeURIComponent(relationshipId)}/screenings/${encodeURIComponent(state.result.screeningAssessmentId)}`),
      );
    }
  }, [nextHref, programId, programRoundNumber, questionSet.instrument, relationshipId, router, state]);

  const questions = questionSet.questions;
  const answeredCount = questions.filter((question) => Boolean(answers[question.key])).length;
  const formComplete = answeredCount === questions.length;
  const locked = pending || unknownOutcome || state.status === "SUCCESS";

  return (
    <div className="max-w-5xl">
      {!embedded ? <PageHeader
        actions={<StatusBadge variant="info">แบบประเมิน {instrumentLabel}</StatusBadge>}
        breadcrumbs={[
          {
            href: `/app/patients/${encodeURIComponent(relationshipId)}/screenings`,
            label: "ประวัติการประเมิน",
          },
          { label: "แบบประเมินใหม่" },
        ]}
        description={patientMode ? "ตอบแบบประเมินของคุณในครั้งบริการที่เปิดอยู่" : "บันทึกคำตอบและผลการประเมินของผู้ป่วยในโรงพยาบาลนี้"}
        title={questionSet.title}
      /> : null}

      <form action={action} className="space-y-6 pt-8">
        <input name="patientHospitalRelationshipId" type="hidden" value={relationshipId} />
        <input name="submissionNonce" type="hidden" value={submissionNonce} />
        <input name="instrument" type="hidden" value={questionSet.instrument} />
        {programId ? <input name="patientProgramId" type="hidden" value={programId} /> : null}

        {programId ? null : (
          <Alert variant="warning">
            แบบประเมินนี้บันทึกนอก Program จึงจะไม่อยู่ในรายงานโรงพยาบาลตาม Program (ไฟล์ Excel)
            หากต้องการให้อยู่ในรายงาน ให้บันทึกจากครั้งที่ของ Program ของผู้ป่วยรายนี้
          </Alert>
        )}

        {!patientMode ? <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em]">ผู้ป่วยและบริบทโรงพยาบาล</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-text-muted">ผู้ป่วย</p>
              <p className="mt-1 text-lg font-semibold text-text">{patient.displayName}</p>
            </div>
            <div>
              <p className="text-sm text-text-muted">โรงพยาบาล</p>
              <p className="mt-1 text-lg font-semibold text-text">{patient.hospital.name}</p>
            </div>
          </div>
          <p className="mt-4 text-sm leading-6 text-text-muted">
            HN ของโรงพยาบาลนี้: {patient.hospitalNumber ?? "ไม่ระบุ"}
          </p>
        </Panel> : null}

        <Panel>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="max-w-3xl space-y-2">
              {(patientMode ? ["เลือกคำตอบที่ตรงกับความรู้สึกและประสบการณ์ของคุณในตอนนี้"] : questionSet.intro).map((paragraph) => (
                <p className="text-sm leading-6 text-text-muted" key={paragraph}>
                  {paragraph}
                </p>
              ))}
              {questionSet.scaleLabel ? (
                <p className="text-sm font-semibold leading-6 text-text">{questionSet.scaleLabel}</p>
              ) : null}
              <p className="text-sm leading-6 text-text-muted">เลือกคำตอบเดียวในแต่ละข้อ ตอบให้ครบทั้ง {questions.length} ข้อ</p>
            </div>
            <StatusBadge variant={formComplete ? "success" : "neutral"}>
              {answeredCount}/{questions.length}
            </StatusBadge>
          </div>
          <div className="mt-6 space-y-6">
            {questions.map((question, index) => (
              <QuestionGroup
                patientMode={patientMode}
                disabled={locked}
                faces={questionSet.instrument === "PROMS"}
                key={question.key}
                number={index + 1}
                onChange={(value) => setAnswers((current) => ({ ...current, [question.key]: value }))}
                question={question}
                value={answers[question.key]}
              />
            ))}
          </div>
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em]">ตรวจสอบก่อนส่ง</h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            ตอบแล้ว {answeredCount}/{questions.length} ข้อ
          </p>
          <p className="mt-2 text-xs leading-5 text-text-subtle">
            ผลลัพธ์จะคำนวณจากคำตอบที่ส่งเมื่อบันทึกแบบประเมิน
          </p>
          <ActionFeedback state={state} />
          <UnknownOutcomeAlert active={unknownOutcome} className="mt-5" recovery={{ kind: "resend", onResend: resendUnconfirmed, resending: pending }} />
          {state.status === "SUCCESS" ? (
            <Alert className="mt-5" variant="success">บันทึกแล้ว กำลังเปิดรายการที่บันทึก...</Alert>
          ) : null}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button disabled={locked || !formComplete} loading={pending} type="submit">
              {pending ? "กำลังตรวจสอบและบันทึก..." : "ตรวจสอบและบันทึกแบบประเมิน"}
            </Button>
            <Link
              className="inline-flex min-h-12 items-center justify-center rounded-control border border-border-strong bg-surface px-5 py-2.5 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              href={nextHref ?? `/app/patients/${encodeURIComponent(relationshipId)}/screenings`}
            >
              ยกเลิก
            </Link>
          </div>
        </Panel>
      </form>
    </div>
  );
}
