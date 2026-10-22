/**
 * Phase R2 booklet inputs shared by integration tests of other domains (Goal Plans, Follow-ups, reports).
 * New Goal Plans use template booklet-v1: food and exercise sections with their activity items.
 */
export const BOOKLET_GOAL_ITEMS = [
  { activityCode: "stop_sweet", targetDays: 4 },
  { activityCode: "cardio", targetDays: 3, targetValue: 15, targetUnit: "minutes" },
] as const;

export function bookletPlan(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    goals: { weightLossKg: 3, waistCm: null, bloodSugarMgDl: 130, hba1cPercent: 7, customText: null },
    food: { notSet: false, planText: "งดน้ำหวาน", startDate: null },
    exercise: { notSet: false, planText: "เดินเร็วหลังอาหารเย็น", startDate: null },
    problemsAfterOneMonth: null,
    patientSignatureName: "ผู้ป่วยทดสอบ",
    witnessSignatureName: "พยานทดสอบ",
    ...overrides,
  };
}

/** The payload part of a booklet Goal Plan request (no scope or nonce). */
export function bookletGoalPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { items: BOOKLET_GOAL_ITEMS, booklet: bookletPlan(), ...overrides };
}

/** A dated life table with one row (R2-G). */
export function routineTable(routineDate = "2026-10-20"): Record<string, unknown> {
  return {
    routineDate,
    entries: [{ timeText: "06:00", activity: "ตื่นนอน ดื่มน้ำ", adjustment: "เดิน 15 นาที" }],
  };
}

/** The booklet dream card (R2-G). */
export function dreamCard(dream = "อยากเล่นกับหลานได้นานขึ้น"): Record<string, unknown> {
  return { dream, obstacle: null, weeklyGoal: "เดินเล่นกับหลานวันละ 10 นาที" };
}

/** A booklet PAM screening answer set (total 10, กลุ่มทั่วไป). */
export function pamScreeningResponses(): Record<string, unknown> {
  return { instrument: "PAM", responses: { answers: { "pam-1": 2, "pam-2": 2, "pam-3": 2, "pam-4": 2, "pam-5": 2 } } };
}

/** Fills R2 fields that tests of other concerns do not set; explicit input fields win. */
export function withDefaults<A, I, D, T>(
  service: (actor: A, input: I, dependencies?: D) => Promise<T>,
  defaults: Record<string, unknown>,
): (actor: A, input: I, dependencies?: D) => Promise<T> {
  return (actor, input, dependencies) =>
    service(actor, (typeof input === "object" && input !== null ? { ...defaults, ...input } : input) as I, dependencies);
}
