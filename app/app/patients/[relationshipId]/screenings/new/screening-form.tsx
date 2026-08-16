"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ScreeningQuestion, ScreeningQuestionSet } from "@/modules/screening/domain/question-sets";
import {
  initialScreeningActionState,
  type ScreeningActionState,
} from "@/modules/screening/transport/action-state";
import { submitScreeningAction } from "@/modules/screening/transport/server-actions";
import type { ScreeningPatientSummary } from "@/modules/screening/services/screening-access-service";

type ScreeningFormProps = {
  relationshipId: string;
  patient: ScreeningPatientSummary;
  questionSet: ScreeningQuestionSet;
  submissionNonce: string;
};

const confidenceScores = Array.from({ length: 11 }, (_, index) => index);

function questionOptionLabel(question: ScreeningQuestion, value: string): string {
  return question.options.find((option) => String(option.value) === value)?.label ?? "ยังไม่ได้ตอบ";
}

function QuestionGroup({
  question,
  value,
  disabled,
  onChange,
}: {
  question: ScreeningQuestion;
  value: string | undefined;
  disabled: boolean;
  onChange: (value: string) => void;
}): React.JSX.Element {
  return (
    <fieldset className="border-t border-border pt-5" disabled={disabled}>
      <legend className="w-full text-base font-semibold leading-7 text-text">
        <span className="block">{question.prompt}</span>
        <span className="mt-1 block text-xs font-normal text-text-muted">ต้องตอบ</span>
      </legend>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {question.options.map((option, index) => {
          const optionValue = String(option.value);
          const selected = value === optionValue;

          return (
            <label
              className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-control border px-4 py-3 text-sm transition-colors ${
                selected
                  ? "border-action-primary bg-brand-soft text-brand-strong"
                  : "border-border bg-surface hover:border-action-primary hover:bg-brand-soft/50"
              }`}
              key={option.value}
            >
              <input
                checked={selected}
                className="h-4 w-4 accent-brand"
                name={question.key}
                onChange={() => onChange(optionValue)}
                required={index === 0}
                type="radio"
                value={option.value}
              />
              <span>
                {option.value}. {option.label}
              </span>
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
      <p className="font-semibold">ส่ง Screening ไม่สำเร็จ</p>
      <p className="mt-1">{state.message}</p>
    </Alert>
  );
}

export function ScreeningForm({
  relationshipId,
  patient,
  questionSet,
  submissionNonce,
}: ScreeningFormProps): React.JSX.Element {
  const router = useRouter();
  const [state, action, pending] = useActionState<ScreeningActionState, FormData>(
    submitScreeningAction,
    initialScreeningActionState,
  );
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [confidenceScore, setConfidenceScore] = useState("");
  const [confidencePlan, setConfidencePlan] = useState("");

  useEffect(() => {
    if (state.status === "SUCCESS") {
      router.push(
        `/app/patients/${encodeURIComponent(relationshipId)}/screenings/${encodeURIComponent(state.result.screeningAssessmentId)}`,
      );
    }
  }, [relationshipId, router, state]);

  const questions = questionSet.questions;
  const pamQuestions = useMemo(
    () => questions.filter((question) => question.section === "PAM"),
    [questions],
  );
  const promsQuestions = useMemo(
    () => questions.filter((question) => question.section === "PROMs"),
    [questions],
  );
  const pamAnswered = pamQuestions.filter((question) => Boolean(answers[question.key])).length;
  const promsAnswered = promsQuestions.filter((question) => Boolean(answers[question.key])).length;
  const answeredCount = useMemo(
    () => questions.filter((question) => Boolean(answers[question.key])).length,
    [answers, questions],
  );
  const formComplete = answeredCount === questions.length && confidenceScore !== "";

  return (
    <div className="max-w-5xl">
      <PageHeader
        actions={<StatusBadge variant="warning">ต้นแบบเพื่อเก็บ Requirement</StatusBadge>}
        breadcrumbs={[
          {
            href: `/app/patients/${encodeURIComponent(relationshipId)}/screenings`,
            label: "ประวัติ Screening",
          },
          { label: "Screening ใหม่" },
        ]}
        description="แบบประเมินต้นแบบสำหรับทดลอง workflow และเก็บ feedback จากลูกค้า"
        title="เริ่ม Screening ใหม่"
      />

      <form action={action} className="space-y-6 pt-8">
        <input name="patientHospitalRelationshipId" type="hidden" value={relationshipId} />
        <input name="submissionNonce" type="hidden" value={submissionNonce} />

        <Alert variant="warning">
          <p className="font-semibold">ต้นแบบเพื่อเก็บ Requirement</p>
          <p className="mt-1">
            ข้อคำถามและเกณฑ์การประเมินในหน้านี้เป็นต้นแบบอ้างอิงรูปแบบจากระบบ DEMI เดิม
            และยังไม่ใช่ข้อกำหนดทางคลินิกฉบับสุดท้าย
          </p>
          <p className="mt-2 text-xs">Question set: {questionSet.version} · Scoring: legacy-prototype-v1</p>
        </Alert>

        <Panel>
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
        </Panel>

        <Panel>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.02em]">ส่วนที่ 1 — PAM</h2>
              <p className="mt-1 text-sm leading-6 text-text-muted">ตอบคำถามให้ครบทั้ง {pamQuestions.length} ข้อ โดยเลือกคำตอบที่ตรงที่สุด</p>
            </div>
            <StatusBadge variant={pamAnswered === pamQuestions.length ? "success" : "neutral"}>
              {pamAnswered}/{pamQuestions.length}
            </StatusBadge>
          </div>
          <div className="mt-6 space-y-6">
            {pamQuestions.map((question) => (
              <QuestionGroup
                disabled={pending}
                key={question.key}
                onChange={(value) => setAnswers((current) => ({ ...current, [question.key]: value }))}
                question={question}
                value={answers[question.key]}
              />
            ))}
          </div>
        </Panel>

        <Panel>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.02em]">ส่วนที่ 2 — PROMs</h2>
              <p className="mt-1 text-sm leading-6 text-text-muted">ตอบคำถามให้ครบทั้ง {promsQuestions.length} ข้อ โดยเลือกคำตอบที่ตรงที่สุด</p>
            </div>
            <StatusBadge variant={promsAnswered === promsQuestions.length ? "success" : "neutral"}>
              {promsAnswered}/{promsQuestions.length}
            </StatusBadge>
          </div>
          <div className="mt-6 space-y-6">
            {promsQuestions.map((question) => (
              <QuestionGroup
                disabled={pending}
                key={question.key}
                onChange={(value) => setAnswers((current) => ({ ...current, [question.key]: value }))}
                question={question}
                value={answers[question.key]}
              />
            ))}
          </div>
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em]">ส่วนที่ 3 — Confidence</h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            ส่วนนี้เป็นข้อมูลต้นแบบและอาจมีความอ่อนไหว กรุณากรอกเท่าที่จำเป็นต่อการทดลอง workflow
          </p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <label className="block space-y-2 text-sm font-semibold">
              <span>ความมั่นใจในการดูแลสุขภาพ (0–10)</span>
              <Select
                disabled={pending}
                name="confidenceScore"
                onChange={(event) => setConfidenceScore(event.target.value)}
                required
                value={confidenceScore}
              >
                <option disabled value="">
                  เลือกคะแนน
                </option>
                {confidenceScores.map((score) => (
                  <option key={score} value={score}>
                    {score}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block space-y-2 text-sm font-semibold sm:col-span-2">
              <span>แผนพัฒนาความมั่นใจ (ไม่บังคับ)</span>
              <textarea
                className="min-h-28 w-full rounded-control border border-border bg-surface px-4 py-3 text-base font-normal text-text outline-none transition-[border-color,box-shadow] placeholder:text-text-subtle focus:border-action-primary focus:ring-4 focus:ring-focus-ring disabled:cursor-not-allowed disabled:bg-surface-muted"
                disabled={pending}
                maxLength={1000}
                name="confidenceImprovementPlan"
                onChange={(event) => setConfidencePlan(event.target.value)}
                placeholder="บันทึกสั้น ๆ เฉพาะที่จำเป็นต่อการทดลองต้นแบบ"
                value={confidencePlan}
              />
              <span className="block text-xs font-normal text-text-subtle">ไม่เกิน 1,000 ตัวอักษร</span>
            </label>
          </div>
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em]">ตรวจสอบก่อนส่ง</h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            ตอบแล้ว {answeredCount}/{questions.length} ข้อ
            {confidenceScore === "" ? " · ยังไม่ได้เลือก Confidence" : " · Confidence พร้อมแล้ว"}
          </p>
          <div className="mt-5 grid gap-5 border-t border-border pt-5 sm:grid-cols-2">
            {(["PAM", "PROMs"] as const).map((section) => (
              <div key={section}>
                <h3 className="font-semibold text-text">{section}</h3>
                <ul className="mt-2 space-y-2 text-sm leading-6 text-text-muted">
                  {(section === "PAM" ? pamQuestions : promsQuestions).map((question) => (
                    <li className="flex gap-2" key={question.key}>
                      <span aria-hidden="true">•</span>
                      <span>
                        {question.key}: {questionOptionLabel(question, answers[question.key] ?? "")}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-5 text-xs leading-5 text-text-subtle">
            ผลลัพธ์จะคำนวณใหม่จากคำตอบฝั่งเซิร์ฟเวอร์เสมอ ค่าที่คำนวณในเบราว์เซอร์ไม่มีอำนาจยืนยันผล
          </p>
          <ActionFeedback state={state} />
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button disabled={pending || !formComplete} type="submit">
              {pending ? "กำลังตรวจสอบและบันทึก..." : "ตรวจสอบและส่ง Screening"}
            </Button>
            <Link
              className="inline-flex min-h-12 items-center justify-center rounded-control border border-border-strong bg-surface px-5 py-2.5 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              href={`/app/patients/${encodeURIComponent(relationshipId)}/screenings`}
            >
              ยกเลิก
            </Link>
          </div>
        </Panel>
      </form>
    </div>
  );
}
