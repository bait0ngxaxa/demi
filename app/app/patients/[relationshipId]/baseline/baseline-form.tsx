"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, inputClassName } from "@/components/ui/input";
import { ModalDialog } from "@/components/ui/modal-dialog";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { useMutationActionState } from "@/components/ui/mutation-action-state";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import type { PatientBaselinePatientSummary } from "@/modules/patient-baseline/services/patient-baseline-access-service";
import {
  initialPatientBaselineActionState,
  type PatientBaselineActionState,
} from "@/modules/patient-baseline/transport/action-state";
import { createPatientBaselineAction } from "@/modules/patient-baseline/transport/server-actions";

type PatientBaselineFormProps = {
  relationshipId: string;
  patient: PatientBaselinePatientSummary;
};

const labelClassName = "block space-y-2 text-sm font-semibold text-text";

/** Field labels shared by the entry form and the review summary so both always say the same thing. */
const baselineLabels = {
  recordedOn: "วันที่บันทึก",
  weight: "น้ำหนัก (kg)",
  heightCm: "ส่วนสูง (cm)",
  waistCircumference: "รอบเอว (cm)",
  bloodPressureSystolic: "ความดันตัวบน (mmHg)",
  bloodPressureDiastolic: "ความดันตัวล่าง (mmHg)",
  bloodSugarDtx: "ระดับน้ำตาลในเลือด (DTX / mg/dL)",
  hba1c: "HbA1c (%)",
  cvdRiskScore: "CVD risk score (%)",
  adaptationSummary: "สรุปการปรับตัว",
  adaptationObstacles: "อุปสรรค",
  adaptationOpportunities: "โอกาส / ปัจจัยสนับสนุน",
  confidenceScore: "คะแนนความมั่นใจ (0–10)",
  confidenceImprovementPlan: "แนวทางเพิ่มความมั่นใจ",
  summary: "สรุปข้อมูลตั้งต้น",
  recommendations: "คำแนะนำ",
} as const;

const baselineSectionTitles = {
  measurements: "ข้อมูลสุขภาพตั้งต้น",
  adaptation: "การปรับตัว / สภาพเริ่มต้น",
  confidence: "ความมั่นใจ",
  summary: "สรุป",
} as const;

const unrecordedLabel = "ไม่ได้บันทึก";

type ReviewField = { label: string; value: string; multiline?: boolean };
type ReviewSection = { title: string; fields: readonly ReviewField[] };

function getTodayDateOnly(): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      day: "2-digit",
      month: "2-digit",
      timeZone: "Asia/Bangkok",
      year: "numeric",
    })
      .formatToParts(new Date())
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function ActionFeedback({ state }: { state: PatientBaselineActionState }): React.JSX.Element | null {
  if (state.status !== "ERROR") {
    return null;
  }

  return (
    <Alert className="mt-5" variant={state.code === "CONFLICT" ? "warning" : "danger"}>
      <p className="font-semibold">บันทึกข้อมูลตั้งต้นไม่สำเร็จ</p>
      <p className="mt-1">{state.message}</p>
    </Alert>
  );
}

/**
 * Shows exactly what the user entered, grouped like the form. A blank field is shown as
 * not recorded (never zero) and nothing is calculated, converted or interpreted.
 */
function BaselineReviewSummary({ sections }: { sections: readonly ReviewSection[] }): React.JSX.Element {
  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <section aria-label={section.title} className="space-y-3" key={section.title}>
          <h3 className="text-base font-semibold text-text">{section.title}</h3>
          <dl className="divide-y divide-border overflow-hidden rounded-panel border border-border">
            {section.fields.map((field) => {
              const recorded = field.value.trim();
              return (
                <div className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:gap-4" key={field.label}>
                  <dt className="text-sm text-text-muted">{field.label}</dt>
                  <dd
                    className={
                      recorded
                        ? `min-w-0 break-words text-sm font-semibold text-text ${field.multiline ? "whitespace-pre-wrap" : ""}`
                        : "text-sm italic text-text-subtle"
                    }
                    data-recorded={recorded ? "true" : "false"}
                  >
                    {recorded || unrecordedLabel}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>
      ))}
    </div>
  );
}

