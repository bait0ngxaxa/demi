export const PROMS_BOOKLET_SCORING_VERSION = "proms-booklet-v1" as const;

/** An item scored at or below this value is a problem (R2-B). */
export const PROMS_PROBLEM_THRESHOLD = 2;

export type PromsBookletResult = {
  itemScores: Record<string, number>;
  hasProblem: boolean;
  /** Question keys scored at or below the threshold, in question order. */
  problemItemKeys: string[];
};

/**
 * "คะแนนข้อใดข้อหนึ่ง น้อยกว่าหรือเท่ากับ 2 จัดว่า “มีปัญหา” ทันที (ไม่มีการวัดจากคะแนนรวม)".
 * No total is calculated. The caller validates the answers and passes them in question order.
 */
export function calculatePromsBookletResult(answers: Readonly<Record<string, number>>): PromsBookletResult {
  const problemItemKeys = Object.entries(answers)
    .filter(([, value]) => value <= PROMS_PROBLEM_THRESHOLD)
    .map(([key]) => key);

  return {
    itemScores: { ...answers },
    hasProblem: problemItemKeys.length > 0,
    problemItemKeys,
  };
}
