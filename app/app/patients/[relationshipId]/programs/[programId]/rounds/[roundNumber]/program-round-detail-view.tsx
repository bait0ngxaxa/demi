import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  ROUND_SUMMARY_STEP,
  type RoundStepState,
} from "@/modules/patient-program-rounds/domain/round-steps";
import {
  buildPatientRoundsPath,
  buildRoundAfterStepPath,
  buildRoundStepPath,
  formatRoundDate,
  formatRoundNumber,
  roundLockedLabel,
  roundSkipDescription,
  roundStepStatusLabel,
  ROUND_STATE_LABELS,
} from "@/modules/patient-program-rounds/presentation/round-labels";
import { buildRoundReturnQuery } from "@/modules/patient-program-rounds/presentation/round-return-path";
import type {
  ProgramRoundDetail,
  RoundHealthPathRow,
  RoundPlanItem,
  RoundVitalsView,
} from "@/modules/patient-program-rounds/services/round-query-service";
import { ageInFullYears } from "@/shared/time/age";

import { ServiceOneToolStep, type ServiceOneToolKey } from "../../service-one-workspace";
import { RoundReviewButton } from "./round-review-button";
import { CompleteRoundControl, RoundProfileForm, SkipStepControl, UnskipStepControl } from "./round-step-controls";
import { RoundVitalsForm } from "./round-vitals-form";

export type RoundCurrentStep = RoundStepState["code"] | typeof ROUND_SUMMARY_STEP;

export type ProgramRoundNonces = {
  vitals: string;
  completion: string;
  review: Record<"PAM" | "PROMS" | "HEALTH_PATH", string>;
};

const progressStatusLabels = {
  DONE: "ทำได้",
  PARTIAL: "ทำได้บางส่วน",
  NOT_DONE: "ยังทำไม่ได้",
  NOT_APPLICABLE: "ไม่เกี่ยวข้อง",
} as const;

const TOOL_KEYS: Partial<Record<RoundStepState["code"], ServiceOneToolKey>> = {
  CONFIDENCE_RULER: "confidence",
  ROUTINE: "routine",
  FLOATING_CHART: "floatingChart",
  DREAM_CARD: "dreamCard",
};

const linkClassName = "font-semibold text-brand-strong underline decoration-brand-muted underline-offset-4";

function stepMarker(step: RoundStepState, index: number): string {
  if (step.status === "DONE") {
    return "✓";
  }

  return step.status === "SKIPPED" ? "–" : String(index + 1);
}

function stepBadgeVariant(step: RoundStepState): "success" | "warning" | "neutral" {
  return step.status === "DONE" ? "success" : step.status === "SKIPPED" ? "warning" : "neutral";
}

