import Link from "next/link";
import { randomUUID } from "node:crypto";
import { roundStepKey } from "@/modules/patient-program-rounds/domain/round-steps";
import { RoundPlanEditor, PlanItemControl } from "./round-plan-editor";

import { Alert } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  VITALS_MEASUREMENT_LABELS,
  type RoundStepState,
} from "@/modules/patient-program-rounds/domain/round-steps";
import {
  buildPatientRoundsPath,
  buildRoundAfterStepPath,
  buildRoundStepPath,
  formatRoundDate,
  roundLockedLabel,
  roundSkipDescription,
  roundStepStatusLabel,
  ROUND_STATE_LABELS,
} from "@/modules/patient-program-rounds/presentation/round-labels";
import { RoundStepTimeline } from "@/modules/patient-program-rounds/presentation/round-step-timeline";
import { buildRoundReturnQuery } from "@/modules/patient-program-rounds/presentation/round-return-path";
import {
  HealthPathTimeline,
  RoundVitalsValues,
} from "@/modules/patient-program-rounds/presentation/round-vitals-display";
import type {
  ProgramRoundDetail,
  RoundPlanItem,
} from "@/modules/patient-program-rounds/services/round-query-service";
import { ageInFullYears } from "@/shared/time/age";

import { ServiceOneToolStep, type ServiceOneToolKey } from "../../service-one-workspace";
import { RoundReviewButton } from "./round-review-button";
import { CompleteRoundControl, RoundProfileForm, SkipStepControl, UnskipStepControl } from "./round-step-controls";
import { RoundVitalsForm } from "./round-vitals-form";

export type RoundCurrentStep = string;

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

