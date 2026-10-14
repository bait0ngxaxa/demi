import type {
  PatientProgramRoundLinkedRecordType,
  PatientProgramRoundToolCode,
} from "@prisma/client";

/**
 * Whiteboard alignment (docs/requirements/WB_ALIGNMENT_DECISIONS.md):
 * WB-DF-01 round mapping, WB-DF-02 recommended (not mandatory) items, WB-DF-03 review of
 * Service 1 tools, WB-PD-01 tools without an approved form.
 */
export const PROGRAM_ROUND_NUMBERS = [1, 2, 3, 4, 5, 6] as const;
export type ProgramRoundNumber = (typeof PROGRAM_ROUND_NUMBERS)[number];

/** Rounds whose vitals live in PatientProgramRoundVitals; rounds 3-6 use PatientFollowup. */
export const ROUND_VITALS_ROUND_NUMBERS = [1, 2] as const;
export type RoundVitalsRoundNumber = (typeof ROUND_VITALS_ROUND_NUMBERS)[number];

/** Service 1 tools and the program screening are recorded once, in round 1 (WB-DF-01). */
export const SERVICE_ONE_HOME_ROUND = 1;
/** The Program's first Goal Plan is round 2 (WB-DF-01). */
export const GOAL_PLAN_ROUND = 2;
/**
 * Follow-up rounds 3-6 map to PatientFollowup.roundNumber 1-4 (the workbook and the follow-up
 * service both number Program Follow-ups from 1).
 */
export const FIRST_FOLLOWUP_ROUND = 3;
export const LAST_FOLLOWUP_ROUND = 6;
export const FOLLOWUP_ROUND_NUMBER_OFFSET = 2;

export type RoundToolKind =
  | "SCREENING"
  | "SERVICE_ONE"
  | "GOAL_PLAN"
  | "FOLLOWUP_REVIEW"
  | "PENDING_FORM";

export type RoundToolDefinition = {
  code: PatientProgramRoundToolCode;
  label: string;
  kind: RoundToolKind;
};

export const ROUND_TOOLS: Readonly<Record<PatientProgramRoundToolCode, RoundToolDefinition>> = {
  PAM: { code: "PAM", label: "แบบประเมิน PAM", kind: "SCREENING" },
  PROMS: { code: "PROMS", label: "แบบประเมิน PROMs", kind: "SCREENING" },
  KNOW_SELF: { code: "KNOW_SELF", label: "รู้จักตัวเอง", kind: "PENDING_FORM" },
  FLOATING_CHART: { code: "FLOATING_CHART", label: "กราฟลอยจม", kind: "SERVICE_ONE" },
  CONFIDENCE_RULER: { code: "CONFIDENCE_RULER", label: "ไม้บรรทัดวัดใจ", kind: "SERVICE_ONE" },
  LIFE_TABLE: { code: "LIFE_TABLE", label: "ตารางชีวิตของฉัน", kind: "PENDING_FORM" },
  ROUTINE: { code: "ROUTINE", label: "ตารางกิจวัตร", kind: "SERVICE_ONE" },
  DREAM_CARD: { code: "DREAM_CARD", label: "การ์ดความฝัน", kind: "SERVICE_ONE" },
  HEALTH_PLAN_REVIEW: {
    code: "HEALTH_PLAN_REVIEW",
    label: "ทบทวนแผนสุขภาพ",
    kind: "FOLLOWUP_REVIEW",
  },
  HEALTHY_PLAN: { code: "HEALTHY_PLAN", label: "แผนสุขภาพดีของฉัน", kind: "GOAL_PLAN" },
  HEALTH_PATH: { code: "HEALTH_PATH", label: "เส้นทางสุขภาพ", kind: "PENDING_FORM" },
};

/**
 * Recommended items per round (WB-DF-02). The whiteboard export that fixes the exact boxes was not
 * readable from the repository, so the sets follow BF-GAP CARE-11/12, WB-DF-01/03 and the WB-PD-01
 * statement that the undefined tools appear in rounds 1, 3, 4 and 6. Adjusting a round is a data
 * change in this table only.
 */
export const ROUND_RECOMMENDED_TOOLS: Readonly<
  Record<ProgramRoundNumber, readonly PatientProgramRoundToolCode[]>
> = {
  1: [
    "KNOW_SELF",
    "PAM",
    "PROMS",
    "FLOATING_CHART",
    "DREAM_CARD",
    "ROUTINE",
    "CONFIDENCE_RULER",
    "LIFE_TABLE",
    "HEALTH_PATH",
  ],
  2: ["HEALTHY_PLAN"],
  3: ["HEALTH_PLAN_REVIEW", "CONFIDENCE_RULER", "DREAM_CARD", "FLOATING_CHART", "LIFE_TABLE"],
  4: ["HEALTH_PLAN_REVIEW", "CONFIDENCE_RULER", "DREAM_CARD", "FLOATING_CHART", "HEALTH_PATH"],
  5: ["HEALTH_PLAN_REVIEW", "CONFIDENCE_RULER", "DREAM_CARD", "FLOATING_CHART"],
  6: ["HEALTH_PLAN_REVIEW", "CONFIDENCE_RULER", "LIFE_TABLE", "HEALTH_PATH"],
};

/** Tools whose single Program-level result can be reviewed read-only in a later round (WB-DF-03). */
export const REVIEWABLE_TOOL_CODES: readonly PatientProgramRoundToolCode[] = [
  "PAM",
  "PROMS",
  "FLOATING_CHART",
  "DREAM_CARD",
  "ROUTINE",
  "CONFIDENCE_RULER",
];

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

export function isProgramRoundNumber(value: unknown): value is ProgramRoundNumber {
  return PROGRAM_ROUND_NUMBERS.some((round) => round === value);
}

export function isRoundVitalsRound(value: unknown): value is RoundVitalsRoundNumber {
  return ROUND_VITALS_ROUND_NUMBERS.some((round) => round === value);
}

export function isFollowupRound(roundNumber: number): boolean {
  return roundNumber >= FIRST_FOLLOWUP_ROUND && roundNumber <= LAST_FOLLOWUP_ROUND;
}

export function toFollowupRoundNumber(roundNumber: number): number {
  return roundNumber - FOLLOWUP_ROUND_NUMBER_OFFSET;
}

export function toProgramRoundNumber(followupRoundNumber: number): number {
  return followupRoundNumber + FOLLOWUP_ROUND_NUMBER_OFFSET;
}

export function isRecommendedTool(
  roundNumber: ProgramRoundNumber,
  toolCode: PatientProgramRoundToolCode,
): boolean {
  return ROUND_RECOMMENDED_TOOLS[roundNumber].includes(toolCode);
}

export function isReviewableTool(toolCode: PatientProgramRoundToolCode): boolean {
  return REVIEWABLE_TOOL_CODES.includes(toolCode);
}

export const roundToolCodes = Object.keys(ROUND_TOOLS) as PatientProgramRoundToolCode[];
