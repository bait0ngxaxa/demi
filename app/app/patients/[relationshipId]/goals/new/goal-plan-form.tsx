"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { useMutationActionState } from "@/components/ui/mutation-action-state";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import type {
  GoalActivityDefinition,
  GoalTemplate,
} from "@/modules/goals/domain/goal-templates";
import { BOOKLET_PLAN_TEXT, getGoalActivity } from "@/modules/goals/domain/goal-templates";
import { getGoalTargetUnitLabel } from "@/modules/goals/presentation/goal-labels";
import type { GoalPatientSummary } from "@/modules/goals/services/goal-access-service";
import {
  initialGoalPlanActionState,
  type GoalPlanActionState,
} from "@/modules/goals/transport/action-state";
import {
  submitGoalPlanAction,
  submitGoalPlanForProgramAction,
} from "@/modules/goals/transport/server-actions";
import type { ScreeningOutcome } from "@/modules/screening/domain/screening-outcome";
import { screeningOutcomeBadges } from "@/modules/screening/presentation/screening-labels";

type GoalScreeningContextForForm = {
  screeningAssessmentId: string;
  submittedAt: string;
  outcome: ScreeningOutcome;
};

export type GoalPlanFormScope =
  | {
      kind: "relationship";
      relationshipId: string;
    }
  | {
      kind: "program";
      relationshipId: string;
      patientProgramId: string;
      /** Follow-up that chose "ปรับแผน" and leads to this plan (Owner decision BR-06). */
      sourceFollowupId?: string | null;
      /** R1-D: validated round page to return to after saving (`parseRoundReturnPath`). */
      returnTo?: string | null;
    };

type GoalPlanFormProps = {
  scope: GoalPlanFormScope;
  patient: GoalPatientSummary;
  /** The booklet template (R2-E); new plans are always created with it. */
  template: GoalTemplate;
  latestScreening: GoalScreeningContextForForm | null;
  submissionNonce: string;
};

type FormItem = {
  activityCode: string;
  targetDays: number;
  targetValue: string;
};

type GoalKey = "weightLossKg" | "waistCm" | "bloodSugarMgDl" | "hba1cPercent";

type SectionKey = "food" | "exercise";

type SectionState = { notSet: boolean; planText: string; startDate: string };

const NUMERIC_GOALS: readonly { key: GoalKey; text: readonly [string, string]; max: number }[] = [
  { key: "weightLossKg", text: BOOKLET_PLAN_TEXT.weightLoss, max: 200 },
  { key: "waistCm", text: BOOKLET_PLAN_TEXT.waist, max: 300 },
  { key: "bloodSugarMgDl", text: BOOKLET_PLAN_TEXT.bloodSugar, max: 1000 },
  { key: "hba1cPercent", text: BOOKLET_PLAN_TEXT.hba1c, max: 20 },
];

const SECTIONS: readonly { key: SectionKey; category: "FOOD" | "EXERCISE"; label: string }[] = [
  { key: "food", category: "FOOD", label: BOOKLET_PLAN_TEXT.food },
  { key: "exercise", category: "EXERCISE", label: BOOKLET_PLAN_TEXT.exercise },
];

const fieldBaseClassName =
  "min-h-12 rounded-control border border-border bg-surface px-4 text-base font-normal text-text outline-none transition-[border-color,box-shadow] focus:border-action-primary focus:ring-4 focus:ring-focus-ring disabled:cursor-not-allowed disabled:bg-surface-muted";
const fieldClassName = `${fieldBaseClassName} w-full`;
const textareaClassName =
  "min-h-24 w-full rounded-control border border-border bg-surface px-4 py-3 text-base font-normal text-text outline-none transition-[border-color,box-shadow] placeholder:text-text-subtle focus:border-action-primary focus:ring-4 focus:ring-focus-ring disabled:cursor-not-allowed disabled:bg-surface-muted";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function createFormItem(activity: GoalActivityDefinition): FormItem {
  return {
    activityCode: activity.code,
    targetDays: 1,
    targetValue: activity.targetRule ? String(activity.targetRule.defaultValue) : "",
  };
}

