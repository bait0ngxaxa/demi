import { ValidationError } from "@/shared/errors/application-error";

/**
 * Owner decision D1: a Program Follow-up reports every activity of its source Goal Plan, so the BR-04
 * rate is never computed on a subset. Shared by the form's check and the service, which stays the authority.
 */
export const FOLLOWUP_PROGRESS_INCOMPLETE_MESSAGE = "กรุณาบันทึกความคืบหน้าให้ครบทุกกิจกรรมในแผนสุขภาพ";

export type FollowupProgressCoverage = {
  /** Plan activities without a progress row. */
  missingActivityCodes: string[];
  /** Progress rows naming an activity outside the plan. */
  unknownActivityCodes: string[];
  /** Activities reported more than once. */
  duplicateActivityCodes: string[];
};

export function followupProgressCoverage(
  planActivityCodes: readonly string[],
  progress: readonly { goalActivityCode: string }[],
): FollowupProgressCoverage {
  const planCodes = new Set(planActivityCodes);
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  const unknown = new Set<string>();

  for (const row of progress) {
    if (seen.has(row.goalActivityCode)) duplicates.add(row.goalActivityCode);
    if (!planCodes.has(row.goalActivityCode)) unknown.add(row.goalActivityCode);
    seen.add(row.goalActivityCode);
  }

  return {
    missingActivityCodes: planActivityCodes.filter((code) => !seen.has(code)),
    unknownActivityCodes: [...unknown],
    duplicateActivityCodes: [...duplicates],
  };
}

export function isFollowupProgressComplete(coverage: FollowupProgressCoverage): boolean {
  return (
    coverage.missingActivityCodes.length === 0 &&
    coverage.unknownActivityCodes.length === 0 &&
    coverage.duplicateActivityCodes.length === 0
  );
}

/** A refused Program Follow-up whose progress does not cover its Goal Plan; the Thai message is shown as-is. */
export class FollowupProgressIncompleteError extends ValidationError {
  constructor() {
    super(FOLLOWUP_PROGRESS_INCOMPLETE_MESSAGE);
    this.name = "FollowupProgressIncompleteError";
  }
}
