import "server-only";

import {
  AppointmentCancellationRequestStatus,
  AppointmentInteractionSource,
  Prisma,
  type AppointmentLocationType,
  type AppointmentStatus,
  type AppointmentType,
  type FollowupActivityProgressStatus,
  type PatientProgramStatus,
  type PrismaClient,
  type Profession,
} from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  APPOINTMENT_READ_CAPABILITY,
} from "@/modules/appointments/policies/appointment-policy";
import {
  appointmentIdSchema,
  appointmentRelationshipIdSchema,
} from "@/modules/appointments/schemas/appointment-schemas";
import { FOLLOWUP_READ_CAPABILITY } from "@/modules/followups/policies/followup-policy";
import {
  followupIdSchema,
  followupRelationshipIdSchema,
} from "@/modules/followups/schemas/followup-schemas";
import { getGoalActivity, getGoalTemplate } from "@/modules/goals/domain/goal-templates";
import { GOAL_READ_CAPABILITY } from "@/modules/goals/policies/goal-policy";
import {
  goalPlanIdSchema,
  goalPlanRelationshipIdSchema,
} from "@/modules/goals/schemas/goal-schemas";
import { PATIENT_READ_CAPABILITY } from "@/modules/patient-directory/policies/patient-directory-policy";
import { PATIENT_PROGRAM_READ_CAPABILITY } from "@/modules/patient-program/policies/patient-program-policy";
import {
  patientProgramIdSchema,
  patientProgramRelationshipIdSchema,
} from "@/modules/patient-program/schemas/patient-program-schemas";
import { SCREENING_READ_CAPABILITY } from "@/modules/screening/policies/screening-policy";
import {
  ApplicationError,
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
} from "@/shared/errors/application-error";
import { z } from "zod";

import { assertPatientSelfReadPolicy } from "../policies/patient-self-policy";
import {
  hasOwnPatientAppointmentIdentity,
  resolveOwnPatientRelationshipContext,
  type PatientSelfQueryDatabase,
  type PatientSelfRelationshipContext,
} from "./patient-self-query-service";

export type PatientSelfCareQueryDatabase = PrismaClient | Prisma.TransactionClient;

export type PatientSelfCareQueryDependencies = {
  database?: PatientSelfCareQueryDatabase;
};

export type PatientSelfNextAppointmentProjection = {
  scheduledAt: Date;
  hospitalName: string;
};

export type PatientSelfNextAppointmentResult =
  | { status: "INELIGIBLE" }
  | {
      status: "AUTHORIZED";
      appointment: PatientSelfNextAppointmentProjection | null;
    };

const PATIENT_SELF_HISTORY_PAGE_SIZE = 50;

export type PatientSelfHistoryPage = {
  page: number;
  hasMore: boolean;
};

export type PatientSelfCareJourneyPageRequests = {
  screeningPage?: unknown;
  programPage?: unknown;
  goalPlanPage?: unknown;
  followupPage?: unknown;
};

export type PatientSelfProgramDetailPageRequests = {
  goalPlanPage?: unknown;
  followupPage?: unknown;
};

export type PatientSelfMeasurementFacts = {
  weight: number | null;
  waistCircumference: number | null;
  systolicBloodPressure: number | null;
  diastolicBloodPressure: number | null;
};

export type PatientSelfProgramContext = {
  status: PatientProgramStatus;
  startedAt: Date;
  completedAt: Date | null;
};

export type PatientSelfProgramHistoryItem = PatientSelfProgramContext & {
  programId: string;
};

export type PatientSelfGoalPlanHistoryItem = {
  goalPlanId: string;
  roundNumber: number;
  createdAt: Date;
  primaryGoalLabel: string;
  program: PatientSelfProgramContext | null;
};

export type PatientSelfFollowupHistoryItem = {
  followupId: string;
  roundNumber: number;
  recordedAt: Date;
  program: PatientSelfProgramContext | null;
};