function isTargetValid(activity: GoalActivityDefinition, item: FormItem): boolean {
  if (!activity.targetRule) {
    return item.targetValue === "";
  }

  const value = Number(item.targetValue);
  const rule = activity.targetRule;

  if (!Number.isFinite(value) || value < rule.min || value > rule.max) {
    return false;
  }

  const steps = (value - rule.min) / rule.step;
  return Math.abs(steps - Math.round(steps)) < Number.EPSILON * 100;
}

function parseGoalValue(value: string, max: number): number | null {
  const parsed = Number(value);
  return value.trim() !== "" && Number.isFinite(parsed) && parsed > 0 && parsed <= max ? parsed : null;
}

function ActionFeedback({ state }: { state: GoalPlanActionState }): React.JSX.Element | null {
  if (state.status !== "ERROR") {
    return null;
  }

  return (
    <Alert className="mt-5" variant={state.code === "CONFLICT" ? "warning" : "danger"}>
      <p className="font-semibold">บันทึกแผนเป้าหมายไม่สำเร็จ</p>
      <p className="mt-1">{state.message}</p>
    </Alert>
  );
}

function ActivityEditor({
  activity,
  item,
  disabled,
  onChange,
  onRemove,
}: {
  activity: GoalActivityDefinition;
  item: FormItem;
  disabled: boolean;
  onChange: (next: FormItem) => void;
  onRemove: () => void;
}): React.JSX.Element {
  const targetRule = activity.targetRule;
  const targetUnitLabel = targetRule ? getGoalTargetUnitLabel(targetRule.unit) : null;

  return (
    <li className="border-t border-border pt-5 first:border-t-0 first:pt-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <h4 className="font-semibold text-text">{activity.label}</h4>
        <Button disabled={disabled} onClick={onRemove} size="compact" type="button" variant="ghost">
          นำออก
        </Button>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <label className="block space-y-2 text-sm font-semibold">
          <span>เป้าหมายต่อสัปดาห์ (วัน)</span>
          <Select
            aria-label={`จำนวนวันต่อสัปดาห์สำหรับ ${activity.label}`}
            disabled={disabled}
            onChange={(event) => onChange({ ...item, targetDays: Number(event.target.value) })}
            value={item.targetDays}
          >
            {Array.from({ length: 7 }, (_, index) => index + 1).map((days) => (
              <option key={days} value={days}>
                {days} วัน
              </option>
            ))}
          </Select>
        </label>
        {targetRule ? (
          <label className="block space-y-2 text-sm font-semibold sm:col-span-2">
            <span>ค่าเป้าหมาย ({targetUnitLabel})</span>
            <input
              aria-describedby={`${activity.code}-target-help`}
              className={fieldClassName}
              disabled={disabled}
              max={targetRule.max}
              min={targetRule.min}
              onChange={(event) => onChange({ ...item, targetValue: event.target.value })}
              step={targetRule.step}
              type="number"
              value={item.targetValue}
            />
            <span className="block text-xs font-normal text-text-subtle" id={`${activity.code}-target-help`}>
              ช่วงที่กำหนด {targetRule.min}–{targetRule.max} {targetUnitLabel} · ค่าเริ่มต้น {targetRule.defaultValue}
            </span>
          </label>
        ) : null}
      </div>
    </li>
  );
}

