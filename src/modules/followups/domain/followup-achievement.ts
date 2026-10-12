import type { FollowupProgressStatus } from "./followup-definitions";

/**
 * Owner decision BR-04 (BF-GAP-WB-00): achievement for one Follow-up is the sum of
 * days achieved over the sum of target days of its source Goal Plan, excluding
 * activities marked NOT_APPLICABLE.
 */
export const FOLLOWUP_ACHIEVED_DAYS_MAX = 7;
export const FOLLOWUP_ACHIEVEMENT_THRESHOLD_PERCENT = 70;

export type FollowupAchievementProgress = {
  goalActivityCode: string;
  status: FollowupProgressStatus;
  achievedDays: number | null;
};

export type FollowupAchievementTarget = {
  activityCode: string;
  targetDays: number;
};

export type FollowupAchievement = {
  achievedDays: number;
  targetDays: number;
  ratePercent: number;
  aboveThreshold: boolean;
};

export type FollowupAchievementSummary = {
  scoredCount: number;
  aboveThresholdCount: number;
};

/** Counts scorable Follow-ups and those strictly above the 70% threshold (Owner decision BR-04). */
export function summarizeFollowupAchievements(
  achievements: readonly (FollowupAchievement | null)[],
): FollowupAchievementSummary {
  const scored = achievements.filter((achievement): achievement is FollowupAchievement => achievement !== null);
  return {
    scoredCount: scored.length,
    aboveThresholdCount: scored.filter((achievement) => achievement.aboveThreshold).length,
  };
}

/**
 * Returns null when the Follow-up cannot be scored: no eligible activity, a target
 * of zero days, or any applicable activity without recorded achieved days.
 */
export function computeFollowupAchievement(
  progress: readonly FollowupAchievementProgress[],
  targets: readonly FollowupAchievementTarget[],
): FollowupAchievement | null {
  const targetDaysByActivity = new Map(targets.map((target) => [target.activityCode, target.targetDays]));
  let achievedDays = 0;
  let targetDays = 0;

  for (const row of progress) {
    if (row.status === "NOT_APPLICABLE") continue;

    const target = targetDaysByActivity.get(row.goalActivityCode);
    if (row.achievedDays === null || target === undefined) return null;

    achievedDays += row.achievedDays;
    targetDays += target;
  }

  if (targetDays === 0) return null;

  return {
    achievedDays,
    targetDays,
    ratePercent: Math.round((achievedDays * 100) / targetDays),
    // Compare exact ratios so a rounded 70% is never counted as above 70%.
    aboveThreshold: achievedDays * 100 > FOLLOWUP_ACHIEVEMENT_THRESHOLD_PERCENT * targetDays,
  };
}
