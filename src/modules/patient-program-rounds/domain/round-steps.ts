import { MIN_HEALTH_PATH_REVIEW_ROUND } from "./round-catalog";
import type {
  PatientProgramRoundSkipReason,
  PatientProgramRoundStepCode,
} from "@prisma/client";

/**
 * ADR-0022 (plan-driven service rounds; supersedes SR-D1/SR-D4): every opened round has a materialized,
 * ordered plan. ROUND_GUIDELINES (the Product Owner's Canva "ผลการจัดบริการ" boxes, 2026-10-21) only seeds
 * the plans of rounds 1-6, and ROUND_ITEM_CATALOG describes every item a plan can hold. A step covers one
 * or more checklist items; the plan position is the stepper order.
 */
export type RoundStepCode = PatientProgramRoundStepCode;

export type RoundStepKind =
  | "FORM"
  | "PER_ROUND_TOOL"
  | "SCREENING"
  | "GOAL_PLAN"
  | "FOLLOWUP_REVIEW"
  | "DERIVED"
  | "CUSTOM";

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

/** The measurements the vitals step needs; the order is the order the step UI lists them. */
export const VITALS_MEASUREMENTS = [
  "weight",
  "heightCm",
  "waistCircumference",
  "bloodSugar",
  "systolicBloodPressure",
  "diastolicBloodPressure",
] as const;

export type VitalsMeasurement = (typeof VITALS_MEASUREMENTS)[number];

/** FR-7b: a round's Follow-up holding any vitals measurement is staff vitals evidence of that round. */
export function followupHoldsVitals(
  followup: Partial<Record<VitalsMeasurement, number | null>> | null | undefined,
): boolean {
  return Boolean(followup && VITALS_MEASUREMENTS.some((measurement) => followup[measurement] != null));
}

export const VITALS_MEASUREMENT_LABELS: Readonly<Record<VitalsMeasurement, string>> = {
  weight: "น้ำหนัก",
  heightCm: "ส่วนสูง",
  waistCircumference: "รอบเอว",
  bloodSugar: "ค่าน้ำตาล",
  systolicBloodPressure: "ความดันตัวบน",
  diastolicBloodPressure: "ความดันตัวล่าง",
};

/**
 * Height is required in rounds 1-2. Later rounds may record it in the Follow-up (R2-D) and otherwise use
 * the latest recorded height (WB-DF-05), so it is never missing there.
 */
export function requiredVitalsMeasurements(roundNumber: number): readonly VitalsMeasurement[] {
  return roundNumber <= 2
    ? VITALS_MEASUREMENTS
    : VITALS_MEASUREMENTS.filter((measurement) => measurement !== "heightCm");
}

/** What a plan item is, independent of the round it is planned in (ADR-0022). */
export type RoundItemCatalogEntry = RoundStepDefinition & {
  /** May be planned in more than one round of a Program. */
  repeatable: boolean;
  /** Answered once per Program; later rounds reuse that answer (KNOW_SELF, PAM, PROMS, HEALTH_PATH). */
  oncePerProgram: boolean;
  /** Recorded by the assigned อสม. or the patient's hospital staff only (FR-D4a). */
  staffOnly: boolean;
  /** The registered patient may record it in their own open round (FR-D4a; enabled by FR-4). */
  patientRecordable: boolean;
};

type RoundItemFlags = Pick<RoundItemCatalogEntry, "repeatable" | "oncePerProgram" | "staffOnly" | "patientRecordable">;

const PER_ROUND: RoundItemFlags = { repeatable: true, oncePerProgram: false, staffOnly: false, patientRecordable: true };
const ONCE_PER_PROGRAM: RoundItemFlags = { repeatable: false, oncePerProgram: true, staffOnly: false, patientRecordable: true };
const STAFF_REVIEW: RoundItemFlags = { repeatable: true, oncePerProgram: false, staffOnly: true, patientRecordable: false };

function catalogEntry(
  code: RoundStepCode,
  label: string,
  kind: RoundStepKind,
  flags: RoundItemFlags,
  items: readonly string[] = [label],
): RoundItemCatalogEntry {
  return { code, label, kind, items, skippable: true, ...flags };
}