export function GoalPlanForm({
  scope,
  patient,
  template,
  latestScreening,
  submissionNonce,
}: GoalPlanFormProps): React.JSX.Element {
  const router = useRouter();
  const relationshipId = scope.relationshipId;
  const programId = scope.kind === "program" ? scope.patientProgramId : null;
  const returnTo = scope.kind === "program" ? (scope.returnTo ?? null) : null;
  const submitAction =
    scope.kind === "program" ? submitGoalPlanForProgramAction : submitGoalPlanAction;
  const [state, action, pending, unknownOutcome, resendUnconfirmed] = useMutationActionState<GoalPlanActionState, FormData>(
    submitAction,
    initialGoalPlanActionState,
  );
  const [goalValues, setGoalValues] = useState<Record<GoalKey, string>>({
    weightLossKg: "",
    waistCm: "",
    bloodSugarMgDl: "",
    hba1cPercent: "",
  });
  const [customGoal, setCustomGoal] = useState("");
  const [sections, setSections] = useState<Record<SectionKey, SectionState>>({
    food: { notSet: false, planText: "", startDate: "" },
    exercise: { notSet: false, planText: "", startDate: "" },
  });
  const [items, setItems] = useState<FormItem[]>([]);
  const [problemsAfterOneMonth, setProblemsAfterOneMonth] = useState("");
  const [patientSignatureName, setPatientSignatureName] = useState("");
  const [witnessSignatureName, setWitnessSignatureName] = useState("");
  const locked = pending || unknownOutcome || state.status === "SUCCESS";

  useEffect(() => {
    if (state.status === "SUCCESS") {
      const destination = returnTo
        ? returnTo
        : programId
          ? `/app/patients/${encodeURIComponent(relationshipId)}/programs/${encodeURIComponent(programId)}/goals/${encodeURIComponent(state.result.goalPlanId)}`
          : `/app/patients/${encodeURIComponent(relationshipId)}/goals/${encodeURIComponent(state.result.goalPlanId)}`;

      router.push(destination);
      return;
    }

    if (
      state.status === "ERROR" &&
      (state.code === "CONFLICT" || state.code === "FORBIDDEN")
    ) {
      router.refresh();
    }
  }, [programId, relationshipId, returnTo, router, state]);

  const selectedCodes = useMemo(() => new Set(items.map((item) => item.activityCode)), [items]);
  const goals = {
    weightLossKg: parseGoalValue(goalValues.weightLossKg, 200),
    waistCm: parseGoalValue(goalValues.waistCm, 300),
    bloodSugarMgDl: parseGoalValue(goalValues.bloodSugarMgDl, 1000),
    hba1cPercent: parseGoalValue(goalValues.hba1cPercent, 20),
    customText: customGoal.trim() || null,
  };
  const hasGoal = Object.values(goals).some((value) => value !== null);
  const goalInputsValid = NUMERIC_GOALS.every(
    ({ key, max }) => goalValues[key].trim() === "" || parseGoalValue(goalValues[key], max) !== null,
  );
  const itemsIn = (category: "FOOD" | "EXERCISE") =>
    items.filter((item) => getGoalActivity(template, item.activityCode)?.category === category);
  const sectionsComplete = SECTIONS.every(({ key, category }) =>
    sections[key].notSet ? itemsIn(category).length === 0 : sections[key].planText.trim() !== "" && itemsIn(category).length > 0,
  );
  const itemsValid = items.every((item) => {
    const activity = getGoalActivity(template, item.activityCode);
    return Boolean(activity && item.targetDays >= 1 && item.targetDays <= 7 && isTargetValid(activity, item));
  });
  const formComplete = hasGoal && goalInputsValid && sectionsComplete && items.length > 0 && itemsValid;

  function toggleActivity(activity: GoalActivityDefinition): void {
    setItems((current) =>
      current.some((item) => item.activityCode === activity.code)
        ? current.filter((item) => item.activityCode !== activity.code)
        : [...current, createFormItem(activity)],
    );
  }

  function updateSection(key: SectionKey, next: Partial<SectionState>): void {
    setSections((current) => ({ ...current, [key]: { ...current[key], ...next } }));
  }

  function setSectionNotSet(key: SectionKey, category: "FOOD" | "EXERCISE", notSet: boolean): void {
    updateSection(key, notSet ? { notSet, planText: "", startDate: "" } : { notSet });

    if (notSet) {
      setItems((current) =>
        current.filter((item) => getGoalActivity(template, item.activityCode)?.category !== category),
      );
    }
  }

  const serializedItems = items.map((item) => {
    const targetRule = getGoalActivity(template, item.activityCode)?.targetRule;

    return {
      activityCode: item.activityCode,
      targetDays: item.targetDays,
      ...(targetRule
        ? { targetValue: Number(item.targetValue), targetUnit: targetRule.unit }
        : {}),
    };
  });
  const serializedBooklet = {
    goals,
    food: {
      notSet: sections.food.notSet,
      planText: sections.food.notSet ? null : sections.food.planText,
      startDate: sections.food.notSet ? null : sections.food.startDate || null,
    },
    exercise: {
      notSet: sections.exercise.notSet,
      planText: sections.exercise.notSet ? null : sections.exercise.planText,
      startDate: sections.exercise.notSet ? null : sections.exercise.startDate || null,
    },
    problemsAfterOneMonth: problemsAfterOneMonth || null,
    patientSignatureName: patientSignatureName || null,
    witnessSignatureName: witnessSignatureName || null,
  };

  return (
    <div className="max-w-5xl">
      <PageHeader
        actions={
          <StatusBadge variant="info">
            {scope.kind === "program"
              ? "Service 2 — แผนสุขภาพและเป้าหมาย"
              : "แผนเป้าหมาย"}
          </StatusBadge>
        }
        breadcrumbs={[
          ...(scope.kind === "program"
            ? [
                {
                  href: `/app/patients/${encodeURIComponent(relationshipId)}/programs/${encodeURIComponent(scope.patientProgramId)}`,
                  label: "รายละเอียดโปรแกรม",
                },
                { label: "สร้างแผนสุขภาพ" },
              ]
            : [
                {
                  href: `/app/patients/${encodeURIComponent(relationshipId)}/goals`,
                  label: "ประวัติแผนเป้าหมาย",
                },
                { label: "สร้างแผนเป้าหมาย" },
              ]),
        ]}
        description={
          scope.kind === "program"
            ? "สร้างแผนสุขภาพรอบใหม่ในโปรแกรมนี้ โดยรอบเดิมจะยังคงเป็นประวัติอ่านได้"
            : "สร้างแผนเป้าหมายและกิจกรรมในประวัติความสัมพันธ์ของโรงพยาบาล"
        }
        title={template.label}
      />

      <form action={action} className="space-y-6 pt-8">
        {scope.kind === "program" ? (
          <>
            <input name="patientProgramId" type="hidden" value={scope.patientProgramId} />
            <input name="sourceFollowupId" type="hidden" value={scope.sourceFollowupId ?? ""} />
          </>
        ) : (
          <input name="patientHospitalRelationshipId" type="hidden" value={relationshipId} />
        )}
        <input name="submissionNonce" type="hidden" value={submissionNonce} />
        <input
          name="sourceScreeningAssessmentId"
          type="hidden"
          value={latestScreening?.screeningAssessmentId ?? ""}
        />
        <input name="items" type="hidden" value={JSON.stringify(serializedItems)} />
        <input name="booklet" type="hidden" value={JSON.stringify(serializedBooklet)} />

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
          {scope.kind === "program" && scope.sourceFollowupId ? (
            <p className="mt-3 text-sm leading-6 text-text-muted">
              แผนนี้สร้างจากการติดตามผลที่เลือก “ปรับแผน” และจะเชื่อมกับการติดตามครั้งนั้น
            </p>
          ) : null}
        </Panel>

        {latestScreening ? (
          <Panel>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.02em]">บริบทจากแบบประเมิน</h2>
                <p className="mt-1 text-sm leading-6 text-text-muted">
                  แบบประเมินล่าสุดบันทึกเมื่อ {formatDate(latestScreening.submittedAt)} · ใช้เป็นบริบทเท่านั้น
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {screeningOutcomeBadges(latestScreening.outcome).map((badge) => (
                  <StatusBadge key={badge.label} variant={badge.variant}>
                    {badge.label}
                  </StatusBadge>
                ))}
              </div>
            </div>
          </Panel>
        ) : null}

        <Panel>
          <fieldset disabled={locked}>
            <legend className="text-xl font-semibold tracking-[-0.02em]">{BOOKLET_PLAN_TEXT.goalsHeading}</legend>
            <div className="mt-5 space-y-4">
              {NUMERIC_GOALS.map(({ key, text, max }) => (
                <label className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-text" key={key}>
                  <span>{text[0]}</span>
                  <input
                    aria-label={`${text[0]} … ${text[1]}`}
                    className={`${fieldBaseClassName} w-28`}
                    inputMode="decimal"
                    max={max}
                    min={0}
                    onChange={(event) => setGoalValues((current) => ({ ...current, [key]: event.target.value }))}
                    step="any"
                    type="number"
                    value={goalValues[key]}
                  />
                  <span>{text[1]}</span>
                </label>
              ))}
              <label className="block space-y-2 text-sm text-text">
                <span>{BOOKLET_PLAN_TEXT.custom} …</span>
                <input
                  className={fieldClassName}
                  maxLength={1000}
                  onChange={(event) => setCustomGoal(event.target.value)}
                  type="text"
                  value={customGoal}
                />
              </label>
            </div>
            {!hasGoal ? (
              <p className="mt-4 text-sm text-text-muted">ยังไม่ได้เลือกเป้าหมาย กรอกอย่างน้อย 1 ข้อ</p>
            ) : null}
          </fieldset>
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em]">{BOOKLET_PLAN_TEXT.planHeading}</h2>
          <div className="mt-6 space-y-8">
            {SECTIONS.map(({ key, category, label }) => {
              const section = sections[key];
              const sectionItems = itemsIn(category);

              return (
                <fieldset className="border-t border-border pt-6 first:border-t-0 first:pt-0" disabled={locked} key={key}>
                  <legend className="text-lg font-semibold text-text">{label}</legend>
                  <label className="mt-3 flex items-center gap-3 text-sm text-text">
                    <input
                      checked={section.notSet}
                      className="h-4 w-4 accent-brand"
                      onChange={(event) => setSectionNotSet(key, category, event.target.checked)}
                      type="checkbox"
                    />
                    <span>{BOOKLET_PLAN_TEXT.sectionNotSet}</span>
                  </label>
                  {section.notSet ? null : (
                    <div className="mt-4 space-y-5">
                      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_14rem]">
                        <label className="block space-y-2 text-sm font-semibold">
                          <span>{BOOKLET_PLAN_TEXT.sectionText} …</span>
                          <textarea
                            className={textareaClassName}
                            maxLength={1000}
                            onChange={(event) => updateSection(key, { planText: event.target.value })}
                            value={section.planText}
                          />
                        </label>
                        <label className="block space-y-2 text-sm font-semibold">
                          <span>{BOOKLET_PLAN_TEXT.sectionStart} …</span>
                          <input
                            className={fieldClassName}
                            onChange={(event) => updateSection(key, { startDate: event.target.value })}
                            type="date"
                            value={section.startDate}
                          />
                        </label>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-text">กิจกรรม (เลือกอย่างน้อย 1 รายการ)</p>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {template.activities
                            .filter((activity) => activity.category === category)
                            .map((activity) => (
                              <label
                                className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-control border px-4 py-3 text-sm transition-colors ${
                                  selectedCodes.has(activity.code)
                                    ? "border-action-primary bg-brand-soft text-brand-strong"
                                    : "border-border bg-surface hover:border-action-primary hover:bg-brand-soft/50"
                                }`}
                                key={activity.code}
                              >
                                <input
                                  checked={selectedCodes.has(activity.code)}
                                  className="h-4 w-4 accent-brand"
                                  onChange={() => toggleActivity(activity)}
                                  type="checkbox"
                                />
                                <span>{activity.label}</span>
                              </label>
                            ))}
                        </div>
                        {sectionItems.length > 0 ? (
                          <ul aria-label={`กิจกรรมที่เลือก: ${label}`} className="mt-5 space-y-5">
                            {sectionItems.map((item) => {
                              const activity = getGoalActivity(template, item.activityCode);

                              return activity ? (
                                <ActivityEditor
                                  activity={activity}
                                  disabled={locked}
                                  item={item}
                                  key={item.activityCode}
                                  onChange={(next) =>
                                    setItems((current) =>
                                      current.map((candidate) =>
                                        candidate.activityCode === next.activityCode ? next : candidate,
                                      ),
                                    )
                                  }
                                  onRemove={() => toggleActivity(activity)}
                                />
                              ) : null;
                            })}
                          </ul>
                        ) : null}
                      </div>
                    </div>
                  )}
                </fieldset>
              );
            })}
          </div>
        </Panel>

        <Panel>
          <fieldset className="space-y-5" disabled={locked}>
            <label className="block space-y-2 text-sm font-semibold">
              <span>{BOOKLET_PLAN_TEXT.problemsAfterOneMonth} … (ไม่บังคับ)</span>
              <textarea
                className={textareaClassName}
                maxLength={2000}
                onChange={(event) => setProblemsAfterOneMonth(event.target.value)}
                value={problemsAfterOneMonth}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-2 text-sm font-semibold">
                <span>
                  {BOOKLET_PLAN_TEXT.patientSignature[0]} … {BOOKLET_PLAN_TEXT.patientSignature[1]}
                </span>
                <input
                  className={fieldClassName}
                  maxLength={200}
                  onChange={(event) => setPatientSignatureName(event.target.value)}
                  type="text"
                  value={patientSignatureName}
                />
              </label>
              <label className="block space-y-2 text-sm font-semibold">
                <span>
                  {BOOKLET_PLAN_TEXT.witnessSignature[0]} … {BOOKLET_PLAN_TEXT.witnessSignature[1]}
                </span>
                <input
                  className={fieldClassName}
                  maxLength={200}
                  onChange={(event) => setWitnessSignatureName(event.target.value)}
                  type="text"
                  value={witnessSignatureName}
                />
              </label>
            </div>
            <p className="text-xs leading-5 text-text-subtle">
              พิมพ์ชื่อผู้ป่วยและพยาน รูปหน้าที่ลงชื่อแล้วแนบได้หลังบันทึกแผนในโปรแกรม
            </p>
          </fieldset>
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em]">ตรวจสอบก่อนส่ง</h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            แผนที่บันทึกแล้วแก้ไขไม่ได้ หากต้องการเปลี่ยนให้ปรับแผนจากการติดตามผล
          </p>
          <ActionFeedback state={state} />
          <UnknownOutcomeAlert active={unknownOutcome} className="mt-5" recovery={{ kind: "resend", onResend: resendUnconfirmed, resending: pending }} />
          {state.status === "SUCCESS" ? (
            <Alert className="mt-5" variant="success">บันทึกแล้ว กำลังเปิดรายการที่บันทึก...</Alert>
          ) : null}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button disabled={locked || !formComplete} loading={pending} type="submit">
              {pending ? "กำลังตรวจสอบและบันทึก..." : "ตรวจสอบและบันทึกแผน"}
            </Button>
            <Link
              className="inline-flex min-h-12 items-center justify-center rounded-control border border-border-strong bg-surface px-5 py-2.5 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              href={
                scope.kind === "program"
                  ? `/app/patients/${encodeURIComponent(relationshipId)}/programs/${encodeURIComponent(scope.patientProgramId)}`
                  : `/app/patients/${encodeURIComponent(relationshipId)}/goals`
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
