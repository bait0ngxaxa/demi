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
import { createFollowupAction } from "@/modules/followups/transport/server-actions";

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

type FollowupFormProps = {
  relationshipId: string;
  patient: PatientContext;
  appointments: AppointmentOption[];
  goalPlans: GoalPlanOption[];
  selectedAppointmentId: string | null;
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
  return type === "FOLLOW_UP" ? "Follow-up" : "Consultation";
}

function targetSummary(activity: GoalPlanActivityOption): string {
  const target = activity.targetValue === null
    ? "ไม่มีค่าเป้าหมายตัวเลข"
    : `${activity.targetValue} ${activity.targetUnit ?? "หน่วยต้นแบบ"}`;

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
      <p className="font-semibold">บันทึก Follow-up ไม่สำเร็จ</p>
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
          รหัสกิจกรรม: {activity.activityCode} · {targetSummary(activity)}
        </p>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className={labelClassName} htmlFor={`progress-status-${activity.activityCode}`}>
          <span>สถานะความคืบหน้า (ค่าตั้งต้น)</span>
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
            placeholder="บันทึกเฉพาะสิ่งที่ต้องการนำไปคุยกับลูกค้า"
            value={draft.note}
          />
        </label>
      </div>
    </li>
  );
}

export function FollowupForm({
  relationshipId,
  patient,
  appointments,
  goalPlans,
  selectedAppointmentId,
  submissionNonce,
}: FollowupFormProps): React.JSX.Element {
  const router = useRouter();
  const [state, action, pending] = useActionState<FollowupActionState, FormData>(
    createFollowupAction,
    initialFollowupActionState,
  );
  const [appointmentId, setAppointmentId] = useState(selectedAppointmentId ?? "");
  const [goalPlanId, setGoalPlanId] = useState("");
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
    getInitialProgress(null),
  );

  useEffect(() => {
    if (state.status === "SUCCESS") {
      router.push(
        `/app/patients/${encodeURIComponent(relationshipId)}/followups/${encodeURIComponent(state.result.followupId)}`,
      );
    }
  }, [relationshipId, router, state]);

  const serializedProgress = selectedGoalPlan
    ? selectedGoalPlan.items.flatMap((activity) => {
        const draft = progress[activity.activityCode];

        return draft?.status
          ? [{ goalActivityCode: activity.activityCode, status: draft.status, note: draft.note || null }]
          : [];
      })
    : [];
  const progressComplete =
    !selectedGoalPlan || selectedGoalPlan.items.every((activity) => Boolean(progress[activity.activityCode]?.status));
  const formComplete = progressComplete;
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
        actions={<StatusBadge variant="warning">ต้นแบบเพื่อเก็บ Requirement</StatusBadge>}
        breadcrumbs={[
          {
            href: `/app/patients/${encodeURIComponent(relationshipId)}`,
            label: "รายละเอียดผู้ป่วย",
          },
          {
            href: `/app/patients/${encodeURIComponent(relationshipId)}/followups`,
            label: "Follow-ups",
          },
          { label: "บันทึก Follow-up" },
        ]}
        description="บันทึก Follow-up เป็น historical round ใหม่ภายใต้ Patient–Hospital relationship นี้"
        title="บันทึก Follow-up"
      />

      <form action={action} className="space-y-6 pt-8">
        <input name="patientHospitalRelationshipId" type="hidden" value={relationshipId} />
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

        <Alert variant="warning">
          <p className="font-semibold">ต้นแบบเพื่อเก็บ Requirement</p>
          <p className="mt-1">
            semantics ของ measurement, สถานะ progress และพฤติกรรม confidence ในฟอร์มนี้เป็น provisional เพื่อเก็บ Requirement
          </p>
          <p className="mt-2">
            อำนาจของผู้บันทึกขั้นสุดท้ายยังรอการยืนยันจากลูกค้า และต้นแบบนี้ไม่ให้คำแนะนำ การวินิจฉัย หรือข้อสรุปทางคลินิกอัตโนมัติ
          </p>
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
          <h2 className="text-xl font-semibold tracking-[-0.02em]">บริบทที่เลือก (ไม่บังคับ)</h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            เลือก Appointment ที่สถานะ COMPLETED หรือ Goal Plan historical round ที่ต้องการอ้างอิงอย่างชัดเจน
            ระบบจะไม่แนบรายการล่าสุดให้โดยอัตโนมัติ
          </p>
          <fieldset className="mt-6 grid gap-5 sm:grid-cols-2" disabled={pending}>
            <label className={labelClassName} htmlFor="followup-appointment">
              <span>Appointment context</span>
              <Select
                id="followup-appointment"
                onChange={(event) => setAppointmentId(event.target.value)}
                value={appointmentId}
              >
                <option value="">ไม่มี Appointment context</option>
                {appointments.map((appointment) => (
                  <option key={appointment.appointmentId} value={appointment.appointmentId}>
                    {appointmentTypeLabel(appointment.type)} · {formatDate(appointment.scheduledAt)}
                  </option>
                ))}
              </Select>
              <span className="text-xs font-normal leading-5 text-text-muted">
                แสดงเฉพาะ Appointment ที่ server ตรวจว่า COMPLETED ใน relationship นี้
              </span>
            </label>
            <label className={labelClassName} htmlFor="followup-goal-plan">
              <span>Goal Plan context</span>
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
                <option value="">ไม่มี Goal Plan context</option>
                {goalPlans.map((plan) => (
                  <option key={plan.goalPlanId} value={plan.goalPlanId}>
                    รอบที่ {plan.roundNumber} · {plan.primaryGoalLabel} · {formatDate(plan.createdAt)}
                  </option>
                ))}
              </Select>
              <span className="text-xs font-normal leading-5 text-text-muted">
                เลือกได้จาก historical Goal Plan ที่เข้าถึงได้ไม่เกิน 50 รอบล่าสุด
              </span>
            </label>
          </fieldset>
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em]">Measurements (provisional)</h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            ช่องเหล่านี้มีไว้ทดลองเก็บ Requirement เท่านั้น หน่วยและความหมายยังไม่ final และระบบจะไม่คำนวณผลทางการแพทย์
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
              <h2 className="text-xl font-semibold tracking-[-0.02em]">Goal Activity Progress (provisional)</h2>
              <p className="mt-2 text-sm leading-6 text-text-muted">
                แสดงกิจกรรมจาก Goal Plan รอบที่ {selectedGoalPlan.roundNumber} เท่านั้น
                สถานะด้านล่างเป็นค่าตั้งต้นเพื่อคุยกับลูกค้า ไม่ใช่ข้อสรุป adherence หรือผลลัพธ์ทางคลินิก
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
          <h2 className="text-xl font-semibold tracking-[-0.02em]">Confidence / Reflection / Notes</h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            confidence 0–10 และข้อความทั้งหมดเป็น provisional สำหรับ requirement validation ยังไม่ใช่เครื่องมือที่ผ่านการรับรอง
          </p>
          <fieldset className="mt-6 grid gap-5 sm:grid-cols-2" disabled={pending}>
            <label className={labelClassName} htmlFor="followup-confidence-score">
              <span>Confidence score (0–10)</span>
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
              <span>Reflection (ไม่บังคับ)</span>
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
              <span>Confidence plan (ไม่บังคับ)</span>
              <textarea
                className={`${inputClassName} min-h-28 py-3`}
                id="followup-confidence-plan"
                maxLength={2_000}
                onChange={(event) => setConfidencePlan(event.target.value)}
                placeholder="แผนหรือสิ่งที่อยากทดลองต่อ โดยไม่ใช่คำแนะนำทางคลินิก"
                value={confidencePlan}
              />
            </label>
            <label className={`${labelClassName} sm:col-span-2`} htmlFor="followup-general-note">
              <span>General note (ไม่บังคับ)</span>
              <textarea
                className={`${inputClassName} min-h-28 py-3`}
                id="followup-general-note"
                maxLength={2_000}
                onChange={(event) => setGeneralNote(event.target.value)}
                placeholder="บันทึกทั่วไปที่จำเป็นต่อการเก็บ Requirement"
                value={generalNote}
              />
            </label>
          </fieldset>
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em]">Review / Submit</h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            การกดส่งจะสร้าง Follow-up historical round ใหม่และทำให้ข้อมูลรอบนี้ immutable ใน prototype นี้
            ไม่มีการแก้ไข ลบ หรือ silent correction
          </p>
          <dl className="mt-5 grid gap-4 border-y border-border py-5 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-text-muted">Appointment context</dt>
              <dd className="mt-1 font-semibold text-text">
                {appointmentId ? "เลือกแล้ว" : "ไม่ได้เลือก"}
              </dd>
            </div>
            <div>
              <dt className="text-text-muted">Goal Plan context</dt>
              <dd className="mt-1 font-semibold text-text">
                {selectedGoalPlan ? `รอบที่ ${selectedGoalPlan.roundNumber}` : "ไม่ได้เลือก"}
              </dd>
            </div>
            <div>
              <dt className="text-text-muted">Measurements</dt>
              <dd className="mt-1 font-semibold text-text">กรอกแล้ว {measurementCount} รายการ</dd>
            </div>
          </dl>
          {!formComplete ? (
            <p className="mt-3 text-sm font-semibold text-danger">
              กรุณาเลือกสถานะให้ครบทุกกิจกรรมก่อนส่ง
            </p>
          ) : null}
          <ActionFeedback state={state} />
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button disabled={pending || !formComplete} type="submit">
              {pending ? "กำลังบันทึก…" : "ส่ง Follow-up"}
            </Button>
            <Link
              className="inline-flex min-h-12 items-center justify-center rounded-control border border-border-strong bg-surface px-5 py-2.5 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              href={`/app/patients/${encodeURIComponent(relationshipId)}/followups`}
            >
              ยกเลิก
            </Link>
          </div>
        </Panel>
      </form>
    </div>
  );
}
