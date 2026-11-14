"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { VITALS_MEASUREMENT_LABELS } from "@/modules/patient-program-rounds/domain/round-steps";
import { buildRoundReturnQuery } from "@/modules/patient-program-rounds/presentation/round-return-path";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { dispatchFormDataPreservingInput, useMutationActionState } from "@/components/ui/mutation-action-state";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import {
  APPOINTMENT_TYPE_LABELS,
  type AppointmentTypeValue,
} from "@/modules/appointments/domain/appointment-definitions";
import {
  FOLLOWUP_ACHIEVED_DAYS_MAX,
  computeFollowupAchievement,
  type FollowupAchievement,
} from "@/modules/followups/domain/followup-achievement";
import {
  followupProgressCoverage,
  isFollowupProgressComplete,
} from "@/modules/followups/domain/followup-progress-coverage";
import { FollowupAchievementSummary } from "@/modules/followups/presentation/followup-achievement-summary";
import {
  FOLLOWUP_PROGRESS_STATUS_LABELS,
  FOLLOWUP_PROGRESS_STATUS_VALUES,
  type FollowupProgressStatus,
} from "@/modules/followups/domain/followup-definitions";
import {
  initialFollowupActionState,
  type FollowupActionState,
} from "@/modules/followups/transport/action-state";
import {
  createFollowupAction,
  createFollowupForProgramAction,
} from "@/modules/followups/transport/server-actions";

type PatientContext = {
  patientHospitalRelationshipId: string;
  displayName: string;
  hospitalNumber: string | null;
  hospital: {
    id: string;
    name: string;
  };
};

type AppointmentOption = {
  appointmentId: string;
  type: AppointmentTypeValue;
  scheduledAt: string;
};

type GoalPlanActivityOption = {
  goalPlanItemId: string;
  activityCode: string;
  activityLabel: string;
  targetDays: number;
  targetValue: number | null;
  targetUnit: string | null;
  sortOrder: number;
};

type GoalPlanOption = {
  goalPlanId: string;
  roundNumber: number;
  createdAt: string;
  primaryGoalLabel: string;
  items: GoalPlanActivityOption[];
};

type ProgressDraft = {
  status: FollowupProgressStatus | "";
  achievedDays: string;
  note: string;
};

type YesNoDraft = "" | "true" | "false";

const PLAN_ADJUSTED_CHOICES = [
  ["true", "ปรับแผน"],
  ["false", "ไม่ปรับแผน"],
] as const;

const OBSTACLE_CHOICES = [
  ["true", "มีอุปสรรค"],
  ["false", "ไม่มีอุปสรรค"],
] as const;

/** R2-F: ทบทวนแผนสุขภาพ (booklet). */
const FOLLOWED_PLAN_CHOICES = [
  ["true", "ทำตามแผนได้"],
  ["false", "ทำตามแผนไม่ได้"],
] as const;

export type FollowupFormScope =
  | {
      kind: "relationship";
      relationshipId: string;
    }
  | {
      kind: "program";
      relationshipId: string;
      patientProgramId: string;
      /** R1-D: validated round page to return to after saving (`parseRoundReturnPath`). */
      returnTo?: string | null;
      /** R2-D: prefills the round's height with the latest recorded height. */
      latestHeightCm?: number | null;
    };

type FollowupFormProps = {
  scope: FollowupFormScope;
  programRoundNumber?: number;
  patient: PatientContext;
  appointments: AppointmentOption[];
  goalPlans: GoalPlanOption[];
  selectedAppointmentId: string | null;
  selectedGoalPlanId: string | null;
  submissionNonce: string;
  todayServiceDate: string;
};

const inputClassName =
  "min-h-12 w-full rounded-control border border-border bg-surface px-4 py-2.5 text-base font-normal text-text outline-none transition-[border-color,box-shadow] placeholder:text-text-subtle focus:border-action-primary focus:ring-4 focus:ring-focus-ring disabled:cursor-not-allowed disabled:bg-surface-muted";

const labelClassName = "block space-y-2 text-sm font-semibold text-text";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}

function targetSummary(activity: GoalPlanActivityOption): string {
  const target = activity.targetValue === null
    ? "ไม่มีค่าเป้าหมายตัวเลข"
    : `${activity.targetValue} ${activity.targetUnit ?? "หน่วย"}`;

  return `เป้าหมาย ${activity.targetDays} วัน/สัปดาห์ · ${target}`;
}

function getInitialProgress(goalPlan: GoalPlanOption | null): Record<string, ProgressDraft> {
  if (!goalPlan) {
    return {};
  }

  return Object.fromEntries(
    goalPlan.items.map((activity) => [
      activity.activityCode,
      { status: "", achievedDays: "", note: "" },
    ]),
  );
}

type ProgressRowCheck = {
  activityCode: string;
  statusMissing: boolean;
  achievedDaysMissing: boolean;
};

function isAchievedDaysValue(value: string): boolean {
  return /^\d+$/u.test(value) && Number(value) <= FOLLOWUP_ACHIEVED_DAYS_MAX;
}

/** D1 on the form: every plan activity needs a status, and achieved days unless NOT_APPLICABLE. */
function checkProgressRows(goalPlan: GoalPlanOption, progress: Record<string, ProgressDraft>): ProgressRowCheck[] {
  return goalPlan.items.map((activity) => {
    const draft = progress[activity.activityCode];
    const status = draft?.status ?? "";

    return {
      activityCode: activity.activityCode,
      statusMissing: status === "",
      achievedDaysMissing: status !== "" && status !== "NOT_APPLICABLE" && !isAchievedDaysValue(draft?.achievedDays ?? ""),
    };
  });
}

function latestGoalPlanId(goalPlans: readonly GoalPlanOption[]): string | null {
  return goalPlans.reduce<GoalPlanOption | null>(
    (latest, plan) => (latest === null || plan.roundNumber > latest.roundNumber ? plan : latest),
    null,
  )?.goalPlanId ?? null;
}

function ProgressAchievementStatus({
  achievement,
  complete,
}: {
  achievement: FollowupAchievement | null;
  complete: boolean;
}): React.JSX.Element {
  if (!complete) {
    return <p className="text-sm leading-6 text-text-muted">กรอกให้ครบทุกกิจกรรมเพื่อคำนวณอัตราความสำเร็จ</p>;
  }

  if (!achievement) {
    return (
      <p className="text-sm leading-6 text-text-muted">
        ไม่มีกิจกรรมที่นำมาคำนวณอัตราความสำเร็จ เพราะทุกกิจกรรมไม่เกี่ยวข้องในรอบนี้
      </p>
    );
  }

  return <FollowupAchievementSummary achievement={achievement} />;
}

function ActionFeedback({ state }: { state: FollowupActionState }): React.JSX.Element {
  return (
    <div
      aria-label="ผลการบันทึกการติดตามผล"
      className={state.status === "ERROR" ? "mt-5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" : ""}
      id="followup-action-feedback"
      tabIndex={-1}
    >
      {state.status === "ERROR" ? (
        <Alert variant={state.code === "CONFLICT" ? "warning" : "danger"}>
          <p className="font-semibold">บันทึกการติดตามผลไม่สำเร็จ</p>
          <p className="mt-1">{state.message}</p>
        </Alert>
      ) : null}
    </div>
  );
}

