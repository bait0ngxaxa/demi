import "server-only";

import { Buffer } from "node:buffer";
import {
  PatientProgramStatus,
  Prisma,
  Role,
  UserStatus,
  type PrismaClient,
} from "@prisma/client";
import { z } from "zod";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { getGoalTemplate } from "@/modules/goals/domain/goal-templates";
import {
  ApplicationError,
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
} from "@/shared/errors/application-error";

import {
  HOSPITAL_REPORT_CAPABILITIES,
  assertHospitalReportPolicy,
} from "../policies/hospital-report-policy";
import type {
  HospitalReportFact,
  HospitalReportFollowup,
  HospitalReportGoalPlan,
  HospitalReportMeasurementSet,
  HospitalReportProgramRow,
  HospitalReportRecord,
  HospitalReportingDataset,
  HospitalReportingPageProjection,
} from "../projections/hospital-report-projection";
import {
  hospitalReportExportRequestSchema,
  hospitalReportPageRequestSchema,
} from "../schemas/hospital-report-schemas";
import { resolveHospitalReportingAccessContext } from "./hospital-report-access-service";

export const HOSPITAL_REPORT_DEFAULT_PAGE_SIZE = 20;
export const HOSPITAL_REPORT_MAX_PAGE_SIZE = 50;
export const HOSPITAL_REPORT_FOLLOWUP_PREVIEW_LIMIT = 6;
export const HOSPITAL_REPORT_GOAL_PLAN_PREVIEW_LIMIT = 3;
export const HOSPITAL_REPORT_EXPORT_MAX_PROGRAMS = 1_000;
export const HOSPITAL_REPORT_EXPORT_MAX_FOLLOWUPS = 10_000;
export const HOSPITAL_REPORT_EXPORT_MAX_GOAL_PLANS = 5_000;
export const HOSPITAL_REPORT_EXPORT_MAX_ACTIVITY_PROGRESS = 50_000;
export const HOSPITAL_REPORT_EXPORT_MAX_GOAL_ITEMS = 20_000;

const REPORT_TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
  maxWait: 5_000,
  timeout: 25_000,
} as const;

export type HospitalReportQueryDatabase = PrismaClient | Prisma.TransactionClient;

export type HospitalReportQueryDependencies = {
  database?: HospitalReportQueryDatabase;
};

export class HospitalReportExportLimitError extends ApplicationError {
  constructor(message: string) {
    super("VALIDATION", message);
    this.name = "HospitalReportExportLimitError";
  }
}

type ReportCursor = { startedAt: Date; id: string };

const cursorPayloadSchema = z
  .object({
    startedAt: z.string().datetime({ offset: true }),
    id: z.string().uuid(),
  })
  .strict();

const reportHospitalProgramWhere = (hospitalId: string): Prisma.PatientProgramWhereInput => ({
  patientHospitalRelationship: { is: { hospitalId } },
  status: { in: [PatientProgramStatus.ACTIVE, PatientProgramStatus.COMPLETED] },
});

