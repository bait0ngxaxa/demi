const GOAL_TARGET_UNIT_LABELS: Readonly<Record<string, string>> = {
  minutes: "นาที",
  liters: "ลิตร",
};

export function getGoalTargetUnitLabel(unit: string): string {
  return GOAL_TARGET_UNIT_LABELS[unit] ?? unit;
}