export type PatientSelfCareJourney = {
  relationship: PatientSelfRelationshipContext;
  screenings: Array<{ submittedAt: Date; status: "RECORDED" }>;
  baseline: {
    recordedOn: Date;
    measurements: {
      weight: number | null;
      heightCm: number | null;
      waistCircumference: number | null;
      systolicBloodPressure: number | null;
      diastolicBloodPressure: number | null;
      bloodSugarDtx: number | null;
      hba1c: number | null;
    };
  } | null;
  programs: PatientSelfProgramHistoryItem[];
  goalPlans: PatientSelfGoalPlanHistoryItem[];
  followups: PatientSelfFollowupHistoryItem[];
  historyPages: {
    screenings: PatientSelfHistoryPage;
    programs: PatientSelfHistoryPage;
    goalPlans: PatientSelfHistoryPage;
    followups: PatientSelfHistoryPage;
  };
};

export type PatientSelfServiceOneActivity = {
  label: "Routine" | "Floating Chart" | "Dream Card" | "Confidence";
  recordedAt: Date | null;
};

export type PatientSelfProgramDetail = PatientSelfProgramHistoryItem & {
  relationship: PatientSelfRelationshipContext;
  serviceOne: PatientSelfServiceOneActivity[];
  goalPlans: PatientSelfGoalPlanHistoryItem[];
  followups: PatientSelfFollowupHistoryItem[];
  historyPages: {
    goalPlans: PatientSelfHistoryPage;
    followups: PatientSelfHistoryPage;
  };
  finalAssessment: {
    recordedAt: Date;
    measurements: PatientSelfMeasurementFacts;
  } | null;
};

export type PatientSelfGoalPlanDetail = PatientSelfGoalPlanHistoryItem & {
  relationship: PatientSelfRelationshipContext;
  primaryGoalNote: string | null;
  weeklyNote: string | null;
  items: Array<{
    activityLabel: string;
    targetDays: number;
    targetValue: number | null;
    targetUnit: string | null;
  }>;
};

export type PatientSelfFollowupDetail = PatientSelfFollowupHistoryItem & {
  relationship: PatientSelfRelationshipContext;
  measurements: PatientSelfMeasurementFacts;
  activityProgress: Array<{
    activityLabel: string;
    status: FollowupActivityProgressStatus;
  }>;
};

export type PatientSelfAppointmentItem = {
  appointmentId: string;
  type: AppointmentType;
  scheduledAt: Date;
  durationMinutes: number | null;
  locationType: AppointmentLocationType | null;
  locationDetail: string | null;
  status: AppointmentStatus;
  updatedAt: Date;
  responsibleDisplayName: string | null;
  responsibleProfession: Profession | null;
  osmAtCreationDisplayName: string | null;
  acknowledgement: {
    source: AppointmentInteractionSource;
    acknowledgedAt: Date;
  } | null;
  cancellationRequests: Array<{
    source: AppointmentInteractionSource;
    status: AppointmentCancellationRequestStatus;
    submittedAt: Date;
  }>;
};

export type PatientSelfAppointmentHistory = {
  relationship: PatientSelfRelationshipContext;
  appointments: PatientSelfAppointmentItem[];
  historyPage: PatientSelfHistoryPage;
};

export type PatientSelfAppointmentDetail = PatientSelfAppointmentItem & {
  relationship: PatientSelfRelationshipContext;
};

const screeningPatientSelect = {
  submittedAt: true,
} satisfies Prisma.ScreeningAssessmentSelect;

const baselinePatientSelect = {
  recordedOn: true,
  weight: true,
  heightCm: true,
  waistCircumference: true,
  bloodPressureSystolic: true,
  bloodPressureDiastolic: true,
  bloodSugarDtx: true,
  hba1c: true,
} satisfies Prisma.PatientBaselineSelect;

const programHistorySelect = {
  id: true,
  status: true,
  startedAt: true,
  completedAt: true,
} satisfies Prisma.PatientProgramSelect;

const goalPlanHistorySelect = {
  id: true,
  roundNumber: true,
  createdAt: true,
  primaryGoalCode: true,
  templateKey: true,
  templateVersion: true,
  patientProgram: {
    select: {
      status: true,
      startedAt: true,
      completedAt: true,
    },
  },
} satisfies Prisma.PatientGoalPlanSelect;

