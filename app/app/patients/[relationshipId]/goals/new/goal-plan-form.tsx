"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";
import type {
  GoalActivityCategory,
  GoalActivityDefinition,
  GoalPAMLevel,
  GoalTemplate,
} from "@/modules/goals/domain/goal-templates";
import {
  getGoalActivity,
  getGoalSuggestion,
} from "@/modules/goals/domain/goal-templates";
import type { GoalPatientSummary } from "@/modules/goals/services/goal-access-service";
import {
  initialGoalPlanActionState,
  type GoalPlanActionState,
} from "@/modules/goals/transport/action-state";
import { submitGoalPlanAction } from "@/modules/goals/transport/server-actions";

type GoalScreeningContextForForm = {
  screeningAssessmentId: string;
  submittedAt: string;
  result: {
    level: GoalPAMLevel;
    zone: "RED" | "YELLOW" | "GREEN";
  };
};

type GoalPlanFormProps = {
  relationshipId: string;
  patient: GoalPatientSummary;
  template: GoalTemplate;
  latestScreening: GoalScreeningContextForForm | null;
  submissionNonce: string;
};

type FormItem = {
  activityCode: string;
  targetDays: number;
  targetValue: string;
};

const categoryLabels: Record<GoalActivityCategory, string> = {
  FOOD: "อาหาร",
  EXERCISE: "กิจกรรมทางกาย",
  MEASUREMENT: "การติดตาม",
  REST: "การพักผ่อน",
};

const categoryOrder: readonly GoalActivityCategory[] = ["FOOD", "EXERCISE", "MEASUREMENT", "REST"];

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function zoneVariant(zone: GoalScreeningContextForForm["result"]["zone"]): StatusVariant {
  if (zone === "RED") {
    return "danger";
  }

  if (zone === "YELLOW") {
    return "warning";
  }

  return "success";
}

function getInitialItems(
  template: GoalTemplate,
  latestScreening: GoalScreeningContextForForm | null,
): FormItem[] {
  const suggestion = latestScreening
    ? getGoalSuggestion(template, latestScreening.result.level)
    : null;

  if (!suggestion) {
    return [];
  }

  return suggestion.activityCodes.flatMap((activityCode) => {
    const activity = getGoalActivity(template, activityCode);

    if (!activity) {
      return [];
    }

    return [createFormItem(activity, suggestion.defaultTargetDays)];
  });
}

