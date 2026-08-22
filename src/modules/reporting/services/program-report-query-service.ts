import "server-only";

import { Prisma, type PrismaClient } from "@prisma/client";
import { Buffer } from "node:buffer";
import { z } from "zod";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  patientProgramIdSchema,
  patientProgramRelationshipIdSchema,
} from "@/modules/patient-program/schemas/patient-program-schemas";
import {
  patientProgramServiceOneSelect,
} from "@/modules/patient-program/services/patient-program-service-one-query-service";
import {
  ApplicationError,
  InfrastructureError,
  NotFoundError,
} from "@/shared/errors/application-error";

import {
  resolveProgramReportAccessContext,
} from "./program-report-access-service";
import {
  toProgramReportFollowup,
  toProgramReportGoalPlan,
  toProgramReportingProjection,
  type ProgramReportBaselineSource,
  type ProgramReportFinalAssessmentSource,
  type ProgramReportFollowup,
  type ProgramReportGoalPlan,
  type ProgramReportPage,
  type ProgramReportingProjection,
} from "../projections/program-report-projection";

export const PROGRAM_REPORT_DEFAULT_PAGE_SIZE = 20;
export const PROGRAM_REPORT_MAX_PAGE_SIZE = 50;

export type ProgramReportQueryDatabase = PrismaClient | Prisma.TransactionClient;

export type ProgramReportQueryDependencies = {
  database?: ProgramReportQueryDatabase;
};

export type ProgramReportingProjectionOptions = {
  goalPlans?: {
    pageSize?: number;
    cursor?: string | null;
  };
  followups?: {
    pageSize?: number;
    cursor?: string | null;
  };
};

type PageCursor = {
  roundNumber: number;
  id: string;
};

type NormalizedPageOptions = {
  pageSize: number;
  cursor: PageCursor | null;
};

type NormalizedProjectionOptions = {
  goalPlans: NormalizedPageOptions;
  followups: NormalizedPageOptions;
};

const pageOptionsSchema = z
  .object({
    pageSize: z.coerce.number().int().min(1).max(PROGRAM_REPORT_MAX_PAGE_SIZE).optional(),
    cursor: z.string().trim().min(1).max(512).nullable().optional(),
  })
  .strict();

const projectionOptionsSchema = z
  .object({
    goalPlans: pageOptionsSchema.optional(),
    followups: pageOptionsSchema.optional(),
  })
  .strict();

const cursorPayloadSchema = z
  .object({
    roundNumber: z.number().int().nonnegative(),
    id: z.string().uuid(),
  })
  .strict();

export const programReportCoreSelect = {
  id: true,
  patientHospitalRelationshipId: true,
  initialBaselineId: true,
  status: true,
  startedAt: true,
  completedAt: true,
  createdAt: true,
  createdByUser: {
    select: {
      id: true,
      person: {
        select: {
          givenName: true,
          familyName: true,
        },
      },
    },
  },
  ...patientProgramServiceOneSelect,
} satisfies Prisma.PatientProgramSelect;

export const programReportBaselineSelect = {
  id: true,
  patientHospitalRelationshipId: true,
  recordedOn: true,
  createdAt: true,
  recordedBy: {
    select: {
      id: true,
      person: {
        select: {
          givenName: true,
          familyName: true,
        },
      },
    },
  },
  weight: true,
  waistCircumference: true,
  bloodPressureSystolic: true,
  bloodPressureDiastolic: true,
  bloodSugarDtx: true,
} satisfies Prisma.PatientBaselineSelect;

export const programReportFinalAssessmentSelect = {
  id: true,
  patientProgramId: true,
  patientHospitalRelationshipId: true,
  recordedAt: true,
  createdAt: true,
  recordedBy: {
    select: {
      id: true,
      person: {
        select: {
          givenName: true,
          familyName: true,
        },
      },
    },
  },
  weight: true,
  waistCircumference: true,
  systolicBloodPressure: true,
  diastolicBloodPressure: true,
  bloodSugar: true,
} satisfies Prisma.PatientFinalAssessmentSelect;

export const programReportGoalPlanSelect = {
  id: true,
  patientProgramId: true,
  patientHospitalRelationshipId: true,
  roundNumber: true,
  createdAt: true,
  createdByUser: {
    select: {
      person: {
        select: {
          givenName: true,
          familyName: true,
        },
      },
    },
  },
  primaryGoalCode: true,
  primaryGoalNote: true,
  weeklyNote: true,
  templateKey: true,
  templateVersion: true,
  items: {
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: {
      id: true,
      activityCode: true,
      targetDays: true,
      targetValue: true,
      targetUnit: true,
      sortOrder: true,
    },
  },
} satisfies Prisma.PatientGoalPlanSelect;