const followupHistorySelect = {
  id: true,
  roundNumber: true,
  recordedAt: true,
  patientProgram: {
    select: {
      status: true,
      startedAt: true,
      completedAt: true,
    },
  },
} satisfies Prisma.PatientFollowupSelect;

const programDetailSelect = {
  id: true,
  status: true,
  startedAt: true,
  completedAt: true,
  serviceOneRoutine: { select: { recordedAt: true } },
  serviceOneFloatingChart: { select: { recordedAt: true } },
  serviceOneDreamCard: { select: { recordedAt: true } },
  serviceOneConfidence: { select: { recordedAt: true } },
  finalAssessment: {
    select: {
      recordedAt: true,
      weight: true,
      waistCircumference: true,
      systolicBloodPressure: true,
      diastolicBloodPressure: true,
    },
  },
} satisfies Prisma.PatientProgramSelect;

const goalPlanDetailSelect = {
  id: true,
  roundNumber: true,
  createdAt: true,
  primaryGoalCode: true,
  primaryGoalNote: true,
  weeklyNote: true,
  templateKey: true,
  templateVersion: true,
  patientProgram: {
    select: {
      status: true,
      startedAt: true,
      completedAt: true,
    },
  },
  items: {
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: {
      activityCode: true,
      targetDays: true,
      targetValue: true,
      targetUnit: true,
    },
  },
} satisfies Prisma.PatientGoalPlanSelect;

const followupDetailSelect = {
  id: true,
  roundNumber: true,
  recordedAt: true,
  weight: true,
  waistCircumference: true,
  systolicBloodPressure: true,
  diastolicBloodPressure: true,
  patientProgram: {
    select: {
      status: true,
      startedAt: true,
      completedAt: true,
    },
  },
  sourceGoalPlan: {
    select: {
      templateKey: true,
      templateVersion: true,
    },
  },
  activityProgress: {
    orderBy: [{ goalActivityCode: "asc" }, { id: "asc" }],
    select: {
      goalActivityCode: true,
      status: true,
    },
  },
} satisfies Prisma.PatientFollowupSelect;

function appointmentPatientSelect(relationshipId: string) {
  return {
  id: true,
  type: true,
  scheduledAt: true,
  durationMinutes: true,
  locationType: true,
  locationDetail: true,
  status: true,
  updatedAt: true,
  responsibleUser: {
    select: {
      person: { select: { givenName: true, familyName: true } },
      memberships: {
        where: {
          hospital: {
            is: {
              patientRelationships: { some: { id: relationshipId } },
            },
          },
        },
        select: { profession: true },
      },
    },
  },
  osmAssignmentAtCreation: {
    select: {
      osmUser: { select: { person: { select: { givenName: true, familyName: true } } } },
    },
  },
  acknowledgements: {
    orderBy: [{ sourceAppointmentUpdatedAt: "desc" }, { id: "desc" }],
    take: 1,
    select: {
      sourceAppointmentUpdatedAt: true,
      source: true,
      acknowledgedAt: true,
    },
  },
  cancellationRequests: {
    orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
    take: 5,
    select: {
      source: true,
      status: true,
      submittedAt: true,
    },
  },
  } satisfies Prisma.PatientAppointmentSelect;
}

type GoalPlanHistoryRecord = Prisma.PatientGoalPlanGetPayload<{
  select: typeof goalPlanHistorySelect;
}>;

type FollowupHistoryRecord = Prisma.PatientFollowupGetPayload<{
  select: typeof followupHistorySelect;
}>;

type AppointmentRecord = Prisma.PatientAppointmentGetPayload<{
  select: ReturnType<typeof appointmentPatientSelect>;
}>;

function parseHistoryPage(value: unknown): { page: number; skip: number } {
  const parsed = z
    .union([
      z.number().int().positive(),
      z.string().regex(/^[1-9]\d*$/).transform(Number),
    ])
    .safeParse(value === undefined ? 1 : value);

  if (!parsed.success || !Number.isSafeInteger(parsed.data)) {
    throw new NotFoundError();
  }

  const skip = (parsed.data - 1) * PATIENT_SELF_HISTORY_PAGE_SIZE;

  if (!Number.isSafeInteger(skip)) {
    throw new NotFoundError();
  }

  return { page: parsed.data, skip };
}

