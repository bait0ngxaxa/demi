import type {
  PatientProgramRoundSkipReason,
  PatientProgramRoundStepCode,
} from "@prisma/client";

import type { ProgramRoundNumber } from "./round-catalog";

/**
 * Phase R1 (docs/requirements/WB_ALIGNMENT_DECISIONS.md SR-D1..D13): each round is a required,
 * ordered checklist transcribed from the Product Owner's Canva "ผลการจัดบริการ" boxes (2026-10-21).
 * A step covers one or more checklist items; the order of ROUND_STEPS is the stepper order.
 */
export type RoundStepCode = PatientProgramRoundStepCode;

export type RoundStepKind =
  | "FORM"
  | "PER_ROUND_TOOL"
  | "SCREENING"
  | "GOAL_PLAN"
  | "FOLLOWUP_REVIEW"
  | "DERIVED";

export type RoundStepDefinition = {
  code: RoundStepCode;
  label: string;
  kind: RoundStepKind;
  /** Checklist items this step satisfies (x/y counting is by item). */
  items: readonly string[];
  /** SR-D3: every checklist step can be skipped with a reason; only the summary cannot. */
  skippable: boolean;
};

/** Items 1-7 of every round, recorded together in the vitals step. */
export const VITALS_ITEMS = [
  "ชื่อ-สกุล",
  "อาชีพ",
  "น้ำหนัก",
  "ส่วนสูง",
  "รอบเอว",
  "ค่าน้ำตาล",
  "ความดัน",
] as const;

function step(
  code: RoundStepCode,
  label: string,
  kind: RoundStepKind,
  items: readonly string[] = [label],
): RoundStepDefinition {
  return { code, label, kind, items, skippable: true };
}

const VITALS_STEP = step("VITALS", "ข้อมูลทั่วไปและสัญญาณชีพ", "FORM", VITALS_ITEMS);
const PLAN_REVIEW_STEP = step("HEALTH_PLAN_REVIEW", "ทบทวนแผนสุขภาพ", "FOLLOWUP_REVIEW");
const RULER_STEP = step("CONFIDENCE_RULER", "ไม้บรรทัดวัดใจ", "PER_ROUND_TOOL");
const ROUTINE_STEP = step("ROUTINE", "ตารางชีวิตของฉัน", "PER_ROUND_TOOL");
const FLOATING_CHART_STEP = step("FLOATING_CHART", "กราฟวัดลอยจม", "PER_ROUND_TOOL");

export const ROUND_STEPS: Readonly<Record<ProgramRoundNumber, readonly RoundStepDefinition[]>> = {
  1: [
    VITALS_STEP,
    // SR-D12: "รู้จักตัวฉันเอง" = the preferred name, also offered in the vitals step of round 1.
    step("KNOW_SELF", "รู้จักตัวฉันเอง", "FORM"),
    step("PAM", "PAM", "SCREENING"),
    step("PROMS", "PROMs", "SCREENING"),
    FLOATING_CHART_STEP,
    RULER_STEP,
    ROUTINE_STEP,
    // SR-D9: derived from round 1 vitals; no form.
    step("HEALTH_PATH", "เส้นทางสุขภาพ", "DERIVED"),
  ],
  // Interim (until Phase R2): round 2 "ทบทวนแผนสุขภาพ" creates the Program's first Goal Plan (D4).
  2: [VITALS_STEP, step("HEALTH_PLAN_REVIEW", "ทบทวนแผนสุขภาพ", "GOAL_PLAN"), RULER_STEP, ROUTINE_STEP],
  // SR-D11: ความฝันของฉัน belongs to round 3.
  3: [VITALS_STEP, PLAN_REVIEW_STEP, RULER_STEP, step("DREAM_CARD", "ความฝันของฉัน", "PER_ROUND_TOOL")],
  4: [
    VITALS_STEP,
    PLAN_REVIEW_STEP,
    FLOATING_CHART_STEP,
    RULER_STEP,
    ROUTINE_STEP,
    // Interim default, PENDING customer confirmation: answered by round 4's Follow-up planAdjusted.
    step("HEALTHY_PLAN", "แผนสุขภาพดีของฉัน", "GOAL_PLAN"),
  ],
  5: [VITALS_STEP, PLAN_REVIEW_STEP, ROUTINE_STEP],
  6: [
    VITALS_STEP,
    // SR-D9: read-only timeline of rounds 1-6, DONE when the actor confirms the review.
    step("HEALTH_PATH_REVIEW", "ทบทวนเส้นทางสุขภาพ", "DERIVED"),
    PLAN_REVIEW_STEP,
    RULER_STEP,
  ],
};

