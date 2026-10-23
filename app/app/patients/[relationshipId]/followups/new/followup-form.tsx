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
import { useMutationActionState } from "@/components/ui/mutation-action-state";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import {
  APPOINTMENT_TYPE_LABELS,
  type AppointmentTypeValue,
} from "@/modules/appointments/domain/appointment-definitions";
import { FOLLOWUP_ACHIEVED_DAYS_MAX } from "@/modules/followups/domain/followup-achievement";
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

function ActionFeedback({ state }: { state: FollowupActionState }): React.JSX.Element | null {
  if (state.status !== "ERROR") {
    return null;
  }

  return (
    <Alert className="mt-5" variant={state.code === "CONFLICT" ? "warning" : "danger"}>
      <p className="font-semibold">บันทึกการติดตามผลไม่สำเร็จ</p>
      <p className="mt-1">{state.message}</p>
    </Alert>
  );
}

function ProgressEditor({
  activity,
  draft,
  disabled,
  onChange,
}: {
  activity: GoalPlanActivityOption;
  draft: ProgressDraft;
  disabled: boolean;
  onChange: (draft: ProgressDraft) => void;
}): React.JSX.Element {
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
          <span>สถานะความคืบหน้า</span>
          <Select
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
        </label>
        <label className={labelClassName} htmlFor={`progress-achieved-days-${activity.activityCode}`}>
          <span>จำนวนวันที่ทำได้ (0–{FOLLOWUP_ACHIEVED_DAYS_MAX} วัน)</span>
          <input
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
          <span className="text-xs font-normal leading-5 text-text-muted">
            นับในช่วง 7 วันก่อนวันที่ให้บริการ เทียบกับเป้าหมาย {activity.targetDays} วัน/สัปดาห์
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
  const [state, action, pending, unknownOutcome, resendUnconfirmed] = useMutationActionState<FollowupActionState, FormData>(
    createAction,
    initialFollowupActionState,
  );
  const [appointmentId, setAppointmentId] = useState(selectedAppointmentId ?? "");
  const [goalPlanId, setGoalPlanId] = useState(selectedGoalPlanId ?? "");
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
  const formRef = useRef<HTMLFormElement>(null);
  const missingVitalsConfirmedRef = useRef(false);
  const [missingVitalsPrompt, setMissingVitalsPrompt] = useState<string[] | null>(null);
  const selectedGoalPlan = useMemo(
    () => goalPlans.find((plan) => plan.goalPlanId === goalPlanId) ?? null,
    [goalPlanId, goalPlans],
  );
  const [progress, setProgress] = useState<Record<string, ProgressDraft>>(() =>
    getInitialProgress(
      goalPlans.find((plan) => plan.goalPlanId === selectedGoalPlanId) ?? null,
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
  const measurements: readonly [string, string][] = [
    [VITALS_MEASUREMENT_LABELS.weight, weight],
    [VITALS_MEASUREMENT_LABELS.waistCircumference, waistCircumference],
    [VITALS_MEASUREMENT_LABELS.bloodSugar, bloodSugar],
    [VITALS_MEASUREMENT_LABELS.systolicBloodPressure, systolicBloodPressure],
    [VITALS_MEASUREMENT_LABELS.diastolicBloodPressure, diastolicBloodPressure],
  ];
  const measurementCount = measurements.filter(([, value]) => value !== "").length;

  // A Program Follow-up is immutable: confirm before saving without every round vital, because the
  // round's vitals step will then need a skip reason.
  function confirmMissingVitals(event: FormEvent<HTMLFormElement>): void {
    if (!programId || missingVitalsConfirmedRef.current) {
      missingVitalsConfirmedRef.current = false;
      return;
    }

    const missing = measurements.filter(([, value]) => value === "").map(([label]) => label);

    if (missing.length > 0) {
      event.preventDefault();
      setMissingVitalsPrompt(missing);
    }
  }

  return (
    <div className="max-w-5xl">
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
            ? "บันทึกการติดตามผลเป็นรอบใหม่ของโปรแกรมนี้ โดยไม่บังคับให้ต้องเลือกแผนเป้าหมาย"
            : "บันทึกการติดตามผลเป็นรายการใหม่ในประวัติความสัมพันธ์ของโรงพยาบาล"
        }
        title="บันทึกการติดตามผล"
      />

      <form action={action} className="space-y-6 pt-8" onSubmit={confirmMissingVitals} ref={formRef}>
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
              การบันทึกนี้จะอยู่ในประวัติของโปรแกรมนี้โดยตรง และสามารถอ้างอิงแผนเป้าหมายของโปรแกรมเดียวกันได้
            </p>
          ) : (
            <Alert className="mt-4" variant="warning">
              การติดตามผลนี้บันทึกนอก Program จึงจะไม่อยู่ในรายงานโรงพยาบาลตาม Program (ไฟล์ Excel)
              หากต้องการให้อยู่ในรายงาน ให้บันทึกจากครั้งที่ของ Program ของผู้ป่วยรายนี้
            </Alert>
          )}
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em]">วันที่ให้บริการ</h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            วันที่พบหรือติดตามผู้ป่วยจริง ใช้เป็นวันที่ติดตามในรายงาน เลือกย้อนหลังได้แต่เลือกวันในอนาคตไม่ได้
          </p>
          <fieldset className="mt-6 grid gap-5 sm:grid-cols-2" disabled={pending || unknownOutcome || state.status === "SUCCESS"}>
            <label className={labelClassName} htmlFor="followup-service-date">
              <span>วันที่ให้บริการ</span>
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
          <h2 className="text-xl font-semibold tracking-[-0.02em]">บริบทที่เลือก (ไม่บังคับ)</h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            เลือกนัดหมายที่เสร็จสิ้นแล้ว หรือแผนเป้าหมายย้อนหลังที่ต้องการอ้างอิงอย่างชัดเจน
            ระบบจะไม่แนบรายการล่าสุดให้โดยอัตโนมัติ
          </p>
          <fieldset className="mt-6 grid gap-5 sm:grid-cols-2" disabled={pending || unknownOutcome || state.status === "SUCCESS"}>
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
              <span>แผนเป้าหมายที่อ้างอิง</span>
              <Select
                id="followup-goal-plan"
                onChange={(event) => {
                  const nextGoalPlanId = event.target.value;
                  setGoalPlanId(nextGoalPlanId);
                  setProgress(
                    getInitialProgress(
                      goalPlans.find((plan) => plan.goalPlanId === nextGoalPlanId) ?? null,
                    ),
                  );
                }}
                value={goalPlanId}
              >
                <option value="">ไม่เชื่อมโยงแผนเป้าหมาย</option>
                {goalPlans.map((plan) => (
                  <option key={plan.goalPlanId} value={plan.goalPlanId}>
                    {scope.kind === "program" ? "แผนเป้าหมายรอบที่" : "รอบที่"} {plan.roundNumber} · {plan.primaryGoalLabel} · {formatDate(plan.createdAt)}
                  </option>
                ))}
              </Select>
              <span className="text-xs font-normal leading-5 text-text-muted">
                {scope.kind === "program"
                  ? "เลือกได้เฉพาะแผนเป้าหมายของโปรแกรมนี้ ไม่เกิน 50 รอบล่าสุด"
                  : "เลือกได้จากแผนเป้าหมายย้อนหลังที่คุณมีสิทธิ์เข้าถึง ไม่เกิน 50 รอบล่าสุด"}
              </span>
            </label>
          </fieldset>
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em]">ค่าที่บันทึกในการติดตามผล</h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            กรอกเท่าที่มี ระบบจะเก็บค่าที่บันทึกไว้และไม่คำนวณผลทางการแพทย์อัตโนมัติ
          </p>
          <fieldset className="mt-6 grid gap-5 sm:grid-cols-2" disabled={pending || unknownOutcome || state.status === "SUCCESS"}>
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
              <fieldset className="space-y-3" disabled={pending || unknownOutcome || state.status === "SUCCESS"}>
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
                  disabled={pending || unknownOutcome || state.status === "SUCCESS"}
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
                  disabled={pending || unknownOutcome || state.status === "SUCCESS"}
                  id="followup-expert-advice"
                  maxLength={1_000}
                  onChange={(event) => setExpertAdvice(event.target.value)}
                  value={expertAdvice}
                />
              </label>
              <p className="text-sm leading-6 text-text-muted">
                ขั้นตอน “ทบทวนแผนสุขภาพ” ของครั้งนี้จะนับว่าบันทึกแล้วเมื่ออ้างอิงแผนเป้าหมาย ตอบว่าทำตามแผนได้หรือไม่ และกรอก “เกิดอะไรขึ้นบ้าง?”
              </p>
            </div>
          </Panel>
        ) : null}

        {selectedGoalPlan ? (
          <Panel>
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.02em]">ความคืบหน้าตามแผนเป้าหมาย</h2>
              <p className="mt-2 text-sm leading-6 text-text-muted">
                แสดงกิจกรรมจากแผนเป้าหมายรอบที่ {selectedGoalPlan.roundNumber} เท่านั้น
                เลือกสถานะตามข้อมูลที่ต้องการบันทึกในการติดตามผลรอบนี้
              </p>
              <p className="mt-2 text-sm leading-6 text-text-muted">
                เลือกบันทึกเฉพาะกิจกรรมที่ต้องการติดตามในรอบนี้ได้ กิจกรรมที่ไม่เลือกสถานะจะไม่ถูกบันทึก
              </p>
            </div>
            <ul className="mt-6 space-y-5">
              {selectedGoalPlan.items.map((activity) => (
                <ProgressEditor
                  activity={activity}
                  disabled={pending || unknownOutcome || state.status === "SUCCESS"}
                  draft={progress[activity.activityCode] ?? { status: "", achievedDays: "", note: "" }}
                  key={activity.activityCode}
                  onChange={(draft) =>
                    setProgress((current) => ({ ...current, [activity.activityCode]: draft }))
                  }
                />
              ))}
            </ul>
          </Panel>
        ) : null}

        <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em]">การปรับแผนและอุปสรรค</h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            ต้องเลือกทั้งสองข้อ ข้อมูลนี้ใช้ในรายงานการจัดบริการ
          </p>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <fieldset className="space-y-3" disabled={pending || unknownOutcome || state.status === "SUCCESS"}>
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
                    ? "หลังบันทึก ระบบจะพาไปสร้างแผนเป้าหมายรอบใหม่ที่เชื่อมกับการติดตามครั้งนี้"
                    : "หลังบันทึก ให้สร้างแผนเป้าหมายรอบใหม่เพื่อใช้ในการติดตามครั้งถัดไป"}
                </p>
              ) : null}
            </fieldset>
            <fieldset className="space-y-3" disabled={pending || unknownOutcome || state.status === "SUCCESS"}>
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
          <fieldset className="mt-6 grid gap-5 sm:grid-cols-2" disabled={pending || unknownOutcome || state.status === "SUCCESS"}>
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
          <h2 className="text-xl font-semibold tracking-[-0.02em]">ตรวจสอบก่อนบันทึก</h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            การบันทึกจะสร้างรายการติดตามผลใหม่ และเก็บข้อมูลรอบนี้เป็นประวัติที่แก้ไขหรือลบไม่ได้
          </p>
          <dl className="mt-5 grid gap-4 border-y border-border py-5 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-text-muted">นัดหมายที่อ้างอิง</dt>
              <dd className="mt-1 font-semibold text-text">
                {appointmentId ? "เลือกแล้ว" : "ไม่ได้เชื่อมโยง"}
              </dd>
            </div>
            <div>
              <dt className="text-text-muted">แผนเป้าหมายที่อ้างอิง</dt>
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
            <Button disabled={pending || unknownOutcome || state.status === "SUCCESS"} loading={pending} type="submit">
              {pending ? "กำลังบันทึก…" : "บันทึกการติดตามผล"}
            </Button>
            <Link
              className="inline-flex min-h-12 items-center justify-center rounded-control border border-border-strong bg-surface px-5 py-2.5 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              href={
                scope.kind === "program"
                  ? `/app/patients/${encodeURIComponent(relationshipId)}/programs/${encodeURIComponent(scope.patientProgramId)}`
                  : `/app/patients/${encodeURIComponent(relationshipId)}/followups`
              }
            >
              ยกเลิก
            </Link>
          </div>
        </Panel>
      </form>
      <ConfirmDialog
        confirmLabel="บันทึกต่อ"
        description={`ยังไม่ได้กรอก: ${missingVitalsPrompt?.join(", ") ?? ""}`}
        details={
          <p>
            การติดตามผลแก้ไขภายหลังไม่ได้ หากบันทึกต่อ ขั้นตอน “ข้อมูลทั่วไปและสัญญาณชีพ” ของครั้งนี้จะต้องระบุเหตุผลที่ข้าม
          </p>
        }
        onCancel={() => setMissingVitalsPrompt(null)}
        onConfirm={() => {
          setMissingVitalsPrompt(null);
          missingVitalsConfirmedRef.current = true;
          formRef.current?.requestSubmit();
        }}
        open={missingVitalsPrompt !== null}
        title="บันทึกโดยไม่มีค่าสุขภาพครบ?"
      />
    </div>
  );
}