function getHistoryPage<T>(
  records: T[],
  page: number,
): { items: T[]; page: PatientSelfHistoryPage } {
  return {
    items: records.slice(0, PATIENT_SELF_HISTORY_PAGE_SIZE),
    page: {
      page,
      hasMore: records.length > PATIENT_SELF_HISTORY_PAGE_SIZE,
    },
  };
}

function getDatabase(dependencies: PatientSelfCareQueryDependencies): PatientSelfCareQueryDatabase {
  return dependencies.database ?? getPrisma();
}

function getProgramContext(record: {
  status: PatientProgramStatus;
  startedAt: Date;
  completedAt: Date | null;
} | null): PatientSelfProgramContext | null {
  return record
    ? { status: record.status, startedAt: record.startedAt, completedAt: record.completedAt }
    : null;
}

function getHistoricalTemplate(key: string, version: string) {
  const template = getGoalTemplate(key, version);

  if (!template) {
    throw new InfrastructureError("The historical Goal Plan template is unavailable");
  }

  return template;
}

function toGoalPlanHistoryItem(record: GoalPlanHistoryRecord): PatientSelfGoalPlanHistoryItem {
  const template = getHistoricalTemplate(record.templateKey, record.templateVersion);
  const primaryGoal = template.primaryGoals.find((goal) => goal.code === record.primaryGoalCode);

  if (!primaryGoal) {
    throw new InfrastructureError("The historical primary Goal is unavailable");
  }

  return {
    goalPlanId: record.id,
    roundNumber: record.roundNumber,
    createdAt: record.createdAt,
    primaryGoalLabel: primaryGoal.label,
    program: getProgramContext(record.patientProgram),
  };
}

function toFollowupHistoryItem(record: FollowupHistoryRecord): PatientSelfFollowupHistoryItem {
  return {
    followupId: record.id,
    roundNumber: record.roundNumber,
    recordedAt: record.recordedAt,
    program: getProgramContext(record.patientProgram),
  };
}

function toAppointmentItem(record: AppointmentRecord): PatientSelfAppointmentItem {
  const acknowledgement = record.acknowledgements.find(
    (item) => item.sourceAppointmentUpdatedAt.getTime() === record.updatedAt.getTime(),
  );

  return {
    appointmentId: record.id,
    type: record.type,
    scheduledAt: record.scheduledAt,
    durationMinutes: record.durationMinutes,
    locationType: record.locationType,
    locationDetail: record.locationDetail,
    status: record.status,
    updatedAt: record.updatedAt,
    responsibleDisplayName: record.responsibleUser
      ? patientAppointmentDisplayName(record.responsibleUser.person)
      : null,
    responsibleProfession: record.responsibleUser?.memberships[0]?.profession ?? null,
    osmAtCreationDisplayName: record.osmAssignmentAtCreation
      ? patientAppointmentDisplayName(record.osmAssignmentAtCreation.osmUser.person)
      : null,
    acknowledgement: acknowledgement
      ? { source: acknowledgement.source, acknowledgedAt: acknowledgement.acknowledgedAt }
      : null,
    cancellationRequests: record.cancellationRequests.map((request) => ({
      source: request.source,
      status: request.status,
      submittedAt: request.submittedAt,
    })),
  };
}

function patientAppointmentDisplayName(person: {
  givenName: string | null;
  familyName: string | null;
}): string {
  const nameParts = [person.givenName, person.familyName]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  return nameParts.join(" ") || "ไม่ระบุชื่อ";
}

function toMeasurements(record: {
  weight: number | null;
  waistCircumference: number | null;
  systolicBloodPressure: number | null;
  diastolicBloodPressure: number | null;
}): PatientSelfMeasurementFacts {
  return {
    weight: record.weight,
    waistCircumference: record.waistCircumference,
    systolicBloodPressure: record.systolicBloodPressure,
    diastolicBloodPressure: record.diastolicBloodPressure,
  };
}

