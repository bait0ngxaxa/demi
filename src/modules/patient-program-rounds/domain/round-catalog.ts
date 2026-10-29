import type {
  PatientProgramRoundLinkedRecordType,
  PatientProgramRoundToolCode,
} from "@prisma/client";

/**
 * Round numbering and ledger tool codes (docs/requirements/WB_ALIGNMENT_DECISIONS.md: WB-DF-01 round
 * mapping; Phase R1 SR-D1..D13; ADR-0022). The guideline and plan rules live in ./round-steps.ts.
 */
/** ADR-0022 (FR-D3): rounds 1-6 follow the guideline; staff may add rounds up to 12. */
export const GUIDELINE_ROUND_COUNT = 6;
export const MAX_PROGRAM_ROUNDS = 12;
export const GUIDELINE_ROUND_NUMBERS: readonly number[] = Array.from(
  { length: GUIDELINE_ROUND_COUNT },
  (_, index) => index + 1,
);

/** Default Before/home round for tools and screenings; active plans may place them later. */
export const SERVICE_ONE_HOME_ROUND = 1;
/** SR-D11: ความฝันของฉัน is recorded in round 3. */
export const DREAM_CARD_ROUND = 3;
/** The Program's first Goal Plan is round 2 (WB-DF-01). */
export const GOAL_PLAN_ROUND = 2;
/** "แผนสุขภาพดีของฉัน" is answered by this round's Follow-up (interim rule, pending customer confirmation). */
export const ADJUSTED_PLAN_ROUND = 4;
/**
 * Follow-up rounds 3-12 map to PatientFollowup.roundNumber 1-10 (the workbook and the follow-up
 * service both number Program Follow-ups from 1).
 */
export const FIRST_FOLLOWUP_ROUND = 3;
export const FOLLOWUP_ROUND_NUMBER_OFFSET = 2;

/** SR-D13: round titles from the customer workbook. */
const ROUND_TITLES: Readonly<Record<number, string>> = {
  1: "รู้จักตัวเอง",
  2: "ทำแผนสุขภาพ เป้าหมายเล็กๆที่ตั้งไว้",
  3: "ติดตามการฝึกซ้อมพฤติกรรม",
  4: "ติดตามการฝึกซ้อมพฤติกรรม",
  5: "ติดตามการฝึกซ้อมพฤติกรรม",
  6: "ติดตามการฝึกซ้อมพฤติกรรม",
};

export function roundTitle(roundNumber: number): string {
  return `ครั้งที่ ${roundNumber} · ${ROUND_TITLES[roundNumber] ?? "บริการเพิ่มเติม"}`;
}

export type RoundToolDefinition = {
  code: PatientProgramRoundToolCode;
  label: string;
};

export const ROUND_TOOLS: Readonly<Record<PatientProgramRoundToolCode, RoundToolDefinition>> = {
  PAM: { code: "PAM", label: "แบบประเมิน PAM" },
  PROMS: { code: "PROMS", label: "แบบประเมิน PROMs" },
  KNOW_SELF: { code: "KNOW_SELF", label: "รู้จักตัวเอง" },
  FLOATING_CHART: { code: "FLOATING_CHART", label: "กราฟวัดลอยจม" },
  CONFIDENCE_RULER: { code: "CONFIDENCE_RULER", label: "ไม้บรรทัดวัดใจ" },
  // Retired by customer decision D2 (= ROUTINE); the enum value stays for history.
  LIFE_TABLE: { code: "LIFE_TABLE", label: "ตารางชีวิตของฉัน" },
  ROUTINE: { code: "ROUTINE", label: "ตารางชีวิตของฉัน" },
  DREAM_CARD: { code: "DREAM_CARD", label: "ความฝันของฉัน" },
  HEALTH_PLAN_REVIEW: { code: "HEALTH_PLAN_REVIEW", label: "ทบทวนแผนสุขภาพ" },
  HEALTHY_PLAN: { code: "HEALTHY_PLAN", label: "แผนสุขภาพดีของฉัน" },
  HEALTH_PATH: { code: "HEALTH_PATH", label: "เส้นทางสุขภาพ" },
};

/**
 * Ledger tools a later round can mark as reviewed: PAM/PROMs as an extra activity (CARE-13), and the
 * round 6+ "ทบทวนเส้นทางสุขภาพ" confirmation (SR-D9), stored as HEALTH_PATH in the target round.
 */
export const REVIEWABLE_TOOL_CODES = ["PAM", "PROMS", "HEALTH_PATH"] as const;
export type ReviewableToolCode = (typeof REVIEWABLE_TOOL_CODES)[number];

export const MIN_HEALTH_PATH_REVIEW_ROUND = GUIDELINE_ROUND_COUNT;

export const SERVICE_ONE_TOOL_LINKED_RECORD_TYPES: Readonly<
  Partial<Record<PatientProgramRoundToolCode, PatientProgramRoundLinkedRecordType>>
> = {
  PAM: "SCREENING_ASSESSMENT",
  PROMS: "SCREENING_ASSESSMENT",
  ROUTINE: "SERVICE_ONE_ROUTINE",
  FLOATING_CHART: "SERVICE_ONE_FLOATING_CHART",
  DREAM_CARD: "SERVICE_ONE_DREAM_CARD",
  CONFIDENCE_RULER: "SERVICE_ONE_CONFIDENCE",
};

/** A Program round number: an integer 1-12. */
export function isValidRoundNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_PROGRAM_ROUNDS;
}

/** WB-DF-05: staff may enter height in the first two guideline visits; patient self-measurements are separate. */
export function isGuidelineHeightEntryRound(roundNumber: number): boolean {
  return roundNumber === 1 || roundNumber === 2;
}

export function isFollowupRound(roundNumber: number): boolean {
  return isValidRoundNumber(roundNumber) && roundNumber >= FIRST_FOLLOWUP_ROUND;
}

export function toFollowupRoundNumber(roundNumber: number): number {
  return roundNumber - FOLLOWUP_ROUND_NUMBER_OFFSET;
}

export function toProgramRoundNumber(followupRoundNumber: number): number {
  return followupRoundNumber + FOLLOWUP_ROUND_NUMBER_OFFSET;
}

/** The plan step a ledger tool fulfils in `roundNumber` (the health path is reviewable from round 6). */
export function roundActivityStepCode(roundNumber: number, toolCode: PatientProgramRoundToolCode): string {
  return toolCode === "HEALTH_PATH" && roundNumber >= MIN_HEALTH_PATH_REVIEW_ROUND ? "HEALTH_PATH_REVIEW" : toolCode;
}

/**
 * Server-derived classification of a ledger entry, never taken from the client (ADR-0022): PLANNED when
 * the round's active plan lists the tool's step, otherwise EXTRA.
 */
export function roundActivitySourceFor(
  roundNumber: number,
  toolCode: PatientProgramRoundToolCode,
  activePlanStepCodes: readonly string[],
): "PLANNED" | "EXTRA" {
  return activePlanStepCodes.includes(roundActivityStepCode(roundNumber, toolCode)) ? "PLANNED" : "EXTRA";
}
