import "server-only";

import {
  PatientProgramStatus,
  type PatientProgramRoundActivityMode,
  type PatientProgramRoundActivitySource,
  type PatientProgramRoundLinkedRecordType,
  type PatientProgramRoundToolCode,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { getGoalTemplate } from "@/modules/goals/domain/goal-templates";
import { PATIENT_PROGRAM_READ_CAPABILITY } from "@/modules/patient-program/policies/patient-program-policy";
import { resolvePatientProgramAccessContext } from "@/modules/patient-program/services/patient-program-access-service";
import { patientProgramIdSchema } from "@/modules/patient-program/schemas/patient-program-schemas";
import {
  ApplicationError,
  InfrastructureError,
  NotFoundError,
} from "@/shared/errors/application-error";

import { calculateBodyMassIndex } from "../domain/body-mass-index";
import {
  ADJUSTED_PLAN_ROUND,
  FIRST_FOLLOWUP_ROUND,
  GOAL_PLAN_ROUND,
  isFollowupRound,
  isProgramRoundNumber,
  isReviewableTool,
  isRoundVitalsRound,
  PROGRAM_ROUND_NUMBERS,
  RETIRED_TOOL_CODES,
  ROUND_RECOMMENDED_TOOLS,
  roundActivitySourceFor,
  roundToolLabel,
  ROUND_TOOLS,
  SERVICE_ONE_HOME_ROUND,
  toFollowupRoundNumber,
  toProgramRoundNumber,
  type ProgramRoundNumber,
  type RoundToolKind,
} from "../domain/round-catalog";

export type PatientProgramRoundQueryDatabase = PrismaClient | Prisma.TransactionClient;

export type PatientProgramRoundQueryDependencies = {
  database?: PatientProgramRoundQueryDatabase;
};

export type RoundRecordedStatus = "RECORDED" | "NOT_RECORDED";

export type RoundSummary = {
  roundNumber: ProgramRoundNumber;
  title: string;
  status: RoundRecordedStatus;
  hasVitals: boolean;
  activityCount: number;
  date: Date | null;
  recordedByDisplayName: string | null;
};

export type ProgramRoundsOverview = {
  patientHospitalRelationshipId: string;
  patientProgramId: string;
  programStatus: PatientProgramStatus;
  rounds: readonly RoundSummary[];
  after: {
    status: RoundRecordedStatus;
    date: Date | null;
    recordedByDisplayName: string | null;
  };
};

export type RoundLinkedRecord = {
  type: PatientProgramRoundLinkedRecordType | "FOLLOWUP";
  id: string;
};

export type RoundActivityRow = {
  toolCode: PatientProgramRoundToolCode;
  label: string;
  kind: RoundToolKind;
  recommended: boolean;
  status: "DONE" | "NOT_DONE" | "AWAITING_FORM";
  mode: PatientProgramRoundActivityMode | null;
  source: PatientProgramRoundActivitySource | null;
  performedAt: Date | null;
  recordedByDisplayName: string | null;
  linkedRecord: RoundLinkedRecord | null;
  /** True when the Program-level result for this tool already exists. */
  resultExists: boolean;
  /** WB-DF-03: the existing result can be reviewed read-only and ledgered in this round. */
  canReview: boolean;
  /**
   * HEALTH_PLAN_REVIEW only: facts about the round's Follow-up when it does not meet the review rule
   * (D5: linked to a Goal Plan and the "ปรับแผน" answer recorded).
   */
  followupEvidence: RoundFollowupEvidence | null;
};

export type RoundFollowupEvidence = {
  followupId: string;
  /** The Follow-up referenced a Goal Plan (sourceGoalPlanId); historical records may not. */
  goalPlanLinked: boolean;
  /** The Follow-up recorded the planAdjusted answer (true or false); historical records may not. */
  planAdjustedAnswered: boolean;
  /** Number of per-activity progress rows saved with the Follow-up. */
  progressCount: number;
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
 * target, or no progress recorded yet; met items are listed separately. The round's whiteboard items
 * (`activities`) complete the due list.
 */
export type RoundPlanFollowUp = {
  goalPlanId: string;
  dueItems: readonly RoundPlanItem[];
  metItems: readonly RoundPlanItem[];
};

export type ProgramRoundDetail = {
  patientHospitalRelationshipId: string;
  patientProgramId: string;
  programStatus: PatientProgramStatus;
  roundNumber: ProgramRoundNumber;
  title: string;
  patientDisplayName: string;
  occupation: string | null;
  vitals: RoundVitalsView | null;
  vitalsForm: {
    /** Rounds 1-2 only, while the Program is active and nothing was recorded yet. */
    canRecord: boolean;
    /** WB-DF-05: editable in rounds 1-2, display-only afterwards. */
    heightEditable: boolean;
    latestHeightCm: number | null;
  };
  /** Rounds 3-6: Follow-up this round maps to, if recorded (PatientFollowup.roundNumber = round - 2). */
  followupId: string | null;
  /**
   * The Follow-up service numbers records sequentially, so a round can only be started once every
   * earlier Follow-up round is recorded.
   */
  canStartFollowup: boolean;
  activities: readonly RoundActivityRow[];
  addOptions: readonly RoundActivityRow[];
  /** Rounds 3-6 only, when the round has a source Goal Plan (D6). */
  planFollowUp: RoundPlanFollowUp | null;
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
  initialBaseline: { select: { heightCm: true } },
  roundVitals: {
    orderBy: { roundNumber: "asc" },
    select: {
      id: true,
      roundNumber: true,
      serviceDate: true,
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
      linkedRecordType: true,
      linkedRecordId: true,
      performedAt: true,
      recordedByUser: recorderSelect,
    },
  },
  screeningAssessment: {
    select: { id: true, submittedAt: true, conductedByUser: recorderSelect },
  },
  serviceOneRoutine: { select: { id: true, recordedAt: true, recordedByUser: recorderSelect } },
  serviceOneFloatingChart: { select: { id: true, recordedAt: true, recordedByUser: recorderSelect } },
  serviceOneDreamCard: { select: { id: true, recordedAt: true, recordedByUser: recorderSelect } },
  serviceOneConfidence: { select: { id: true, recordedAt: true, recordedByUser: recorderSelect } },
  goalPlans: {
    orderBy: { roundNumber: "asc" },
    take: 50,
    select: {
      id: true,
      roundNumber: true,
      createdAt: true,
      templateKey: true,
      templateVersion: true,
      sourceFollowup: { select: { roundNumber: true } },
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
    where: { roundNumber: { lte: toFollowupRoundNumber(6) } },
    orderBy: { roundNumber: "asc" },
    select: {
      id: true,
      roundNumber: true,
      serviceDate: true,
      recordedAt: true,
      sourceGoalPlanId: true,
      planAdjusted: true,
      weight: true,
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

function roundTitle(roundNumber: ProgramRoundNumber): string {
  if (roundNumber === SERVICE_ONE_HOME_ROUND) {
    return "ครั้งที่ 1 · รู้จักตัวเอง";
  }

  if (roundNumber === GOAL_PLAN_ROUND) {
    return "ครั้งที่ 2 · ทำแผนสุขภาพ";
  }

  return `ครั้งที่ ${roundNumber} · ติดตามผล`;
}

type ProgramResultRecord = { id: string; recordedAt: Date; by: string | null };

function programResultRecord(
  program: ProgramRoundRecord,
  toolCode: PatientProgramRoundToolCode,
): { record: ProgramResultRecord; type: PatientProgramRoundLinkedRecordType } | null {
  switch (toolCode) {
    case "PAM":
    case "PROMS":
      return program.screeningAssessment
        ? {
            type: "SCREENING_ASSESSMENT",
            record: {
              id: program.screeningAssessment.id,
              recordedAt: program.screeningAssessment.submittedAt,
              by: toDisplayName(program.screeningAssessment.conductedByUser),
            },
          }
        : null;
    case "ROUTINE":
      return program.serviceOneRoutine
        ? {
            type: "SERVICE_ONE_ROUTINE",
            record: {
              id: program.serviceOneRoutine.id,
              recordedAt: program.serviceOneRoutine.recordedAt,
              by: toDisplayName(program.serviceOneRoutine.recordedByUser),
            },
          }
        : null;
    case "FLOATING_CHART":
      return program.serviceOneFloatingChart
        ? {
            type: "SERVICE_ONE_FLOATING_CHART",
            record: {
              id: program.serviceOneFloatingChart.id,
              recordedAt: program.serviceOneFloatingChart.recordedAt,
              by: toDisplayName(program.serviceOneFloatingChart.recordedByUser),
            },
          }
        : null;
    case "DREAM_CARD":
      return program.serviceOneDreamCard
        ? {
            type: "SERVICE_ONE_DREAM_CARD",
            record: {
              id: program.serviceOneDreamCard.id,
              recordedAt: program.serviceOneDreamCard.recordedAt,
              by: toDisplayName(program.serviceOneDreamCard.recordedByUser),
            },
          }
        : null;
    case "CONFIDENCE_RULER":
      return program.serviceOneConfidence
        ? {
            type: "SERVICE_ONE_CONFIDENCE",
            record: {
              id: program.serviceOneConfidence.id,
              recordedAt: program.serviceOneConfidence.recordedAt,
              by: toDisplayName(program.serviceOneConfidence.recordedByUser),
            },
          }
        : null;
    default:
      return null;
  }
}

function findFollowupForRound(program: ProgramRoundRecord, roundNumber: number) {
  return isFollowupRound(roundNumber)
    ? (program.followups.find(
        (followup) => followup.roundNumber === toFollowupRoundNumber(roundNumber),
      ) ?? null)
    : null;
}

/**
 * D4: round 2 is the Program's first Goal Plan; round 4 ("แผนสุขภาพดีของฉัน") is the first plan adjusted
 * from a Follow-up in round 4 or later. Other rounds have no Goal Plan activity of their own.
 */
function roundGoalPlan(program: ProgramRoundRecord, roundNumber: ProgramRoundNumber) {
  if (roundNumber === GOAL_PLAN_ROUND) {
    return program.goalPlans[0] ?? null;
  }

  if (roundNumber === ADJUSTED_PLAN_ROUND) {
    return (
      program.goalPlans.find(
        (plan) =>
          plan.sourceFollowup !== null &&
          plan.sourceFollowup.roundNumber >= toFollowupRoundNumber(ADJUSTED_PLAN_ROUND),
      ) ?? null
    );
  }

  return null;
}

function buildActivityRow(
  program: ProgramRoundRecord,
  roundNumber: ProgramRoundNumber,
  toolCode: PatientProgramRoundToolCode,
): RoundActivityRow {
  const definition = ROUND_TOOLS[toolCode];
  const recommended = ROUND_RECOMMENDED_TOOLS[roundNumber].includes(toolCode);
  const ledger = program.roundActivities.find(
    (entry) => entry.roundNumber === roundNumber && entry.toolCode === toolCode,
  );
  const base = {
    toolCode,
    label: roundToolLabel(roundNumber, toolCode),
    kind: definition.kind,
    recommended,
    followupEvidence: null as RoundFollowupEvidence | null,
  };
  const result = programResultRecord(program, toolCode);
  const resultExists = result !== null;

  if (ledger) {
    return {
      ...base,
      status: "DONE",
      mode: ledger.mode,
      source: ledger.source,
      performedAt: ledger.performedAt,
      recordedByDisplayName: toDisplayName(ledger.recordedByUser),
      linkedRecord:
        ledger.linkedRecordType && ledger.linkedRecordId
          ? { type: ledger.linkedRecordType, id: ledger.linkedRecordId }
          : null,
      resultExists,
      canReview: false,
    };
  }

  if (definition.kind === "PENDING_FORM") {
    return {
      ...base,
      status: "AWAITING_FORM",
      mode: null,
      source: null,
      performedAt: null,
      recordedByDisplayName: null,
      linkedRecord: null,
      resultExists: false,
      canReview: false,
    };
  }

  // Records made before the ledger existed, and domain records that already carry their round.
  if (result && roundNumber === SERVICE_ONE_HOME_ROUND) {
    return {
      ...base,
      status: "DONE",
      mode: "RECORDED",
      source: roundActivitySourceFor(roundNumber, toolCode),
      performedAt: result.record.recordedAt,
      recordedByDisplayName: result.record.by,
      linkedRecord: { type: result.type, id: result.record.id },
      resultExists,
      canReview: false,
    };
  }

  if (toolCode === "HEALTHY_PLAN") {
    // D4: derived from the Goal Plan records, never written to the ledger.
    const plan = roundGoalPlan(program, roundNumber);

    if (plan) {
      return {
        ...base,
        status: "DONE",
        mode: "RECORDED",
        source: roundActivitySourceFor(roundNumber, toolCode),
        performedAt: plan.createdAt,
        recordedByDisplayName: toDisplayName(plan.createdByUser),
        linkedRecord: { type: "GOAL_PLAN", id: plan.id },
        resultExists: true,
        canReview: false,
      };
    }

    const currentPlan = program.goalPlans[program.goalPlans.length - 1] ?? null;

    return {
      ...base,
      status: "NOT_DONE",
      mode: null,
      source: null,
      performedAt: null,
      recordedByDisplayName: null,
      linkedRecord: currentPlan ? { type: "GOAL_PLAN", id: currentPlan.id } : null,
      resultExists: currentPlan !== null,
      canReview: false,
    };
  }

  if (toolCode === "HEALTH_PLAN_REVIEW") {
    // D5: derived from the round's Follow-up facts (no ledger backfill): reviewed when the Follow-up
    // was linked to a Goal Plan and recorded the "ปรับแผน" answer (true or false).
    const followup = findFollowupForRound(program, roundNumber);

    if (followup && followup.sourceGoalPlanId !== null && typeof followup.planAdjusted === "boolean") {
      return {
        ...base,
        status: "DONE",
        mode: "REVIEWED",
        source: roundActivitySourceFor(roundNumber, toolCode),
        performedAt: followup.serviceDate ?? followup.recordedAt,
        recordedByDisplayName: toDisplayName(followup.createdByUser),
        linkedRecord: { type: "FOLLOWUP", id: followup.id },
        resultExists: true,
        canReview: false,
      };
    }

    return {
      ...base,
      status: "NOT_DONE",
      mode: null,
      source: null,
      performedAt: null,
      recordedByDisplayName: null,
      linkedRecord: followup ? { type: "FOLLOWUP", id: followup.id } : null,
      resultExists: followup !== null,
      canReview: false,
      followupEvidence: followup
        ? {
            followupId: followup.id,
            goalPlanLinked: followup.sourceGoalPlanId !== null,
            planAdjustedAnswered: typeof followup.planAdjusted === "boolean",
            progressCount: followup.activityProgress.length,
          }
        : null,
    };
  }

  return {
    ...base,
    status: "NOT_DONE",
    mode: null,
    source: null,
    performedAt: null,
    recordedByDisplayName: null,
    linkedRecord: result ? { type: result.type, id: result.record.id } : null,
    resultExists,
    canReview: resultExists && isReviewableTool(toolCode) && roundNumber !== SERVICE_ONE_HOME_ROUND,
  };
}

function buildRoundActivities(
  program: ProgramRoundRecord,
  roundNumber: ProgramRoundNumber,
): { activities: RoundActivityRow[]; addOptions: RoundActivityRow[] } {
  const recommended = ROUND_RECOMMENDED_TOOLS[roundNumber];
  const activities = recommended.map((toolCode) => buildActivityRow(program, roundNumber, toolCode));
  const addOptions: RoundActivityRow[] = [];

  for (const toolCode of Object.keys(ROUND_TOOLS) as PatientProgramRoundToolCode[]) {
    if (recommended.includes(toolCode) || RETIRED_TOOL_CODES.includes(toolCode)) {
      continue;
    }

    const row = buildActivityRow(program, roundNumber, toolCode);

    if (row.status === "DONE") {
      // An EXTRA activity that was performed stays visible in the round history (CARE-13).
      activities.push(row);
    } else {
      addOptions.push(row);
    }
  }

  return { activities, addOptions };
}

function latestHeightCm(program: ProgramRoundRecord, upToRound: number): number | null {
  for (let index = program.roundVitals.length - 1; index >= 0; index -= 1) {
    const vitals = program.roundVitals[index];

    if (vitals && vitals.roundNumber <= upToRound && vitals.heightCm != null) {
      return vitals.heightCm;
    }
  }

  return program.initialBaseline?.heightCm ?? null;
}

function buildVitals(program: ProgramRoundRecord, roundNumber: ProgramRoundNumber): RoundVitalsView | null {
  const roundVitals = program.roundVitals.find((vitals) => vitals.roundNumber === roundNumber);

  if (roundVitals) {
    const heightCm = latestHeightCm(program, roundNumber);

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
      recordedByDisplayName: toDisplayName(roundVitals.recordedByUser),
    };
  }

  const followup = findFollowupForRound(program, roundNumber);

  if (followup) {
    const heightCm = latestHeightCm(program, roundNumber);

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
      recordedByDisplayName: toDisplayName(followup.createdByUser),
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

function buildRoundSummary(program: ProgramRoundRecord, roundNumber: ProgramRoundNumber): RoundSummary {
  const vitals = buildVitals(program, roundNumber);
  const { activities } = buildRoundActivities(program, roundNumber);
  const done = activities.filter((activity) => activity.status === "DONE");
  const firstDone = done
    .slice()
    .sort((left, right) => (left.performedAt?.getTime() ?? 0) - (right.performedAt?.getTime() ?? 0))[0];
  const recorded =
    vitals !== null || done.length > 0 || findFollowupForRound(program, roundNumber) !== null;

  return {
    roundNumber,
    title: roundTitle(roundNumber),
    status: recorded ? "RECORDED" : "NOT_RECORDED",
    hasVitals: vitals !== null,
    activityCount: done.length,
    date: vitals?.serviceDate ?? firstDone?.performedAt ?? null,
    recordedByDisplayName: vitals?.recordedByDisplayName ?? firstDone?.recordedByDisplayName ?? null,
  };
}

export function buildProgramRoundsOverview(program: ProgramRoundRecord): ProgramRoundsOverview {
  const final = program.finalAssessment;

  return {
    patientHospitalRelationshipId: program.patientHospitalRelationshipId,
    patientProgramId: program.id,
    programStatus: program.status,
    rounds: PROGRAM_ROUND_NUMBERS.map((roundNumber) => buildRoundSummary(program, roundNumber)),
    after: {
      status: final ? "RECORDED" : "NOT_RECORDED",
      date: final ? (final.serviceDate ?? final.recordedAt) : null,
      recordedByDisplayName: final ? toDisplayName(final.recordedBy) : null,
    },
  };
}

export function buildProgramRoundDetail(
  program: ProgramRoundRecord,
  roundNumber: ProgramRoundNumber,
  patient: { displayName: string; occupation: string | null },
): ProgramRoundDetail {
  const vitals = buildVitals(program, roundNumber);
  const { activities, addOptions } = buildRoundActivities(program, roundNumber);
  const followup = findFollowupForRound(program, roundNumber);

  return {
    patientHospitalRelationshipId: program.patientHospitalRelationshipId,
    patientProgramId: program.id,
    programStatus: program.status,
    roundNumber,
    title: roundTitle(roundNumber),
    patientDisplayName: patient.displayName,
    occupation: patient.occupation,
    vitals,
    vitalsForm: {
      canRecord:
        isRoundVitalsRound(roundNumber) &&
        program.status === PatientProgramStatus.ACTIVE &&
        vitals === null,
      heightEditable: isRoundVitalsRound(roundNumber),
      latestHeightCm: latestHeightCm(program, roundNumber),
    },
    followupId: followup?.id ?? null,
    canStartFollowup:
      isFollowupRound(roundNumber) &&
      program.status === PatientProgramStatus.ACTIVE &&
      followup === null &&
      program.followups.length === toFollowupRoundNumber(roundNumber) - 1,
    activities,
    addOptions,
    planFollowUp: buildPlanFollowUp(program, roundNumber),
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
): Promise<ProgramRoundsOverview> {
  return buildProgramRoundsOverview(await loadProgramRoundRecord(database, programId, relationshipId));
}

export async function loadProgramRoundDetail(
  database: PatientProgramRoundQueryDatabase,
  relationshipId: string,
  programId: string,
  roundNumber: ProgramRoundNumber,
  patient: { displayName: string; occupation: string | null },
): Promise<ProgramRoundDetail> {
  return buildProgramRoundDetail(
    await loadProgramRoundRecord(database, programId, relationshipId),
    roundNumber,
    patient,
  );
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
    const profile = await database.patientHospitalProfile.findUnique({
      where: { patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId },
      select: { occupation: true },
    });

    return await loadProgramRoundDetail(
      database,
      access.patient.patientHospitalRelationshipId,
      normalizedProgramId,
      parsedRound,
      { displayName: access.patient.displayName, occupation: profile?.occupation ?? null },
    );
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Program round could not be loaded");
  }
}

export const patientProgramRoundQueryInternals = {
  buildActivityRow,
  buildPlanFollowUp,
  buildRoundActivities,
  latestHeightCm,
  parseRoundNumber,
  FIRST_FOLLOWUP_ROUND,
};