function VitalsList({ vitals }: { vitals: RoundVitalsView }): React.JSX.Element {
  return (
    <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {[
        ["วันที่ให้บริการ", formatRoundDate(vitals.serviceDate)],
        ["น้ำหนัก (kg)", formatRoundNumber(vitals.weight)],
        ["ส่วนสูง (cm)", formatRoundNumber(vitals.heightCm)],
        ["BMI (kg/m²)", formatRoundNumber(vitals.bmi)],
        ["รอบเอว (cm)", formatRoundNumber(vitals.waistCircumference)],
        ["น้ำตาลในเลือด / DTX (mg/dL)", formatRoundNumber(vitals.bloodSugar)],
        ["ความดันตัวบน (mmHg)", formatRoundNumber(vitals.systolicBloodPressure)],
        ["ความดันตัวล่าง (mmHg)", formatRoundNumber(vitals.diastolicBloodPressure)],
        ["ผู้บันทึก", vitals.recordedByDisplayName ?? "ไม่ระบุ"],
      ].map(([label, value]) => (
        <div className="min-w-0" key={label}>
          <dt className="text-sm text-text-muted">{label}</dt>
          <dd className="mt-1 break-words font-semibold text-text">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** SR-D9: เส้นทางสุขภาพ derived from each round's vitals (no form of its own). */
function HealthPathTable({ rows }: { rows: readonly RoundHealthPathRow[] }): React.JSX.Element {
  return (
    <ul className="divide-y divide-border rounded-control border border-border">
      {rows.map((row) => (
        <li className="grid gap-1 px-4 py-3 sm:grid-cols-[7rem_1fr]" key={row.roundNumber}>
          <span className="font-semibold text-text">ครั้งที่ {row.roundNumber}</span>
          <span className="text-sm text-text-muted">
            {row.vitals
              ? [
                  `น้ำหนัก ${formatRoundNumber(row.vitals.weight)} kg`,
                  `BMI ${formatRoundNumber(row.vitals.bmi)}`,
                  `รอบเอว ${formatRoundNumber(row.vitals.waistCircumference)} cm`,
                  `น้ำตาล ${formatRoundNumber(row.vitals.bloodSugar)} mg/dL`,
                  `ความดัน ${formatRoundNumber(row.vitals.systolicBloodPressure)}/${formatRoundNumber(row.vitals.diastolicBloodPressure)} mmHg`,
                ].join(" · ")
              : "ยังไม่มีสัญญาณชีพ"}
          </span>
        </li>
      ))}
    </ul>
  );
}

function PlanItemList({ items }: { items: readonly RoundPlanItem[] }): React.JSX.Element {
  return (
    <ul className="divide-y divide-border">
      {items.map((item) => (
        <li className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between" key={item.activityCode}>
          <div>
            <p className="font-semibold text-text">{item.activityLabel}</p>
            <p className="text-xs text-text-subtle">
              เป้าหมาย {item.targetDays} วัน/สัปดาห์
              {item.targetValue !== null ? ` · ${item.targetValue} ${item.targetUnit ?? ""}` : ""}
            </p>
          </div>
          <StatusBadge variant={item.progressStatus === "DONE" ? "success" : "neutral"}>
            {item.progressStatus && item.achievedDays !== null
              ? `${progressStatusLabels[item.progressStatus]} · ${item.achievedDays}/7 วัน · ครั้งที่ ${item.progressRound}`
              : "ยังไม่มีบันทึกความคืบหน้า"}
          </StatusBadge>
        </li>
      ))}
    </ul>
  );
}

type StepContext = {
  detail: ProgramRoundDetail;
  editable: boolean;
  nextHref: string;
  nonces: ProgramRoundNonces;
  programPath: string;
  roundPath: string;
  todayServiceDate: string;
};

function FollowupEntry({ context }: { context: StepContext }): React.JSX.Element {
  const { detail, programPath } = context;

  if (detail.followupId) {
    return (
      <Link className={linkClassName} href={`${programPath}/followups/${encodeURIComponent(detail.followupId)}`}>
        ดูแบบบันทึกการติดตามผลของครั้งนี้
      </Link>
    );
  }

  if (!context.editable) {
    return <p className="text-sm text-text-muted">ยังไม่มีการบันทึกการติดตามผลของครั้งนี้</p>;
  }

  if (!detail.canStartFollowup) {
    return <p className="text-sm text-text-muted">บันทึกการติดตามผลของครั้งก่อนหน้าให้ครบก่อน</p>;
  }

  const query = [
    detail.goalPlan.currentGoalPlanId ? `sourceGoalPlanId=${encodeURIComponent(detail.goalPlan.currentGoalPlanId)}` : null,
    buildRoundReturnQuery(context.nextHref),
  ].filter(Boolean).join("&");

  return (
    <div className="space-y-2">
      <p className="text-sm leading-6 text-text-muted">
        สัญญาณชีพ ความคืบหน้าตามแผน และคำตอบ “ปรับแผนหรือไม่” ของครั้งนี้บันทึกในแบบบันทึกการติดตามผลชุดเดียว
        บันทึกเสร็จแล้วระบบจะพากลับมาที่ขั้นตอนถัดไป
      </p>
      <Link className={buttonClassName({ variant: "primary" })} href={`${programPath}/followups/new?${query}`}>
        บันทึกการติดตามผลของครั้งนี้
      </Link>
    </div>
  );
}

function StepContent({ context, step }: { context: StepContext; step: RoundStepState }): React.JSX.Element {
  const { detail, editable, nextHref, programPath } = context;
  const target = {
    patientHospitalRelationshipId: detail.patientHospitalRelationshipId,
    patientProgramId: detail.patientProgramId,
    roundNumber: detail.roundNumber,
  };
  const toolKey = TOOL_KEYS[step.code];

  if (toolKey) {
    return (
      <ServiceOneToolStep
        canManage={editable}
        nextHref={nextHref}
        programId={detail.patientProgramId}
        relationshipId={detail.patientHospitalRelationshipId}
        roundNumber={detail.roundNumber}
        serviceOne={detail.serviceOne}
        tool={toolKey}
      />
    );
  }

  switch (step.code) {
    case "VITALS":
      if (detail.vitals) {
        return (
          <div className="space-y-4">
            <VitalsList vitals={detail.vitals} />
            {detail.vitals.source === "FOLLOWUP" ? <FollowupEntry context={context} /> : null}
          </div>
        );
      }

      if (detail.roundNumber >= 3) {
        return <FollowupEntry context={context} />;
      }

      return editable ? (
        <RoundVitalsForm
          heightEditable={detail.vitalsForm.heightEditable}
          latestHeightCm={detail.vitalsForm.latestHeightCm}
          nextHref={nextHref}
          occupation={detail.patient.occupation}
          patientDisplayName={detail.patient.displayName}
          patientHospitalRelationshipId={detail.patientHospitalRelationshipId}
          patientProgramId={detail.patientProgramId}
          profile={
            detail.roundNumber === 1
              ? {
                  preferredName: detail.patient.preferredName,
                  occupation: detail.patient.occupation,
                  profileVersion: detail.patient.profileVersion,
                }
              : null
          }
          roundNumber={detail.roundNumber}
          submissionNonce={context.nonces.vitals}
          todayServiceDate={context.todayServiceDate}
        />
      ) : (
        <p className="text-sm text-text-muted">ยังไม่มีสัญญาณชีพของครั้งนี้</p>
      );
    case "KNOW_SELF":
      return (
        <div className="space-y-4">
          <p className="text-sm text-text-muted">
            ชื่อที่อยากให้เรียก:{" "}
            <span className="font-semibold text-text">{detail.patient.preferredName ?? "ยังไม่ได้บันทึก"}</span>
          </p>
          {editable ? (
            <RoundProfileForm
              nextHref={nextHref}
              occupation={detail.patient.occupation}
              preferredName={detail.patient.preferredName}
              profileVersion={detail.patient.profileVersion}
              target={target}
            />
          ) : null}
        </div>
      );
    case "PAM":
    case "PROMS":
      if (detail.screeningId) {
        return (
          <Link
            className={linkClassName}
            href={`/app/patients/${encodeURIComponent(detail.patientHospitalRelationshipId)}/screenings/${encodeURIComponent(detail.screeningId)}`}
          >
            ดูผลแบบประเมิน PAM และ PROMs
          </Link>
        );
      }

      return editable ? (
        <div className="space-y-2">
          <p className="text-sm leading-6 text-text-muted">
            PAM และ PROMs อยู่ในแบบประเมินชุดเดียวกัน บันทึกครั้งเดียวได้ทั้ง 2 รายการ แล้วระบบจะพากลับมาที่ขั้นตอนถัดไป
          </p>
          <Link
            className={buttonClassName({ variant: "primary" })}
            href={`/app/patients/${encodeURIComponent(detail.patientHospitalRelationshipId)}/screenings/new?programId=${encodeURIComponent(detail.patientProgramId)}`}
          >
            ทำแบบประเมิน PAM และ PROMs
          </Link>
        </div>
      ) : (
        <p className="text-sm text-text-muted">ยังไม่มีแบบประเมินของครั้งนี้</p>
      );
    case "HEALTH_PATH":
      return (
        <div className="space-y-3">
          <p className="text-sm leading-6 text-text-muted">
            จุดเริ่มต้นของเส้นทางสุขภาพมาจากสัญญาณชีพของครั้งนี้ ไม่มีแบบฟอร์มแยก ขั้นตอนนี้เสร็จเมื่อบันทึกสัญญาณชีพแล้ว
          </p>
          <HealthPathTable rows={detail.healthPath} />
        </div>
      );
    case "HEALTH_PATH_REVIEW":
      return (
        <div className="space-y-4">
          <p className="text-sm leading-6 text-text-muted">
            ทบทวนสัญญาณชีพและ BMI ของครั้งที่ 1–6 ร่วมกับผู้ป่วย แล้วยืนยันว่าได้ทบทวนแล้ว
          </p>
          <HealthPathTable rows={detail.healthPath} />
          {step.status === "DONE" || !editable ? null : detail.vitals ? (
            <RoundReviewButton
              label="ยืนยันว่าได้ทบทวนเส้นทางสุขภาพแล้ว"
              nextHref={nextHref}
              patientHospitalRelationshipId={detail.patientHospitalRelationshipId}
              patientProgramId={detail.patientProgramId}
              roundNumber={detail.roundNumber}
              submissionNonce={context.nonces.review.HEALTH_PATH}
              toolCode="HEALTH_PATH"
            />
          ) : (
            <p className="text-sm text-text-muted">บันทึกสัญญาณชีพของครั้งนี้ (แบบบันทึกการติดตามผล) ก่อน จึงจะยืนยันได้</p>
          )}
        </div>
      );
    case "HEALTH_PLAN_REVIEW":
      if (step.kind === "GOAL_PLAN") {
        return detail.goalPlan.firstGoalPlanId ? (
          <Link className={linkClassName} href={`${programPath}/goals/${encodeURIComponent(detail.goalPlan.firstGoalPlanId)}`}>
            ดูแผนสุขภาพที่บันทึก
          </Link>
        ) : editable ? (
          <div className="space-y-2">
            <p className="text-sm leading-6 text-text-muted">สร้างแผนสุขภาพของโปรแกรม บันทึกเสร็จแล้วระบบจะพากลับมาที่ขั้นตอนถัดไป</p>
            <Link className={buttonClassName({ variant: "primary" })} href={`${programPath}/goals/new?${buildRoundReturnQuery(nextHref)}`}>
              สร้างแผนสุขภาพ
            </Link>
          </div>
        ) : (
          <p className="text-sm text-text-muted">ยังไม่มีแผนสุขภาพ</p>
        );
      }

      return (
        <div className="space-y-4">
          {detail.planFollowUp && detail.planFollowUp.dueItems.length > 0 ? (
            <div>
              <h3 className="text-base font-semibold text-text">กิจกรรมในแผนที่ยังไม่ถึงเป้าหมาย</h3>
              <div className="mt-3"><PlanItemList items={detail.planFollowUp.dueItems} /></div>
            </div>
          ) : null}
          {detail.planFollowUp && detail.planFollowUp.metItems.length > 0 ? (
            <div>
              <h3 className="text-base font-semibold text-text">ทำได้ตามเป้าแล้ว</h3>
              <div className="mt-3"><PlanItemList items={detail.planFollowUp.metItems} /></div>
            </div>
          ) : null}
          {detail.followupId && step.status !== "DONE" ? (
            <Alert variant="warning">
              การติดตามผลของครั้งนี้ไม่ได้อ้างอิงแผนสุขภาพ หรือไม่ได้ตอบว่าปรับแผนหรือไม่ จึงยังไม่นับเป็นการทบทวนแผน
              บันทึกการติดตามผลแก้ไขไม่ได้ หากทบทวนไม่ได้ให้ข้ามพร้อมเหตุผล
            </Alert>
          ) : null}
          <FollowupEntry context={context} />
        </div>
      );
    case "HEALTHY_PLAN": {
      const { roundPlanAdjusted, adjustedGoalPlanId, currentGoalPlanId } = detail.goalPlan;

      if (!detail.followupId) {
        return (
          <div className="space-y-2">
            <p className="text-sm text-text-muted">ตอบในแบบบันทึกการติดตามผลของครั้งนี้ว่า “ปรับแผน” หรือใช้แผนเดิม</p>
            <FollowupEntry context={context} />
          </div>
        );
      }

      if (roundPlanAdjusted === false) {
        return (
          <p className="text-sm leading-6 text-text-muted">
            การติดตามผลของครั้งนี้ยืนยันใช้แผนเดิม{" "}
            {currentGoalPlanId ? (
              <Link className={linkClassName} href={`${programPath}/goals/${encodeURIComponent(currentGoalPlanId)}`}>
                ดูแผนปัจจุบัน
              </Link>
            ) : null}
          </p>
        );
      }

      if (adjustedGoalPlanId) {
        return (
          <Link className={linkClassName} href={`${programPath}/goals/${encodeURIComponent(adjustedGoalPlanId)}`}>
            ดูแผนสุขภาพดีของฉัน (ฉบับปรับในครั้งนี้)
          </Link>
        );
      }

      return editable && roundPlanAdjusted === true ? (
        <div className="space-y-2">
          <p className="text-sm text-text-muted">การติดตามผลของครั้งนี้เลือก “ปรับแผน” สร้างแผนฉบับใหม่ แล้วระบบจะพากลับมาที่ขั้นตอนถัดไป</p>
          <Link
            className={buttonClassName({ variant: "primary" })}
            href={`${programPath}/goals/new?sourceFollowupId=${encodeURIComponent(detail.followupId)}&${buildRoundReturnQuery(nextHref)}`}
          >
            สร้างแผนสุขภาพดีของฉัน
          </Link>
        </div>
      ) : (
        <p className="text-sm text-text-muted">ยังไม่มีคำตอบเรื่องการปรับแผนในครั้งนี้</p>
      );
    }
    default:
      return <p className="text-sm text-text-muted">ไม่มีข้อมูลของขั้นตอนนี้</p>;
  }
}

function RoundSummary({ context }: { context: StepContext }): React.JSX.Element {
  const { detail } = context;
  const { status } = detail;
  const unresolved = status.steps.filter((step) => step.status === "TODO" || step.status === "LOCKED");

  return (
    <div className="space-y-5">
      <ul className="divide-y divide-border">
        {status.steps.map((step) => (
          <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between" key={step.code}>
            <div className="min-w-0">
              <p className="font-semibold text-text">{step.label}</p>
              {step.items.length > 1 ? <p className="text-xs text-text-subtle">{step.items.join(" · ")}</p> : null}
              {step.status === "DONE" && step.evidence?.at ? (
                <p className="mt-1 text-xs text-text-subtle">
                  {formatRoundDate(step.evidence.at)}
                  {step.evidence.byDisplayName ? ` · ${step.evidence.byDisplayName}` : ""}
                </p>
              ) : null}
              {step.status === "SKIPPED" ? (
                <p className="mt-1 break-words text-sm text-text-muted">เหตุผล: {roundSkipDescription(step)}</p>
              ) : null}
            </div>
            <StatusBadge variant={stepBadgeVariant(step)}>{step.status === "TODO" ? "ยังขาด" : roundStepStatusLabel(step)}</StatusBadge>
          </li>
        ))}
      </ul>

      {status.completion ? (
        <Alert variant="success">
          จบบริการครั้งนี้แล้วเมื่อ {formatRoundDate(status.completion.completedAt)}
          {status.completion.completedByDisplayName ? ` โดย ${status.completion.completedByDisplayName}` : ""}
        </Alert>
      ) : status.canComplete && context.editable ? (
        <CompleteRoundControl
          roundsHref={buildPatientRoundsPath(detail.patientHospitalRelationshipId, detail.patientProgramId)}
          submissionNonce={context.nonces.completion}
          target={{
            patientHospitalRelationshipId: detail.patientHospitalRelationshipId,
            patientProgramId: detail.patientProgramId,
            roundNumber: detail.roundNumber,
          }}
        />
      ) : (
        <p className="text-sm leading-6 text-text-muted">
          {unresolved.length > 0
            ? `จบบริการครั้งนี้ได้เมื่อทุกรายการบันทึกแล้วหรือข้ามพร้อมเหตุผล (ยังขาด ${unresolved.length} ขั้นตอน)`
            : "บัญชีนี้ไม่มีสิทธิ์จบบริการครั้งนี้"}
        </p>
      )}
    </div>
  );
}

function ExtraActivities({ context }: { context: StepContext }): React.JSX.Element | null {
  const { detail, editable } = context;

  if (detail.extraActivities.length === 0 && (!editable || detail.extraOptions.length === 0)) {
    return null;
  }

  return (
    <Panel>
      <h2 className="text-lg font-semibold text-text">การจัดบริการเพิ่ม</h2>
      <p className="mt-1 text-sm leading-6 text-text-muted">
        บันทึกว่าได้ทบทวนผลแบบประเมิน PAM/PROMs เดิมกับผู้ป่วยในครั้งนี้ (ไม่สร้างผลใหม่ และไม่นับในรายการของครั้งนี้)
      </p>
      <ul className="mt-4 divide-y divide-border">
        {detail.extraActivities.map((activity) => (
          <li className="flex flex-wrap items-center justify-between gap-2 py-3" key={activity.toolCode}>
            <span className="font-semibold text-text">{activity.label}</span>
            <StatusBadge variant="info">
              ทบทวนแล้ว · {formatRoundDate(activity.performedAt)}
              {activity.recordedByDisplayName ? ` · ${activity.recordedByDisplayName}` : ""}
            </StatusBadge>
          </li>
        ))}
        {editable
          ? detail.extraOptions.map((toolCode) => (
              <li className="flex flex-wrap items-center justify-between gap-2 py-3" key={toolCode}>
                <span className="font-semibold text-text">{toolCode === "PAM" ? "แบบประเมิน PAM" : "แบบประเมิน PROMs"}</span>
                <RoundReviewButton
                  label="บันทึกว่าได้ทบทวนในครั้งนี้"
                  patientHospitalRelationshipId={detail.patientHospitalRelationshipId}
                  patientProgramId={detail.patientProgramId}
                  roundNumber={detail.roundNumber}
                  submissionNonce={context.nonces.review[toolCode]}
                  toolCode={toolCode}
                />
              </li>
            ))
          : null}
      </ul>
    </Panel>
  );
}

export function ProgramRoundDetailView({
  currentStep,
  detail,
  healthHistory,
  nonces,
  todayServiceDate,
}: {
  currentStep: RoundCurrentStep;
  detail: ProgramRoundDetail;
  healthHistory?: React.ReactNode;
  nonces: ProgramRoundNonces;
  todayServiceDate: string;
}): React.JSX.Element {
  const relationshipId = detail.patientHospitalRelationshipId;
  const programId = detail.patientProgramId;
  const { status } = detail;
  const roundsPath = buildPatientRoundsPath(relationshipId, programId);
  const roundPath = `${roundsPath}/${detail.roundNumber}`;
  const programPath = `/app/patients/${encodeURIComponent(relationshipId)}/programs/${encodeURIComponent(programId)}`;
  const age = detail.patient.dateOfBirth ? ageInFullYears(detail.patient.dateOfBirth, new Date()) : null;
  // SR-D4/SR-D5: completed and locked rounds are read-only; the server re-checks every write.
  const editable = detail.canManage && status.writable;
  const stepIndex = status.steps.findIndex((step) => step.code === currentStep);
  const step = stepIndex >= 0 ? status.steps[stepIndex] : null;
  const stepCount = status.steps.length + 1;
  const percent = status.totalItems === 0 ? 0 : Math.round((status.resolvedItems / status.totalItems) * 100);
  const nextHref = step
    ? buildRoundAfterStepPath(relationshipId, programId, detail.roundNumber, step.code)
    : roundsPath;
  const context: StepContext = { detail, editable, nextHref, nonces, programPath, roundPath, todayServiceDate };
  const target = { patientHospitalRelationshipId: relationshipId, patientProgramId: programId, roundNumber: detail.roundNumber };

  return (
    <div>
      <PageHeader
        actions={
          <StatusBadge variant={status.state === "COMPLETED" ? "success" : status.state === "IN_PROGRESS" ? "info" : "neutral"}>
            {status.state === "LOCKED" ? roundLockedLabel(detail.roundNumber) : ROUND_STATE_LABELS[status.state]}
          </StatusBadge>
        }
        breadcrumbs={[
          { href: `/app/patients/${encodeURIComponent(relationshipId)}`, label: "รายละเอียดผู้ป่วย" },
          { href: roundsPath, label: "การจัดบริการครั้งที่ 1–6" },
          { label: `ครั้งที่ ${detail.roundNumber}` },
        ]}
        description={`ผู้ป่วย: ${detail.patient.displayName}${detail.patient.preferredName ? ` (เรียกว่า “${detail.patient.preferredName}”)` : ""}${age !== null ? ` · อายุ ${age} ปี` : ""}`}
        title={detail.title}
      />

      <div className="space-y-6 pt-6">
        {detail.programStatus === "COMPLETED" ? (
          <Alert variant="neutral">โปรแกรมนี้จบแล้ว ข้อมูลครั้งนี้เป็นประวัติแบบอ่านอย่างเดียว</Alert>
        ) : status.state === "COMPLETED" ? (
          <Alert variant="neutral">ครั้งนี้จบบริการแล้ว ข้อมูลเป็นแบบอ่านอย่างเดียว</Alert>
        ) : status.state === "LOCKED" ? (
          <Alert variant="warning">
            {roundLockedLabel(detail.roundNumber)} จึงจะบันทึกครั้งนี้ได้{" "}
            <Link className={linkClassName} href={`${roundsPath}/${detail.roundNumber - 1}`}>
              ไปที่ครั้งที่ {detail.roundNumber - 1}
            </Link>
          </Alert>
        ) : !detail.canManage ? (
          <Alert variant="info">บัญชีนี้อ่านข้อมูลครั้งนี้ได้ แต่ไม่มีสิทธิ์บันทึก ข้าม หรือจบบริการ</Alert>
        ) : null}

        <nav aria-label="ขั้นตอนของครั้งนี้" className="space-y-3">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-semibold text-text">
              {status.resolvedItems}/{status.totalItems} รายการ
            </span>
            <span className="text-text-muted">บันทึกแล้วหรือข้ามพร้อมเหตุผล</span>
          </div>
          <div
            aria-label={`ความคืบหน้า ${status.resolvedItems} จาก ${status.totalItems} รายการ`}
            aria-valuemax={status.totalItems}
            aria-valuemin={0}
            aria-valuenow={status.resolvedItems}
            className="h-2 overflow-hidden rounded-full bg-surface-muted"
            role="progressbar"
          >
            <div className="h-full rounded-full bg-action-primary" style={{ width: `${percent}%` }} />
          </div>
          <ol className="flex flex-wrap gap-2">
            {status.steps.map((item, index) => {
              const current = item.code === currentStep;

              return (
                <li key={item.code}>
                  <Link
                    aria-current={current ? "step" : undefined}
                    aria-label={`ขั้นตอนที่ ${index + 1} ${item.label}: ${roundStepStatusLabel(item)}`}
                    className={`flex size-11 items-center justify-center rounded-full border text-sm font-semibold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring ${
                      current
                        ? "border-action-primary bg-action-primary text-white"
                        : item.status === "DONE"
                          ? "border-success bg-success-soft text-success"
                          : item.status === "SKIPPED"
                            ? "border-warning bg-warning-soft text-warning"
                            : "border-border-strong bg-surface text-text"
                    }`}
                    href={buildRoundStepPath(relationshipId, programId, detail.roundNumber, item.code)}
                    title={item.label}
                  >
                    {stepMarker(item, index)}
                  </Link>
                </li>
              );
            })}
            <li>
              <Link
                aria-current={currentStep === ROUND_SUMMARY_STEP ? "step" : undefined}
                className={`flex h-11 items-center justify-center rounded-full border px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring ${
                  currentStep === ROUND_SUMMARY_STEP
                    ? "border-action-primary bg-action-primary text-white"
                    : "border-border-strong bg-surface text-text"
                }`}
                href={buildRoundStepPath(relationshipId, programId, detail.roundNumber, ROUND_SUMMARY_STEP)}
              >
                สรุป
              </Link>
            </li>
          </ol>
        </nav>

        <Panel>
          <p className="text-sm text-text-muted">
            ขั้นตอนที่ {step ? stepIndex + 1 : stepCount}/{stepCount}
          </p>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold tracking-[-0.02em] text-text">
              {step ? step.label : `สรุปและจบบริการครั้งที่ ${detail.roundNumber}`}
            </h2>
            {step ? <StatusBadge variant={stepBadgeVariant(step)}>{roundStepStatusLabel(step)}</StatusBadge> : null}
          </div>
          {step && step.items.length > 1 ? (
            <p className="mt-2 text-sm text-text-muted">รายการ: {step.items.join(" · ")}</p>
          ) : null}
          {step?.code === "VITALS" && healthHistory ? <div className="mt-2">{healthHistory}</div> : null}

          <div className="mt-5">
            {step ? <StepContent context={context} step={step} /> : <RoundSummary context={context} />}
          </div>

          {step ? (
            <div className="mt-6 flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                {step.status === "SKIPPED" ? (
                  <p className="break-words text-sm text-text-muted">ข้ามแล้ว · เหตุผล: {roundSkipDescription(step)}</p>
                ) : null}
                {editable && step.skippable && step.status === "TODO" ? (
                  <SkipStepControl nextHref={nextHref} stepCode={step.code} stepLabel={step.label} target={target} />
                ) : null}
                {editable && step.status === "SKIPPED" ? <UnskipStepControl stepCode={step.code} target={target} /> : null}
              </div>
              <Link className={buttonClassName({ variant: "secondary" })} href={nextHref}>
                ขั้นตอนถัดไป
              </Link>
            </div>
          ) : null}
        </Panel>

        <ExtraActivities context={context} />

        <Link className={buttonClassName({ variant: "secondary" })} href={roundsPath}>
          กลับไปภาพรวมครั้งที่ 1–6
        </Link>
      </div>
    </div>
  );
}