export const ROUND_ITEM_CATALOG: Readonly<Record<RoundStepCode, RoundItemCatalogEntry>> = {
  VITALS: catalogEntry("VITALS", "ข้อมูลทั่วไปและสัญญาณชีพ", "FORM", PER_ROUND, VITALS_ITEMS),
  // SR-D12: "รู้จักตัวฉันเอง" = the preferred name, also offered in the vitals step of round 1.
  KNOW_SELF: catalogEntry("KNOW_SELF", "รู้จักตัวฉันเอง", "FORM", ONCE_PER_PROGRAM),
  PAM: catalogEntry("PAM", "PAM", "SCREENING", ONCE_PER_PROGRAM),
  PROMS: catalogEntry("PROMS", "PROMs", "SCREENING", ONCE_PER_PROGRAM),
  FLOATING_CHART: catalogEntry("FLOATING_CHART", "กราฟวัดลอยจม", "PER_ROUND_TOOL", PER_ROUND),
  CONFIDENCE_RULER: catalogEntry("CONFIDENCE_RULER", "ไม้บรรทัดวัดใจ", "PER_ROUND_TOOL", PER_ROUND),
  ROUTINE: catalogEntry("ROUTINE", "ตารางชีวิตของฉัน", "PER_ROUND_TOOL", PER_ROUND),
  // SR-D9: derived from round 1 vitals; no form, so nobody records it.
  HEALTH_PATH: catalogEntry("HEALTH_PATH", "เส้นทางสุขภาพ", "DERIVED", { ...ONCE_PER_PROGRAM, patientRecordable: false }),
  // Answered by the round's Follow-up plan review; round 2's guideline answers it with the first Goal Plan.
  HEALTH_PLAN_REVIEW: catalogEntry("HEALTH_PLAN_REVIEW", "ทบทวนแผนสุขภาพ", "FOLLOWUP_REVIEW", STAFF_REVIEW),
  DREAM_CARD: catalogEntry("DREAM_CARD", "ความฝันของฉัน", "PER_ROUND_TOOL", PER_ROUND),
  // Interim default, PENDING customer confirmation: answered by the round's Follow-up planAdjusted.
  HEALTHY_PLAN: catalogEntry("HEALTHY_PLAN", "แผนสุขภาพดีของฉัน", "GOAL_PLAN", STAFF_REVIEW),
  // SR-D9: read-only timeline of the rounds, DONE when the actor confirms the review (round 6).
  HEALTH_PATH_REVIEW: catalogEntry("HEALTH_PATH_REVIEW", "ทบทวนเส้นทางสุขภาพ", "DERIVED", STAFF_REVIEW),
  // FR-D2: a free-text item; its title is its label and it is DONE once marked "ทำแล้ว".
  CUSTOM: catalogEntry("CUSTOM", "รายการเพิ่มเติม", "CUSTOM", PER_ROUND),
};

function guidelineStep(code: RoundStepCode, kind?: RoundStepKind): RoundStepDefinition {
  const entry = ROUND_ITEM_CATALOG[code];

  return { code, label: entry.label, kind: kind ?? entry.kind, items: entry.items, skippable: entry.skippable };
}

const VITALS_STEP = guidelineStep("VITALS");
const PLAN_REVIEW_STEP = guidelineStep("HEALTH_PLAN_REVIEW");
const RULER_STEP = guidelineStep("CONFIDENCE_RULER");
const ROUTINE_STEP = guidelineStep("ROUTINE");
const FLOATING_CHART_STEP = guidelineStep("FLOATING_CHART");

/**
 * The guideline that seeds the plans of rounds 1-6; it is copied into PatientProgramRoundPlanItem when a
 * round opens, so changing it never rewrites the plan of an opened round.
 */