function stepBadgeVariant(step: RoundStepState): "success" | "warning" | "neutral" {
  return step.status === "DONE" ? "success" : step.status === "SKIPPED" ? "warning" : "neutral";
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

/** R2-F: ทบทวนแผนสุขภาพ answers of the round's Follow-up. */
function PlanReviewAnswers({ review }: { review: NonNullable<ProgramRoundDetail["planReview"]> }): React.JSX.Element | null {
  if (review.followedPlan === null && !review.reflectionNote && !review.expertAdvice) {
    return null;
  }

  return (
    <dl className="grid gap-3 rounded-control border border-border px-4 py-3 text-sm">
      {review.followedPlan !== null ? (
        <div>
          <dt className="text-text-muted">ทบทวนแผนสุขภาพ</dt>
          <dd className="mt-0.5 font-semibold text-text">{review.followedPlan ? "ทำตามแผนได้" : "ทำตามแผนไม่ได้"}</dd>
        </div>
      ) : null}
      <div>
        <dt className="text-text-muted">เกิดอะไรขึ้นบ้าง?</dt>
        <dd className="mt-0.5 whitespace-pre-wrap text-text">{review.reflectionNote ?? "ไม่ได้ระบุ"}</dd>
      </div>
      {review.expertAdvice ? (
        <div>
          <dt className="text-text-muted">คำแนะนำจากผู้เชี่ยวชาญ</dt>
          <dd className="mt-0.5 whitespace-pre-wrap text-text">{review.expertAdvice}</dd>
        </div>
      ) : null}
    </dl>
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
    return <p className="text-sm text-text-muted">ครั้งนี้ต้องมีรายการสัญญาณชีพหรือทบทวนแผนสุขภาพในแผนที่เปิดอยู่</p>;
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
        submissionNonce={context.nonces.vitals}
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
        const missing = step.status === "TODO" ? step.missingMeasurements : [];
        const vitalsServiceDate = detail.vitals.serviceDate?.toISOString().slice(0, 10) ?? null;

        return (
          <div className="space-y-4">
            <RoundVitalsValues recorder vitals={detail.vitals} />
            {editable && detail.vitals.source === "ROUND_VITALS" && detail.vitals.byPatient ? <details className="mt-4"><summary className="min-h-11 cursor-pointer rounded-control py-3 font-semibold text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring">บันทึกใหม่แทนค่าที่ผู้ป่วยบันทึก</summary><RoundVitalsForm heightEditable={detail.vitalsForm.heightEditable} initialValues={detail.vitals} defaultServiceDate={vitalsServiceDate ?? context.todayServiceDate} latestHeightCm={detail.vitalsForm.latestHeightCm} nextHref={nextHref} occupation={detail.patient.occupation} patientDisplayName={detail.patient.displayName} patientHospitalRelationshipId={detail.patientHospitalRelationshipId} patientProgramId={detail.patientProgramId} profile={null} roundNumber={detail.roundNumber} submissionNonce={context.nonces.vitals} todayServiceDate={context.todayServiceDate} /></details> : null}
            {missing.length > 0 ? (
              <Alert variant="warning">
                ยังขาด: {missing.map((measurement) => VITALS_MEASUREMENT_LABELS[measurement]).join(" · ")}
                {detail.vitals.source === "ROUND_VITALS"
                  ? " บันทึกค่าที่ยังขาดให้ครบ หรือข้ามขั้นตอนนี้พร้อมเหตุผล"
                  : " หากวัดค่าที่ขาดไม่ได้ ให้ข้ามขั้นตอนนี้พร้อมเหตุผล"}
              </Alert>
            ) : null}
            {missing.length > 0 && editable && !detail.vitals.byPatient && detail.vitals.source === "ROUND_VITALS" && vitalsServiceDate ? (
              <RoundVitalsForm
                heightEditable={detail.vitalsForm.heightEditable}
                latestHeightCm={detail.vitalsForm.latestHeightCm}
                nextHref={nextHref}
                occupation={detail.patient.occupation}
                patientDisplayName={detail.patient.displayName}
                patientHospitalRelationshipId={detail.patientHospitalRelationshipId}
                patientProgramId={detail.patientProgramId}
                profile={null}
                roundNumber={detail.roundNumber}
                submissionNonce={context.nonces.vitals}
                supplement={{ serviceDate: vitalsServiceDate, missing }}
                todayServiceDate={context.todayServiceDate}
              />
            ) : null}
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
            detail.roundNumber === 1 && detail.status.steps.some((item) => item.code === "KNOW_SELF")
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
              submissionNonce={context.nonces.vitals}
            profileVersion={detail.patient.profileVersion}
              target={target}
            />
          ) : null}
        </div>
      );
    case "PAM":
    case "PROMS": {
      // R2-C: each instrument is recorded (or skipped) on its own; a legacy combined screening answers both.
      const screening = detail.screenings[step.code];
      const instrumentLabel = step.code === "PAM" ? "PAM" : "PROMs";

      if (screening) {
        return (
          <Link
            className={linkClassName}
            href={`/app/patients/${encodeURIComponent(detail.patientHospitalRelationshipId)}/screenings/${encodeURIComponent(screening.id)}`}
          >
            {screening.combined ? "ดูผลแบบประเมิน PAM และ PROMs (ชุดเดิม)" : `ดูผลแบบประเมิน ${instrumentLabel}`}
          </Link>
        );
      }

      return editable ? (
        <div className="space-y-2">
          <p className="text-sm leading-6 text-text-muted">
            บันทึกแบบประเมิน {instrumentLabel} แล้วระบบจะพากลับมาที่ขั้นตอนถัดไป
          </p>
          <Link
            className={buttonClassName({ variant: "primary" })}
            href={`/app/patients/${encodeURIComponent(detail.patientHospitalRelationshipId)}/screenings/new?programId=${encodeURIComponent(detail.patientProgramId)}&instrument=${step.code}`}
          >
            ทำแบบประเมิน {instrumentLabel}
          </Link>
        </div>
      ) : (
        <p className="text-sm text-text-muted">ยังไม่มีแบบประเมิน {instrumentLabel} ของครั้งนี้</p>
      );
    }
    case "HEALTH_PATH":
      return (
        <div className="space-y-3">
          <p className="text-sm leading-6 text-text-muted">
            จุดเริ่มต้นของเส้นทางสุขภาพมาจากสัญญาณชีพครั้งที่ 1 ไม่มีแบบฟอร์มแยก ขั้นตอนนี้เสร็จเมื่อบันทึกสัญญาณชีพแล้ว
          </p>
          <HealthPathTimeline rows={detail.healthPath} />
        </div>
      );
    case "HEALTH_PATH_REVIEW":
      return (
        <div className="space-y-4">
          <p className="text-sm leading-6 text-text-muted">
            ทบทวนสัญญาณชีพและ BMI ของครั้งที่ 1–{detail.roundNumber} ร่วมกับผู้ป่วย แล้วยืนยันว่าได้ทบทวนแล้ว
          </p>
          <HealthPathTimeline rows={detail.healthPath} />
          {step.status === "DONE" || !editable ? null : detail.healthPath.some((row) => row.roundNumber === 1 && row.vitals) ? (
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
            <p className="text-sm text-text-muted">ต้องมีสัญญาณชีพครั้งที่ 1 ก่อน จึงจะยืนยันการทบทวนได้</p>
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
          {detail.planReview ? <PlanReviewAnswers review={detail.planReview} /> : null}
          {detail.followupId && step.status !== "DONE" ? (
            <Alert variant="warning">
              {detail.planReview?.followedPlan === null
                ? "การติดตามผลของครั้งนี้ไม่ได้อ้างอิงแผนสุขภาพ หรือไม่ได้ตอบว่าปรับแผนหรือไม่ จึงยังไม่นับเป็นการทบทวนแผน"
                : "การติดตามผลของครั้งนี้ไม่ได้อ้างอิงแผนสุขภาพ หรือยังไม่ได้ตอบ “เกิดอะไรขึ้นบ้าง?” จึงยังไม่นับเป็นการทบทวนแผน"}
              {" "}บันทึกการติดตามผลแก้ไขไม่ได้ หากทบทวนไม่ได้ให้ข้ามพร้อมเหตุผล
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
          <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between" key={step.planItemId ?? step.code}>
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
          steps={status.steps}
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
            ? `ต้องมีรายการในแผนที่ทำแล้วอย่างน้อย 1 รายการก่อนจบบริการ (ยังไม่ได้ทำ ${unresolved.length} รายการ)`
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
  const stepIndex = status.steps.findIndex((step) => roundStepKey(step) === currentStep);
  const step = stepIndex >= 0 ? status.steps[stepIndex] : null;
  const stepCount = status.steps.length + 1;
  const total = status.steps.length;
  const resolved = status.steps.filter((item) => item.status === "DONE" || item.status === "SKIPPED").length;
  const percent = total === 0 ? 0 : Math.round((resolved / total) * 100);
  const nextHref = step
    ? buildRoundAfterStepPath(relationshipId, programId, detail.roundNumber, roundStepKey(step))
    : roundsPath;
  const context: StepContext = { detail, editable, nextHref, nonces, programPath, roundPath, todayServiceDate };
  const target = { patientHospitalRelationshipId: relationshipId, patientProgramId: programId, roundNumber: detail.roundNumber };
  const timeline = (
    <RoundStepTimeline
      completion={status.completion}
      currentStep={currentStep}
      hrefForStep={(code) => buildRoundStepPath(relationshipId, programId, detail.roundNumber, code)}
      locked={status.state === "LOCKED"}
      roundNumber={detail.roundNumber}
      steps={status.steps}
    />
  );

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
          { href: roundsPath, label: "การจัดบริการรายครั้ง" },
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

        {editable ? <RoundPlanEditor choices={detail.planChoices ?? []} submissionNonce={randomUUID()} target={target} /> : null}
        {total === 0 ? <Panel><p className="text-sm text-text-muted">ยังไม่มีรายการ เพิ่มรายการที่จะทำในครั้งนี้</p></Panel> : null}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-semibold text-text">
              {resolved}/{total} รายการในแผน
            </span>
            <span className="text-text-muted">บันทึกแล้วหรือข้ามพร้อมเหตุผล</span>
          </div>
          <div
            aria-label={`ความคืบหน้า ${resolved} จาก ${total} รายการ`}
            aria-valuemax={total}
            aria-valuemin={0}
            aria-valuenow={resolved}
            className="h-2 overflow-hidden rounded-full bg-surface-muted"
            role="progressbar"
          >
            <div className="h-full rounded-full bg-action-primary" style={{ width: `${percent}%` }} />
          </div>
        </div>

        <div className="grid min-w-0 items-start gap-6 @5xl/workspace:grid-cols-[18rem_minmax(0,1fr)]">
          <nav aria-label="ขั้นตอนบริการ" className="sticky top-6 hidden max-h-[calc(100dvh-3rem)] overflow-y-auto p-1 @5xl/workspace:block">
            {timeline}
          </nav>
          <div className="min-w-0 space-y-6">
            <details className="rounded-panel border border-border bg-surface p-4 @5xl/workspace:hidden" open={!editable}>
              <summary className="min-h-11 cursor-pointer rounded-control py-3 text-sm font-semibold text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2">
                ขั้นตอนที่ {step ? stepIndex + 1 : stepCount}/{stepCount} · {step ? step.label : `สรุปและจบบริการครั้งที่ ${detail.roundNumber}`} · {step ? roundStepStatusLabel(step) : status.completion ? "บันทึกแล้ว" : status.state === "LOCKED" ? "ยังเปิดไม่ได้" : "ยังไม่ได้บันทึก"}
              </summary>
              {timeline}
            </details>
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
                {step?.code === "CUSTOM" ? <div className="space-y-3"><p>{step.doneNote}</p>{!editable ? <p className="text-sm text-text-muted">{roundStepStatusLabel(step)}</p> : null}</div> : step ? <StepContent context={context} step={step} /> : <RoundSummary context={context} />}
                {editable && step?.planItemId ? <PlanItemControl key={`${step.planItemId}-${step.status}`} step={step} target={target} submissionNonce={randomUUID()} /> : null}
              </div>

              {step ? (
                <div className="mt-6 flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-2">
                    {step.status === "SKIPPED" ? (
                      <p className="break-words text-sm text-text-muted">ข้ามแล้ว · เหตุผล: {roundSkipDescription(step)}</p>
                    ) : null}
                    {/* A preview step (planItemId null) belongs to an unopened round and is never writable. */}
                    {editable && step.planItemId && step.skippable && step.status === "TODO" ? (
                      <SkipStepControl
                        nextHref={nextHref}
                        planItemId={step.planItemId}
                        stepLabel={step.label}
                        target={target}
                      />
                    ) : null}
                    {editable && step.planItemId && step.status === "SKIPPED" ? (
                      <UnskipStepControl planItemId={step.planItemId} target={target} />
                    ) : null}
                  </div>
                  <Link className={buttonClassName({ variant: "secondary" })} href={nextHref}>
                    ขั้นตอนถัดไป
                  </Link>
                </div>
              ) : null}
            </Panel>

            <ExtraActivities context={context} />
          </div>
        </div>

        <Link className={buttonClassName({ variant: "secondary" })} href={roundsPath}>
          กลับไปภาพรวมบริการ
        </Link>
      </div>
    </div>
  );
}