async function resolveAuthorizedRelationship(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  capability: Parameters<typeof assertPatientSelfReadPolicy>[0]["capability"],
  database: PatientSelfQueryDatabase,
): Promise<PatientSelfRelationshipContext> {
  assertPatientSelfReadPolicy({ actor, capability });

  return resolveOwnPatientRelationshipContext(actor, relationshipId, { database });
}

export async function getOwnPatientCareJourney(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  dependencies: PatientSelfCareQueryDependencies = {},
  pageRequests: PatientSelfCareJourneyPageRequests = {},
): Promise<PatientSelfCareJourney> {
  const database = getDatabase(dependencies);

  try {
    const relationship = await resolveAuthorizedRelationship(
      actor,
      relationshipId,
      PATIENT_READ_CAPABILITY,
      database,
    );
    assertPatientSelfReadPolicy({ actor, capability: SCREENING_READ_CAPABILITY });
    assertPatientSelfReadPolicy({ actor, capability: PATIENT_PROGRAM_READ_CAPABILITY });
    assertPatientSelfReadPolicy({ actor, capability: GOAL_READ_CAPABILITY });
    assertPatientSelfReadPolicy({ actor, capability: FOLLOWUP_READ_CAPABILITY });

    const screeningPage = parseHistoryPage(pageRequests.screeningPage);
    const programPage = parseHistoryPage(pageRequests.programPage);
    const goalPlanPage = parseHistoryPage(pageRequests.goalPlanPage);
    const followupPage = parseHistoryPage(pageRequests.followupPage);
    const scope = { patientHospitalRelationshipId: relationship.relationshipId };
    const [screenings, baseline, programs, goalPlans, followups] = await Promise.all([
      database.screeningAssessment.findMany({
        where: scope,
        orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
        skip: screeningPage.skip,
        take: PATIENT_SELF_HISTORY_PAGE_SIZE + 1,
        select: screeningPatientSelect,
      }),
      database.patientBaseline.findUnique({
        where: { patientHospitalRelationshipId: relationship.relationshipId },
        select: baselinePatientSelect,
      }),
      database.patientProgram.findMany({
        where: scope,
        orderBy: [{ startedAt: "desc" }, { id: "desc" }],
        skip: programPage.skip,
        take: PATIENT_SELF_HISTORY_PAGE_SIZE + 1,
        select: programHistorySelect,
      }),
      database.patientGoalPlan.findMany({
        where: scope,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: goalPlanPage.skip,
        take: PATIENT_SELF_HISTORY_PAGE_SIZE + 1,
        select: goalPlanHistorySelect,
      }),
      database.patientFollowup.findMany({
        where: scope,
        orderBy: [{ recordedAt: "desc" }, { id: "desc" }],
        skip: followupPage.skip,
        take: PATIENT_SELF_HISTORY_PAGE_SIZE + 1,
        select: followupHistorySelect,
      }),
    ]);
    const screeningResults = getHistoryPage(screenings, screeningPage.page);
    const programResults = getHistoryPage(programs, programPage.page);
    const goalPlanResults = getHistoryPage(goalPlans, goalPlanPage.page);
    const followupResults = getHistoryPage(followups, followupPage.page);

    return {
      relationship,
      screenings: screeningResults.items.map(({ submittedAt }) => ({
        submittedAt,
        status: "RECORDED",
      })),
      baseline: baseline
        ? {
            recordedOn: baseline.recordedOn,
            measurements: {
              weight: baseline.weight,
              heightCm: baseline.heightCm,
              waistCircumference: baseline.waistCircumference,
              systolicBloodPressure: baseline.bloodPressureSystolic,
              diastolicBloodPressure: baseline.bloodPressureDiastolic,
              bloodSugarDtx: baseline.bloodSugarDtx,
              hba1c: baseline.hba1c,
            },
          }
        : null,
      programs: programResults.items.map((program) => ({
        programId: program.id,
        status: program.status,
        startedAt: program.startedAt,
        completedAt: program.completedAt,
      })),
      goalPlans: goalPlanResults.items.map(toGoalPlanHistoryItem),
      followups: followupResults.items.map(toFollowupHistoryItem),
      historyPages: {
        screenings: screeningResults.page,
        programs: programResults.page,
        goalPlans: goalPlanResults.page,
        followups: followupResults.page,
      },
    };
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Patient care history could not be loaded");
  }
}

