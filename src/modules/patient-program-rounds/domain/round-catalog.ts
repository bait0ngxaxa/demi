import type {
  PatientProgramRoundLinkedRecordType,
  PatientProgramRoundToolCode,
} from "@prisma/client";

import { isStepInRound } from "./round-steps";

/**
 * Round numbering and ledger tool codes (docs/requirements/WB_ALIGNMENT_DECISIONS.md: WB-DF-01 round
 * mapping; Phase R1 SR-D1..D13). The required checklist of each round lives in ./round-steps.ts.
 */
export const PROGRAM_ROUND_NUMBERS = [1, 2, 3, 4, 5, 6] as const;
export type ProgramRoundNumber = (typeof PROGRAM_ROUND_NUMBERS)[number];

/** Rounds whose vitals live in PatientProgramRoundVitals; rounds 3-6 use PatientFollowup. */
export const ROUND_VITALS_ROUND_NUMBERS = [1, 2] as const;
export type RoundVitalsRoundNumber = (typeof ROUND_VITALS_ROUND_NUMBERS)[number];

/** The program screening (PAM/PROMs) and the preferred name belong to round 1. */
export const SERVICE_ONE_HOME_ROUND = 1;
/** SR-D11: ความฝันของฉัน is recorded in round 3. */
export const DREAM_CARD_ROUND = 3;
/** The Program's first Goal Plan is round 2 (WB-DF-01). */
export const GOAL_PLAN_ROUND = 2;
/** "แผนสุขภาพดีของฉัน" is answered by this round's Follow-up (interim rule, pending customer confirmation). */
export const ADJUSTED_PLAN_ROUND = 4;
/**
 * Follow-up rounds 3-6 map to PatientFollowup.roundNumber 1-4 (the workbook and the follow-up
 * service both number Program Follow-ups from 1).
 */
export const FIRST_FOLLOWUP_ROUND = 3;
export const LAST_FOLLOWUP_ROUND = 6;
export const FOLLOWUP_ROUND_NUMBER_OFFSET = 2;

/** SR-D13: round titles from the customer workbook. */
const ROUND_TITLES: Readonly<Record<ProgramRoundNumber, string>> = {
  1: "รู้จักตัวเอง",
  2: "ทำแผนสุขภาพ เป้าหมายเล็กๆที่ตั้งไว้",
  3: "ติดตามการฝึกซ้อมพฤติกรรม",
  4: "ติดตามการฝึกซ้อมพฤติกรรม",
  5: "ติดตามการฝึกซ้อมพฤติกรรม",
  6: "ติดตามการฝึกซ้อมพฤติกรรม",
};

export function roundTitle(roundNumber: ProgramRoundNumber): string {
  return `ครั้งที่ ${roundNumber} · ${ROUND_TITLES[roundNumber]}`;
}

export type RoundToolDefinition = {
  code: PatientProgramRoundToolCode;
  label: string;
};

export const ROUND_TOOLS: Readonly<Record<PatientProgramRoundToolCode, RoundToolDefinition>> = {
  PAM: { code: "PAM", label: "แบบประเมิน PAM" },
  PROMS: { code: "PROMS", label: "แบบประเมิน PROMs" },
  // Retired by customer decision D1; the enum value stays for history.
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
 * round 6 "ทบทวนเส้นทางสุขภาพ" confirmation (SR-D9), stored as HEALTH_PATH in round 6.
 */
export const REVIEWABLE_TOOL_CODES = ["PAM", "PROMS", "HEALTH_PATH"] as const;
export type ReviewableToolCode = (typeof REVIEWABLE_TOOL_CODES)[number];

export const HEALTH_PATH_REVIEW_ROUND = 6;

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

/** Server-derived classification of a ledger entry; never taken from the client. */
export function roundActivitySourceFor(
  roundNumber: ProgramRoundNumber,
  toolCode: PatientProgramRoundToolCode,
): "PLANNED" | "EXTRA" {
  const stepCode = toolCode === "HEALTH_PATH" && roundNumber === HEALTH_PATH_REVIEW_ROUND
    ? "HEALTH_PATH_REVIEW"
    : toolCode;

  return isStepInRound(roundNumber, stepCode) ? "PLANNED" : "EXTRA";
}