export const ROUND_GUIDELINES: Readonly<Record<number, readonly RoundStepDefinition[]>> = {
  1: [
    VITALS_STEP,
    guidelineStep("KNOW_SELF"),
    guidelineStep("PAM"),
    guidelineStep("PROMS"),
    FLOATING_CHART_STEP,
    RULER_STEP,
    ROUTINE_STEP,
    guidelineStep("HEALTH_PATH"),
  ],
  // Interim (until Phase R2): round 2 "ทบทวนแผนสุขภาพ" creates the Program's first Goal Plan (D4).
  2: [VITALS_STEP, guidelineStep("HEALTH_PLAN_REVIEW", "GOAL_PLAN"), RULER_STEP, ROUTINE_STEP],
  // SR-D11: ความฝันของฉัน belongs to round 3.
  3: [VITALS_STEP, PLAN_REVIEW_STEP, RULER_STEP, guidelineStep("DREAM_CARD")],
  4: [VITALS_STEP, PLAN_REVIEW_STEP, FLOATING_CHART_STEP, RULER_STEP, ROUTINE_STEP, guidelineStep("HEALTHY_PLAN")],
  5: [VITALS_STEP, PLAN_REVIEW_STEP, ROUTINE_STEP],
  6: [VITALS_STEP, guidelineStep("HEALTH_PATH_REVIEW"), PLAN_REVIEW_STEP, RULER_STEP],
};

/** The guideline of a round; rounds 7-12 (FR-D3) have none and open with an empty plan. */
export function roundGuideline(roundNumber: number): readonly RoundStepDefinition[] {
  return ROUND_GUIDELINES[roundNumber] ?? [];
}

export function isStepInGuideline(roundNumber: number, stepCode: string): boolean {
  return roundGuideline(roundNumber).some((definition) => definition.code === stepCode);
}

/** Per-round tools (SR-D8); a result needs an active plan item of its round (DB trigger). */
export type PerRoundToolCode = "CONFIDENCE_RULER" | "ROUTINE" | "FLOATING_CHART" | "DREAM_CARD";

export const ROUND_SKIP_REASON_LABELS: Readonly<Record<PatientProgramRoundSkipReason, string>> = {
  PATIENT_DECLINED: "ผู้ป่วยปฏิเสธ",
  PATIENT_UNABLE: "ผู้ป่วยทำไม่ได้",
  EQUIPMENT_UNAVAILABLE: "ไม่มีอุปกรณ์",
  OTHER: "อื่น ๆ",
  // FR-D1: recorded by the system for the items still unresolved when a round is ended.
  NOT_DONE_AT_CLOSE: "ยังไม่ได้ทำเมื่อจบบริการ",
};

export type RoundStepEvidence = {
  at: Date | null;
  byDisplayName: string | null;
  byPatient?: boolean;
  recordedRoundNumber?: number;
};