export async function getOwnPatientProgramDetail(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  programId: unknown,
  dependencies: PatientSelfCareQueryDependencies = {},
  pageRequests: PatientSelfProgramDetailPageRequests = {},
): Promise<PatientSelfProgramDetail> {
  const parsedRelationshipId = patientProgramRelationshipIdSchema.safeParse(relationshipId);
  const parsedProgramId = patientProgramIdSchema.safeParse(programId);

  if (!parsedRelationshipId.success || !parsedProgramId.success) {
    throw new NotFoundError();
  }

  const database = getDatabase(dependencies);

  try {
    const relationship = await resolveAuthorizedRelationship(
      actor,
      parsedRelationshipId.data,
      PATIENT_PROGRAM_READ_CAPABILITY,
      database,
    );
    assertPatientSelfReadPolicy({ actor, capability: GOAL_READ_CAPABILITY });
    assertPatientSelfReadPolicy({ actor, capability: FOLLOWUP_READ_CAPABILITY });

    const program = await database.patientProgram.findFirst({
      where: {
        id: parsedProgramId.data,
        patientHospitalRelationshipId: relationship.relationshipId,
      },
      select: programDetailSelect,
    });

    if (!program) {
      throw new NotFoundError();
    }

    const goalPlanPage = parseHistoryPage(pageRequests.goalPlanPage);
    const followupPage = parseHistoryPage(pageRequests.followupPage);
    const scope = {
      patientProgramId: program.id,
      patientHospitalRelationshipId: relationship.relationshipId,
    };
    const [goalPlanRecords, followupRecords] = await Promise.all([
      database.patientGoalPlan.findMany({
        where: scope,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: goalPlanPage.skip,
        take: PATIENT_SELF_HISTORY_PAGE_SIZE + 1,
        select: goalPlanHistorySelect,
      }),
      database.patientFollowup.findMany({
        where: scope,
        orderBy: [{ recordedAt: "desc" }, { id: "desc" }],
        skip: followupPage.skip,
        take: PATIENT_SELF_HISTORY_PAGE_SIZE + 1,
        select: followupHistorySelect,
      }),
    ]);
    const goalPlanResults = getHistoryPage(goalPlanRecords, goalPlanPage.page);
    const followupResults = getHistoryPage(followupRecords, followupPage.page);

    return {
      relationship,
      programId: program.id,
      status: program.status,
      startedAt: program.startedAt,
      completedAt: program.completedAt,
      serviceOne: [
        { label: "Routine", recordedAt: program.serviceOneRoutine?.recordedAt ?? null },
        { label: "Floating Chart", recordedAt: program.serviceOneFloatingChart?.recordedAt ?? null },
        { label: "Dream Card", recordedAt: program.serviceOneDreamCard?.recordedAt ?? null },
        { label: "Confidence", recordedAt: program.serviceOneConfidence?.recordedAt ?? null },
      ],
      goalPlans: goalPlanResults.items.map(toGoalPlanHistoryItem),
      followups: followupResults.items.map(toFollowupHistoryItem),
      historyPages: {
        goalPlans: goalPlanResults.page,
        followups: followupResults.page,
      },
      finalAssessment: program.finalAssessment
        ? {
            recordedAt: program.finalAssessment.recordedAt,
            measurements: toMeasurements(program.finalAssessment),
          }
        : null,
    };
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Patient Program history could not be loaded");
  }
}

