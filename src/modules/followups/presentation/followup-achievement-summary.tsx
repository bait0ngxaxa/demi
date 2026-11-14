import { StatusBadge } from "@/components/ui/status-badge";

import {
  FOLLOWUP_ACHIEVEMENT_THRESHOLD_PERCENT,
  type FollowupAchievement,
} from "../domain/followup-achievement";

/** BR-04 summary line, the same wording on the form, its review, the detail and the round card. */
export function followupAchievementLine(achievement: FollowupAchievement): string {
  return `ทำได้ ${achievement.achievedDays} จาก ${achievement.targetDays} วัน · อัตราความสำเร็จ ${achievement.ratePercent}%`;
}

export function followupAchievementThresholdLabel(achievement: FollowupAchievement): string {
  return achievement.aboveThreshold
    ? `เกิน ${FOLLOWUP_ACHIEVEMENT_THRESHOLD_PERCENT}%`
    : `ไม่เกิน ${FOLLOWUP_ACHIEVEMENT_THRESHOLD_PERCENT}%`;
}

export function FollowupAchievementSummary({
  achievement,
}: {
  achievement: FollowupAchievement;
}): React.JSX.Element {
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-text">
      <span className="font-semibold tabular-nums">{followupAchievementLine(achievement)}</span>
      <StatusBadge variant={achievement.aboveThreshold ? "success" : "neutral"}>
        {followupAchievementThresholdLabel(achievement)}
      </StatusBadge>
    </p>
  );
}