function ReviewField({ label, value }: { label: string; value: React.ReactNode }): React.JSX.Element {
  return (
    <div className="min-w-0">
      <dt className="text-text-muted">{label}</dt>
      <dd className="mt-1 break-words whitespace-pre-wrap font-semibold text-text">{value}</dd>
    </div>
  );
}

function reviewValue(value: string): string {
  return value === "" ? "ไม่ได้กรอก" : value;
}

function formatServiceDate(value: string): string {
  if (!value) {
    return "ไม่ได้ระบุ";
  }

  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeZone: "Asia/Bangkok",
  }).format(new Date(`${value}T00:00:00+07:00`));
}

function ProgressEditor({
  activity,
  draft,
  disabled,
  onChange,
  dateLabel,
  requireAll,
  errors,
}: {
  activity: GoalPlanActivityOption;
  draft: ProgressDraft;
  disabled: boolean;
  onChange: (draft: ProgressDraft) => void;
  dateLabel: string;
  /** D1: a Program Follow-up records every activity. */
  requireAll: boolean;
  errors: { status: boolean; achievedDays: boolean } | null;
}): React.JSX.Element {
  const statusErrorId = `progress-status-error-${activity.activityCode}`;
  const daysErrorId = `progress-achieved-days-error-${activity.activityCode}`;

  return (
    <li className="border-t border-border pt-5 first:border-t-0 first:pt-0">
      <div>
        <h3 className="font-semibold text-text">{activity.activityLabel}</h3>
        <p className="mt-1 text-sm leading-6 text-text-muted">
          {targetSummary(activity)}
        </p>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className={labelClassName} htmlFor={`progress-status-${activity.activityCode}`}>
          <span>สถานะความคืบหน้า{requireAll ? "" : " (ไม่บังคับ)"}</span>
          <Select
            aria-describedby={errors?.status ? statusErrorId : undefined}
            aria-invalid={errors?.status ? true : undefined}
            aria-required={requireAll ? true : undefined}
            disabled={disabled}
            id={`progress-status-${activity.activityCode}`}
            onChange={(event) => {
              const status = event.target.value as FollowupProgressStatus | "";
              onChange({
                ...draft,
                status,
                achievedDays: status === "NOT_APPLICABLE" ? "" : draft.achievedDays,
              });
            }}
            value={draft.status}
          >
            <option value="">กรุณาเลือกสถานะ</option>
            {FOLLOWUP_PROGRESS_STATUS_VALUES.map((status) => (
              <option key={status} value={status}>
                {FOLLOWUP_PROGRESS_STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
          {errors?.status ? (
            <span className="block text-sm font-normal text-danger" id={statusErrorId}>
              กรุณาเลือกสถานะของกิจกรรมนี้
            </span>
          ) : null}
        </label>
        <label className={labelClassName} htmlFor={`progress-achieved-days-${activity.activityCode}`}>
          <span>จำนวนวันที่ทำได้ (0–{FOLLOWUP_ACHIEVED_DAYS_MAX} วัน)</span>
          <input
            aria-describedby={errors?.achievedDays ? daysErrorId : undefined}
            aria-invalid={errors?.achievedDays ? true : undefined}
            className={inputClassName}
            disabled={disabled || !draft.status || draft.status === "NOT_APPLICABLE"}
            id={`progress-achieved-days-${activity.activityCode}`}
            inputMode="numeric"
            max={FOLLOWUP_ACHIEVED_DAYS_MAX}
            min={0}
            onChange={(event) => onChange({ ...draft, achievedDays: event.target.value })}
            required={Boolean(draft.status) && draft.status !== "NOT_APPLICABLE"}
            step={1}
            type="number"
            value={draft.achievedDays}
          />
          {errors?.achievedDays ? (
            <span className="block text-sm font-normal text-danger" id={daysErrorId}>
              กรุณากรอกจำนวนวันที่ทำได้ 0–{FOLLOWUP_ACHIEVED_DAYS_MAX} วัน
            </span>
          ) : null}
          <span className="text-xs font-normal leading-5 text-text-muted">
            นับในช่วง 7 วันก่อน{dateLabel} เทียบกับเป้าหมาย {activity.targetDays} วัน/สัปดาห์
          </span>
        </label>
        <label className={`${labelClassName} sm:col-span-2`} htmlFor={`progress-note-${activity.activityCode}`}>
          <span>หมายเหตุกิจกรรม (ไม่บังคับ)</span>
          <textarea
            className={`${inputClassName} min-h-24 py-3`}
            disabled={disabled}
            id={`progress-note-${activity.activityCode}`}
            maxLength={1_000}
            onChange={(event) => onChange({ ...draft, note: event.target.value })}
            placeholder="บันทึกเฉพาะข้อสังเกตที่เกี่ยวข้องกับกิจกรรมในรอบนี้"
            value={draft.note}
          />
        </label>
      </div>
    </li>
  );
}

export function FollowupForm({
  programRoundNumber,
  scope,
  patient,
  appointments,
  goalPlans,
  selectedAppointmentId,
  selectedGoalPlanId,
  submissionNonce,
  todayServiceDate,
}: FollowupFormProps): React.JSX.Element {
  const router = useRouter();
  const relationshipId = scope.relationshipId;
  const programId = scope.kind === "program" ? scope.patientProgramId : null;
  const returnTo = scope.kind === "program" ? (scope.returnTo ?? null) : null;
  const createAction =
    scope.kind === "program" ? createFollowupForProgramAction : createFollowupAction;
  const submissionLockRef = useRef(false);
  const reviewConfirmedRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const reviewValidationTargetRef = useRef<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null>(null);
  const reportReviewValidationRef = useRef(false);
  const actionStateRef = useRef<FollowupActionState>(initialFollowupActionState);
  const [submissionLocked, setSubmissionLocked] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [missingVitalsPrompt, setMissingVitalsPrompt] = useState<string[]>([]);
  const [missingVitalsAcknowledged, setMissingVitalsAcknowledged] = useState(false);
  const [state, action, pending, unknownOutcome, resendUnconfirmed] = useMutationActionState<FollowupActionState, FormData>(
    async (previous, formData) => {
      const result = await createAction(previous, formData);
      actionStateRef.current = result;
      submissionLockRef.current = false;
      setSubmissionLocked(false);
      setReviewOpen(false);
      return result;
    },
    initialFollowupActionState,
  );
  const busy = pending || unknownOutcome || submissionLocked;

  function followupReturnFocusTarget(): HTMLElement | null {
    if (reviewValidationTargetRef.current?.isConnected) {
      return reviewValidationTargetRef.current;
    }

    if (typeof document === "undefined") {
      return saveButtonRef.current;
    }

    if (unknownOutcome) {
      return document.querySelector<HTMLButtonElement>('[data-navigation-guard="unknown-outcome"] button') ?? null;
    }

    if (actionStateRef.current.status === "ERROR") {
      return document.getElementById("followup-action-feedback");
    }

    return actionStateRef.current.status === "SUCCESS"
      ? document.getElementById("followup-form-page")
      : saveButtonRef.current;
  }

  useEffect(() => {
    if (reviewOpen || !reportReviewValidationRef.current) {
      return;
    }

    reportReviewValidationRef.current = false;
    formRef.current?.reportValidity();
  }, [reviewOpen]);

  const [appointmentId, setAppointmentId] = useState(selectedAppointmentId ?? "");
  // D2: a Program Follow-up always reports on a plan; default to the Program's latest one.
  const defaultGoalPlanId = selectedGoalPlanId ?? (scope.kind === "program" ? latestGoalPlanId(goalPlans) : null);
  const [goalPlanId, setGoalPlanId] = useState(defaultGoalPlanId ?? "");
  const [progressErrorsVisible, setProgressErrorsVisible] = useState(false);
  const [weight, setWeight] = useState("");
  const [waistCircumference, setWaistCircumference] = useState("");
  const [systolicBloodPressure, setSystolicBloodPressure] = useState("");
  const [diastolicBloodPressure, setDiastolicBloodPressure] = useState("");
  const [bloodSugar, setBloodSugar] = useState("");
  const [confidenceScore, setConfidenceScore] = useState("");
  const [reflectionNote, setReflectionNote] = useState("");
  const [confidencePlan, setConfidencePlan] = useState("");
  const [generalNote, setGeneralNote] = useState("");
  const [serviceDate, setServiceDate] = useState(todayServiceDate);
  const [planAdjusted, setPlanAdjusted] = useState<YesNoDraft>("");
  const [heightCm, setHeightCm] = useState(
    scope.kind === "program" && scope.latestHeightCm != null ? String(scope.latestHeightCm) : "",
  );
  const [followedPlan, setFollowedPlan] = useState<YesNoDraft>("");
  const [expertAdvice, setExpertAdvice] = useState("");
  const [hasObstacle, setHasObstacle] = useState<YesNoDraft>("");
  const [obstacleNote, setObstacleNote] = useState("");
  const selectedGoalPlan = useMemo(
    () => goalPlans.find((plan) => plan.goalPlanId === goalPlanId) ?? null,
    [goalPlanId, goalPlans],
  );
  const selectedAppointment = appointments.find((appointment) => appointment.appointmentId === appointmentId) ?? null;
  const [progress, setProgress] = useState<Record<string, ProgressDraft>>(() =>
    getInitialProgress(
      goalPlans.find((plan) => plan.goalPlanId === defaultGoalPlanId) ?? null,
    ),
  );

  useEffect(() => {
    if (state.status === "SUCCESS") {
      // Owner decision BR-06: a Program Follow-up that chose "ปรับแผน" continues to the new plan.
      const destination = programId && planAdjusted === "true"
        ? `/app/patients/${encodeURIComponent(relationshipId)}/programs/${encodeURIComponent(programId)}/goals/new?sourceFollowupId=${encodeURIComponent(state.result.followupId)}${returnTo ? `&${buildRoundReturnQuery(returnTo)}` : ""}`
        : returnTo
          ? returnTo
          : programId
            ? `/app/patients/${encodeURIComponent(relationshipId)}/programs/${encodeURIComponent(programId)}/followups/${encodeURIComponent(state.result.followupId)}`
            : `/app/patients/${encodeURIComponent(relationshipId)}/followups/${encodeURIComponent(state.result.followupId)}`;

      router.push(destination);
      return;
    }

    if (
      state.status === "ERROR" &&
      (state.code === "CONFLICT" || state.code === "FORBIDDEN")
    ) {
      router.refresh();
    }
  }, [planAdjusted, programId, relationshipId, returnTo, router, state]);

  const serializedProgress = selectedGoalPlan
    ? selectedGoalPlan.items.flatMap((activity) => {
        const draft = progress[activity.activityCode];

        if (!draft?.status) {
          return [];
        }

        const achievedDays = draft.status === "NOT_APPLICABLE" || draft.achievedDays === ""
          ? null
          : Number(draft.achievedDays);

        return [{
          goalActivityCode: activity.activityCode,
          status: draft.status,
          achievedDays,
          note: draft.note || null,
        }];
      })
    : [];
  const requireAllProgress = programId !== null;
  const progressChecks = selectedGoalPlan ? checkProgressRows(selectedGoalPlan, progress) : [];
  const progressComplete = selectedGoalPlan !== null &&
    progressChecks.every((row) => !row.statusMissing && !row.achievedDaysMissing) &&
    isFollowupProgressComplete(
      followupProgressCoverage(selectedGoalPlan.items.map((activity) => activity.activityCode), serializedProgress),
    );
  // BR-04 through the shared domain function; the server stays the authority on what is saved.
  const achievement = selectedGoalPlan && progressComplete
    ? computeFollowupAchievement(serializedProgress, selectedGoalPlan.items)
    : null;
  const serviceDateLabel = programId ? "วันที่ติดตาม" : "วันที่ให้บริการ";
  // D2: a Program without a Goal Plan cannot record a Follow-up; the form explains instead of offering a save.
  const noGoalPlan = scope.kind === "program" && goalPlans.length === 0;
  const measurements: readonly [string, string][] = [
    [VITALS_MEASUREMENT_LABELS.weight, weight],
    [VITALS_MEASUREMENT_LABELS.waistCircumference, waistCircumference],
    [VITALS_MEASUREMENT_LABELS.bloodSugar, bloodSugar],
    [VITALS_MEASUREMENT_LABELS.systolicBloodPressure, systolicBloodPressure],
    [VITALS_MEASUREMENT_LABELS.diastolicBloodPressure, diastolicBloodPressure],
  ];
  const measurementCount = measurements.filter(([, value]) => value !== "").length;
  const reviewMeasurements: readonly (readonly [string, string])[] = [
    ["น้ำหนัก (kg)", weight],
    ["รอบเอว (cm)", waistCircumference],
    ["ความดันตัวบน (mmHg)", systolicBloodPressure],
    ["ความดันตัวล่าง (mmHg)", diastolicBloodPressure],
    ["น้ำตาลในเลือด / DTX (DTX / mg%)", bloodSugar],
    ...(programId ? [["ส่วนสูง (cm)", heightCm] as const] : []),
  ];
  const missingReviewMeasurements = reviewMeasurements.filter(([, value]) => value === "").map(([label]) => label);

  // The browser runs native validation before this handler. Opening review never submits the form.
  function handleFormSubmit(event: FormEvent<HTMLFormElement>): void {
    if (reviewConfirmedRef.current) {
      reviewConfirmedRef.current = false;
      dispatchFormDataPreservingInput(event, action);
      return;
    }

    event.preventDefault();
    reviewValidationTargetRef.current = null;
    if (busy || state.status === "SUCCESS" || submissionLockRef.current) {
      return;
    }

    if (requireAllProgress && !progressComplete) {
      setProgressErrorsVisible(true);
      const firstIncomplete = progressChecks.find((row) => row.statusMissing || row.achievedDaysMissing);
      const target = firstIncomplete
        ? document.getElementById(
            firstIncomplete.statusMissing
              ? `progress-status-${firstIncomplete.activityCode}`
              : `progress-achieved-days-${firstIncomplete.activityCode}`,
          )
        : document.getElementById("followup-goal-plan");
      target?.focus();
      return;
    }

    const missing = programId
      ? measurements.filter(([, value]) => value === "").map(([label]) => label)
      : [];
    setMissingVitalsPrompt(missing);
    setMissingVitalsAcknowledged(false);
    setReviewOpen(true);
  }

  function validateFinalReview(): boolean {
    const form = formRef.current;
    if (!form) {
      return false;
    }
    if (form.checkValidity()) {
      return true;
    }

    reviewValidationTargetRef.current = form.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      "input:invalid, select:invalid, textarea:invalid",
    );
    reportReviewValidationRef.current = true;
    setReviewOpen(false);
    return false;
  }

  function confirmFinalReview(): void {
    const requiresMissingVitalsAcknowledgment = programId !== null && missingVitalsPrompt.length > 0;
    if (
      busy ||
      state.status === "SUCCESS" ||
      submissionLockRef.current ||
      (requiresMissingVitalsAcknowledgment && !missingVitalsAcknowledged)
    ) {
      return;
    }

    const form = formRef.current;
    if (!form) {
      return;
    }

    submissionLockRef.current = true;
    setSubmissionLocked(true);
    reviewConfirmedRef.current = true;

    try {
      form.requestSubmit();
    } catch {
      if (reviewConfirmedRef.current) {
        reviewConfirmedRef.current = false;
        submissionLockRef.current = false;
        setSubmissionLocked(false);
      }
      return;
    }

    if (reviewConfirmedRef.current) {
      reviewConfirmedRef.current = false;
      submissionLockRef.current = false;
      setSubmissionLocked(false);
    }
  }

  return (
    <div className="max-w-5xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" id="followup-form-page" tabIndex={-1}>
      {programRoundNumber ? <p className="text-sm font-semibold text-text">บันทึกสำหรับครั้งที่ {programRoundNumber}</p> : null}
      <PageHeader
        actions={
          <StatusBadge variant="info">
            {scope.kind === "program" ? "การติดตามผลในโปรแกรม" : "การติดตามผล"}
          </StatusBadge>
        }
        breadcrumbs={[
          ...(scope.kind === "program"
            ? [
                {
                  href: `/app/patients/${encodeURIComponent(relationshipId)}/programs/${encodeURIComponent(scope.patientProgramId)}`,
                  label: "รายละเอียดโปรแกรม",
                },
                { label: "บันทึกการติดตามผล" },
              ]
            : [
                {
                  href: `/app/patients/${encodeURIComponent(relationshipId)}/followups`,
                  label: "ประวัติการติดตามผล",
                },
                { label: "บันทึกการติดตามผล" },
              ]),
        ]}
        description={
          scope.kind === "program"
            ? "บันทึกการติดตามผลในครั้งบริการที่เปิดอยู่ของโปรแกรมนี้"
            : "บันทึกการติดตามผลไว้ในประวัติการดูแลของโรงพยาบาลนี้"
        }
        title="บันทึกการติดตามผล"
      />

      {noGoalPlan ? (
        <div className="pt-8">
          <Panel>
            <h2 className="text-xl font-semibold tracking-[-0.02em]">ต้องมีแผนสุขภาพก่อนบันทึกการติดตามผล</h2>
            <p className="mt-2 max-w-[68ch] text-sm leading-6 text-text-muted">
              โปรแกรมนี้ยังไม่มีแผนสุขภาพ การติดตามผลต้องบันทึกความคืบหน้าของทุกกิจกรรมในแผนสุขภาพเพื่อคำนวณอัตราความสำเร็จ
              แผนสุขภาพแรกของโปรแกรมสร้างในครั้งที่ 2 และระบบไม่ให้จบบริการครั้งที่ 2 จนกว่าจะมีแผน
            </p>
            <Link
              className="mt-5 inline-flex min-h-12 items-center justify-center rounded-control border border-border-strong bg-surface px-5 py-2.5 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              href={returnTo ?? `/app/patients/${encodeURIComponent(relationshipId)}/programs/${encodeURIComponent(programId ?? "")}`}
            >
              {returnTo ? "กลับไปหน้าครั้งบริการ" : "กลับไปรายละเอียดโปรแกรม"}
            </Link>
          </Panel>
        </div>
      ) : (
        <>
          <form className="space-y-6 pt-8" onSubmit={handleFormSubmit} ref={formRef}>
            {scope.kind === "program" ? (
              <input name="patientProgramId" type="hidden" value={scope.patientProgramId} />
            ) : (
              <input name="patientHospitalRelationshipId" type="hidden" value={relationshipId} />
            )}
            <input name="submissionNonce" type="hidden" value={submissionNonce} />
            <input name="appointmentId" readOnly type="hidden" value={appointmentId} />
            <input name="sourceGoalPlanId" readOnly type="hidden" value={goalPlanId} />
            <input name="serviceDate" readOnly type="hidden" value={serviceDate} />
            <input name="planAdjusted" readOnly type="hidden" value={planAdjusted} />
            <input name="hasObstacle" readOnly type="hidden" value={hasObstacle} />
            <input name="obstacleNote" readOnly type="hidden" value={hasObstacle === "true" ? obstacleNote : ""} />
            <input name="weight" readOnly type="hidden" value={weight} />
            <input name="waistCircumference" readOnly type="hidden" value={waistCircumference} />
            <input name="systolicBloodPressure" readOnly type="hidden" value={systolicBloodPressure} />
            <input name="diastolicBloodPressure" readOnly type="hidden" value={diastolicBloodPressure} />
            <input name="bloodSugar" readOnly type="hidden" value={bloodSugar} />
            {programId ? (
              <>
                <input name="heightCm" readOnly type="hidden" value={heightCm} />
                <input name="followedPlan" readOnly type="hidden" value={followedPlan} />
                <input name="expertAdvice" readOnly type="hidden" value={expertAdvice} />
              </>
            ) : null}
            {programId ? null : <input name="confidenceScore" readOnly type="hidden" value={confidenceScore} />}
            <input name="reflectionNote" readOnly type="hidden" value={reflectionNote} />
            {programId ? null : <input name="confidencePlan" readOnly type="hidden" value={confidencePlan} />}
            <input name="generalNote" readOnly type="hidden" value={generalNote} />
            <input name="activityProgress" readOnly type="hidden" value={JSON.stringify(serializedProgress)} />

            <Panel>
              <h2 className="text-xl font-semibold tracking-[-0.02em]">
                {scope.kind === "program" ? "ผู้ป่วยและโปรแกรม" : "ผู้ป่วยและบริบทโรงพยาบาล"}
              </h2>
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
              {scope.kind === "program" ? (
                <p className="mt-3 text-sm leading-6 text-text-muted">
                  การบันทึกนี้จะอยู่ในประวัติของโปรแกรมนี้โดยตรง และสามารถอ้างอิงแผนสุขภาพของโปรแกรมเดียวกันได้
                </p>
              ) : (
                <Alert className="mt-4" variant="warning">
                  การติดตามผลนี้บันทึกนอกโปรแกรมจึงจะไม่อยู่ในรายงานโรงพยาบาลตามโปรแกรม (ไฟล์ Excel)
                  หากต้องการให้อยู่ในรายงาน ให้บันทึกจากรอบบริการของโปรแกรมผู้ป่วยรายนี้
                </Alert>
              )}
            </Panel>

            <Panel>
              <h2 className="text-xl font-semibold tracking-[-0.02em]">{serviceDateLabel}</h2>
              <p className="mt-2 text-sm leading-6 text-text-muted">
                วันที่พบหรือติดตามผู้ป่วยจริง ใช้เป็นวันที่ติดตามในรายงาน เลือกย้อนหลังได้แต่เลือกวันในอนาคตไม่ได้
              </p>
              <fieldset className="mt-6 grid gap-5 sm:grid-cols-2" disabled={busy || state.status === "SUCCESS"}>
                <label className={labelClassName} htmlFor="followup-service-date">
                  <span>{serviceDateLabel}</span>
                  <input
                    className={inputClassName}
                    id="followup-service-date"
                    max={todayServiceDate}
                    onChange={(event) => setServiceDate(event.target.value)}
                    required
                    type="date"
                    value={serviceDate}
                  />
                </label>
              </fieldset>
            </Panel>

            <Panel>
              <h2 className="text-xl font-semibold tracking-[-0.02em]">
                {scope.kind === "program" ? "บริบทที่เลือก" : "บริบทที่เลือก (ไม่บังคับ)"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-text-muted">
                {scope.kind === "program"
                  ? "เลือกแผนสุขภาพที่ใช้ติดตามในครั้งนี้ (ระบบเลือกแผนล่าสุดไว้ให้) และนัดหมายที่เสร็จสิ้นแล้วหากต้องการอ้างอิง"
                  : "เลือกนัดหมายที่เสร็จสิ้นแล้ว หรือแผนสุขภาพย้อนหลังที่ต้องการอ้างอิงอย่างชัดเจน ระบบจะไม่แนบรายการล่าสุดให้โดยอัตโนมัติ"}
              </p>
              <fieldset className="mt-6 grid gap-5 sm:grid-cols-2" disabled={busy || state.status === "SUCCESS"}>
                <label className={labelClassName} htmlFor="followup-appointment">
                  <span>นัดหมายที่อ้างอิง</span>
                  <Select
                    id="followup-appointment"
                    onChange={(event) => setAppointmentId(event.target.value)}
                    value={appointmentId}
                  >
                    <option value="">ไม่เชื่อมโยงนัดหมาย</option>
                    {appointments.map((appointment) => (
                      <option key={appointment.appointmentId} value={appointment.appointmentId}>
                        {APPOINTMENT_TYPE_LABELS[appointment.type]} · {formatDate(appointment.scheduledAt)}
                      </option>
                    ))}
                  </Select>
                  <span className="text-xs font-normal leading-5 text-text-muted">
                เลือกได้เฉพาะนัดหมายของผู้ป่วยรายนี้ที่เสร็จสิ้นแล้ว
                  </span>
                </label>
                <label className={labelClassName} htmlFor="followup-goal-plan">
                  <span>แผนสุขภาพที่อ้างอิง</span>
                  <Select
                    id="followup-goal-plan"
                    onChange={(event) => {
                      const nextGoalPlanId = event.target.value;
                      setGoalPlanId(nextGoalPlanId);
                      setProgressErrorsVisible(false);
                      setProgress(
                        getInitialProgress(
                          goalPlans.find((plan) => plan.goalPlanId === nextGoalPlanId) ?? null,
                        ),
                      );
                    }}
                    required={scope.kind === "program"}
                    value={goalPlanId}
                  >
                    {scope.kind === "program" ? null : <option value="">ไม่เชื่อมโยงแผนสุขภาพ</option>}
                    {goalPlans.map((plan) => (
                      <option key={plan.goalPlanId} value={plan.goalPlanId}>
                        {scope.kind === "program" ? "แผนสุขภาพรอบที่" : "รอบที่"} {plan.roundNumber} · {plan.primaryGoalLabel} · {formatDate(plan.createdAt)}
                      </option>
                    ))}
                  </Select>
                  <span className="text-xs font-normal leading-5 text-text-muted">
                    {scope.kind === "program"
                      ? "เลือกได้เฉพาะแผนสุขภาพของโปรแกรมนี้ ไม่เกิน 50 รอบล่าสุด"
                      : "เลือกได้จากแผนสุขภาพย้อนหลังที่คุณมีสิทธิ์เข้าถึง ไม่เกิน 50 รอบล่าสุด"}
                  </span>
                </label>
              </fieldset>
            </Panel>

            <Panel>
              <h2 className="text-xl font-semibold tracking-[-0.02em]">ค่าที่บันทึกในการติดตามผล</h2>
              <p className="mt-2 text-sm leading-6 text-text-muted">
                กรอกเท่าที่มี ระบบจะเก็บค่าที่บันทึกไว้และไม่คำนวณผลทางการแพทย์อัตโนมัติ
              </p>
              <fieldset className="mt-6 grid gap-5 sm:grid-cols-2" disabled={busy || state.status === "SUCCESS"}>
                <label className={labelClassName} htmlFor="followup-weight">
                  <span>น้ำหนัก (kg)</span>
                  <input
                    className={inputClassName}
                    id="followup-weight"
                    max={1_000_000}
                    min={0}
                    onChange={(event) => setWeight(event.target.value)}
                    step="any"
                    type="number"
                    value={weight}
                  />
                </label>
                <label className={labelClassName} htmlFor="followup-waist">
                  <span>รอบเอว (cm)</span>
                  <input
                    className={inputClassName}
                    id="followup-waist"
                    max={1_000_000}
                    min={0}
                    onChange={(event) => setWaistCircumference(event.target.value)}
                    step="any"
                    type="number"
                    value={waistCircumference}
                  />
                </label>
                <label className={labelClassName} htmlFor="followup-systolic">
                  <span>ความดันตัวบน (mmHg)</span>
                  <input
                    className={inputClassName}
                    id="followup-systolic"
                    max={1_000_000}
                    min={0}
                    onChange={(event) => setSystolicBloodPressure(event.target.value)}
                    step="any"
                    type="number"
                    value={systolicBloodPressure}
                  />
                </label>
                <label className={labelClassName} htmlFor="followup-diastolic">
                  <span>ความดันตัวล่าง (mmHg)</span>
                  <input
                    className={inputClassName}
                    id="followup-diastolic"
                    max={1_000_000}
                    min={0}
                    onChange={(event) => setDiastolicBloodPressure(event.target.value)}
                    step="any"
                    type="number"
                    value={diastolicBloodPressure}
                  />
                </label>
                <label className={labelClassName} htmlFor="followup-blood-sugar">
                  <span>น้ำตาลในเลือด / DTX (DTX / mg%)</span>
                  <input
                    className={inputClassName}
                    id="followup-blood-sugar"
                    max={1_000_000}
                    min={0}
                    onChange={(event) => setBloodSugar(event.target.value)}
                    step="any"
                    type="number"
                    value={bloodSugar}
                  />
                </label>
                {programId ? (
                  <label className={labelClassName} htmlFor="followup-height">
                    <span>ส่วนสูง (cm)</span>
                    <input
                      aria-describedby="followup-height-help"
                      className={inputClassName}
                      id="followup-height"
                      max={1_000_000}
                      min={0}
                      onChange={(event) => setHeightCm(event.target.value)}
                      step="any"
                      type="number"
                      value={heightCm}
                    />
                    <span className="text-xs font-normal leading-5 text-text-muted" id="followup-height-help">
                      เติมค่าส่วนสูงล่าสุดให้แล้ว แก้ไขได้หากวัดใหม่ เว้นว่างได้ (ระบบจะใช้ค่าล่าสุด)
                    </span>
                  </label>
                ) : null}
              </fieldset>
            </Panel>

            {programId ? (
              <Panel>
                <h2 className="text-xl font-semibold tracking-[-0.02em]">ทบทวนแผนสุขภาพ</h2>
                <div className="mt-6 grid gap-6">
                  <fieldset className="space-y-3" disabled={busy || state.status === "SUCCESS"}>
                    <legend className="text-sm font-semibold text-text">ทำตามแผนได้หรือไม่</legend>
                    {FOLLOWED_PLAN_CHOICES.map(([value, label]) => (
                      <label className="flex min-h-11 items-center gap-3 text-base text-text" key={value}>
                        <input
                          checked={followedPlan === value}
                          className="size-5"
                          name="followedPlanChoice"
                          onChange={() => setFollowedPlan(value)}
                          required
                          type="radio"
                          value={value}
                        />
                        {label}
                      </label>
                    ))}
                  </fieldset>
                  <label className={labelClassName} htmlFor="followup-reflection">
                    <span>เกิดอะไรขึ้นบ้าง?</span>
                    <textarea
                      className={`${inputClassName} min-h-28 py-3`}
                      disabled={busy || state.status === "SUCCESS"}
                      id="followup-reflection"
                      maxLength={2_000}
                      onChange={(event) => setReflectionNote(event.target.value)}
                      required
                      value={reflectionNote}
                    />
                  </label>
                  <label className={labelClassName} htmlFor="followup-expert-advice">
                    <span>คำแนะนำจากผู้เชี่ยวชาญ (ไม่บังคับ)</span>
                    <textarea
                      className={`${inputClassName} min-h-28 py-3`}
                      disabled={busy || state.status === "SUCCESS"}
                      id="followup-expert-advice"
                      maxLength={1_000}
                      onChange={(event) => setExpertAdvice(event.target.value)}
                      value={expertAdvice}
                    />
                  </label>
                  <p className="text-sm leading-6 text-text-muted">
                    ขั้นตอน “ทบทวนแผนสุขภาพ” ของครั้งนี้จะนับว่าบันทึกแล้วเมื่ออ้างอิงแผนสุขภาพ ตอบว่าทำตามแผนได้หรือไม่ และกรอก “เกิดอะไรขึ้นบ้าง?”
                  </p>
                </div>
              </Panel>
            ) : null}

            {selectedGoalPlan ? (
              <Panel>
                <div>
                  <h2 className="text-xl font-semibold tracking-[-0.02em]">ความคืบหน้าตามแผนสุขภาพ</h2>
                  <p className="mt-2 text-sm leading-6 text-text-muted">
                    แสดงกิจกรรมจากแผนสุขภาพรอบที่ {selectedGoalPlan.roundNumber} เท่านั้น
                    เลือกสถานะตามข้อมูลที่ต้องการบันทึกในการติดตามผลรอบนี้
                  </p>
                  <p className="mt-2 text-sm leading-6 text-text-muted">
                    {requireAllProgress
                      ? "ต้องบันทึกให้ครบทุกกิจกรรมในแผน: เลือกสถานะ และกรอกจำนวนวันที่ทำได้ ยกเว้นกิจกรรมที่ไม่เกี่ยวข้องในรอบนี้"
                      : "เลือกบันทึกเฉพาะกิจกรรมที่ต้องการติดตามในรอบนี้ได้ กิจกรรมที่ไม่เลือกสถานะจะไม่ถูกบันทึก"}
                  </p>
                </div>
                <ul className="mt-6 space-y-5">
                  {selectedGoalPlan.items.map((activity) => {
                    const check = progressChecks.find((row) => row.activityCode === activity.activityCode);

                    return (
                      <ProgressEditor
                        activity={activity}
                        dateLabel={serviceDateLabel}
                        disabled={busy || state.status === "SUCCESS"}
                        draft={progress[activity.activityCode] ?? { status: "", achievedDays: "", note: "" }}
                        errors={requireAllProgress && progressErrorsVisible && check
                          ? { status: check.statusMissing, achievedDays: check.achievedDaysMissing }
                          : null}
                        key={activity.activityCode}
                        onChange={(draft) =>
                          setProgress((current) => ({ ...current, [activity.activityCode]: draft }))
                        }
                        requireAll={requireAllProgress}
                      />
                    );
                  })}
                </ul>
                {requireAllProgress ? (
                  <div aria-live="polite" className="mt-6 border-t border-border pt-5" id="followup-achievement-summary">
                    <ProgressAchievementStatus achievement={achievement} complete={progressComplete} />
                  </div>
                ) : null}
              </Panel>
            ) : null}

            <Panel>
              <h2 className="text-xl font-semibold tracking-[-0.02em]">การปรับแผนและอุปสรรค</h2>
              <p className="mt-2 text-sm leading-6 text-text-muted">
                ต้องเลือกทั้งสองข้อ ข้อมูลนี้ใช้ในรายงานการจัดบริการ
              </p>
              <div className="mt-6 grid gap-6 sm:grid-cols-2">
                <fieldset className="space-y-3" disabled={busy || state.status === "SUCCESS"}>
                  <legend className="text-sm font-semibold text-text">ปรับแผนใหม่ในรอบนี้หรือไม่</legend>
                  {PLAN_ADJUSTED_CHOICES.map(([value, label]) => (
                    <label className="flex min-h-11 items-center gap-3 text-base text-text" key={value}>
                      <input
                        checked={planAdjusted === value}
                        className="size-5"
                        name="planAdjustedChoice"
                        onChange={() => setPlanAdjusted(value)}
                        required
                        type="radio"
                        value={value}
                      />
                      {label}
                    </label>
                  ))}
                  {planAdjusted === "true" ? (
                    <p className="text-sm leading-6 text-text-muted">
                      {scope.kind === "program"
                        ? "หลังบันทึก ระบบจะพาไปสร้างแผนสุขภาพรอบใหม่ที่เชื่อมกับการติดตามครั้งนี้"
                        : "หลังบันทึก ให้สร้างแผนสุขภาพรอบใหม่เพื่อใช้ในการติดตามครั้งถัดไป"}
                    </p>
                  ) : null}
                </fieldset>
                <fieldset className="space-y-3" disabled={busy || state.status === "SUCCESS"}>
                  <legend className="text-sm font-semibold text-text">มีอุปสรรคในรอบนี้หรือไม่</legend>
                  {OBSTACLE_CHOICES.map(([value, label]) => (
                    <label className="flex min-h-11 items-center gap-3 text-base text-text" key={value}>
                      <input
                        checked={hasObstacle === value}
                        className="size-5"
                        name="hasObstacleChoice"
                        onChange={() => setHasObstacle(value)}
                        required
                        type="radio"
                        value={value}
                      />
                      {label}
                    </label>
                  ))}
                  {hasObstacle === "true" ? (
                    <label className={labelClassName} htmlFor="followup-obstacle-note">
                      <span>รายละเอียดอุปสรรค (ไม่บังคับ)</span>
                      <textarea
                        className={`${inputClassName} min-h-24 py-3`}
                        id="followup-obstacle-note"
                        maxLength={1_000}
                        onChange={(event) => setObstacleNote(event.target.value)}
                        placeholder="อุปสรรคที่พบ ใช้ประกอบการติดตาม ไม่แสดงในไฟล์รายงาน"
                        value={obstacleNote}
                      />
                    </label>
                  ) : null}
                </fieldset>
              </div>
            </Panel>

            <Panel>
              <h2 className="text-xl font-semibold tracking-[-0.02em]">
                {programId ? "หมายเหตุ" : "ความมั่นใจ / สิ่งที่ต้องการสะท้อน / หมายเหตุ"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-text-muted">
                {programId
                  ? "คะแนนความมั่นใจของโปรแกรมบันทึกที่ขั้นตอน “ไม้บรรทัดวัดใจ” ของแต่ละครั้ง ระบบจะไม่ใช้ข้อมูลส่วนนี้คำนวณคะแนนหรือแนะนำการรักษา"
                  : "บันทึกข้อมูลตามที่เหมาะสม ระบบจะไม่ใช้ข้อมูลส่วนนี้คำนวณคะแนนหรือแนะนำการรักษา"}
              </p>
              <fieldset className="mt-6 grid gap-5 sm:grid-cols-2" disabled={busy || state.status === "SUCCESS"}>
                {programId ? null : (
                <>
                <label className={labelClassName} htmlFor="followup-confidence-score">
                  <span>คะแนนความมั่นใจ (0–10)</span>
                  <input
                    className={inputClassName}
                    id="followup-confidence-score"
                    max={10}
                    min={0}
                    onChange={(event) => setConfidenceScore(event.target.value)}
                    step={1}
                    type="number"
                    value={confidenceScore}
                  />
                </label>
                <div className="text-sm leading-6 text-text-muted sm:pt-8">
                  เลือกใส่เมื่อเหมาะสม ไม่ใช้เพื่อคำนวณคะแนนหรือแนะนำการรักษา
                </div>
                </>
                )}
                {programId ? null : (
                <label className={labelClassName} htmlFor="followup-reflection">
                  <span>สิ่งที่ต้องการสะท้อน (ไม่บังคับ)</span>
                  <textarea
                    className={`${inputClassName} min-h-28 py-3`}
                    id="followup-reflection"
                    maxLength={2_000}
                    onChange={(event) => setReflectionNote(event.target.value)}
                    placeholder="สิ่งที่ผู้ป่วยหรือทีมต้องการสะท้อนในรอบนี้"
                    value={reflectionNote}
                  />
                </label>
                )}
                {programId ? null : (
                <label className={labelClassName} htmlFor="followup-confidence-plan">
                  <span>แผนต่อเนื่อง (ไม่บังคับ)</span>
                  <textarea
                    className={`${inputClassName} min-h-28 py-3`}
                    id="followup-confidence-plan"
                    maxLength={2_000}
                    onChange={(event) => setConfidencePlan(event.target.value)}
                    placeholder="แผนหรือสิ่งที่ต้องการติดตามต่อ"
                    value={confidencePlan}
                  />
                </label>
                )}
                <label className={`${labelClassName} sm:col-span-2`} htmlFor="followup-general-note">
                  <span>หมายเหตุทั่วไป (ไม่บังคับ)</span>
                  <textarea
                    className={`${inputClassName} min-h-28 py-3`}
                    id="followup-general-note"
                    maxLength={2_000}
                    onChange={(event) => setGeneralNote(event.target.value)}
                    placeholder="บันทึกทั่วไปที่จำเป็น"
                    value={generalNote}
                  />
                </label>
              </fieldset>
            </Panel>

            <Panel>
              <h2 className="text-xl font-semibold tracking-[-0.02em]">ก่อนบันทึก</h2>
              <p className="mt-2 text-sm leading-6 text-text-muted">
                ตรวจทานค่าที่เลือกและกรอกในหน้าต่างถัดไป การบันทึกจะสร้างรายการติดตามผลใหม่ที่แก้ไขหรือลบไม่ได้
              </p>
              <dl className="mt-5 grid gap-4 border-y border-border py-5 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-text-muted">นัดหมายที่อ้างอิง</dt>
                  <dd className="mt-1 font-semibold text-text">
                    {appointmentId ? "เลือกแล้ว" : "ไม่ได้เชื่อมโยง"}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-muted">แผนสุขภาพที่อ้างอิง</dt>
                  <dd className="mt-1 font-semibold text-text">
                    {selectedGoalPlan ? `รอบที่ ${selectedGoalPlan.roundNumber}` : "ไม่ได้เชื่อมโยง"}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-muted">ข้อมูลที่บันทึก</dt>
                  <dd className="mt-1 font-semibold text-text">กรอกแล้ว {measurementCount} รายการ</dd>
                </div>
              </dl>
              <ActionFeedback state={state} />
              <UnknownOutcomeAlert active={unknownOutcome} className="mt-5" recovery={{ kind: "resend", onResend: resendUnconfirmed, resending: pending }} />
              {state.status === "SUCCESS" ? (
                <Alert className="mt-5" variant="success">บันทึกแล้ว กำลังเปิดรายการที่บันทึก...</Alert>
              ) : null}
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button
                  disabled={busy || state.status === "SUCCESS"}
                  loading={pending || (submissionLocked && !unknownOutcome)}
                  ref={saveButtonRef}
                  type="submit"
                >
                  {pending || (submissionLocked && !unknownOutcome) ? "กำลังบันทึก…" : "บันทึกการติดตามผล"}
                </Button>
                <Link
                  aria-disabled={busy || state.status === "SUCCESS"}
                  className={`inline-flex min-h-12 items-center justify-center rounded-control border border-border-strong bg-surface px-5 py-2.5 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2 ${busy || state.status === "SUCCESS" ? "pointer-events-none cursor-not-allowed text-text-subtle" : ""}`}
                  href={
                    scope.kind === "program"
                      ? `/app/patients/${encodeURIComponent(relationshipId)}/programs/${encodeURIComponent(scope.patientProgramId)}`
                      : `/app/patients/${encodeURIComponent(relationshipId)}/followups`
                  }
                  onClick={(event) => {
                    if (busy || state.status === "SUCCESS") {
                      event.preventDefault();
                    }
                  }}
                  tabIndex={busy || state.status === "SUCCESS" ? -1 : undefined}
                >
                  ยกเลิก
                </Link>
              </div>
            </Panel>
          </form>
          <ConfirmDialog
            cancelLabel={unknownOutcome ? "ปิดหน้าต่าง" : undefined}
            confirmDisabled={busy || (programId !== null && missingVitalsPrompt.length > 0 && !missingVitalsAcknowledged)}
            confirmLabel="บันทึกต่อ"
            description={
              <>
                ผู้ป่วย {patient.displayName} · โรงพยาบาล {patient.hospital.name}
                {programId
                  ? ` · โปรแกรมสุขภาพ · ครั้งบริการที่ ${programRoundNumber ?? "ไม่ได้ระบุ"}`
                  : " · การติดตามผลนอกโปรแกรม"}
              </>
            }
            details={
              <div className="space-y-5">
                {unknownOutcome ? (
                  <UnknownOutcomeAlert
                    active={unknownOutcome}
                    recovery={{ kind: "resend", onResend: resendUnconfirmed, resending: pending }}
                  />
                ) : null}
                <section>
                  <h3 className="font-semibold text-text">บริบทการติดตาม</h3>
                  <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                    <ReviewField label={serviceDateLabel} value={formatServiceDate(serviceDate)} />
                    <ReviewField
                      label="นัดหมายที่เลือก"
                      value={selectedAppointment
                        ? `${APPOINTMENT_TYPE_LABELS[selectedAppointment.type]} · ${formatDate(selectedAppointment.scheduledAt)}`
                        : appointmentId ? "ไม่พบรายละเอียดนัดหมายที่เลือก" : "ไม่ได้เชื่อมโยงนัดหมาย"}
                    />
                    <ReviewField
                      label="แผนสุขภาพที่เลือก"
                      value={selectedGoalPlan
                        ? `รอบที่ ${selectedGoalPlan.roundNumber} · ${selectedGoalPlan.primaryGoalLabel} · ${formatDate(selectedGoalPlan.createdAt)}`
                        : goalPlanId ? "ไม่พบรายละเอียดแผนสุขภาพที่เลือก" : "ไม่ได้เชื่อมโยงแผนสุขภาพ"}
                    />
                  </dl>
                </section>

                <section>
                  <h3 className="font-semibold text-text">ค่าที่จะบันทึก</h3>
                  <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                    {reviewMeasurements.map(([label, value]) => (
                      <ReviewField key={label} label={label} value={reviewValue(value)} />
                    ))}
                  </dl>
                  <p className="mt-3 text-sm leading-6 text-text-muted">
                    ค่าที่ยังไม่ได้กรอก: {missingReviewMeasurements.length ? missingReviewMeasurements.join(" · ") : "ไม่มี"}
                  </p>
                </section>

                {programId ? (
                  <section>
                    <h3 className="font-semibold text-text">คำตอบและความคืบหน้า</h3>
                    <dl className="mt-3 grid gap-3 text-sm">
                      <ReviewField
                        label="ทำตามแผนสุขภาพ"
                        value={followedPlan === "true" ? "ทำตามแผนได้" : followedPlan === "false" ? "ทำตามแผนไม่ได้" : "ยังไม่ได้เลือก"}
                      />
                      <ReviewField label="เกิดอะไรขึ้นบ้าง?" value={reviewValue(reflectionNote)} />
                      <ReviewField label="คำแนะนำจากผู้เชี่ยวชาญ" value={reviewValue(expertAdvice)} />
                      <ReviewField
                        label="ความคืบหน้าตามแผนสุขภาพ"
                        value={selectedGoalPlan && selectedGoalPlan.items.length > 0 ? (
                          <ul className="list-disc space-y-2 pl-5 font-normal">
                            {selectedGoalPlan.items.map((activity) => {
                              const draft = progress[activity.activityCode] ?? { status: "", achievedDays: "", note: "" };
                              const achievedDays = draft.status === "NOT_APPLICABLE" || draft.achievedDays === ""
                                ? null
                                : Number(draft.achievedDays);
                              const statusLabel = draft.status ? FOLLOWUP_PROGRESS_STATUS_LABELS[draft.status] : "ไม่ได้บันทึกสถานะ";
                              const daysLabel = !draft.status
                                ? "ไม่ได้บันทึก"
                                : draft.status === "NOT_APPLICABLE"
                                  ? "ไม่ต้องระบุจำนวนวัน"
                                  : achievedDays === null ? "ไม่ได้กรอกจำนวนวัน" : `${achievedDays} วัน`;

                              return (
                                <li className="break-words" key={activity.activityCode}>
                                  <span className="font-semibold">{activity.activityLabel}:</span> {statusLabel} · {daysLabel}
                                  <span className="block whitespace-pre-wrap">
                                    หมายเหตุ{draft.status ? "" : " (ไม่ได้บันทึก เพราะยังไม่ได้เลือกสถานะ)"}: {reviewValue(draft.note)}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        ) : "ไม่มีแผนสุขภาพที่เลือก"}
                      />
                      <ReviewField
                        label="อัตราความสำเร็จตามเป้า"
                        value={<ProgressAchievementStatus achievement={achievement} complete={progressComplete} />}
                      />
                    </dl>
                  </section>
                ) : (
                  <section>
                    <h3 className="font-semibold text-text">ความมั่นใจและสิ่งที่ต้องการสะท้อน</h3>
                    <dl className="mt-3 grid gap-3 text-sm">
                      <ReviewField label="คะแนนความมั่นใจ (0–10)" value={reviewValue(confidenceScore)} />
                      <ReviewField label="สิ่งที่ต้องการสะท้อน" value={reviewValue(reflectionNote)} />
                      <ReviewField label="แผนต่อเนื่อง" value={reviewValue(confidencePlan)} />
                    </dl>
                  </section>
                )}

                <section>
                  <h3 className="font-semibold text-text">แผนและอุปสรรค</h3>
                  <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                    <ReviewField
                      label="ความตั้งใจปรับแผน"
                      value={planAdjusted === "true" ? "ปรับแผน" : planAdjusted === "false" ? "ไม่ปรับแผน" : "ยังไม่ได้เลือก"}
                    />
                    <ReviewField
                      label="อุปสรรคในรอบนี้"
                      value={hasObstacle === "true" ? "มีอุปสรรค" : hasObstacle === "false" ? "ไม่มีอุปสรรค" : "ยังไม่ได้เลือก"}
                    />
                    <ReviewField
                      label="รายละเอียดอุปสรรค"
                      value={hasObstacle === "true" ? reviewValue(obstacleNote) : hasObstacle === "false" ? "ไม่เกี่ยวข้อง" : "ไม่ได้เลือก"}
                    />
                    <ReviewField label="หมายเหตุทั่วไป" value={reviewValue(generalNote)} />
                  </dl>
                </section>

                {programId !== null && missingVitalsPrompt.length > 0 ? (
                  <Alert role="alert" variant="warning">
                    <p className="font-semibold">ค่าสุขภาพของรอบนี้ยังขาด</p>
                    <p className="mt-1">{missingVitalsPrompt.join(" · ")}</p>
                    <p className="mt-2">
                      หากบันทึกต่อ ขั้นตอน “ข้อมูลทั่วไปและสัญญาณชีพ” ของรอบนี้อาจต้องระบุเหตุผลที่ข้ามด้วยตนเอง ระบบจะไม่ข้ามขั้นตอนหรือเลือกเหตุผลให้อัตโนมัติ
                    </p>
                    <label className="mt-3 flex min-h-11 items-start gap-3 font-semibold text-text">
                      <input
                        checked={missingVitalsAcknowledged}
                        className="mt-1 size-5 shrink-0"
                        disabled={busy}
                        onChange={(event) => setMissingVitalsAcknowledged(event.currentTarget.checked)}
                        type="checkbox"
                      />
                      <span>รับทราบผลของการบันทึกโดยยังขาดค่าสุขภาพ</span>
                    </label>
                  </Alert>
                ) : null}

                <p className="text-sm leading-6 text-text-muted">
                  การบันทึกจะสร้างรายการติดตามผลใหม่ ข้อมูลที่บันทึกแล้วแก้ไขหรือลบไม่ได้
                </p>
              </div>
            }
            onCancel={() => setReviewOpen(false)}
            onBeforeConfirm={validateFinalReview}
            onConfirm={confirmFinalReview}
            open={reviewOpen}
            pending={pending || (submissionLocked && !unknownOutcome)}
            pendingLabel="กำลังบันทึก…"
            returnFocusTarget={followupReturnFocusTarget}
            title="ตรวจทานก่อนบันทึก"
          />
        </>
      )}
    </div>
  );
}