export async function getOwnPatientGoalPlanDetail(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  goalPlanId: unknown,
  dependencies: PatientSelfCareQueryDependencies = {},
): Promise<PatientSelfGoalPlanDetail> {
  const parsedRelationshipId = goalPlanRelationshipIdSchema.safeParse(relationshipId);
  const parsedGoalPlanId = goalPlanIdSchema.safeParse(goalPlanId);

  if (!parsedRelationshipId.success || !parsedGoalPlanId.success) {
    throw new NotFoundError();
  }

  const database = getDatabase(dependencies);

  try {
    const relationship = await resolveAuthorizedRelationship(
      actor,
      parsedRelationshipId.data,
      GOAL_READ_CAPABILITY,
      database,
    );
    const record = await database.patientGoalPlan.findFirst({
      where: {
        id: parsedGoalPlanId.data,
        patientHospitalRelationshipId: relationship.relationshipId,
      },
      select: goalPlanDetailSelect,
    });

    if (!record) {
      throw new NotFoundError();
    }

    const template = getHistoricalTemplate(record.templateKey, record.templateVersion);
    const primaryGoal = template.primaryGoals.find((goal) => goal.code === record.primaryGoalCode);

    if (!primaryGoal) {
      throw new InfrastructureError("The historical primary Goal is unavailable");
    }

    return {
      goalPlanId: record.id,
      relationship,
      roundNumber: record.roundNumber,
      createdAt: record.createdAt,
      primaryGoalLabel: primaryGoal.label,
      program: getProgramContext(record.patientProgram),
      primaryGoalNote: record.primaryGoalNote,
      weeklyNote: record.weeklyNote,
      items: record.items.map((item) => {
        const activity = getGoalActivity(template, item.activityCode);

        if (!activity) {
          throw new InfrastructureError("The historical Goal activity is unavailable");
        }

        return {
          activityLabel: activity.label,
          targetDays: item.targetDays,
          targetValue: item.targetValue,
          targetUnit: item.targetUnit,
        };
      }),
    };
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Patient Goal Plan could not be loaded");
  }
}

export async function getOwnPatientFollowupDetail(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  followupId: unknown,
  dependencies: PatientSelfCareQueryDependencies = {},
): Promise<PatientSelfFollowupDetail> {
  const parsedRelationshipId = followupRelationshipIdSchema.safeParse(relationshipId);
  const parsedFollowupId = followupIdSchema.safeParse(followupId);

  if (!parsedRelationshipId.success || !parsedFollowupId.success) {
    throw new NotFoundError();
  }

  const database = getDatabase(dependencies);

  try {
    const relationship = await resolveAuthorizedRelationship(
      actor,
      parsedRelationshipId.data,
      FOLLOWUP_READ_CAPABILITY,
      database,
    );
    const record = await database.patientFollowup.findFirst({
      where: {
        id: parsedFollowupId.data,
        patientHospitalRelationshipId: relationship.relationshipId,
      },
      select: followupDetailSelect,
    });

    if (!record) {
      throw new NotFoundError();
    }

    const template = record.sourceGoalPlan
      ? getHistoricalTemplate(
          record.sourceGoalPlan.templateKey,
          record.sourceGoalPlan.templateVersion,
        )
      : null;

    if (!template && record.activityProgress.length > 0) {
      throw new InfrastructureError("Follow-up activities have no source Goal Plan");
    }

    const activityProgress = record.activityProgress.map((progress) => {
      if (!template) {
        throw new InfrastructureError("Follow-up activity template is unavailable");
      }

      const activity = getGoalActivity(template, progress.goalActivityCode);

      if (!activity) {
        throw new InfrastructureError("The historical Goal activity is unavailable");
      }

      return {
        activityLabel: activity.label,
        status: progress.status,
      };
    });

    return {
      followupId: record.id,
      relationship,
      roundNumber: record.roundNumber,
      recordedAt: record.recordedAt,
      program: getProgramContext(record.patientProgram),
      measurements: toMeasurements(record),
      activityProgress,
    };
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Patient Follow-up could not be loaded");
  }
}

const patientSelfNextAppointmentSelect = {
  scheduledAt: true,
  patientHospitalRelationship: {
    select: {
      hospital: {
        select: { name: true },
      },
    },
  },
} satisfies Prisma.PatientAppointmentSelect;