function createFormItem(activity: GoalActivityDefinition, defaultTargetDays: number): FormItem {
  return {
    activityCode: activity.code,
    targetDays: Math.max(1, Math.min(7, defaultTargetDays || 1)),
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

function ActionFeedback({ state }: { state: GoalPlanActionState }): React.JSX.Element | null {
  if (state.status !== "ERROR") {
    return null;
  }

  return (
    <Alert className="mt-5" variant={state.code === "CONFLICT" ? "warning" : "danger"}>
      <p className="font-semibold">ส่ง Goal Plan ไม่สำเร็จ</p>
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

  return (
    <li className="border-t border-border pt-5 first:border-t-0 first:pt-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-semibold text-text">{activity.label}</h3>
          <p className="mt-1 text-sm leading-6 text-text-muted">รหัสกิจกรรม: {activity.code}</p>
        </div>
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
            <span>ค่าเป้าหมาย ({targetRule.unit})</span>
            <input
              aria-describedby={`${activity.code}-target-help`}
              className="min-h-12 w-full rounded-control border border-border bg-surface px-4 text-base font-normal text-text outline-none transition-[border-color,box-shadow] focus:border-action-primary focus:ring-4 focus:ring-focus-ring disabled:cursor-not-allowed disabled:bg-surface-muted"
              disabled={disabled}
              max={targetRule.max}
              min={targetRule.min}
              onChange={(event) => onChange({ ...item, targetValue: event.target.value })}
              step={targetRule.step}
              type="number"
              value={item.targetValue}
            />
            <span className="block text-xs font-normal text-text-subtle" id={`${activity.code}-target-help`}>
              ช่วงต้นแบบ {targetRule.min}–{targetRule.max} {targetRule.unit} · ค่าเริ่มต้น {targetRule.defaultValue}
            </span>
          </label>
        ) : (
          <p className="text-sm leading-6 text-text-muted sm:col-span-2">
            กิจกรรมนี้ยังไม่มีค่าเป้าหมายเชิงตัวเลขใน template ต้นแบบ
          </p>
        )}
      </div>
    </li>
  );
}

export function GoalPlanForm({
  relationshipId,
  patient,
  template,
  latestScreening,
  submissionNonce,
}: GoalPlanFormProps): React.JSX.Element {
  const router = useRouter();
  const [state, action, pending] = useActionState<GoalPlanActionState, FormData>(
    submitGoalPlanAction,
    initialGoalPlanActionState,
  );
  const [primaryGoalCode, setPrimaryGoalCode] = useState("");
  const [items, setItems] = useState<FormItem[]>(() => getInitialItems(template, latestScreening));
  const [primaryGoalNote, setPrimaryGoalNote] = useState("");
  const [weeklyNote, setWeeklyNote] = useState("");

  useEffect(() => {
    if (state.status === "SUCCESS") {
      router.push(
        `/app/patients/${encodeURIComponent(relationshipId)}/goals/${encodeURIComponent(state.result.goalPlanId)}`,
      );
    }
  }, [relationshipId, router, state]);

  const selectedCodes = useMemo(() => new Set(items.map((item) => item.activityCode)), [items]);
  const itemsByCategory = useMemo(
    () =>
      categoryOrder.map((category) => ({
        category,
        activities: template.activities.filter((activity) => activity.category === category),
      })),
    [template.activities],
  );
  const formComplete =
    template.primaryGoals.some((goal) => goal.code === primaryGoalCode) &&
    items.length > 0 &&
    items.every((item) => {
      const activity = getGoalActivity(template, item.activityCode);
      return Boolean(activity && item.targetDays >= 1 && item.targetDays <= 7 && isTargetValid(activity, item));
    });

  function toggleActivity(activity: GoalActivityDefinition): void {
    setItems((current) => {
      const existing = current.find((item) => item.activityCode === activity.code);

      if (existing) {
        return current.filter((item) => item.activityCode !== activity.code);
      }

      const suggestion = latestScreening
        ? getGoalSuggestion(template, latestScreening.result.level)
        : null;
      const suggestedDays = suggestion?.defaultTargetDays ?? 1;

      return [...current, createFormItem(activity, suggestedDays)];
    });
  }

  const serializedItems = items.map((item) => {
    const activity = getGoalActivity(template, item.activityCode);
    const targetRule = activity?.targetRule;

    return {
      activityCode: item.activityCode,
      targetDays: item.targetDays,
      ...(targetRule
        ? { targetValue: Number(item.targetValue), targetUnit: targetRule.unit }
        : {}),
    };
  });

  return (
    <div className="max-w-5xl">
      <PageHeader
        actions={<StatusBadge variant="warning">ต้นแบบเพื่อเก็บ Requirement</StatusBadge>}
        breadcrumbs={[
          {
            href: `/app/patients/${encodeURIComponent(relationshipId)}/goals`,
            label: "Goals / Activity Plan",
          },
          { label: "สร้าง Goal Plan" },
        ]}
        description="สร้าง Goal Plan รอบใหม่เพื่อทดลอง workflow และเก็บ feedback จากลูกค้า"
        title="สร้าง Goal Plan"
      />

      <form action={action} className="space-y-6 pt-8">
        <input name="patientHospitalRelationshipId" type="hidden" value={relationshipId} />
        <input name="submissionNonce" type="hidden" value={submissionNonce} />
        <input
          name="sourceScreeningAssessmentId"
          type="hidden"
          value={latestScreening?.screeningAssessmentId ?? ""}
        />
        <input name="items" type="hidden" value={JSON.stringify(serializedItems)} />

        <Alert variant="warning">
          <p className="font-semibold">ต้นแบบเพื่อเก็บ Requirement</p>
          <p className="mt-1">
            เป้าหมาย กิจกรรม ค่าเริ่มต้น และความสัมพันธ์กับผล Screening ในหน้านี้เป็นต้นแบบอ้างอิงรูปแบบจากระบบ DEMI เดิม
            และยังไม่ใช่ข้อกำหนดทางคลินิกฉบับสุดท้าย
          </p>
          <p className="mt-2 text-xs">Template: {template.key} · {template.version}</p>
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
              <h2 className="text-xl font-semibold tracking-[-0.02em]">บริบท Screening</h2>
              <p className="mt-1 text-sm leading-6 text-text-muted">
                Screening เป็นบริบทหรือค่าเริ่มต้นเท่านั้น ไม่ได้สร้างหรือบังคับ Goal Plan อัตโนมัติ
              </p>
            </div>
            {latestScreening ? (
              <StatusBadge variant={zoneVariant(latestScreening.result.zone)}>
                {latestScreening.result.level} · {latestScreening.result.zone}
              </StatusBadge>
            ) : null}
          </div>
          {latestScreening ? (
            <div className="mt-5 rounded-control border border-border bg-surface-muted px-4 py-4">
              <p className="text-sm leading-6 text-text">
                Screening ล่าสุดส่งเมื่อ {formatDate(latestScreening.submittedAt)}
              </p>
              <p className="mt-3 text-sm leading-6 text-text-muted">
                Screening นี้ใช้เป็นบริบทสำหรับค่าเริ่มต้นของ Goal Plan รอบนี้
                ผู้ใช้ยังสามารถปรับ เพิ่ม หรือนำกิจกรรมออกก่อนส่งได้ และไม่ใช่การบังคับทางคลินิก
              </p>
            </div>
          ) : (
            <p className="mt-5 border-t border-border pt-5 text-sm leading-6 text-text-muted">
              ยังไม่มี Screening ล่าสุด คุณยังสร้าง Goal Plan รอบนี้ได้ตาม prototype policy
            </p>
          )}
        </Panel>

        <Panel>
          <fieldset disabled={pending}>
            <legend className="text-xl font-semibold tracking-[-0.02em]">Primary Goal</legend>
            <p className="mt-2 text-sm leading-6 text-text-muted">เลือกเป้าหมายหลักหนึ่งรายการสำหรับ Goal Plan รอบนี้</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {template.primaryGoals.map((goal) => (
                <label
                  className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-control border px-4 py-3 text-sm transition-colors ${
                    primaryGoalCode === goal.code
                      ? "border-action-primary bg-brand-soft text-brand-strong"
                      : "border-border bg-surface hover:border-action-primary hover:bg-brand-soft/50"
                  }`}
                  key={goal.code}
                >
                  <input
                    checked={primaryGoalCode === goal.code}
                    className="h-4 w-4 accent-brand"
                    name="primaryGoalCode"
                    onChange={() => setPrimaryGoalCode(goal.code)}
                    type="radio"
                    value={goal.code}
                  />
                  <span>{goal.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="mt-6 grid gap-5 border-t border-border pt-5 sm:grid-cols-2">
            <label className="block space-y-2 text-sm font-semibold">
              <span>หมายเหตุ Primary Goal (ไม่บังคับ)</span>
              <textarea
                className="min-h-28 w-full rounded-control border border-border bg-surface px-4 py-3 text-base font-normal text-text outline-none transition-[border-color,box-shadow] placeholder:text-text-subtle focus:border-action-primary focus:ring-4 focus:ring-focus-ring disabled:cursor-not-allowed disabled:bg-surface-muted"
                disabled={pending}
                maxLength={1000}
                name="primaryGoalNote"
                onChange={(event) => setPrimaryGoalNote(event.target.value)}
                placeholder="บันทึกเฉพาะที่จำเป็นต่อการทดลองต้นแบบ"
                value={primaryGoalNote}
              />
            </label>
            <label className="block space-y-2 text-sm font-semibold">
              <span>หมายเหตุรายสัปดาห์ (ไม่บังคับ)</span>
              <textarea
                className="min-h-28 w-full rounded-control border border-border bg-surface px-4 py-3 text-base font-normal text-text outline-none transition-[border-color,box-shadow] placeholder:text-text-subtle focus:border-action-primary focus:ring-4 focus:ring-focus-ring disabled:cursor-not-allowed disabled:bg-surface-muted"
                disabled={pending}
                maxLength={2000}
                name="weeklyNote"
                onChange={(event) => setWeeklyNote(event.target.value)}
                placeholder="บันทึกเฉพาะที่จำเป็นต่อการทดลองต้นแบบ"
                value={weeklyNote}
              />
            </label>
          </div>
        </Panel>

        <Panel>
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Weekly Activities</h2>
            <p className="mt-2 text-sm leading-6 text-text-muted">
              ค่าเริ่มต้นด้านล่างเป็นข้อมูลต้นแบบจากระดับ Screening และสามารถเพิ่มหรือนำกิจกรรมออกเป็นรายรายการ
            </p>
          </div>

          <div className="mt-6 space-y-6">
            {itemsByCategory.map(({ category, activities }) => (
              <fieldset className="border-t border-border pt-5 first:border-t-0 first:pt-0" disabled={pending} key={category}>
                <legend className="text-base font-semibold text-text">{categoryLabels[category]}</legend>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {activities.map((activity) => (
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
              </fieldset>
            ))}
          </div>

          <div className="mt-7 border-t border-border pt-6">
            <h3 className="text-base font-semibold text-text">กิจกรรมที่เลือก</h3>
            {items.length > 0 ? (
              <ul className="mt-5 space-y-5" aria-label="กิจกรรมที่เลือก">
                {items.map((item) => {
                  const activity = getGoalActivity(template, item.activityCode);

                  if (!activity) {
                    return null;
                  }

                  return (
                    <ActivityEditor
                      activity={activity}
                      disabled={pending}
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
                  );
                })}
              </ul>
            ) : (
              <p className="mt-3 rounded-control border border-dashed border-border px-4 py-4 text-sm leading-6 text-text-muted">
                ยังไม่ได้เลือกกิจกรรม กรุณาเลือกอย่างน้อยหนึ่งรายการเพื่อส่ง Goal Plan
              </p>
            )}
          </div>
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em]">ตรวจสอบก่อนส่ง</h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            รอบใหม่จะถูกบันทึกเป็นประวัติอีกหนึ่งรายการ และจะไม่แก้ไข Goal Plan รอบเดิม
          </p>
          <dl className="mt-5 grid gap-4 border-y border-border py-5 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-text-muted">Primary Goal</dt>
              <dd className="mt-1 font-semibold text-text">
                {template.primaryGoals.find((goal) => goal.code === primaryGoalCode)?.label ?? "ยังไม่ได้เลือก"}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-text-muted">กิจกรรม</dt>
              <dd className="mt-1 font-semibold text-text">{items.length} รายการ</dd>
            </div>
          </dl>
          <p className="mt-5 text-xs leading-5 text-text-subtle">
            ค่าทั้งหมดจะถูกตรวจสอบซ้ำกับ template ต้นแบบฝั่งเซิร์ฟเวอร์ อำนาจการยืนยันไม่ได้อยู่ที่เบราว์เซอร์
          </p>
          <ActionFeedback state={state} />
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button disabled={pending || !formComplete} type="submit">
              {pending ? "กำลังตรวจสอบและบันทึก..." : "ตรวจสอบและส่ง Goal Plan"}
            </Button>
            <Link
              className="inline-flex min-h-12 items-center justify-center rounded-control border border-border-strong bg-surface px-5 py-2.5 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              href={`/app/patients/${encodeURIComponent(relationshipId)}/goals`}
            >
              ยกเลิก
            </Link>
          </div>
        </Panel>
      </form>
    </div>
  );
}