const reportProgramRelationshipSelect = {
  select: {
    id: true,
    hospitalNumber: true,
    patientProfile: {
      select: {
        person: { select: { givenName: true, familyName: true } },
      },
    },
    osmAssignments: {
      where: {
        endedAt: null,
        osmUser: {
          is: {
            status: UserStatus.ACTIVE,
            roles: { some: { role: Role.OSM } },
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 1,
      select: {
        createdAt: true,
        osmUser: {
          select: {
            person: { select: { givenName: true, familyName: true } },
          },
        },
      },
    },
  },
} satisfies Prisma.PatientProgramSelect["patientHospitalRelationship"];

const reportProgramBaselineSelect = {
  select: {
    id: true,
    recordedOn: true,
    weight: true,
    heightCm: true,
    waistCircumference: true,
    bloodPressureSystolic: true,
    bloodPressureDiastolic: true,
    bloodSugarDtx: true,
  },
} satisfies Prisma.PatientProgramSelect["initialBaseline"];

const reportProgramServiceOneSelect = {
  select: { recordedAt: true },
} satisfies Prisma.PatientProgramSelect["serviceOneRoutine"];

const reportProgramGoalPlanSelect = {
  orderBy: [{ roundNumber: "desc" }, { id: "desc" }],
  select: {
    id: true,
    roundNumber: true,
    primaryGoalCode: true,
    templateKey: true,
    templateVersion: true,
    items: {
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: {
        activityCode: true,
        targetDays: true,
        targetValue: true,
        targetUnit: true,
      },
    },
  },
} satisfies Prisma.PatientProgramSelect["goalPlans"];

const reportProgramFollowupSelect = {
  orderBy: [{ roundNumber: "asc" }, { id: "asc" }],
  select: {
    id: true,
    roundNumber: true,
    recordedAt: true,
    weight: true,
    waistCircumference: true,
    systolicBloodPressure: true,
    diastolicBloodPressure: true,
    bloodSugar: true,
    activityProgress: {
      orderBy: [{ goalActivityCode: "asc" }, { id: "asc" }],
      select: { goalActivityCode: true, status: true },
    },
  },
} satisfies Prisma.PatientProgramSelect["followups"];

const reportProgramFinalSelect = {
  select: {
    recordedAt: true,
    weight: true,
    waistCircumference: true,
    systolicBloodPressure: true,
    diastolicBloodPressure: true,
    bloodSugar: true,
  },
} satisfies Prisma.PatientProgramSelect["finalAssessment"];

const reportProgramBaseSelect = {
  id: true,
  patientHospitalRelationshipId: true,
  status: true,
  startedAt: true,
  completedAt: true,
  patientHospitalRelationship: reportProgramRelationshipSelect,
  initialBaseline: reportProgramBaselineSelect,
  serviceOneRoutine: reportProgramServiceOneSelect,
  serviceOneFloatingChart: reportProgramServiceOneSelect,
  serviceOneDreamCard: reportProgramServiceOneSelect,
  serviceOneConfidence: reportProgramServiceOneSelect,
  finalAssessment: reportProgramFinalSelect,
} satisfies Prisma.PatientProgramSelect;

export const hospitalReportPageProgramSelect = {
  ...reportProgramBaseSelect,
  goalPlans: { ...reportProgramGoalPlanSelect, take: HOSPITAL_REPORT_GOAL_PLAN_PREVIEW_LIMIT },
  followups: {
    ...reportProgramFollowupSelect,
    take: HOSPITAL_REPORT_FOLLOWUP_PREVIEW_LIMIT,
  },
} satisfies Prisma.PatientProgramSelect;

export const hospitalReportExportProgramSelect = {
  ...reportProgramBaseSelect,
  goalPlans: reportProgramGoalPlanSelect,
  followups: reportProgramFollowupSelect,
} satisfies Prisma.PatientProgramSelect;

type HospitalReportProgramRecord = Prisma.PatientProgramGetPayload<{
  select: typeof hospitalReportPageProgramSelect;
}>;

type HospitalReportExportProgramRecord = Prisma.PatientProgramGetPayload<{
  select: typeof hospitalReportExportProgramSelect;
}>;

function encodeCursor(record: { startedAt: Date; id: string }): string {
  return Buffer.from(
    JSON.stringify({ startedAt: record.startedAt.toISOString(), id: record.id }),
    "utf8",
  ).toString("base64url");
}

function decodeCursor(value: string | undefined): ReportCursor | null {
  if (!value) return null;

  try {
    const decoded: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    const parsed = cursorPayloadSchema.safeParse(decoded);
    if (!parsed.success) throw new Error("Invalid reporting cursor");
    return { startedAt: new Date(parsed.data.startedAt), id: parsed.data.id.toLowerCase() };
  } catch {
    throw new NotFoundError();
  }
}

function reportCursorWhere(cursor: ReportCursor | null): Prisma.PatientProgramWhereInput {
  if (!cursor) return {};
  return {
    OR: [
      { startedAt: { lt: cursor.startedAt } },
      { startedAt: cursor.startedAt, id: { lt: cursor.id } },
    ],
  };
}

function toFact<T extends number | string>(value: T | null): HospitalReportFact<T> {
  return value === null ? { state: "NOT_RECORDED" } : { state: "RECORDED", value };
}

function toUnavailable<T>(reason: "SOURCE_MISSING" | "CLINICAL_SEMANTICS_UNAPPROVED" | "NOT_PROGRAM_SCOPED" | "DERIVATION_UNAPPROVED"): HospitalReportFact<T> {
  return { state: "UNAVAILABLE", reason };
}

function toRecord<T>(value: T | null): HospitalReportRecord<T> {
  return value === null ? { state: "MISSING" } : { state: "PRESENT", value };
}

function toDisplayName(person: { givenName: string | null; familyName: string | null }): string {
  const parts = [person.givenName, person.familyName]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  return parts.join(" ") || "ไม่ระบุชื่อ";
}

function toMeasurementSet(input: {
  bloodSugar: number | null;
  weight: number | null;
  waistCircumference: number | null;
  systolicBloodPressure: number | null;
  diastolicBloodPressure: number | null;
}): HospitalReportMeasurementSet {
  return {
    bloodSugar: toFact(input.bloodSugar),
    weight: toFact(input.weight),
    waistCircumference: toFact(input.waistCircumference),
    systolicBloodPressure: toFact(input.systolicBloodPressure),
    diastolicBloodPressure: toFact(input.diastolicBloodPressure),
  };
}

function toGoalPlan(record: {
  id: string;
  roundNumber: number;
  primaryGoalCode: string;
  templateKey: string;
  templateVersion: string;
  items: readonly {
    activityCode: string;
    targetDays: number;
    targetValue: number | null;
    targetUnit: string | null;
  }[];
}): HospitalReportGoalPlan {
  const template = getGoalTemplate(record.templateKey, record.templateVersion);
  const primaryGoalLabel =
    template?.primaryGoals.find((goal) => goal.code === record.primaryGoalCode)?.label ??
    record.primaryGoalCode;

  return {
    id: record.id,
    roundNumber: record.roundNumber,
    primaryGoalCode: record.primaryGoalCode,
    primaryGoalLabel,
    items: record.items.map((item) => ({
      activityCode: item.activityCode,
      activityLabel:
        template?.activities.find((activity) => activity.code === item.activityCode)?.label ??
        item.activityCode,
      targetDays: item.targetDays,
      targetValue: toFact(item.targetValue),
      targetUnit: toFact(item.targetUnit),
    })),
  };
}

function toFollowup(record: {
  id: string;
  roundNumber: number;
  recordedAt: Date;
  weight: number | null;
  waistCircumference: number | null;
  systolicBloodPressure: number | null;
  diastolicBloodPressure: number | null;
  bloodSugar: number | null;
  activityProgress: readonly { goalActivityCode: string; status: HospitalReportFollowup["activityProgress"][number]["status"] }[];
}): HospitalReportFollowup {
  return {
    id: record.id,
    roundNumber: record.roundNumber,
    recordedAt: record.recordedAt.toISOString(),
    measurements: toMeasurementSet(record),
    activityProgress: record.activityProgress.map((item) => ({
      activityCode: item.goalActivityCode,
      status: item.status,
    })),
  };
}

function toServiceOneActivity(record: { recordedAt: Date } | null): HospitalReportProgramRow["serviceOne"]["routine"] {
  return record
    ? { state: "PRESENT", value: { recordedAt: record.recordedAt.toISOString() } }
    : { state: "MISSING" };
}

function toHospitalReportProgramRow(
  record: HospitalReportProgramRecord | HospitalReportExportProgramRecord,
  counts: { goalPlans: number; followups: number },
): HospitalReportProgramRow {
  const relationship = record.patientHospitalRelationship;
  const assignment = relationship.osmAssignments[0];
  const baseline = record.initialBaseline;
  const finalAssessment = record.finalAssessment;

  return {
    patientProgramId: record.id,
    patientHospitalRelationshipId: relationship.id,
    patient: {
      displayName: toDisplayName(relationship.patientProfile.person),
      givenName: relationship.patientProfile.person.givenName,
      familyName: relationship.patientProfile.person.familyName,
      hospitalNumber: toFact(relationship.hospitalNumber),
    },
    currentRelationshipOsmAssignment: toRecord(
      assignment
        ? {
            displayName: toDisplayName(assignment.osmUser.person),
            assignedAt: assignment.createdAt.toISOString(),
          }
        : null,
    ),
    lifecycle: {
      status: record.status,
      startedAt: record.startedAt.toISOString(),
      completedAt: record.completedAt ? { state: "RECORDED", value: record.completedAt.toISOString() } : { state: "NOT_RECORDED" },
    },
    baseline: toRecord(
      baseline
        ? {
            recordedOn: baseline.recordedOn.toISOString(),
            measurements: toMeasurementSet({
              bloodSugar: baseline.bloodSugarDtx,
              weight: baseline.weight,
              waistCircumference: baseline.waistCircumference,
              systolicBloodPressure: baseline.bloodPressureSystolic,
              diastolicBloodPressure: baseline.bloodPressureDiastolic,
            }),
            heightCm: toFact(baseline.heightCm),
            hba1c: toUnavailable("CLINICAL_SEMANTICS_UNAPPROVED"),
            confidenceScore: toUnavailable("CLINICAL_SEMANTICS_UNAPPROVED"),
          }
        : null,
    ),
    serviceOne: {
      routine: toServiceOneActivity(record.serviceOneRoutine),
      floatingChart: toServiceOneActivity(record.serviceOneFloatingChart),
      dreamCard: toServiceOneActivity(record.serviceOneDreamCard),
      confidence: toServiceOneActivity(record.serviceOneConfidence),
    },
    goalPlans: {
      totalCount: counts.goalPlans,
      items: record.goalPlans.map(toGoalPlan),
      hasMore: counts.goalPlans > record.goalPlans.length,
    },
    followups: {
      totalCount: counts.followups,
      items: record.followups.map(toFollowup),
      hasMore: counts.followups > record.followups.length,
    },
    finalAssessment: toRecord(
      finalAssessment
        ? {
            recordedAt: finalAssessment.recordedAt.toISOString(),
            measurements: toMeasurementSet(finalAssessment),
          }
        : null,
    ),
    unavailable: {
      illnessDuration: "SOURCE_MISSING",
      baselineCvdRiskScore: "SOURCE_MISSING",
      baselineBmi: "DERIVATION_UNAPPROVED",
      afterCvdRiskScore: "SOURCE_MISSING",
      afterHba1c: "SOURCE_MISSING",
      afterBmi: "DERIVATION_UNAPPROVED",
      afterHeightCm: "SOURCE_MISSING",
      beforePamScore: "NOT_PROGRAM_SCOPED",
      beforePromsScore: "NOT_PROGRAM_SCOPED",
      beforeWeeklyExercise: "NOT_PROGRAM_SCOPED",
      afterWeeklyExercise: "NOT_PROGRAM_SCOPED",
      achievementDays: "SOURCE_MISSING",
      achievementRate: "DERIVATION_UNAPPROVED",
      achievementOver70Count: "DERIVATION_UNAPPROVED",
      outcome: "SOURCE_MISSING",
      planAdjustment: "SOURCE_MISSING",
      obstacle: "SOURCE_MISSING",
    },
  };
}

async function countProgramRelatedRows(
  database: HospitalReportQueryDatabase,
  hospitalId: string,
  programIds: readonly string[],
): Promise<Map<string, { goalPlans: number; followups: number }>> {
  if (programIds.length === 0) return new Map();

  const [goalGroups, followupGroups] = await Promise.all([
    database.patientGoalPlan.groupBy({
      by: ["patientProgramId"],
      where: { patientProgramId: { in: [...programIds] }, patientHospitalRelationship: { hospitalId } },
      _count: { _all: true },
    }),
    database.patientFollowup.groupBy({
      by: ["patientProgramId"],
      where: { patientProgramId: { in: [...programIds] }, patientHospitalRelationship: { hospitalId } },
      _count: { _all: true },
    }),
  ]);
  const counts = new Map<string, { goalPlans: number; followups: number }>();

  for (const group of goalGroups) {
    if (group.patientProgramId) {
      counts.set(group.patientProgramId, {
        goalPlans: group._count._all,
        followups: counts.get(group.patientProgramId)?.followups ?? 0,
      });
    }
  }
  for (const group of followupGroups) {
    if (group.patientProgramId) {
      counts.set(group.patientProgramId, {
        goalPlans: counts.get(group.patientProgramId)?.goalPlans ?? 0,
        followups: group._count._all,
      });
    }
  }

  return counts;
}

async function loadSummary(
  database: HospitalReportQueryDatabase,
  hospitalId: string,
): Promise<HospitalReportingPageProjection["counts"]> {
  const [relationshipCount, relationshipsWithoutProgram, programGroups] = await Promise.all([
    database.patientHospitalRelationship.count({ where: { hospitalId } }),
    database.patientHospitalRelationship.count({
      where: { hospitalId, programs: { none: {} } },
    }),
    database.patientProgram.groupBy({
      by: ["status"],
      where: reportHospitalProgramWhere(hospitalId),
      _count: { _all: true },
    }),
  ]);
  const programCounts = new Map(programGroups.map((group) => [group.status, group._count._all]));
  const active = programCounts.get(PatientProgramStatus.ACTIVE) ?? 0;
  const completed = programCounts.get(PatientProgramStatus.COMPLETED) ?? 0;

  return {
    patientHospitalRelationships: { grain: "PATIENT_HOSPITAL_RELATIONSHIP", value: relationshipCount },
    relationshipsWithoutProgram: { grain: "PATIENT_HOSPITAL_RELATIONSHIP", value: relationshipsWithoutProgram },
    programs: { grain: "PATIENT_PROGRAM", total: active + completed, active, completed },
  };
}

async function runConsistentRead<T>(
  database: HospitalReportQueryDatabase | undefined,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const client = database ?? getPrisma();
  if ("$transaction" in client && typeof client.$transaction === "function") {
    return client.$transaction(operation, REPORT_TRANSACTION_OPTIONS);
  }
  return operation(client);
}

async function loadHospitalReportingPage(
  actor: ActorContext | null | undefined,
  request: ReturnType<typeof hospitalReportPageRequestSchema.parse>,
  database: HospitalReportQueryDatabase,
): Promise<HospitalReportingPageProjection> {
  const access = await resolveHospitalReportingAccessContext(
    actor,
    request.hospitalId,
    HOSPITAL_REPORT_CAPABILITIES.dashboardRead,
    database,
  );
  assertHospitalReportPolicy({
    actor: access.actor,
    capability: HOSPITAL_REPORT_CAPABILITIES.rowRead,
    target: { hospitalId: access.hospital.id, hospitalStatus: access.hospital.status },
  });

  const pageSize = request.pageSize ?? HOSPITAL_REPORT_DEFAULT_PAGE_SIZE;
  const cursor = decodeCursor(request.cursor);
  const where: Prisma.PatientProgramWhereInput = {
    ...reportHospitalProgramWhere(access.hospital.id),
    ...reportCursorWhere(cursor),
  };
  const [records, summary] = await Promise.all([
    database.patientProgram.findMany({
      where,
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      take: pageSize + 1,
      select: hospitalReportPageProgramSelect,
    }),
    loadSummary(database, access.hospital.id),
  ]);
  const hasMore = records.length > pageSize;
  const pageRecords = hasMore ? records.slice(0, pageSize) : records;
  const childCounts = await countProgramRelatedRows(
    database,
    access.hospital.id,
    pageRecords.map((record) => record.id),
  );
  const items = pageRecords.map((record) =>
    toHospitalReportProgramRow(record, childCounts.get(record.id) ?? { goalPlans: 0, followups: 0 }),
  );
  const lastRecord = pageRecords.at(-1);

  return {
    hospital: {
      id: access.hospital.id,
      hospitalCode: access.hospital.hospitalCode,
      name: access.hospital.name,
    },
    counts: summary,
    page: {
      items,
      pageSize,
      nextCursor: hasMore && lastRecord ? encodeCursor(lastRecord) : null,
    },
  };
}

export async function getHospitalReportingPage(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: HospitalReportQueryDependencies = {},
): Promise<HospitalReportingPageProjection> {
  const parsed = hospitalReportPageRequestSchema.safeParse(input);
  if (!parsed.success) throw new NotFoundError();

  try {
    return await runConsistentRead(dependencies.database, (transaction) =>
      loadHospitalReportingPage(actor, parsed.data, transaction),
    );
  } catch (error: unknown) {
    if (error instanceof ForbiddenError || error instanceof NotFoundError) throw error;
    throw new InfrastructureError("Hospital reporting data could not be loaded");
  }
}

function assertExportBounds(input: {
  programs: number;
  followups: number;
  goalPlans: number;
  activityProgress: number;
  goalItems: number;
}): void {
  if (input.programs > HOSPITAL_REPORT_EXPORT_MAX_PROGRAMS) {
    throw new HospitalReportExportLimitError(
      `ส่งออกได้ไม่เกิน ${HOSPITAL_REPORT_EXPORT_MAX_PROGRAMS.toLocaleString("th-TH")} โปรแกรมต่อไฟล์`,
    );
  }
  if (input.followups > HOSPITAL_REPORT_EXPORT_MAX_FOLLOWUPS) {
    throw new HospitalReportExportLimitError("จำนวนบันทึกติดตามเกินขีดจำกัดการส่งออกที่รองรับ");
  }
  if (input.goalPlans > HOSPITAL_REPORT_EXPORT_MAX_GOAL_PLANS) {
    throw new HospitalReportExportLimitError("จำนวนแผนสุขภาพเกินขีดจำกัดการส่งออกที่รองรับ");
  }
  if (input.activityProgress > HOSPITAL_REPORT_EXPORT_MAX_ACTIVITY_PROGRESS) {
    throw new HospitalReportExportLimitError("จำนวนรายการความคืบหน้ากิจกรรมเกินขีดจำกัดการส่งออกที่รองรับ");
  }
  if (input.goalItems > HOSPITAL_REPORT_EXPORT_MAX_GOAL_ITEMS) {
    throw new HospitalReportExportLimitError("จำนวนเป้าหมายกิจกรรมเกินขีดจำกัดการส่งออกที่รองรับ");
  }
}

async function countExportSourceRows(
  database: HospitalReportQueryDatabase,
  hospitalId: string,
): Promise<{ programs: number; followups: number; goalPlans: number; activityProgress: number; goalItems: number }> {
  const programWhere = reportHospitalProgramWhere(hospitalId);
  const followupWhere: Prisma.PatientFollowupWhereInput = {
    patientProgram: { is: programWhere },
  };
  const goalPlanWhere: Prisma.PatientGoalPlanWhereInput = {
    patientProgram: { is: programWhere },
  };
  const [programs, followups, goalPlans, activityProgress, goalItems] = await Promise.all([
    database.patientProgram.count({ where: programWhere }),
    database.patientFollowup.count({ where: followupWhere }),
    database.patientGoalPlan.count({ where: goalPlanWhere }),
    database.patientFollowupActivityProgress.count({
      where: { followup: { is: { patientProgram: { is: programWhere } } } },
    }),
    database.patientGoalItem.count({ where: { goalPlan: { is: goalPlanWhere } } }),
  ]);
  return { programs, followups, goalPlans, activityProgress, goalItems };
}

async function loadHospitalReportingDataset(
  actor: ActorContext | null | undefined,
  hospitalId: string,
  database: HospitalReportQueryDatabase,
): Promise<HospitalReportingDataset> {
  const access = await resolveHospitalReportingAccessContext(
    actor,
    hospitalId,
    HOSPITAL_REPORT_CAPABILITIES.export,
    database,
  );
  const bounds = await countExportSourceRows(database, access.hospital.id);
  assertExportBounds(bounds);

  const [programRecords, counts] = await Promise.all([
    database.patientProgram.findMany({
      where: reportHospitalProgramWhere(access.hospital.id),
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      take: HOSPITAL_REPORT_EXPORT_MAX_PROGRAMS + 1,
      select: hospitalReportExportProgramSelect,
    }),
    loadSummary(database, access.hospital.id),
  ]);

  if (programRecords.length > HOSPITAL_REPORT_EXPORT_MAX_PROGRAMS) {
    throw new HospitalReportExportLimitError(
      `ส่งออกได้ไม่เกิน ${HOSPITAL_REPORT_EXPORT_MAX_PROGRAMS.toLocaleString("th-TH")} โปรแกรมต่อไฟล์`,
    );
  }

  const childCounts = new Map(
    programRecords.map((record) => [record.id, { goalPlans: record.goalPlans.length, followups: record.followups.length }]),
  );
  const programs = programRecords.map((record) =>
    toHospitalReportProgramRow(record, childCounts.get(record.id) ?? { goalPlans: 0, followups: 0 }),
  );

  return {
    hospital: {
      id: access.hospital.id,
      hospitalCode: access.hospital.hospitalCode,
      name: access.hospital.name,
    },
    counts,
    programs,
  };
}

export async function getHospitalReportingDatasetForExport(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: HospitalReportQueryDependencies = {},
): Promise<HospitalReportingDataset> {
  const parsed = hospitalReportExportRequestSchema.safeParse(input);
  if (!parsed.success) throw new NotFoundError();

  try {
    return await runConsistentRead(dependencies.database, (transaction) =>
      loadHospitalReportingDataset(actor, parsed.data.hospitalId, transaction),
    );
  } catch (error: unknown) {
    if (
      error instanceof ForbiddenError ||
      error instanceof NotFoundError ||
      error instanceof HospitalReportExportLimitError
    ) {
      throw error;
    }
    throw new InfrastructureError("Hospital report source data could not be collected");
  }
}

export const hospitalReportQueryInternals = {
  assertExportBounds,
  countExportSourceRows,
  countProgramRelatedRows,
  decodeCursor,
  encodeCursor,
  reportCursorWhere,
  reportHospitalProgramWhere,
  toFact,
  toHospitalReportProgramRow,
  toMeasurementSet,
  toUnavailable,
  hospitalReportPageProgramSelect,
  hospitalReportExportProgramSelect,
};