export async function getOwnNextAppointment(
  actor: ActorContext | null | undefined,
  captureAsOf: () => Date,
  dependencies: { database: Prisma.TransactionClient },
): Promise<PatientSelfNextAppointmentResult> {
  try {
    assertPatientSelfReadPolicy({ actor, capability: APPOINTMENT_READ_CAPABILITY });
  } catch (error: unknown) {
    if (error instanceof ForbiddenError) {
      return { status: "INELIGIBLE" };
    }
    throw error;
  }

  if (!actor) {
    return { status: "INELIGIBLE" };
  }

  if (!(await hasOwnPatientAppointmentIdentity(actor, dependencies.database))) {
    return { status: "INELIGIBLE" };
  }

  try {
    const asOf = captureAsOf();
    if (!(asOf instanceof Date) || Number.isNaN(asOf.getTime())) {
      throw new InfrastructureError("Current appointment time could not be captured");
    }

    const appointments = await dependencies.database.patientAppointment.findMany({
      where: {
        status: "SCHEDULED",
        scheduledAt: { gte: asOf },
        patientHospitalRelationship: {
          is: {
            patientProfile: {
              is: { personId: actor.personId },
            },
          },
        },
      },
      orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
      take: 1,
      select: patientSelfNextAppointmentSelect,
    });
    const appointment = appointments[0];

    return {
      status: "AUTHORIZED",
      appointment: appointment
        ? {
            scheduledAt: appointment.scheduledAt,
            hospitalName: appointment.patientHospitalRelationship.hospital.name,
          }
        : null,
    };
  } catch (error: unknown) {
    if (error instanceof InfrastructureError) {
      throw error;
    }
    throw new InfrastructureError("Next Patient appointment could not be loaded");
  }
}

export async function getOwnPatientAppointmentHistory(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  dependencies: PatientSelfCareQueryDependencies = {},
  requestedPage?: unknown,
): Promise<PatientSelfAppointmentHistory> {
  const parsedRelationshipId = appointmentRelationshipIdSchema.safeParse(relationshipId);

  if (!parsedRelationshipId.success) {
    throw new NotFoundError();
  }

  const database = getDatabase(dependencies);

  try {
    const relationship = await resolveAuthorizedRelationship(
      actor,
      parsedRelationshipId.data,
      APPOINTMENT_READ_CAPABILITY,
      database,
    );
    const page = parseHistoryPage(requestedPage);
    const records = await database.patientAppointment.findMany({
      where: { patientHospitalRelationshipId: relationship.relationshipId },
      orderBy: [{ scheduledAt: "desc" }, { id: "desc" }],
      skip: page.skip,
      take: PATIENT_SELF_HISTORY_PAGE_SIZE + 1,
      select: appointmentPatientSelect(relationship.relationshipId),
    });
    const appointmentResults = getHistoryPage(records, page.page);

    return {
      relationship,
      appointments: appointmentResults.items.map(toAppointmentItem),
      historyPage: appointmentResults.page,
    };
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Patient appointments could not be loaded");
  }
}

export async function getOwnPatientAppointmentDetail(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  appointmentId: unknown,
  dependencies: PatientSelfCareQueryDependencies = {},
): Promise<PatientSelfAppointmentDetail> {
  const parsedRelationshipId = appointmentRelationshipIdSchema.safeParse(relationshipId);
  const parsedAppointmentId = appointmentIdSchema.safeParse(appointmentId);

  if (!parsedRelationshipId.success || !parsedAppointmentId.success) {
    throw new NotFoundError();
  }

  const database = getDatabase(dependencies);

  try {
    const relationship = await resolveAuthorizedRelationship(
      actor,
      parsedRelationshipId.data,
      APPOINTMENT_READ_CAPABILITY,
      database,
    );
    const record = await database.patientAppointment.findFirst({
      where: {
        id: parsedAppointmentId.data,
        patientHospitalRelationshipId: relationship.relationshipId,
      },
      select: appointmentPatientSelect(relationship.relationshipId),
    });

    if (!record) {
      throw new NotFoundError();
    }

    return {
      ...toAppointmentItem(record),
      relationship,
    };
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Patient appointment could not be loaded");
  }
}

export const patientSelfCareQueryInternals = {
  appointmentPatientSelect,
  baselinePatientSelect,
  followupDetailSelect,
  followupHistorySelect,
  goalPlanDetailSelect,
  goalPlanHistorySelect,
  programDetailSelect,
  programHistorySelect,
  screeningPatientSelect,
  toAppointmentItem,
  toFollowupHistoryItem,
  toGoalPlanHistoryItem,
  toMeasurements,
};
