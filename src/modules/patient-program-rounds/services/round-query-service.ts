import "server-only";

import {
  PatientProgramStatus,
  Role,
  type PatientProgramRoundToolCode,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { getGoalTemplate } from "@/modules/goals/domain/goal-templates";
import {
  decidePatientProgramPolicy,
  PATIENT_PROGRAM_MANAGE_CAPABILITY,
  PATIENT_PROGRAM_READ_CAPABILITY,
} from "@/modules/patient-program/policies/patient-program-policy";
import { resolvePatientProgramAccessContext } from "@/modules/patient-program/services/patient-program-access-service";
import { patientProgramIdSchema } from "@/modules/patient-program/schemas/patient-program-schemas";
import {
  patientProgramServiceOneSelect,
  toPatientProgramServiceOneProjection,
  withoutPatientProgramServiceOneRecorders,
  type PatientProgramServiceOneProjection,
} from "@/modules/patient-program/services/patient-program-service-one-query-service";
import {
  ApplicationError,
  InfrastructureError,
  NotFoundError,
} from "@/shared/errors/application-error";

import { screeningAnswersInstrument } from "@/modules/screening/domain/screening-outcome";

import { calculateBodyMassIndex } from "../domain/body-mass-index";
import {
  ADJUSTED_PLAN_ROUND,
  HEALTH_PATH_REVIEW_ROUND,
  isFollowupRound,
  isProgramRoundNumber,
  isRoundVitalsRound,
  LAST_FOLLOWUP_ROUND,
  PROGRAM_ROUND_NUMBERS,
  roundTitle,
  ROUND_TOOLS,
  SERVICE_ONE_HOME_ROUND,
  toFollowupRoundNumber,
  toProgramRoundNumber,
  type ProgramRoundNumber,
} from "../domain/round-catalog";
import {
  computeRoundStatus,
  type PerRoundToolCode,
  type ProgramRoundFacts,
  type RoundFollowupFact,
  type RoundState,
  type RoundStatus,
  type RoundStepEvidence,
  type RoundVitalsFact,
  VITALS_MEASUREMENTS,
} from "../domain/round-steps";

export type PatientProgramRoundQueryDatabase = PrismaClient | Prisma.TransactionClient;

export type PatientProgramRoundQueryDependencies = {
  database?: PatientProgramRoundQueryDatabase;
};

export type RoundSummary = {
  roundNumber: ProgramRoundNumber;
  title: string;
  state: RoundState;
  resolvedItems: number;
  totalItems: number;
  completedAt: Date | null;
  completedByDisplayName: string | null;
};

export type ProgramRoundsOverview = {
  patientHospitalRelationshipId: string;
  patientProgramId: string;
  programStatus: PatientProgramStatus;
  rounds: readonly RoundSummary[];
  after: {
    /** LOCKED until round 6 is completed (SR-D5). */
    state: "LOCKED" | "RECORDED" | "NOT_RECORDED";
    date: Date | null;
    recordedByDisplayName: string | null;
  };
};

export type RoundVitalsView = {
  source: "ROUND_VITALS" | "FOLLOWUP";
  serviceDate: Date | null;
  weight: number | null;
  heightCm: number | null;
  waistCircumference: number | null;
  systolicBloodPressure: number | null;
  diastolicBloodPressure: number | null;
  bloodSugar: number | null;
  /** WB-DF-04: value only, from this round's weight and the latest recorded height. */
  bmi: number | null;
  recordedByDisplayName: string | null;
};

/** SR-D9: one row of the health path, derived from a round's vitals. */
export type RoundHealthPathRow = {
  roundNumber: ProgramRoundNumber;
  vitals: RoundVitalsView | null;
};

/** An activity of the round's source Goal Plan with its latest recorded progress up to this round. */
export type RoundPlanItem = {
  activityCode: string;
  activityLabel: string;
  targetDays: number;
  targetValue: number | null;
  targetUnit: string | null;
  progressStatus: "DONE" | "PARTIAL" | "NOT_DONE" | "NOT_APPLICABLE" | null;
  achievedDays: number | null;
  /** Program round (3-6) whose Follow-up recorded the progress shown; null when none was recorded. */
  progressRound: number | null;
};

/**
 * D6: the plan part of "รายการที่ต้องติดตามในครั้งนั้น". Due = latest recorded achievedDays below the
 * target, or no progress recorded yet; met items are listed separately.
 */
export type RoundPlanFollowUp = {
  goalPlanId: string;
  dueItems: readonly RoundPlanItem[];
  metItems: readonly RoundPlanItem[];
};

/** CARE-13: PAM/PROMs reviewed again in a later round, recorded as EXTRA in the ledger. */
export type RoundExtraActivity = {
  toolCode: "PAM" | "PROMS";
  label: string;
  performedAt: Date | null;
  recordedByDisplayName: string | null;
};

export type ProgramRoundDetail = {
  patientHospitalRelationshipId: string;
  patientProgramId: string;
  programStatus: PatientProgramStatus;
  roundNumber: ProgramRoundNumber;
  title: string;
  /** The actor may record, skip and complete (same policy as every round write; the server re-checks). */
  canManage: boolean;
  patient: {
    displayName: string;
    occupation: string | null;
    /** SR-D12: "รู้จักตัวฉันเอง". */
    preferredName: string | null;
    /** Optimistic concurrency token of the hospital profile; null when no profile row exists yet. */
    profileVersion: number | null;
    /** D10: shown as age in full years in the vitals header; null hides it. */
    dateOfBirth: Date | null;
  };
  status: RoundStatus;
  vitals: RoundVitalsView | null;
  vitalsForm: {
    /** WB-DF-05: editable in rounds 1-2, display-only afterwards. */
    heightEditable: boolean;
    latestHeightCm: number | null;
  };
  /** Rounds 3-6: Follow-up this round maps to, if recorded (PatientFollowup.roundNumber = round - 2). */
  followupId: string | null;
  /** Rounds 3-6: the round is writable and its Follow-up is the next one to record. */
  canStartFollowup: boolean;
  serviceOne: PatientProgramServiceOneProjection;
  /** R2-C: the Program screening answering each step; a legacy combined screening answers both. */
  screenings: Readonly<Record<"PAM" | "PROMS", { id: string; combined: boolean } | null>>;
  /** Rounds 3-6: the round's Follow-up plan review answers (R2-F), when recorded. */
  planReview: {
    followedPlan: boolean | null;
    reflectionNote: string | null;
    expertAdvice: string | null;
  } | null;
  goalPlan: {
    /** Round 2: the Program's first Goal Plan. */
    firstGoalPlanId: string | null;
    /** The latest Goal Plan of the Program (source of the next Follow-up). */
    currentGoalPlanId: string | null;
    /** Round 4: the round's Follow-up planAdjusted answer, and the plan adjusted from it. */
    roundPlanAdjusted: boolean | null;
    adjustedGoalPlanId: string | null;
  };
  /** Rounds 3-6 only, when the round has a source Goal Plan (D6). */
  planFollowUp: RoundPlanFollowUp | null;
  /** Round 1: the starting point; round 6: rounds 1-6 (SR-D9). Empty otherwise. */
  healthPath: readonly RoundHealthPathRow[];
  extraActivities: readonly RoundExtraActivity[];
  /** Extra PAM/PROMs reviews still available in this round (rounds 2-6, screening recorded). */
  extraOptions: readonly ("PAM" | "PROMS")[];
};

type RecorderName = {
  person: { givenName: string | null; familyName: string | null };
} | null;

const recorderSelect = {
  select: { person: { select: { givenName: true, familyName: true } } },
} as const;

const programRoundSelect = {
  id: true,
  patientHospitalRelationshipId: true,
  status: true,
  patientHospitalRelationship: {
    select: { hospitalProfile: { select: { occupation: true, preferredName: true, version: true } } },
  },
  initialBaseline: { select: { heightCm: true } },
  roundVitals: {
    orderBy: { roundNumber: "asc" },
    select: {
      id: true,
      roundNumber: true,
      serviceDate: true,
      recordedAt: true,
      weight: true,
      heightCm: true,
      waistCircumference: true,
      systolicBloodPressure: true,
      diastolicBloodPressure: true,
      bloodSugar: true,
      recordedByUser: recorderSelect,
    },
  },
  roundActivities: {
    orderBy: [{ roundNumber: "asc" }, { performedAt: "asc" }],
    select: {
      id: true,
      roundNumber: true,
      toolCode: true,
      source: true,
      mode: true,
      performedAt: true,
      recordedByUser: recorderSelect,
    },
  },
  roundCompletions: {
    orderBy: { roundNumber: "asc" },
    select: { roundNumber: true, completedAt: true, completedByUser: recorderSelect },
  },
  roundStepSkips: {
    orderBy: [{ roundNumber: "asc" }, { createdAt: "asc" }],
    select: {
      roundNumber: true,
      stepCode: true,
      reasonCode: true,
      note: true,
      createdAt: true,
      skippedByUser: recorderSelect,
    },
  },
  screeningAssessments: {
    orderBy: { submittedAt: "asc" },
    select: { id: true, instrument: true, submittedAt: true, conductedByUser: recorderSelect },
  },
  ...patientProgramServiceOneSelect,
  goalPlans: {
    orderBy: { roundNumber: "asc" },
    take: 50,
    select: {
      id: true,
      roundNumber: true,
      createdAt: true,
      templateKey: true,
      templateVersion: true,
      sourceFollowupId: true,
      createdByUser: recorderSelect,
      items: {
        orderBy: { sortOrder: "asc" },
        select: {
          activityCode: true,
          targetDays: true,
          targetValue: true,
          targetUnit: true,
        },
      },
    },
  },
  followups: {
    where: { roundNumber: { lte: toFollowupRoundNumber(LAST_FOLLOWUP_ROUND) } },
    orderBy: { roundNumber: "asc" },
    select: {
      id: true,
      roundNumber: true,
      serviceDate: true,
      recordedAt: true,
      sourceGoalPlanId: true,
      planAdjusted: true,
      followedPlan: true,
      reflectionNote: true,
      expertAdvice: true,
      weight: true,
      heightCm: true,
      waistCircumference: true,
      systolicBloodPressure: true,
      diastolicBloodPressure: true,
      bloodSugar: true,
      createdByUser: recorderSelect,
      activityProgress: {
        select: { goalActivityCode: true, status: true, achievedDays: true },
      },
    },
  },
  finalAssessment: {
    select: { serviceDate: true, recordedAt: true, recordedBy: recorderSelect },
  },
} satisfies Prisma.PatientProgramSelect;

export type ProgramRoundRecord = Prisma.PatientProgramGetPayload<{
  select: typeof programRoundSelect;
}>;

/** Patient SELF views hide recorder names; staff views show them. */
export type RoundReadOptions = { recorderNames: boolean };

const STAFF_READ: RoundReadOptions = { recorderNames: true };
const PATIENT_SELF_READ: RoundReadOptions = { recorderNames: false };

function getDatabase(
  dependencies: PatientProgramRoundQueryDependencies,
): PatientProgramRoundQueryDatabase {
  return dependencies.database ?? getPrisma();
}

function toDisplayName(user: RecorderName): string | null {
  if (!user) {
    return null;
  }

  const name = [user.person.givenName, user.person.familyName]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(" ");

  return name || null;
}

function findFollowupForRound(program: ProgramRoundRecord, roundNumber: number) {
  return isFollowupRound(roundNumber)
    ? (program.followups.find(
        (followup) => followup.roundNumber === toFollowupRoundNumber(roundNumber),
      ) ?? null)
    : null;
}

function adjustedPlanFor(program: ProgramRoundRecord, followupId: string) {
  return program.goalPlans.find((plan) => plan.sourceFollowupId === followupId) ?? null;
}

const PER_ROUND_TOOL_RECORDS = {
  CONFIDENCE_RULER: "serviceOneConfidences",
  ROUTINE: "serviceOneRoutines",
  FLOATING_CHART: "serviceOneFloatingCharts",
  DREAM_CARD: "serviceOneDreamCards",
} as const satisfies Record<PerRoundToolCode, keyof ProgramRoundRecord>;

/** Which vitals measurements of a record hold a value. */
function recordedMeasurements(values: Partial<Record<(typeof VITALS_MEASUREMENTS)[number], number | null>>) {
  return VITALS_MEASUREMENTS.filter((measurement) => values[measurement] != null);
}

/** R2-C: the screening answering a step; a legacy combined screening answers both PAM and PROMs. */
function screeningFor(program: ProgramRoundRecord, step: "PAM" | "PROMS") {
  return program.screeningAssessments.find((screening) => screeningAnswersInstrument(screening.instrument, step)) ?? null;
}

/**
 * R2-G: ตารางชีวิตของฉัน is done with at least one row or a photo of the paper page. A routine recorded
 * before R2 (no date) stays done as recorded.
 */
function routineIsComplete(routine: ProgramRoundRecord["serviceOneRoutines"][number]): boolean {
  return routine.routineDate === null || routine.entries.length > 0 || routine.serviceOneArtifactAssociation !== null;
}

/** Plain facts for the shared status computation (SR-D1); every view and the completion guard use it. */
export function buildProgramRoundFacts(
  program: ProgramRoundRecord,
  options: RoundReadOptions = STAFF_READ,
): ProgramRoundFacts {
  const name = (user: RecorderName) => (options.recorderNames ? toDisplayName(user) : null);
  const evidence = (at: Date | null, user: RecorderName): RoundStepEvidence => ({
    at,
    byDisplayName: name(user),
  });
  const tools = Object.fromEntries(
    Object.entries(PER_ROUND_TOOL_RECORDS).map(([tool, key]) => [
      tool,
      Object.fromEntries(
        program[key]
          .filter((record) => key !== "serviceOneRoutines" || routineIsComplete(record as ProgramRoundRecord["serviceOneRoutines"][number]))
          .map((record) => [record.roundNumber, evidence(record.recordedAt, record.recordedByUser)]),
      ),
    ]),
  ) as ProgramRoundFacts["tools"];
  const followups: Partial<Record<ProgramRoundNumber, RoundFollowupFact>> = {};

  for (const followup of program.followups) {
    const roundNumber = toProgramRoundNumber(followup.roundNumber);

    if (!isProgramRoundNumber(roundNumber)) {
      continue;
    }

    const adjusted = adjustedPlanFor(program, followup.id);
    followups[roundNumber] = {
      ...evidence(followup.serviceDate ?? followup.recordedAt, followup.createdByUser),
      measurements: recordedMeasurements(followup),
      goalPlanLinked: followup.sourceGoalPlanId !== null,
      planAdjusted: followup.planAdjusted,
      followedPlan: followup.followedPlan,
      reflectionAnswered: Boolean(followup.reflectionNote?.trim()),
      adjustedPlan: adjusted ? evidence(adjusted.createdAt, adjusted.createdByUser) : null,
    };
  }

  const firstGoalPlan = program.goalPlans[0] ?? null;
  const pathReview = program.roundActivities.find(
    (entry) => entry.roundNumber === HEALTH_PATH_REVIEW_ROUND && entry.toolCode === "HEALTH_PATH",
  );

  return {
    programActive: program.status === PatientProgramStatus.ACTIVE,
    preferredName: program.patientHospitalRelationship.hospitalProfile?.preferredName ?? null,
    screenings: Object.fromEntries(
      (["PAM", "PROMS"] as const).map((step) => {
        const screening = screeningFor(program, step);

        return [step, screening ? evidence(screening.submittedAt, screening.conductedByUser) : null];
      }),
    ) as ProgramRoundFacts["screenings"],
    roundVitals: Object.fromEntries(
      program.roundVitals.map((vitals): [number, RoundVitalsFact] => [
        vitals.roundNumber,
        { ...evidence(vitals.serviceDate, vitals.recordedByUser), measurements: recordedMeasurements(vitals) },
      ]),
    ),
    followups,
    tools,
    firstGoalPlan: firstGoalPlan ? evidence(firstGoalPlan.createdAt, firstGoalPlan.createdByUser) : null,
    healthPathReviewed: pathReview ? evidence(pathReview.performedAt, pathReview.recordedByUser) : null,
    completions: Object.fromEntries(
      program.roundCompletions.map((completion) => [
        completion.roundNumber,
        { completedAt: completion.completedAt, completedByDisplayName: name(completion.completedByUser) },
      ]),
    ),
    skips: program.roundStepSkips.reduce<Partial<Record<ProgramRoundNumber, ProgramRoundFacts["skips"][1]>>>(
      (byRound, skip) => {
        if (!isProgramRoundNumber(skip.roundNumber)) {
          return byRound;
        }

        byRound[skip.roundNumber] = [
          ...(byRound[skip.roundNumber] ?? []),
          {
            stepCode: skip.stepCode,
            reasonCode: skip.reasonCode,
            note: skip.note,
            at: skip.createdAt,
            byDisplayName: name(skip.skippedByUser),
          },
        ];
        return byRound;
      },
      {},
    ),
  };
}

/** The height recorded in the latest round up to `upToRound` (rounds 1-2 vitals, rounds 3-6 Follow-ups). */
function latestHeightCm(program: ProgramRoundRecord, upToRound: number): number | null {
  for (let round = upToRound; round >= 1; round -= 1) {
    const height = isFollowupRound(round)
      ? findFollowupForRound(program, round)?.heightCm
      : program.roundVitals.find((vitals) => vitals.roundNumber === round)?.heightCm;

    if (height != null) {
      return height;
    }
  }

  return program.initialBaseline?.heightCm ?? null;
}

function buildVitals(
  program: ProgramRoundRecord,
  roundNumber: ProgramRoundNumber,
  options: RoundReadOptions,
): RoundVitalsView | null {
  const name = (user: RecorderName) => (options.recorderNames ? toDisplayName(user) : null);
  const roundVitals = program.roundVitals.find((vitals) => vitals.roundNumber === roundNumber);
  const heightCm = latestHeightCm(program, roundNumber);

  if (roundVitals) {
    return {
      source: "ROUND_VITALS",
      serviceDate: roundVitals.serviceDate,
      weight: roundVitals.weight,
      heightCm,
      waistCircumference: roundVitals.waistCircumference,
      systolicBloodPressure: roundVitals.systolicBloodPressure,
      diastolicBloodPressure: roundVitals.diastolicBloodPressure,
      bloodSugar: roundVitals.bloodSugar,
      bmi: calculateBodyMassIndex(roundVitals.weight, heightCm),
      recordedByDisplayName: name(roundVitals.recordedByUser),
    };
  }

  const followup = findFollowupForRound(program, roundNumber);

  if (followup) {
    return {
      source: "FOLLOWUP",
      serviceDate: followup.serviceDate ?? followup.recordedAt,
      weight: followup.weight,
      heightCm,
      waistCircumference: followup.waistCircumference,
      systolicBloodPressure: followup.systolicBloodPressure,
      diastolicBloodPressure: followup.diastolicBloodPressure,
      bloodSugar: followup.bloodSugar,
      bmi: calculateBodyMassIndex(followup.weight, heightCm),
      recordedByDisplayName: name(followup.createdByUser),
    };
  }

  return null;
}

/**
 * Latest recorded progress per activity of `goalPlanId`, from the Follow-ups that used that plan up to
 * and including this round. Progress without achieved days counts as not recorded.
 */
function latestPlanProgress(
  program: ProgramRoundRecord,
  goalPlanId: string,
  roundNumber: ProgramRoundNumber,
) {
  const latest = new Map<
    string,
    { status: RoundPlanItem["progressStatus"]; achievedDays: number; followupRoundNumber: number }
  >();

  for (const followup of program.followups) {
    if (followup.sourceGoalPlanId !== goalPlanId || followup.roundNumber > toFollowupRoundNumber(roundNumber)) {
      continue;
    }

    for (const progress of followup.activityProgress) {
      const current = latest.get(progress.goalActivityCode);

      if (progress.achievedDays !== null && (!current || current.followupRoundNumber < followup.roundNumber)) {
        latest.set(progress.goalActivityCode, {
          status: progress.status,
          achievedDays: progress.achievedDays,
          followupRoundNumber: followup.roundNumber,
        });
      }
    }
  }

  return latest;
}

function buildPlanFollowUp(
  program: ProgramRoundRecord,
  roundNumber: ProgramRoundNumber,
): RoundPlanFollowUp | null {
  if (!isFollowupRound(roundNumber)) {
    return null;
  }

  const followup = findFollowupForRound(program, roundNumber);
  // Before the Follow-up exists the source plan is the Program's latest Goal Plan.
  const plan = followup
    ? (program.goalPlans.find((candidate) => candidate.id === followup.sourceGoalPlanId) ?? null)
    : (program.goalPlans[program.goalPlans.length - 1] ?? null);

  if (!plan) {
    return null;
  }

  const template = getGoalTemplate(plan.templateKey, plan.templateVersion);
  const progressByCode = latestPlanProgress(program, plan.id, roundNumber);
  const dueItems: RoundPlanItem[] = [];
  const metItems: RoundPlanItem[] = [];

  for (const item of plan.items) {
    const progress = progressByCode.get(item.activityCode);
    const planItem: RoundPlanItem = {
      activityCode: item.activityCode,
      activityLabel:
        template?.activities.find((activity) => activity.code === item.activityCode)?.label ??
        item.activityCode,
      targetDays: item.targetDays,
      targetValue: item.targetValue,
      targetUnit: item.targetUnit,
      progressStatus: progress?.status ?? null,
      achievedDays: progress?.achievedDays ?? null,
      progressRound: progress ? toProgramRoundNumber(progress.followupRoundNumber) : null,
    };

    if (progress && progress.achievedDays >= item.targetDays) {
      metItems.push(planItem);
    } else {
      dueItems.push(planItem);
    }
  }

  return { goalPlanId: plan.id, dueItems, metItems };
}

function buildHealthPath(
  program: ProgramRoundRecord,
  roundNumber: ProgramRoundNumber,
  options: RoundReadOptions,
): RoundHealthPathRow[] {
  const rounds =
    roundNumber === SERVICE_ONE_HOME_ROUND
      ? [SERVICE_ONE_HOME_ROUND]
      : roundNumber === HEALTH_PATH_REVIEW_ROUND
        ? PROGRAM_ROUND_NUMBERS
        : [];

  return rounds.map((round) => ({
    roundNumber: round as ProgramRoundNumber,
    vitals: buildVitals(program, round as ProgramRoundNumber, options),
  }));
}

const EXTRA_TOOLS = ["PAM", "PROMS"] as const;

function buildExtras(
  program: ProgramRoundRecord,
  roundNumber: ProgramRoundNumber,
  options: RoundReadOptions,
): { extraActivities: RoundExtraActivity[]; extraOptions: ("PAM" | "PROMS")[] } {
  if (roundNumber === SERVICE_ONE_HOME_ROUND) {
    return { extraActivities: [], extraOptions: [] };
  }

  const extraActivities: RoundExtraActivity[] = [];
  const extraOptions: ("PAM" | "PROMS")[] = [];

  for (const toolCode of EXTRA_TOOLS) {
    const entry = program.roundActivities.find(
      (candidate) => candidate.roundNumber === roundNumber && candidate.toolCode === (toolCode as PatientProgramRoundToolCode),
    );

    if (entry) {
      extraActivities.push({
        toolCode,
        label: ROUND_TOOLS[toolCode].label,
        performedAt: entry.performedAt,
        recordedByDisplayName: options.recorderNames ? toDisplayName(entry.recordedByUser) : null,
      });
    } else if (screeningFor(program, toolCode)) {
      extraOptions.push(toolCode);
    }
  }

  return { extraActivities, extraOptions };
}

export function buildProgramRoundsOverview(
  program: ProgramRoundRecord,
  options: RoundReadOptions = STAFF_READ,
): ProgramRoundsOverview {
  const facts = buildProgramRoundFacts(program, options);
  const final = program.finalAssessment;
  const rounds = PROGRAM_ROUND_NUMBERS.map((roundNumber): RoundSummary => {
    const status = computeRoundStatus(facts, roundNumber);

    return {
      roundNumber,
      title: roundTitle(roundNumber),
      state: status.state,
      resolvedItems: status.resolvedItems,
      totalItems: status.totalItems,
      completedAt: status.completion?.completedAt ?? null,
      completedByDisplayName: status.completion?.completedByDisplayName ?? null,
    };
  });

  return {
    patientHospitalRelationshipId: program.patientHospitalRelationshipId,
    patientProgramId: program.id,
    programStatus: program.status,
    rounds,
    after: {
      state: final ? "RECORDED" : facts.completions[LAST_FOLLOWUP_ROUND] ? "NOT_RECORDED" : "LOCKED",
      date: final ? (final.serviceDate ?? final.recordedAt) : null,
      recordedByDisplayName: final && options.recorderNames ? toDisplayName(final.recordedBy) : null,
    },
  };
}

function toScreeningLink(screening: ReturnType<typeof screeningFor>) {
  return screening ? { id: screening.id, combined: screening.instrument === "COMBINED" } : null;
}

export type RoundPatientContext = {
  displayName: string;
  dateOfBirth?: Date | null;
};

export function buildProgramRoundDetail(
  program: ProgramRoundRecord,
  roundNumber: ProgramRoundNumber,
  patient: RoundPatientContext,
  input: { canManage: boolean; options?: RoundReadOptions },
): ProgramRoundDetail {
  const options = input.options ?? STAFF_READ;
  const status = computeRoundStatus(buildProgramRoundFacts(program, options), roundNumber);
  const followup = findFollowupForRound(program, roundNumber);
  const roundFollowup = roundNumber === ADJUSTED_PLAN_ROUND ? followup : null;
  const profile = program.patientHospitalRelationship.hospitalProfile;

  return {
    patientHospitalRelationshipId: program.patientHospitalRelationshipId,
    patientProgramId: program.id,
    programStatus: program.status,
    roundNumber,
    title: roundTitle(roundNumber),
    canManage: input.canManage,
    patient: {
      displayName: patient.displayName,
      occupation: profile?.occupation ?? null,
      preferredName: profile?.preferredName ?? null,
      profileVersion: profile?.version ?? null,
      dateOfBirth: patient.dateOfBirth ?? null,
    },
    status,
    vitals: buildVitals(program, roundNumber, options),
    vitalsForm: {
      heightEditable: isRoundVitalsRound(roundNumber),
      latestHeightCm: latestHeightCm(program, roundNumber),
    },
    followupId: followup?.id ?? null,
    canStartFollowup:
      isFollowupRound(roundNumber) &&
      status.writable &&
      followup === null &&
      program.followups.length === toFollowupRoundNumber(roundNumber) - 1,
    serviceOne: options.recorderNames
      ? toPatientProgramServiceOneProjection(program, roundNumber)
      : withoutPatientProgramServiceOneRecorders(toPatientProgramServiceOneProjection(program, roundNumber)),
    screenings: {
      PAM: toScreeningLink(screeningFor(program, "PAM")),
      PROMS: toScreeningLink(screeningFor(program, "PROMS")),
    },
    planReview: followup
      ? {
          followedPlan: followup.followedPlan,
          reflectionNote: followup.reflectionNote,
          expertAdvice: followup.expertAdvice,
        }
      : null,
    goalPlan: {
      firstGoalPlanId: program.goalPlans[0]?.id ?? null,
      currentGoalPlanId: program.goalPlans[program.goalPlans.length - 1]?.id ?? null,
      roundPlanAdjusted: roundFollowup?.planAdjusted ?? null,
      adjustedGoalPlanId: roundFollowup ? (adjustedPlanFor(program, roundFollowup.id)?.id ?? null) : null,
    },
    planFollowUp: buildPlanFollowUp(program, roundNumber),
    healthPath: buildHealthPath(program, roundNumber, options),
    ...buildExtras(program, roundNumber, options),
  };
}

export async function loadProgramRoundRecord(
  database: PatientProgramRoundQueryDatabase,
  programId: string,
  relationshipId: string,
): Promise<ProgramRoundRecord> {
  const program = await database.patientProgram.findFirst({
    where: { id: programId, patientHospitalRelationshipId: relationshipId },
    select: programRoundSelect,
  });

  if (!program) {
    throw new NotFoundError();
  }

  return program;
}

function parseProgramId(programId: unknown): string {
  const parsed = patientProgramIdSchema.safeParse(programId);

  if (!parsed.success) {
    throw new NotFoundError();
  }

  return parsed.data.toLowerCase();
}

function parseRoundNumber(roundNumber: unknown): ProgramRoundNumber {
  const value = typeof roundNumber === "string" && /^[1-6]$/u.test(roundNumber) ? Number(roundNumber) : roundNumber;

  if (!isProgramRoundNumber(value)) {
    throw new NotFoundError();
  }

  return value;
}

/** Shared by the staff and Patient SELF read paths; the caller has already authorized the relationship. */
export async function loadProgramRoundsOverview(
  database: PatientProgramRoundQueryDatabase,
  relationshipId: string,
  programId: string,
  options: RoundReadOptions = STAFF_READ,
): Promise<ProgramRoundsOverview> {
  return buildProgramRoundsOverview(await loadProgramRoundRecord(database, programId, relationshipId), options);
}

export async function getProgramRoundsOverview(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  programId: unknown,
  dependencies: PatientProgramRoundQueryDependencies = {},
): Promise<ProgramRoundsOverview & { patientDisplayName: string }> {
  const normalizedProgramId = parseProgramId(programId);

  try {
    const database = getDatabase(dependencies);
    const access = await resolvePatientProgramAccessContext(
      actor,
      relationshipId,
      PATIENT_PROGRAM_READ_CAPABILITY,
      database,
    );
    const overview = await loadProgramRoundsOverview(
      database,
      access.patient.patientHospitalRelationshipId,
      normalizedProgramId,
      access.actor.roles.includes(Role.PATIENT) ? PATIENT_SELF_READ : STAFF_READ,
    );

    return { ...overview, patientDisplayName: access.patient.displayName };
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Program rounds could not be loaded");
  }
}

export async function getProgramRoundDetail(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  programId: unknown,
  roundNumber: unknown,
  dependencies: PatientProgramRoundQueryDependencies = {},
): Promise<ProgramRoundDetail> {
  const normalizedProgramId = parseProgramId(programId);
  const parsedRound = parseRoundNumber(roundNumber);

  try {
    const database = getDatabase(dependencies);
    const access = await resolvePatientProgramAccessContext(
      actor,
      relationshipId,
      PATIENT_PROGRAM_READ_CAPABILITY,
      database,
    );
    const relationship = await database.patientHospitalRelationship.findUnique({
      where: { id: access.patient.patientHospitalRelationshipId },
      select: { patientProfile: { select: { dateOfBirth: true } } },
    });
    const program = await loadProgramRoundRecord(
      database,
      normalizedProgramId,
      access.patient.patientHospitalRelationshipId,
    );

    return buildProgramRoundDetail(
      program,
      parsedRound,
      {
        displayName: access.patient.displayName,
        dateOfBirth: relationship?.patientProfile.dateOfBirth ?? null,
      },
      {
        canManage: decidePatientProgramPolicy({
          actor: access.actor,
          capability: PATIENT_PROGRAM_MANAGE_CAPABILITY,
          target: access.target,
        }).allowed,
        options: access.actor.roles.includes(Role.PATIENT) ? PATIENT_SELF_READ : STAFF_READ,
      },
    );
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Program round could not be loaded");
  }
}

export const patientProgramRoundQueryInternals = {
  buildExtras,
  buildHealthPath,
  buildPlanFollowUp,
  latestHeightCm,
  parseRoundNumber,
};