export function isStepInRound(roundNumber: ProgramRoundNumber, stepCode: string): boolean {
  return ROUND_STEPS[roundNumber].some((definition) => definition.code === stepCode);
}

export function roundStepDefinition(
  roundNumber: ProgramRoundNumber,
  stepCode: string,
): RoundStepDefinition | null {
  return ROUND_STEPS[roundNumber].find((definition) => definition.code === stepCode) ?? null;
}

/** Per-round tools and the rounds whose checklist lists them (SR-D8; mirrored by DB CHECKs). */
export type PerRoundToolCode = "CONFIDENCE_RULER" | "ROUTINE" | "FLOATING_CHART" | "DREAM_CARD";

export function isPerRoundToolInRound(roundNumber: ProgramRoundNumber, tool: PerRoundToolCode): boolean {
  return isStepInRound(roundNumber, tool);
}

export const ROUND_SKIP_REASON_LABELS: Readonly<Record<PatientProgramRoundSkipReason, string>> = {
  PATIENT_DECLINED: "ผู้ป่วยปฏิเสธ",
  PATIENT_UNABLE: "ผู้ป่วยทำไม่ได้",
  EQUIPMENT_UNAVAILABLE: "ไม่มีอุปกรณ์",
  OTHER: "อื่น ๆ",
};

export type RoundStepEvidence = {
  at: Date | null;
  byDisplayName: string | null;
};

export type RoundStepSkipFact = {
  stepCode: RoundStepCode;
  reasonCode: PatientProgramRoundSkipReason;
  note: string | null;
  at: Date;
  byDisplayName: string | null;
};

export type RoundCompletionFact = {
  completedAt: Date;
  completedByDisplayName: string | null;
};

export type RoundFollowupFact = RoundStepEvidence & {
  goalPlanLinked: boolean;
  planAdjusted: boolean | null;
  /** The Goal Plan adjusted from this Follow-up, if any. */
  adjustedPlan: RoundStepEvidence | null;
};

/** Plain facts of one Program, loaded once and shared by every status computation. */
export type ProgramRoundFacts = {
  programActive: boolean;
  preferredName: string | null;
  screening: RoundStepEvidence | null;
  /** Rounds 1-2. */
  roundVitals: Partial<Record<ProgramRoundNumber, RoundStepEvidence>>;
  /** Rounds 3-6 (Follow-up k = round k + 2). */
  followups: Partial<Record<ProgramRoundNumber, RoundFollowupFact>>;
  tools: Readonly<Record<PerRoundToolCode, Partial<Record<ProgramRoundNumber, RoundStepEvidence>>>>;
  firstGoalPlan: RoundStepEvidence | null;
  healthPathReviewed: RoundStepEvidence | null;
  completions: Partial<Record<ProgramRoundNumber, RoundCompletionFact>>;
  skips: Partial<Record<ProgramRoundNumber, readonly RoundStepSkipFact[]>>;
};

export type RoundStepStatus = "DONE" | "SKIPPED" | "TODO" | "LOCKED";

export type RoundStepState = RoundStepDefinition & {
  status: RoundStepStatus;
  evidence: RoundStepEvidence | null;
  skip: RoundStepSkipFact | null;
};

export type RoundState =
  | "COMPLETED"
  | "IN_PROGRESS"
  | "NOT_STARTED"
  | "LOCKED";

export type RoundStatus = {
  roundNumber: ProgramRoundNumber;
  state: RoundState;
  steps: readonly RoundStepState[];
  resolvedItems: number;
  totalItems: number;
  completion: RoundCompletionFact | null;
  /** Writes are accepted (SR-D5): Program active, round open, previous round completed. */
  writable: boolean;
  /** SR-D1/SR-D4: every step DONE or SKIPPED while the round is writable. */
  canComplete: boolean;
};