export function PatientBaselineForm({
  patient,
  relationshipId,
}: PatientBaselineFormProps): React.JSX.Element {
  const router = useRouter();
  const [state, action, pending, unknownOutcome, resendUnconfirmed] = useMutationActionState<PatientBaselineActionState, FormData>(
    // A fresh object per confirmed result lets the review dialog tell a new answer from the one it opened with.
    async (previous, formData) => ({ ...(await createPatientBaselineAction(previous, formData)) }),
    initialPatientBaselineActionState,
  );
  const [recordedOn, setRecordedOn] = useState<string>(getTodayDateOnly);
  const [weight, setWeight] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [waistCircumference, setWaistCircumference] = useState("");
  const [bloodPressureSystolic, setBloodPressureSystolic] = useState("");
  const [bloodPressureDiastolic, setBloodPressureDiastolic] = useState("");
  const [bloodSugarDtx, setBloodSugarDtx] = useState("");
  const [hba1c, setHba1c] = useState("");
  const [cvdRiskScore, setCvdRiskScore] = useState("");
  const [adaptationSummary, setAdaptationSummary] = useState("");
  const [adaptationObstacles, setAdaptationObstacles] = useState("");
  const [adaptationOpportunities, setAdaptationOpportunities] = useState("");
  const [confidenceScore, setConfidenceScore] = useState("");
  const [confidenceImprovementPlan, setConfidenceImprovementPlan] = useState("");
  const [summary, setSummary] = useState("");
  const [recommendations, setRecommendations] = useState("");
  // The review stays open for the action state it was opened with; any newer confirmed result closes it.
  const [review, setReview] = useState<{ openedWith: PatientBaselineActionState } | null>(null);
  const submissionLock = useRef(false);
  // Set when the review sends a request: a review that closes afterwards closed on a confirmed failure.
  const submittedFromReview = useRef(false);
  const reviewTrigger = useRef<HTMLButtonElement>(null);
  const returnToEdit = useRef<HTMLButtonElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const errorFeedback = useRef<HTMLDivElement>(null);
  const succeeded = state.status === "SUCCESS";
  const reviewOpen = review !== null && (review.openedWith === state || pending || unknownOutcome || succeeded);
  const reviewLocked = pending || unknownOutcome || succeeded;

  useEffect(() => {
    if (state.status === "SUCCESS") {
      router.replace(
        `/app/patients/${encodeURIComponent(relationshipId)}/baseline`,
      );
    }
  }, [relationshipId, router, state]);

  useEffect(() => {
    // A request releases the single-flight lock only after it has settled.
    if (!pending) {
      submissionLock.current = false;
    }
  }, [pending]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    if (!reviewOpen) {
      // Native constraint validation already passed; opening the review never dispatches.
      event.preventDefault();
      if (!reviewLocked) {
        submittedFromReview.current = false;
        setReview({ openedWith: state });
      }
      return;
    }

    if (submitter !== confirmButton.current || reviewLocked || submissionLock.current) {
      event.preventDefault();
      return;
    }

    submissionLock.current = true;
    submittedFromReview.current = true;
  }

  function resend(): void {
    if (submissionLock.current || pending) {
      return;
    }
    submissionLock.current = true;
    submittedFromReview.current = true;
    resendUnconfirmed();
  }

  function closeReview(): void {
    if (reviewLocked) {
      return;
    }
    setReview(null);
  }

  const reviewSections: readonly ReviewSection[] = [
    {
      title: baselineSectionTitles.measurements,
      fields: [
        { label: baselineLabels.weight, value: weight },
        { label: baselineLabels.heightCm, value: heightCm },
        { label: baselineLabels.waistCircumference, value: waistCircumference },
        { label: baselineLabels.bloodPressureSystolic, value: bloodPressureSystolic },
        { label: baselineLabels.bloodPressureDiastolic, value: bloodPressureDiastolic },
        { label: baselineLabels.bloodSugarDtx, value: bloodSugarDtx },
        { label: baselineLabels.hba1c, value: hba1c },
        { label: baselineLabels.cvdRiskScore, value: cvdRiskScore },
      ],
    },
    {
      title: baselineSectionTitles.adaptation,
      fields: [
        { label: baselineLabels.adaptationSummary, value: adaptationSummary, multiline: true },
        { label: baselineLabels.adaptationObstacles, value: adaptationObstacles, multiline: true },
        { label: baselineLabels.adaptationOpportunities, value: adaptationOpportunities, multiline: true },
      ],
    },
    {
      title: baselineSectionTitles.confidence,
      fields: [
        { label: baselineLabels.confidenceScore, value: confidenceScore },
        { label: baselineLabels.confidenceImprovementPlan, value: confidenceImprovementPlan, multiline: true },
      ],
    },
    {
      title: baselineSectionTitles.summary,
      fields: [
        { label: baselineLabels.summary, value: summary, multiline: true },
        { label: baselineLabels.recommendations, value: recommendations, multiline: true },
      ],
    },
  ];

  return (
    <div className="max-w-5xl">
      <PageHeader
        actions={<StatusBadge variant="info">ข้อมูลตั้งต้น</StatusBadge>}
        breadcrumbs={[
          {
            href: `/app/patients/${encodeURIComponent(relationshipId)}`,
            label: "รายละเอียดผู้ป่วย",
          },
          { label: "ข้อมูลตั้งต้น" },
        ]}
        description="บันทึกข้อมูลอ้างอิงเริ่มต้นของผู้ป่วยในโรงพยาบาลนี้"
        title="ข้อมูลตั้งต้น"
      />

      <form action={action} className="space-y-6 pt-8" onSubmit={handleSubmit}>
        <input name="patientHospitalRelationshipId" type="hidden" value={relationshipId} />

        <Alert variant="warning">
          <p className="font-semibold">ตรวจสอบข้อมูลก่อนบันทึก</p>
          <p className="mt-1">
            ข้อมูลตั้งต้นจะถูกบันทึกเป็นข้อมูลอ้างอิงและยังไม่รองรับการแก้ไข กรุณาตรวจสอบข้อมูลก่อนบันทึก
          </p>
          <p className="mt-2">
            ช่องว่างหมายถึงยังไม่มีข้อมูล ระบบจะไม่เติมค่าแทนและจะไม่คำนวณการแปลผลทางคลินิกอัตโนมัติ
          </p>
        </Alert>

        <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-text">ผู้ป่วยและบริบทโรงพยาบาล</h2>
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
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-text">ข้อมูลตั้งต้น</h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <label className={labelClassName} htmlFor="baseline-recorded-on">
              <span>{baselineLabels.recordedOn}</span>
              <Input
                aria-required="true"
                id="baseline-recorded-on"
                name="recordedOn"
                onChange={(event) => setRecordedOn(event.target.value)}
                readOnly={pending}
                required
                type="date"
                value={recordedOn}
              />
              <span className="text-xs font-normal leading-5 text-text-muted">
                วันที่นี้คือวันที่ข้อมูลเริ่มต้นถูกบันทึกหรือใช้เป็นจุดอ้างอิง ไม่ใช่เวลาที่ระบบสร้างรายการ
              </span>
            </label>
          </div>
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-text">{baselineSectionTitles.measurements}</h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            กรอกเฉพาะข้อมูลที่มี โดยระบบจะเก็บตามหน่วยที่ระบุและยังไม่แปลผลหรือจัดกลุ่มความเสี่ยงอัตโนมัติ
          </p>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <label className={labelClassName} htmlFor="baseline-weight">
              <span>{baselineLabels.weight}</span>
              <Input
                id="baseline-weight"
                inputMode="decimal"
                max={1_000_000}
                min={0.01}
                name="weight"
                onChange={(event) => setWeight(event.target.value)}
                placeholder="ไม่บังคับ"
                readOnly={pending}
                step="any"
                type="number"
                value={weight}
              />
            </label>
            <label className={labelClassName} htmlFor="baseline-height-cm">
              <span>{baselineLabels.heightCm}</span>
              <Input
                id="baseline-height-cm"
                inputMode="decimal"
                max={1_000_000}
                min={0.01}
                name="heightCm"
                onChange={(event) => setHeightCm(event.target.value)}
                placeholder="ไม่บังคับ"
                readOnly={pending}
                step="any"
                type="number"
                value={heightCm}
              />
            </label>
            <label className={labelClassName} htmlFor="baseline-waist">
              <span>{baselineLabels.waistCircumference}</span>
              <Input
                id="baseline-waist"
                inputMode="decimal"
                max={1_000_000}
                min={0.01}
                name="waistCircumference"
                onChange={(event) => setWaistCircumference(event.target.value)}
                placeholder="ไม่บังคับ"
                readOnly={pending}
                step="any"
                type="number"
                value={waistCircumference}
              />
            </label>
            <label className={labelClassName} htmlFor="baseline-blood-pressure-systolic">
              <span>{baselineLabels.bloodPressureSystolic}</span>
              <Input
                id="baseline-blood-pressure-systolic"
                inputMode="decimal"
                max={1_000_000}
                min={0.01}
                name="bloodPressureSystolic"
                onChange={(event) => setBloodPressureSystolic(event.target.value)}
                placeholder="ไม่บังคับ"
                readOnly={pending}
                step="any"
                type="number"
                value={bloodPressureSystolic}
              />
            </label>
            <label className={labelClassName} htmlFor="baseline-blood-pressure-diastolic">
              <span>{baselineLabels.bloodPressureDiastolic}</span>
              <Input
                id="baseline-blood-pressure-diastolic"
                inputMode="decimal"
                max={1_000_000}
                min={0.01}
                name="bloodPressureDiastolic"
                onChange={(event) => setBloodPressureDiastolic(event.target.value)}
                placeholder="ไม่บังคับ"
                readOnly={pending}
                step="any"
                type="number"
                value={bloodPressureDiastolic}
              />
            </label>
            <label className={labelClassName} htmlFor="baseline-blood-sugar-dtx">
              <span>{baselineLabels.bloodSugarDtx}</span>
              <Input
                id="baseline-blood-sugar-dtx"
                inputMode="decimal"
                max={1_000_000}
                min={0.01}
                name="bloodSugarDtx"
                onChange={(event) => setBloodSugarDtx(event.target.value)}
                placeholder="ไม่บังคับ"
                readOnly={pending}
                step="any"
                type="number"
                value={bloodSugarDtx}
              />
            </label>
            <label className={labelClassName} htmlFor="baseline-hba1c">
              <span>{baselineLabels.hba1c}</span>
              <Input
                id="baseline-hba1c"
                inputMode="decimal"
                max={1_000_000}
                min={0.01}
                name="hba1c"
                onChange={(event) => setHba1c(event.target.value)}
                placeholder="ไม่บังคับ"
                readOnly={pending}
                step="any"
                type="number"
                value={hba1c}
              />
            </label>
            <label className={labelClassName} htmlFor="baseline-cvd-risk-score">
              <span>{baselineLabels.cvdRiskScore}</span>
              <Input
                id="baseline-cvd-risk-score"
                inputMode="decimal"
                max={100}
                min={0}
                name="cvdRiskScore"
                onChange={(event) => setCvdRiskScore(event.target.value)}
                placeholder="ไม่บังคับ · 0–100 ทศนิยม 1 ตำแหน่ง"
                readOnly={pending}
                step={0.1}
                type="number"
                value={cvdRiskScore}
              />
            </label>
          </div>
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-text">{baselineSectionTitles.adaptation}</h2>
          <div className="mt-6 grid gap-5">
            <label className={labelClassName} htmlFor="baseline-adaptation-summary">
              <span>{baselineLabels.adaptationSummary}</span>
              <textarea
                className={`${inputClassName} min-h-28 py-3`}
                id="baseline-adaptation-summary"
                maxLength={2_000}
                name="adaptationSummary"
                onChange={(event) => setAdaptationSummary(event.target.value)}
                placeholder="บันทึกสภาพเริ่มต้นตามที่สังเกตหรือพูดคุย"
                readOnly={pending}
                value={adaptationSummary}
              />
            </label>
            <label className={labelClassName} htmlFor="baseline-adaptation-obstacles">
              <span>{baselineLabels.adaptationObstacles}</span>
              <textarea
                className={`${inputClassName} min-h-28 py-3`}
                id="baseline-adaptation-obstacles"
                maxLength={2_000}
                name="adaptationObstacles"
                onChange={(event) => setAdaptationObstacles(event.target.value)}
                placeholder="สิ่งที่ทำให้การปรับตัวทำได้ยาก"
                readOnly={pending}
                value={adaptationObstacles}
              />
            </label>
            <label className={labelClassName} htmlFor="baseline-adaptation-opportunities">
              <span>{baselineLabels.adaptationOpportunities}</span>
              <textarea
                className={`${inputClassName} min-h-28 py-3`}
                id="baseline-adaptation-opportunities"
                maxLength={2_000}
                name="adaptationOpportunities"
                onChange={(event) => setAdaptationOpportunities(event.target.value)}
                placeholder="ปัจจัยที่ช่วยสนับสนุนการดูแลต่อไป"
                readOnly={pending}
                value={adaptationOpportunities}
              />
            </label>
          </div>
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-text">{baselineSectionTitles.confidence}</h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            คะแนน 0–10 ใช้เพื่อบันทึกระดับความมั่นใจ ไม่ใช่คะแนนวินิจฉัยหรือผลลัพธ์ทางคลินิก
          </p>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <label className={labelClassName} htmlFor="baseline-confidence-score">
              <span>{baselineLabels.confidenceScore}</span>
              <Input
                id="baseline-confidence-score"
                inputMode="numeric"
                max={10}
                min={0}
                name="confidenceScore"
                onChange={(event) => setConfidenceScore(event.target.value)}
                placeholder="ไม่บังคับ"
                readOnly={pending}
                step={1}
                type="number"
                value={confidenceScore}
              />
            </label>
            <label className={labelClassName} htmlFor="baseline-confidence-plan">
              <span>{baselineLabels.confidenceImprovementPlan}</span>
              <textarea
                className={`${inputClassName} min-h-28 py-3`}
                id="baseline-confidence-plan"
                maxLength={2_000}
                name="confidenceImprovementPlan"
                onChange={(event) => setConfidenceImprovementPlan(event.target.value)}
                placeholder="สิ่งที่อยากทดลองหรือสนับสนุนต่อ"
                readOnly={pending}
                value={confidenceImprovementPlan}
              />
            </label>
          </div>
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-text">{baselineSectionTitles.summary}</h2>
          <div className="mt-6 grid gap-5">
            <label className={labelClassName} htmlFor="baseline-summary">
              <span>{baselineLabels.summary}</span>
              <textarea
                className={`${inputClassName} min-h-32 py-3`}
                id="baseline-summary"
                maxLength={2_000}
                name="summary"
                onChange={(event) => setSummary(event.target.value)}
                placeholder="สรุปข้อมูลที่ต้องการเก็บไว้เป็นจุดอ้างอิง"
                readOnly={pending}
                value={summary}
              />
            </label>
            <label className={labelClassName} htmlFor="baseline-recommendations">
              <span>{baselineLabels.recommendations}</span>
              <textarea
                className={`${inputClassName} min-h-32 py-3`}
                id="baseline-recommendations"
                maxLength={2_000}
                name="recommendations"
                onChange={(event) => setRecommendations(event.target.value)}
                placeholder="ข้อความที่ต้องการบันทึกไว้ โดยไม่มีการสร้างคำแนะนำอัตโนมัติ"
                readOnly={pending}
                value={recommendations}
              />
            </label>
          </div>
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-text">ตรวจสอบและบันทึก</h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            เมื่อบันทึกแล้ว ข้อมูลตั้งต้นจะเป็นข้อมูลอ่านอย่างเดียว ไม่มีการแก้ไข ลบ หรือแทนที่รายการเดิม
          </p>
          <div ref={errorFeedback} tabIndex={-1} className="focus-visible:outline-none">
            {reviewOpen ? null : <ActionFeedback state={state} />}
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button disabled={reviewLocked} ref={reviewTrigger} type="submit">
              ตรวจสอบข้อมูลก่อนบันทึก
            </Button>
            <Link
              className="inline-flex min-h-12 items-center justify-center rounded-control border border-border-strong bg-surface px-5 py-2.5 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              href={`/app/patients/${encodeURIComponent(relationshipId)}`}
            >
              ยกเลิก
            </Link>
          </div>
        </Panel>

        {reviewOpen ? (
          <ModalDialog
            description="ตรวจสอบข้อมูลที่กรอกก่อนยืนยัน ข้อมูลตั้งต้นที่บันทึกแล้วเป็นข้อมูลอ่านอย่างเดียว"
            dismissible={!reviewLocked}
            footer={
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <Button
                  className="w-full sm:w-auto"
                  disabled={reviewLocked}
                  onClick={closeReview}
                  ref={returnToEdit}
                  variant="secondary"
                >
                  กลับไปแก้ไข
                </Button>
                <Button
                  className="w-full sm:w-auto"
                  disabled={unknownOutcome || succeeded}
                  loading={pending}
                  ref={confirmButton}
                  type="submit"
                >
                  {pending ? "กำลังบันทึก…" : "ยืนยันบันทึกข้อมูลตั้งต้น"}
                </Button>
              </div>
            }
            initialFocusRef={returnToEdit}
            onRequestClose={closeReview}
            returnFocusTarget={() => (submittedFromReview.current ? errorFeedback.current : null) ?? reviewTrigger.current}
            size="fullscreen"
            title="ตรวจสอบข้อมูลตั้งต้นก่อนบันทึก"
          >
            <div className="space-y-6">
              <section aria-label="บริบทการบันทึก" className="grid gap-4 rounded-panel bg-surface-muted px-4 py-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-text-muted">ผู้ป่วย</p>
                  <p className="mt-1 font-semibold text-text">{patient.displayName}</p>
                  <p className="mt-1 text-sm text-text-muted">HN ของโรงพยาบาลนี้: {patient.hospitalNumber ?? "ไม่ระบุ"}</p>
                </div>
                <div>
                  <p className="text-sm text-text-muted">โรงพยาบาล</p>
                  <p className="mt-1 font-semibold text-text">{patient.hospital.name}</p>
                </div>
                <div>
                  <p className="text-sm text-text-muted">{baselineLabels.recordedOn}</p>
                  <p className="mt-1 font-semibold text-text">
                    <time dateTime={recordedOn}>{recordedOn}</time>
                  </p>
                </div>
              </section>
              <Alert variant="warning">
                <p className="font-semibold">เมื่อยืนยัน ระบบจะสร้างข้อมูลตั้งต้นแบบอ่านอย่างเดียว</p>
                <p className="mt-1">
                  ข้อมูลนี้จะใช้เป็นจุดอ้างอิงของผู้ป่วยในโรงพยาบาลนี้ และไม่สามารถแก้ไข ลบ หรือแทนที่ได้ภายหลัง
                  ช่องที่แสดง “{unrecordedLabel}” จะถูกเก็บเป็นไม่มีข้อมูล ไม่ใช่ค่าศูนย์ และระบบไม่แปลผลทางคลินิกอัตโนมัติ
                </p>
              </Alert>
              <BaselineReviewSummary sections={reviewSections} />
              <UnknownOutcomeAlert active={unknownOutcome} recovery={{ kind: "resend", onResend: resend, resending: pending }} />
              {succeeded ? (
                <Alert role="status" variant="success">บันทึกแล้ว กำลังเปิดรายการที่บันทึก...</Alert>
              ) : null}
            </div>
          </ModalDialog>
        ) : null}
      </form>
    </div>
  );
}
