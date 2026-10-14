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
  FIRST_FOLLOWUP_ROUND,
  GOAL_PLAN_ROUND,
  isFollowupRound,
  isProgramRoundNumber,
  isReviewableTool,
  isRoundVitalsRound,
  PROGRAM_ROUND_NUMBERS,
  ROUND_RECOMMENDED_TOOLS,
  roundActivitySourceFor,
  roundToolLabel,
  ROUND_TOOLS,
  SERVICE_ONE_HOME_ROUND,
  toFollowupRoundNumber,
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

export type RoundDueItem = {
  activityCode: string;
  activityLabel: string;
  targetDays: number;
  targetValue: number | null;
  targetUnit: string | null;
  progressStatus: "DONE" | "PARTIAL" | "NOT_DONE" | "NOT_APPLICABLE" | null;
  achievedDays: number | null;
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
  /** Rounds 3-6 only: items that need following up in this round. */
  dueItems: readonly RoundDueItem[] | null;
  /** The Goal Plan the due items come from. */
  dueGoalPlanId: string | null;
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
    return "ครั้งที่ 1 · Service 1 และแบบประเมิน";
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

function buildActivityRow(
  program: ProgramRoundRecord,
  roundNumber: ProgramRoundNumber,
  toolCode: PatientProgramRoundToolCode,
): RoundActivityRow {
  const definition = ROUND_TOOLS[toolCode];
  const recommended = ROUND_RECOMMENDED_TOOLS[roundNumber].includes(toolCode);
  const base = {
    toolCode,
    label: roundToolLabel(roundNumber, toolCode),
    kind: definition.kind,
    recommended,
  };
  const ledger = program.roundActivities.find(
    (entry) => entry.roundNumber === roundNumber && entry.toolCode === toolCode,
  );
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
    const firstPlan = program.goalPlans[0] ?? null;

    if (firstPlan && roundNumber === GOAL_PLAN_ROUND) {
      return {
        ...base,
        status: "DONE",
        mode: "RECORDED",
        source: roundActivitySourceFor(roundNumber, toolCode),
        performedAt: firstPlan.createdAt,
        recordedByDisplayName: toDisplayName(firstPlan.createdByUser),
        linkedRecord: { type: "GOAL_PLAN", id: firstPlan.id },
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
      linkedRecord: firstPlan ? { type: "GOAL_PLAN", id: firstPlan.id } : null,
      resultExists: firstPlan !== null,
      canReview: false,
    };
  }

  if (toolCode === "HEALTH_PLAN_REVIEW") {
    const followup = findFollowupForRound(program, roundNumber);

    if (followup) {
      return {
        ...base,
        status: "DONE",
        mode: "RECORDED",
        source: roundActivitySourceFor(roundNumber, toolCode),
        performedAt: followup.recordedAt,
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
      linkedRecord: null,
      resultExists: false,
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
    if (recommended.includes(toolCode)) {
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

function buildDueItems(
  program: ProgramRoundRecord,
  roundNumber: ProgramRoundNumber,
): { items: RoundDueItem[]; goalPlanId: string } | null {
  if (!isFollowupRound(roundNumber)) {
    return null;
  }

  const followup = findFollowupForRound(program, roundNumber);
  // Before the Follow-up exists the due plan is the Program's latest Goal Plan.
  const plan = followup
    ? (program.goalPlans.find((candidate) => candidate.id === followup.sourceGoalPlanId) ?? null)
    : (program.goalPlans[program.goalPlans.length - 1] ?? null);

  if (!plan) {
    return null;
  }

  const template = getGoalTemplate(plan.templateKey, plan.templateVersion);
  const progressByCode = new Map(
    (followup?.activityProgress ?? []).map((progress) => [progress.goalActivityCode, progress]),
  );

  return {
    goalPlanId: plan.id,
    items: plan.items.map((item) => {
      const progress = progressByCode.get(item.activityCode);

      return {
        activityCode: item.activityCode,
        activityLabel:
          template?.activities.find((activity) => activity.code === item.activityCode)?.label ??
          item.activityCode,
        targetDays: item.targetDays,
        targetValue: item.targetValue,
        targetUnit: item.targetUnit,
        progressStatus: progress?.status ?? null,
        achievedDays: progress?.achievedDays ?? null,
      };
    }),
  };
}

function buildRoundSummary(program: ProgramRoundRecord, roundNumber: ProgramRoundNumber): RoundSummary {
  const vitals = buildVitals(program, roundNumber);
  const { activities } = buildRoundActivities(program, roundNumber);
  const done = activities.filter((activity) => activity.status === "DONE");
  const firstDone = done
    .slice()
    .sort((left, right) => (left.performedAt?.getTime() ?? 0) - (right.performedAt?.getTime() ?? 0))[0];
  const recorded = vitals !== null || done.length > 0;

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
  const due = buildDueItems(program, roundNumber);
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
    dueItems: due?.items ?? null,
    dueGoalPlanId: due?.goalPlanId ?? null,
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
  buildDueItems,
  buildRoundActivities,
  latestHeightCm,
  parseRoundNumber,
  FIRST_FOLLOWUP_ROUND,
};