export const programReportFollowupSelect = {
  id: true,
  patientProgramId: true,
  patientHospitalRelationshipId: true,
  roundNumber: true,
  recordedAt: true,
  createdAt: true,
  createdByUser: {
    select: {
      person: {
        select: {
          givenName: true,
          familyName: true,
        },
      },
    },
  },
  weight: true,
  waistCircumference: true,
  systolicBloodPressure: true,
  diastolicBloodPressure: true,
  bloodSugar: true,
  activityProgress: {
    orderBy: [{ goalActivityCode: "asc" }, { id: "asc" }],
    select: {
      goalActivityCode: true,
      status: true,
      note: true,
    },
  },
} satisfies Prisma.PatientFollowupSelect;

type ProgramReportCoreRecord = Prisma.PatientProgramGetPayload<{
  select: typeof programReportCoreSelect;
}>;

function getDatabase(dependencies: ProgramReportQueryDependencies): ProgramReportQueryDatabase {
  return dependencies.database ?? getPrisma();
}

function decodeCursor(cursor: string | null | undefined): PageCursor | null {
  if (!cursor) {
    return null;
  }

  try {
    const decoded: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    const parsed = cursorPayloadSchema.safeParse(decoded);

    if (!parsed.success) {
      throw new Error("Invalid report cursor");
    }

    return {
      roundNumber: parsed.data.roundNumber,
      id: parsed.data.id.toLowerCase(),
    };
  } catch {
    throw new NotFoundError();
  }
}

function encodeCursor(record: { roundNumber: number; id: string }): string {
  return Buffer.from(
    JSON.stringify({ roundNumber: record.roundNumber, id: record.id }),
    "utf8",
  ).toString("base64url");
}

function normalizePageOptions(input: {
  pageSize?: number;
  cursor?: string | null;
} | undefined): NormalizedPageOptions {
  return {
    pageSize: input?.pageSize ?? PROGRAM_REPORT_DEFAULT_PAGE_SIZE,
    cursor: decodeCursor(input?.cursor),
  };
}

function parseProjectionOptions(options: unknown): NormalizedProjectionOptions {
  const parsed = projectionOptionsSchema.safeParse(options ?? {});

  if (!parsed.success) {
    throw new NotFoundError();
  }

  return {
    goalPlans: normalizePageOptions(parsed.data.goalPlans),
    followups: normalizePageOptions(parsed.data.followups),
  };
}

function getAfterCursorWhere(
  cursor: PageCursor | null,
): Prisma.PatientGoalPlanWhereInput["OR"] {
  return cursor
    ? [
        { roundNumber: { gt: cursor.roundNumber } },
        { roundNumber: cursor.roundNumber, id: { gt: cursor.id } },
      ]
    : undefined;
}

function toPage<T>(input: {
  records: T[];
  totalCount: number;
  pageSize: number;
  getCursor: (record: T) => { roundNumber: number; id: string };
}): ProgramReportPage<T> {
  const hasMore = input.records.length > input.pageSize;
  const items = hasMore ? input.records.slice(0, input.pageSize) : input.records;
  const lastItem = items.at(-1);

  return {
    items,
    totalCount: input.totalCount,
    pageSize: input.pageSize,
    hasMore,
    nextCursor: hasMore && lastItem ? encodeCursor(input.getCursor(lastItem)) : null,
  };
}

async function loadGoalPlans(
  database: ProgramReportQueryDatabase,
  patientProgramId: string,
  patientHospitalRelationshipId: string,
  options: NormalizedPageOptions,
): Promise<ProgramReportPage<ProgramReportGoalPlan>> {
  const baseWhere: Prisma.PatientGoalPlanWhereInput = {
    patientProgramId,
    patientHospitalRelationshipId,
  };
  const afterCursorWhere = getAfterCursorWhere(options.cursor);
  const where: Prisma.PatientGoalPlanWhereInput = afterCursorWhere
    ? { ...baseWhere, OR: afterCursorWhere }
    : baseWhere;
  const [records, totalCount] = await Promise.all([
    database.patientGoalPlan.findMany({
      where,
      orderBy: [{ roundNumber: "asc" }, { id: "asc" }],
      take: options.pageSize + 1,
      select: programReportGoalPlanSelect,
    }),
    database.patientGoalPlan.count({ where: baseWhere }),
  ]);
  const sourceItems = records.map((record) =>
    toProgramReportGoalPlan(record, patientProgramId, patientHospitalRelationshipId),
  );

  return toPage({
    records: sourceItems,
    totalCount,
    pageSize: options.pageSize,
    getCursor: (record) => ({ roundNumber: record.roundNumber, id: record.goalPlanId }),
  });
}

