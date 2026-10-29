import { GUIDELINE_ROUND_COUNT } from "@/modules/patient-program-rounds/domain/round-catalog";

/** CT-D1: a patient in an active stage without care activity for more than this many days is stale. */
export const CARE_STALE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export const CARE_STAGES = [
  "NOT_STARTED",
  "READY_FOR_PROGRAM",
  "IN_ROUND",
  "IN_EXTRA_ROUND",
  "AWAITING_AFTER",
  "AWAITING_PROGRAM_END",
  "PROGRAM_COMPLETED",
  "CARE_ENDED",
] as const;

export type CareStage = (typeof CARE_STAGES)[number];

export const CARE_STAGE_LABELS: Readonly<Record<CareStage, string>> = {
  NOT_STARTED: "ยังไม่เริ่ม",
  READY_FOR_PROGRAM: "รอเปิดโปรแกรม",
  IN_ROUND: "อยู่ระหว่างครั้งบริการ",
  IN_EXTRA_ROUND: "ครั้งบริการเพิ่มเติม",
  AWAITING_AFTER: "รอการประเมินสุดท้าย",
  AWAITING_PROGRAM_END: "รอจบโปรแกรม",
  PROGRAM_COMPLETED: "จบโปรแกรมแล้ว",
  CARE_ENDED: "สิ้นสุดการดูแลแล้ว",
};

/** Stages whose care is still running; CT-D1 signals (b) and (c) apply to these only. */
export const ACTIVE_CARE_STAGES: ReadonlySet<CareStage> = new Set<CareStage>([
  "READY_FOR_PROGRAM",
  "IN_ROUND",
  "IN_EXTRA_ROUND",
  "AWAITING_AFTER",
  "AWAITING_PROGRAM_END",
]);

/** CT-D5: stages hidden unless the ended filter is on. */
export const ENDED_CARE_STAGES: ReadonlySet<CareStage> = new Set<CareStage>(["PROGRAM_COMPLETED", "CARE_ENDED"]);

export const CARE_SIGNALS = ["overdueAppointment", "noUpcomingAppointment", "stale"] as const;

export type CareSignal = (typeof CARE_SIGNALS)[number];

export type CareSignals = Readonly<Record<CareSignal, boolean>>;

export const CARE_SIGNAL_LABELS: Readonly<Record<CareSignal, string>> = {
  overdueAppointment: "เกินนัด",
  noUpcomingAppointment: "ไม่มีนัดถัดไป",
  stale: "ไม่มีความเคลื่อนไหว",
};

/** Coarse, per-patient facts computed in the database for every patient in scope. */
export type CareCoarseFacts = {
  careEnded: boolean;
  baselineRecorded: boolean;
  /** The relationship's ACTIVE Program (at most one), or null. */
  activeProgram: {
    openedRounds: number;
    completedRounds: number;
    /** Lowest opened round without a completion; null when every opened round is completed. */
    currentOpenRound: number | null;
    finalAssessmentRecorded: boolean;
  } | null;
  completedProgramExists: boolean;
};

export function deriveCareStage(facts: CareCoarseFacts): CareStage {
  if (facts.careEnded) {
    return "CARE_ENDED";
  }

  const program = facts.activeProgram;
  if (program) {
    if (program.finalAssessmentRecorded) {
      return "AWAITING_PROGRAM_END";
    }

    if (program.currentOpenRound !== null) {
      return program.currentOpenRound > GUIDELINE_ROUND_COUNT ? "IN_EXTRA_ROUND" : "IN_ROUND";
    }

    // ADR-0022 Final Assessment gate: at least six opened rounds and every opened round completed.
    if (program.openedRounds >= GUIDELINE_ROUND_COUNT && program.completedRounds === program.openedRounds) {
      return "AWAITING_AFTER";
    }

    // An active Program whose next guideline round is not opened yet still has rounds ahead.
    return "IN_ROUND";
  }

  if (facts.completedProgramExists) {
    return "PROGRAM_COMPLETED";
  }

  return facts.baselineRecorded ? "READY_FOR_PROGRAM" : "NOT_STARTED";
}

export type CareSignalFacts = {
  stage: CareStage;
  now: Date;
  /** Latest care activity (see the care tracking query for its sources); null when none was recorded. */
  lastActivityAt: Date | null;
  /** Earliest SCHEDULED appointment at or after `now`. */
  nextAppointmentAt: Date | null;
  /** A SCHEDULED appointment before `now` exists. */
  hasOverdueAppointment: boolean;
};

/** CT-D1 delay signals. "เกินนัด" applies in every stage; the other two only in active stages. */
export function deriveCareSignals(facts: CareSignalFacts): CareSignals {
  const active = ACTIVE_CARE_STAGES.has(facts.stage);
  const staleBefore = facts.now.getTime() - CARE_STALE_DAYS * DAY_MS;

  return {
    overdueAppointment: facts.hasOverdueAppointment,
    noUpcomingAppointment: active && facts.nextAppointmentAt === null,
    stale: active && (facts.lastActivityAt === null || facts.lastActivityAt.getTime() < staleBefore),
  };
}

export function hasAnyCareSignal(signals: CareSignals): boolean {
  return CARE_SIGNALS.some((signal) => signals[signal]);
}