export type RoundStepSkipFact = {
  /** ADR-0022 (FR-1b): a skip belongs to one plan item. */
  planItemId: string;
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

/** A recorded vitals source of a round and which of its measurements hold a value. */
export type RoundVitalsFact = RoundStepEvidence & {
  measurements: readonly VitalsMeasurement[];
  /** When the source was recorded; the latest of a round's two sources is the one shown. */
  recordedAt: Date;
};

export type RoundFollowupFact = RoundVitalsFact & {
  goalPlanLinked: boolean;
  planAdjusted: boolean | null;
  /** R2-F: ทำตามแผนได้/ไม่ได้; null for Follow-ups recorded before R2. */
  followedPlan: boolean | null;
  /** R2-F: "เกิดอะไรขึ้นบ้าง?" (reflectionNote) is not blank. */
  reflectionAnswered: boolean;
  /** The Goal Plan adjusted from this Follow-up, if any. */
  adjustedPlan: RoundStepEvidence | null;
};

/** One item of a round's plan. `id` is null in the guideline preview of a round not opened yet. */
export type RoundPlanItemFact = {
  id: string | null;
  stepCode: RoundStepCode;
  customTitle: string | null;
  position: number;
  removed: boolean;
  origin?: "GUIDELINE" | "ADDED";
  doneNote?: string | null;
  /** CUSTOM "ทำแล้ว". */
  done: RoundStepEvidence | null;
};

/** An opened round (PatientProgramRound) with all of its plan items, removed ones included. */
export type RoundPlanFact = {
  planItems: readonly RoundPlanItemFact[];
};

/** Plain facts of one Program, loaded once and shared by every status computation. */
export type ProgramRoundFacts = {
  programActive: boolean;
  preferredName: string | null;
  preferredNameEvidence?: RoundStepEvidence | null;
  /** R2-C: per instrument; a legacy combined screening fills both. */
  screenings: Readonly<Record<"PAM" | "PROMS", RoundStepEvidence | null>>;
  /** PatientProgramRoundVitals by round. */
  roundVitals: Partial<Record<number, RoundVitalsFact>>;
  /** The round's Follow-up (Follow-up k = round k + 2). */
  followups: Partial<Record<number, RoundFollowupFact>>;
  tools: Readonly<Record<PerRoundToolCode, Partial<Record<number, RoundStepEvidence>>>>;
  firstGoalPlan: RoundStepEvidence | null;
  healthPathReviewed: RoundStepEvidence | null;
  healthPathReviews?: Partial<Record<number, RoundStepEvidence>>;
  completions: Partial<Record<number, RoundCompletionFact>>;
  skips: Partial<Record<number, readonly RoundStepSkipFact[]>>;
  /** Opened rounds and their plans (ADR-0022). */
  rounds: Partial<Record<number, RoundPlanFact>>;
};

export type RoundStepStatus = "DONE" | "SKIPPED" | "TODO" | "LOCKED";

export type RoundStepState = RoundStepDefinition & {
  /** The plan item; null in the guideline preview of a round not opened yet. */
  planItemId: string | null;
  origin?: "GUIDELINE" | "ADDED";
  doneNote?: string | null;
  status: RoundStepStatus;
  evidence: RoundStepEvidence | null;
  skip: RoundStepSkipFact | null;
  /** VITALS only: required measurements without a value in the round's record; empty otherwise. */
  missingMeasurements: readonly VitalsMeasurement[];
};

export type RoundState =
  | "COMPLETED"
  | "IN_PROGRESS"
  | "NOT_STARTED"
  | "LOCKED";

export type RoundStatus = {
  roundNumber: number;
  state: RoundState;
  steps: readonly RoundStepState[];
  resolvedItems: number;
  totalItems: number;
  completion: RoundCompletionFact | null;
  /** Writes are accepted (SR-D5): Program active, round opened and open, previous round completed. */
  writable: boolean;
  /** FR-D1: at least one active plan item DONE while the round is writable. */
  canComplete: boolean;
};

/** SR-D5: round 1, or the previous round completed; never a completed round. */
export function isRoundOpenForWrites(
  completedRounds: ReadonlySet<number>,
  roundNumber: number,
): boolean {
  return !completedRounds.has(roundNumber) && (roundNumber === 1 || completedRounds.has(roundNumber - 1));
}

/** The plan of a round: the opened round's plan, else the guideline as a preview (rounds 7-12: empty). */
export function roundPlan(facts: ProgramRoundFacts, roundNumber: number): readonly RoundPlanItemFact[] {
  return (
    facts.rounds[roundNumber]?.planItems ??
    roundGuideline(roundNumber).map((definition, index) => ({
      id: null,
      stepCode: definition.code,
      customTitle: null,
      position: index + 1,
      removed: false,
      done: null,
    }))
  );
}

/** A plan item's definition: its round's guideline step, else its catalog entry (CUSTOM: its own title). */
export function planItemDefinition(roundNumber: number, item: RoundPlanItemFact): RoundStepDefinition {
  if (item.stepCode === "CUSTOM") {
    const title = item.customTitle ?? ROUND_ITEM_CATALOG.CUSTOM.label;

    return { ...guidelineStep("CUSTOM"), label: title, items: [title] };
  }

  return (
    roundGuideline(roundNumber).find((definition) => definition.code === item.stepCode) ??
    guidelineStep(item.stepCode)
  );
}

/** A round's vitals sources, latest recorded first: its round vitals and its Follow-up measurements. */
function roundVitalsSources(facts: ProgramRoundFacts, roundNumber: number): readonly RoundVitalsFact[] {
  return [facts.roundVitals[roundNumber], facts.followups[roundNumber]]
    .filter((source): source is RoundVitalsFact => source !== undefined)
    .sort((left, right) => right.recordedAt.getTime() - left.recordedAt.getTime());
}

function missingFrom(source: RoundVitalsFact | undefined, roundNumber: number): readonly VitalsMeasurement[] {
  const recorded = source?.measurements ?? [];

  return requiredVitalsMeasurements(roundNumber).filter((measurement) => !recorded.includes(measurement));
}

/**
 * Items 1-7 count as done when either source holds every required measurement (the latest such source is
 * the evidence); otherwise the latest source's missing measurements are reported.
 */
function vitalsOutcome(
  facts: ProgramRoundFacts,
  roundNumber: number,
): { evidence: RoundStepEvidence | null; missing: readonly VitalsMeasurement[] } {
  const sources = roundVitalsSources(facts, roundNumber);
  const complete = sources.find((source) => missingFrom(source, roundNumber).length === 0);

  return complete
    ? { evidence: { at: complete.at, byDisplayName: complete.byDisplayName, byPatient: complete.byPatient }, missing: [] }
    : { evidence: null, missing: missingFrom(sources[0], roundNumber) };
}

/** How DONE is computed for each step (single source for every view and the completion guard). */
function stepEvidence(
  facts: ProgramRoundFacts,
  roundNumber: number,
  definition: RoundStepDefinition,
  item: RoundPlanItemFact,
): RoundStepEvidence | null {
  const followup = facts.followups[roundNumber] ?? null;

  switch (definition.code) {
    case "VITALS":
      return vitalsOutcome(facts, roundNumber).evidence;
    case "CUSTOM":
      return item.done;
    case "KNOW_SELF":
      return facts.preferredName ? facts.preferredNameEvidence ?? { at: null, byDisplayName: null } : null;
    case "PAM":
    case "PROMS":
      return facts.screenings[definition.code];
    case "CONFIDENCE_RULER":
    case "ROUTINE":
    case "FLOATING_CHART":
    case "DREAM_CARD":
      return facts.tools[definition.code][roundNumber] ?? null;
    case "HEALTH_PATH":
      return facts.roundVitals[1] ?? null;
    case "HEALTH_PATH_REVIEW":
      return facts.healthPathReviews ? facts.healthPathReviews[roundNumber] ?? null : roundNumber === MIN_HEALTH_PATH_REVIEW_ROUND ? facts.healthPathReviewed : null;
    case "HEALTH_PLAN_REVIEW":
      if (definition.kind === "GOAL_PLAN") {
        return facts.firstGoalPlan;
      }

      if (!followup || !followup.goalPlanLinked) {
        return null;
      }

      // R2-F: ทำตามแผนได้/ไม่ได้ answered and "เกิดอะไรขึ้นบ้าง?" not blank.
      if (followup.followedPlan !== null) {
        return followup.reflectionAnswered ? followup : null;
      }

      // Follow-ups recorded before R2 have no followedPlan and keep D5: "ปรับแผน" answered.
      return followup.planAdjusted !== null ? followup : null;
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

/** A round's status over `plan`: active items in position order; removed items are ignored. */
export function computeRoundStatus(
  facts: ProgramRoundFacts,
  roundNumber: number,
  plan: readonly RoundPlanItemFact[],
): RoundStatus {
  const completedRounds = new Set(
    Object.keys(facts.completions).map((value) => Number(value)),
  );
  const completion = facts.completions[roundNumber] ?? null;
  const locked = !completion && roundNumber > 1 && !completedRounds.has(roundNumber - 1);
  const skips = facts.skips[roundNumber] ?? [];
  const activeItems = plan.filter((item) => !item.removed).sort((left, right) => left.position - right.position);
  const steps: RoundStepState[] = activeItems.map((item) => {
    const definition = planItemDefinition(roundNumber, item);
    const recorded = stepEvidence(facts, roundNumber, definition, item);
    const storedSkip = item.id === null ? null : skips.find((candidate) => candidate.planItemId === item.id) ?? null;
    // A later Program-level answer cannot rewrite the history of a closed round. Auto-close skips
    // prove the item was TODO at close; manual skips may only be replaced before that close.
    const frozenSkip = completion && storedSkip && (storedSkip.reasonCode === "NOT_DONE_AT_CLOSE" || (recorded?.recordedRoundNumber !== undefined && recorded.recordedRoundNumber > roundNumber));
    const evidence = frozenSkip ? null : recorded;
    const skip = evidence ? null : storedSkip;
    const status: RoundStepStatus = evidence ? "DONE" : skip ? "SKIPPED" : locked ? "LOCKED" : "TODO";

    const missingMeasurements = definition.code === "VITALS" ? vitalsOutcome(facts, roundNumber).missing : [];

    return { ...definition, planItemId: item.id, origin: item.origin, doneNote: item.doneNote, status, evidence, skip, missingMeasurements };
  });
  const resolved = steps.filter((state) => state.status === "DONE" || state.status === "SKIPPED");
  const resolvedItems = resolved.reduce((total, state) => total + state.items.length, 0);
  const totalItems = steps.reduce((total, state) => total + state.items.length, 0);
  const writable =
    facts.programActive && facts.rounds[roundNumber] !== undefined && isRoundOpenForWrites(completedRounds, roundNumber);
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
    canComplete: writable && steps.some((step) => step.status === "DONE"),
  };
}

export const ROUND_SUMMARY_STEP = "SUMMARY" as const;

/** Shared by plan writers and the editor's disabled choices. Authorization is checked separately. */
export function roundPlanItemUnavailableReason(facts: ProgramRoundFacts, roundNumber: number, stepCode: RoundStepCode): string | null {
  const current = computeRoundStatus(facts, roundNumber, roundPlan(facts, roundNumber));
  if (stepCode !== "CUSTOM" && current.steps.some((step) => step.code === stepCode)) return "รายการนี้อยู่ในแผนแล้ว";
  if (ROUND_ITEM_CATALOG[stepCode].oncePerProgram && Object.keys(facts.rounds).some((key) => {
    const otherRound = Number(key);
    return otherRound !== roundNumber && computeRoundStatus(facts, otherRound, roundPlan(facts, otherRound)).steps.some((step) => step.code === stepCode && step.status === "DONE");
  })) return "รายการนี้ทำแล้วในโปรแกรมนี้";
  if (["HEALTH_PLAN_REVIEW", "HEALTHY_PLAN"].includes(stepCode) && !facts.firstGoalPlan) return "ต้องมีแผนเป้าหมายก่อนเพิ่มรายการนี้";
  if (stepCode === "HEALTH_PATH_REVIEW" && (roundNumber < MIN_HEALTH_PATH_REVIEW_ROUND || !facts.roundVitals[1])) return "ทบทวนเส้นทางสุขภาพได้ตั้งแต่ครั้งที่ 6 และต้องมีสัญญาณชีพครั้งที่ 1";
  return null;
}

/**
 * SR-D7: after saving `afterCode`, go to the next unresolved step after it, then any unresolved step
 * before it, then the summary.
 */
export function nextRoundStep(
  steps: readonly RoundStepState[],
  afterCode: string | null,
): string {
  const index = afterCode ? steps.findIndex((state) => roundStepKey(state) === afterCode) : -1;
  const ordered = [...steps.slice(index + 1), ...steps.slice(0, Math.max(index, 0))];
  const next = ordered.find((state) => state.status === "TODO");

  return next ? roundStepKey(next) : ROUND_SUMMARY_STEP;
}

/** CUSTOM titles may repeat, so navigation uses the materialized item identity. */
export function roundStepKey(step: Pick<RoundStepState, "code" | "planItemId">): string {
  return step.code === "CUSTOM" && step.planItemId ? step.planItemId : step.code;
}
