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
  type: "FOLLOW_UP" | "CONSULTATION";
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
  note: string;
};

export type FollowupFormScope =
  | {
      kind: "relationship";
      relationshipId: string;
    }
  | {
      kind: "program";
      relationshipId: string;
      patientProgramId: string;
    };

type FollowupFormProps = {
  scope: FollowupFormScope;
  patient: PatientContext;
  appointments: AppointmentOption[];
  goalPlans: GoalPlanOption[];
  selectedAppointmentId: string | null;
  selectedGoalPlanId: string | null;
  submissionNonce: string;
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

function appointmentTypeLabel(type: AppointmentOption["type"]): string {
  return type === "FOLLOW_UP" ? "ติดตามผล" : "ให้คำปรึกษา";
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
      { status: "", note: "" },
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
            onChange={(event) =>
              onChange({
                ...draft,
                status: event.target.value as FollowupProgressStatus | "",
              })
            }
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
        <label className={labelClassName} htmlFor={`progress-note-${activity.activityCode}`}>
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
}: FollowupFormProps): React.JSX.Element {
  const router = useRouter();
  const relationshipId = scope.relationshipId;
  const programId = scope.kind === "program" ? scope.patientProgramId : null;
  const createAction =
    scope.kind === "program" ? createFollowupForProgramAction : createFollowupAction;
  const [state, action, pending] = useActionState<FollowupActionState, FormData>(
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
      const destination = programId
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
  }, [programId, relationshipId, router, state]);

  const serializedProgress = selectedGoalPlan
    ? selectedGoalPlan.items.flatMap((activity) => {
        const draft = progress[activity.activityCode];

        return draft?.status
          ? [{ goalActivityCode: activity.activityCode, status: draft.status, note: draft.note || null }]
          : [];
      })
    : [];
  const measurementCount = [
    weight,
    waistCircumference,
    systolicBloodPressure,
    diastolicBloodPressure,
    bloodSugar,
  ].filter(Boolean).length;

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

      <form action={action} className="space-y-6 pt-8">
        {scope.kind === "program" ? (
          <input name="patientProgramId" type="hidden" value={scope.patientProgramId} />
        ) : (
          <input name="patientHospitalRelationshipId" type="hidden" value={relationshipId} />
        )}
        <input name="submissionNonce" type="hidden" value={submissionNonce} />
        <input name="appointmentId" readOnly type="hidden" value={appointmentId} />
        <input name="sourceGoalPlanId" readOnly type="hidden" value={goalPlanId} />
        <input name="weight" readOnly type="hidden" value={weight} />
        <input name="waistCircumference" readOnly type="hidden" value={waistCircumference} />
        <input name="systolicBloodPressure" readOnly type="hidden" value={systolicBloodPressure} />
        <input name="diastolicBloodPressure" readOnly type="hidden" value={diastolicBloodPressure} />
        <input name="bloodSugar" readOnly type="hidden" value={bloodSugar} />
        <input name="confidenceScore" readOnly type="hidden" value={confidenceScore} />
        <input name="reflectionNote" readOnly type="hidden" value={reflectionNote} />
        <input name="confidencePlan" readOnly type="hidden" value={confidencePlan} />
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
          ) : null}
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em]">บริบทที่เลือก (ไม่บังคับ)</h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            เลือกนัดหมายที่เสร็จสิ้นแล้ว หรือแผนเป้าหมายย้อนหลังที่ต้องการอ้างอิงอย่างชัดเจน
            ระบบจะไม่แนบรายการล่าสุดให้โดยอัตโนมัติ
          </p>
          <fieldset className="mt-6 grid gap-5 sm:grid-cols-2" disabled={pending}>
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
                    {appointmentTypeLabel(appointment.type)} · {formatDate(appointment.scheduledAt)}
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
          <fieldset className="mt-6 grid gap-5 sm:grid-cols-2" disabled={pending}>
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
          </fieldset>
        </Panel>

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
                  disabled={pending}
                  draft={progress[activity.activityCode] ?? { status: "", note: "" }}
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
          <h2 className="text-xl font-semibold tracking-[-0.02em]">ความมั่นใจ / สิ่งที่ต้องการสะท้อน / หมายเหตุ</h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            บันทึกข้อมูลตามที่เหมาะสม ระบบจะไม่ใช้ข้อมูลส่วนนี้คำนวณคะแนนหรือแนะนำการรักษา
          </p>
          <fieldset className="mt-6 grid gap-5 sm:grid-cols-2" disabled={pending}>
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
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button disabled={pending} loading={pending} type="submit">
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
    </div>
  );
}
