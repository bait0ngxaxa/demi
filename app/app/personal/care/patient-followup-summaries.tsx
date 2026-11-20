import Link from "next/link";

import { StatusBadge } from "@/components/ui/status-badge";
import {
  followupAchievementLine,
  followupAchievementThresholdLabel,
} from "@/modules/followups/presentation/followup-achievement-summary";
import type {
  PatientSelfFollowupSummary,
  PatientSelfGoalPlanDetail,
} from "@/modules/patient-self/services/patient-self-care-query-service";

import {
  patientFollowupDateText,
  patientFollowupRoundLabel,
} from "../patient-self-care-presentation";
import { SavedRecordEmpty } from "../saved-record-card";

const linkClassName = "font-semibold text-brand-strong underline decoration-brand-soft underline-offset-4 hover:text-brand focus-visible:rounded-control focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring";

function outcomeText(item: PatientSelfFollowupSummary): string | null {
  const parts = [
    item.planAdjusted === null ? null : `ปรับแผน: ${item.planAdjusted ? "ปรับ" : "ไม่ปรับ"}`,
    item.hasObstacle === null ? null : `อุปสรรค: ${item.hasObstacle ? "มี" : "ไม่มี"}`,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Tab "การติดตาม": how each behaviour-practice Follow-up went against the health plan. */
export function PatientFollowupSummaries({ relationshipId, followups, plan }: {
  relationshipId: string;
  followups: readonly PatientSelfFollowupSummary[];
  plan: PatientSelfGoalPlanDetail | null;
}): React.JSX.Element {
  const careHref = `/app/personal/care/${encodeURIComponent(relationshipId)}`;

  return <section aria-labelledby="services-followups-heading" className="min-w-0">
    <h2 className="sr-only" id="services-followups-heading">การติดตาม</h2>
    {plan ? <div className="min-w-0 rounded-panel border border-border bg-surface p-4 sm:p-5">
      <h3 className="font-semibold text-text">แผนสุขภาพที่ใช้ติดตาม</h3>
      <p className="mt-1 break-words text-text">{plan.primaryGoalLabel}</p>
      {plan.items.length > 0 ? <ul className="mt-2 space-y-1 text-sm text-text-muted">
        {plan.items.map((item, index) => <li className="break-words" key={`${item.activityLabel}-${index}`}>
          {item.activityLabel} · {item.targetDays} วัน/สัปดาห์
        </li>)}
      </ul> : null}
      <Link className={`${linkClassName} mt-2 inline-flex min-h-11 items-center`} href={`${careHref}/goal-plans/${encodeURIComponent(plan.goalPlanId)}`}>
        ดูแผนสุขภาพ
      </Link>
    </div> : null}

    {followups.length === 0 ? <div className="mt-4"><SavedRecordEmpty>การติดตามผลเริ่มตั้งแต่ครั้งที่ 3</SavedRecordEmpty></div>
      : <ul className="mt-4 divide-y divide-border border-y border-border">
        {followups.map((item) => {
          const outcome = outcomeText(item);
          return <li className="min-w-0 py-3" key={item.followupId}>
            <Link className={`${linkClassName} inline-flex min-h-11 items-center break-words`} href={`${careHref}/followups/${encodeURIComponent(item.followupId)}`}>
              {patientFollowupRoundLabel(item.roundNumber)} · {patientFollowupDateText(item.serviceDate, item.recordedAt)}
            </Link>
            {item.achievement ? <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text">
              <span className="tabular-nums">{followupAchievementLine(item.achievement)}</span>
              {item.achievement.aboveThreshold ? <StatusBadge variant="success">{followupAchievementThresholdLabel(item.achievement)}</StatusBadge> : null}
            </p> : null}
            {outcome ? <p className="mt-1 text-sm text-text-muted">{outcome}</p> : null}
          </li>;
        })}
      </ul>}
  </section>;
}