/** SR-D5: round 1, or the previous round completed; never a completed round. */
export function isRoundOpenForWrites(
  completedRounds: ReadonlySet<number>,
  roundNumber: number,
): boolean {
  return !completedRounds.has(roundNumber) && (roundNumber === 1 || completedRounds.has(roundNumber - 1));
}

/** How DONE is computed for each step (single source for every view and the completion guard). */
function stepEvidence(
  facts: ProgramRoundFacts,
  roundNumber: ProgramRoundNumber,
  definition: RoundStepDefinition,
): RoundStepEvidence | null {
  const followup = facts.followups[roundNumber] ?? null;

  switch (definition.code) {
    case "VITALS":
      return roundNumber <= 2 ? (facts.roundVitals[roundNumber] ?? null) : followup;
    case "KNOW_SELF":
      return facts.preferredName ? { at: null, byDisplayName: null } : null;
    case "PAM":
    case "PROMS":
      return facts.screening;
    case "CONFIDENCE_RULER":
    case "ROUTINE":
    case "FLOATING_CHART":
    case "DREAM_CARD":
      return facts.tools[definition.code][roundNumber] ?? null;
    case "HEALTH_PATH":
      return facts.roundVitals[1] ?? null;
    case "HEALTH_PATH_REVIEW":
      return facts.healthPathReviewed;
    case "HEALTH_PLAN_REVIEW":
      if (definition.kind === "GOAL_PLAN") {
        return facts.firstGoalPlan;
      }

      // D5: the round's Follow-up referenced a Goal Plan and answered "ปรับแผน".
      return followup && followup.goalPlanLinked && followup.planAdjusted !== null ? followup : null;
    case "HEALTHY_PLAN":
      // Interim rule: false = current plan confirmed; true = a new plan adjusted from that Follow-up.
      if (!followup || followup.planAdjusted === null) {
        return null;
      }

      return followup.planAdjusted ? followup.adjustedPlan : followup;
    default:
      return null;
  }
}

export function computeRoundStatus(facts: ProgramRoundFacts, roundNumber: ProgramRoundNumber): RoundStatus {
  const completedRounds = new Set(
    Object.keys(facts.completions).map((value) => Number(value)),
  );
  const completion = facts.completions[roundNumber] ?? null;
  const locked = !completion && roundNumber > 1 && !completedRounds.has(roundNumber - 1);
  const skips = facts.skips[roundNumber] ?? [];
  const steps: RoundStepState[] = ROUND_STEPS[roundNumber].map((definition) => {
    const evidence = stepEvidence(facts, roundNumber, definition);
    // A recorded result replaces an earlier skip (SR-D3).
    const skip = evidence ? null : (skips.find((candidate) => candidate.stepCode === definition.code) ?? null);
    const status: RoundStepStatus = evidence ? "DONE" : skip ? "SKIPPED" : locked ? "LOCKED" : "TODO";

    return { ...definition, status, evidence, skip };
  });
  const resolved = steps.filter((state) => state.status === "DONE" || state.status === "SKIPPED");
  const resolvedItems = resolved.reduce((total, state) => total + state.items.length, 0);
  const totalItems = steps.reduce((total, state) => total + state.items.length, 0);
  const writable = facts.programActive && isRoundOpenForWrites(completedRounds, roundNumber);
  const state: RoundState = completion
    ? "COMPLETED"
    : locked
      ? "LOCKED"
      : resolved.length > 0
        ? "IN_PROGRESS"
        : "NOT_STARTED";

  return {
    roundNumber,
    state,
    steps,
    resolvedItems,
    totalItems,
    completion,
    writable,
    canComplete: writable && resolved.length === steps.length,
  };
}

export const ROUND_SUMMARY_STEP = "SUMMARY" as const;

/**
 * SR-D7: after saving `afterCode`, go to the next unresolved step after it, then any unresolved step
 * before it, then the summary.
 */
export function nextRoundStep(
  steps: readonly RoundStepState[],
  afterCode: string | null,
): RoundStepCode | typeof ROUND_SUMMARY_STEP {
  const index = afterCode ? steps.findIndex((state) => state.code === afterCode) : -1;
  const ordered = [...steps.slice(index + 1), ...steps.slice(0, Math.max(index, 0))];
  const next = ordered.find((state) => state.status === "TODO");

  return next?.code ?? ROUND_SUMMARY_STEP;
}