async function loadFollowups(
  database: ProgramReportQueryDatabase,
  patientProgramId: string,
  patientHospitalRelationshipId: string,
  options: NormalizedPageOptions,
): Promise<ProgramReportPage<ProgramReportFollowup>> {
  const baseWhere: Prisma.PatientFollowupWhereInput = {
    patientProgramId,
    patientHospitalRelationshipId,
  };
  const where: Prisma.PatientFollowupWhereInput = options.cursor
    ? {
        ...baseWhere,
        OR: [
          { roundNumber: { gt: options.cursor.roundNumber } },
          { roundNumber: options.cursor.roundNumber, id: { gt: options.cursor.id } },
        ],
      }
    : baseWhere;
  const [records, totalCount] = await Promise.all([
    database.patientFollowup.findMany({
      where,
      orderBy: [{ roundNumber: "asc" }, { id: "asc" }],
      take: options.pageSize + 1,
      select: programReportFollowupSelect,
    }),
    database.patientFollowup.count({ where: baseWhere }),
  ]);
  const sourceItems = records.map((record) =>
    toProgramReportFollowup(record, patientProgramId, patientHospitalRelationshipId),
  );

  return toPage({
    records: sourceItems,
    totalCount,
    pageSize: options.pageSize,
    getCursor: (record) => ({ roundNumber: record.roundNumber, id: record.followupId }),
  });
}

async function loadLinkedBaseline(
  database: ProgramReportQueryDatabase,
  program: Pick<ProgramReportCoreRecord, "initialBaselineId" | "patientHospitalRelationshipId">,
): Promise<ProgramReportBaselineSource | null> {
  if (program.initialBaselineId === null) {
    return null;
  }

  return database.patientBaseline.findFirst({
    where: {
      id: program.initialBaselineId,
      patientHospitalRelationshipId: program.patientHospitalRelationshipId,
    },
    select: programReportBaselineSelect,
  });
}

async function loadFinalAssessment(
  database: ProgramReportQueryDatabase,
  patientProgramId: string,
  patientHospitalRelationshipId: string,
): Promise<ProgramReportFinalAssessmentSource | null> {
  return database.patientFinalAssessment.findFirst({
    where: {
      patientProgramId,
      patientHospitalRelationshipId,
    },
    select: programReportFinalAssessmentSelect,
  });
}

export async function getProgramReportingProjection(
  actor: ActorContext | null | undefined,
  patientHospitalRelationshipId: unknown,
  patientProgramId: unknown,
  options: unknown = {},
  dependencies: ProgramReportQueryDependencies = {},
): Promise<ProgramReportingProjection> {
  const parsedRelationshipId = patientProgramRelationshipIdSchema.safeParse(
    patientHospitalRelationshipId,
  );
  const parsedProgramId = patientProgramIdSchema.safeParse(patientProgramId);

  if (!parsedRelationshipId.success || !parsedProgramId.success) {
    throw new NotFoundError();
  }

  const normalizedRelationshipId = parsedRelationshipId.data.toLowerCase();
  const normalizedProgramId = parsedProgramId.data.toLowerCase();
  const normalizedOptions = parseProjectionOptions(options);

  try {
    const database = getDatabase(dependencies);
    const access = await resolveProgramReportAccessContext(
      actor,
      normalizedRelationshipId,
      normalizedProgramId,
      database,
    );
    const program = await database.patientProgram.findFirst({
      where: {
        id: normalizedProgramId,
        patientHospitalRelationshipId: normalizedRelationshipId,
      },
      select: programReportCoreSelect,
    });

    if (!program) {
      throw new NotFoundError();
    }

    const [linkedBaseline, finalAssessment, goalPlans, followups] = await Promise.all([
      loadLinkedBaseline(database, program),
      loadFinalAssessment(database, normalizedProgramId, normalizedRelationshipId),
      loadGoalPlans(database, normalizedProgramId, normalizedRelationshipId, normalizedOptions.goalPlans),
      loadFollowups(database, normalizedProgramId, normalizedRelationshipId, normalizedOptions.followups),
    ]);

    return toProgramReportingProjection({
      program,
      hospital: access.patient.hospital,
      patientDisplayName: access.patient.displayName,
      linkedBaseline,
      finalAssessment,
      goalPlans,
      followups,
    });
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Program reporting projection could not be loaded");
  }
}

export const programReportQueryInternals = {
  decodeCursor,
  encodeCursor,
  getAfterCursorWhere,
  loadFinalAssessment,
  loadFollowups,
  loadGoalPlans,
  loadLinkedBaseline,
  normalizePageOptions,
  parseProjectionOptions,
  programReportBaselineSelect,
  programReportCoreSelect,
  programReportFinalAssessmentSelect,
  programReportFollowupSelect,
  programReportGoalPlanSelect,
  toPage,
};
