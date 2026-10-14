import "server-only";

import { Buffer } from "node:buffer";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  HospitalStatus,
  PatientProgramStatus,
  Prisma,
  Role,
  UserStatus,
  type PrismaClient,
} from "@prisma/client";
import { z } from "zod";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { computeFollowupAchievement } from "@/modules/followups/domain/followup-achievement";
import { calculateBodyMassIndex } from "@/modules/patient-program-rounds/domain/body-mass-index";
import { screeningResultSchema } from "@/modules/screening/schemas/screening-schemas";
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
import { GLOBAL_REPORTING_CAPABILITIES } from "../policies/global-reporting-policy";
import type {
  HospitalReportFact,
  HospitalReportFollowup,
  HospitalReportGoalPlan,
  HospitalReportMeasurementSet,
  HospitalReportProgramRow,
  HospitalReportRecord,
  HospitalReportingDataset,
  HospitalReportingPageProjection,
  HospitalReportingSummary,
  ParentChildHospitalReportingProjection,
} from "../projections/hospital-report-projection";
import {
  hospitalReportExportRequestSchema,
  hospitalReportPageRequestSchema,
  parentChildHospitalReportRequestSchema,
} from "../schemas/hospital-report-schemas";
import { resolveParentChildHospitalReportAccessContext } from "./parent-child-hospital-report-access-service";
import {
  parentChildHospitalReportingAuditReasonForError,
  recordParentChildHospitalReportingAudit,
} from "./parent-child-hospital-report-audit-service";
import { resolveHospitalReportingAccessContext } from "./hospital-report-access-service";
import { resolveGlobalReportingAccessContext } from "./global-reporting-access-service";

export const HOSPITAL_REPORT_DEFAULT_PAGE_SIZE = 20;
export const HOSPITAL_REPORT_MAX_PAGE_SIZE = 50;
export const HOSPITAL_REPORT_FOLLOWUP_PREVIEW_LIMIT = 6;
export const HOSPITAL_REPORT_GOAL_PLAN_PREVIEW_LIMIT = 3;
export const HOSPITAL_REPORT_EXPORT_MAX_PROGRAMS = 1_000;
export const HOSPITAL_REPORT_EXPORT_MAX_FOLLOWUPS = 10_000;
export const HOSPITAL_REPORT_EXPORT_MAX_GOAL_PLANS = 5_000;
export const HOSPITAL_REPORT_EXPORT_MAX_ACTIVITY_PROGRESS = 50_000;
export const HOSPITAL_REPORT_EXPORT_MAX_GOAL_ITEMS = 20_000;
export const HOSPITAL_REPORTING_CURSOR_SECRET_ENV = "DEMI_HOSPITAL_REPORTING_CURSOR_SECRET";

const REPORT_TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
  maxWait: 5_000,
  timeout: 25_000,
} as const;
const REPORT_CURSOR_VERSION = 2;
const REPORT_CURSOR_TTL_MS = 15 * 60 * 1000;
const REPORT_CURSOR_ORDERING = "startedAt:desc,id:desc";
const REPORT_CURSOR_SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const REPORT_CURSOR_PAYLOAD_PATTERN = /^[A-Za-z0-9_-]+$/u;
const REPORT_CURSOR_SECRET_MIN_BYTES = 32;

export type HospitalReportQueryDatabase = PrismaClient | Prisma.TransactionClient;

export type HospitalReportQueryDependencies = {
  database?: PrismaClient;
};

export class HospitalReportExportLimitError extends ApplicationError {
  constructor(message: string) {
    super("VALIDATION", message);
    this.name = "HospitalReportExportLimitError";
  }
}

type ReportCursor = { startedAt: Date; id: string };
// Parent reporting currently returns only an allowlisted exact-Child summary, with no pageable Patient/Program
// rows or cursor. Any future pageable Parent operation must bind its signed cursor to the actor, exact Parent
// and Child, operation, page size, ordering and expiry, then re-resolve authority on every continuation.
type ReportScopeOperation = "HOSPITAL_OWNER" | "GLOBAL_ADMIN";
type ReportCursorContext = {
  actorId: string;
  hospitalId: string;
  pageSize: number;
  operation: ReportScopeOperation;
};

const cursorPayloadSchema = z
  .object({
    version: z.literal(REPORT_CURSOR_VERSION),
    context: z.object({
      actorId: z.string().uuid().transform((value) => value.toLowerCase()),
      hospitalId: z.string().uuid().transform((value) => value.toLowerCase()),
      pageSize: z.number().int().min(1).max(HOSPITAL_REPORT_MAX_PAGE_SIZE),
      ordering: z.literal(REPORT_CURSOR_ORDERING),
      operation: z.enum(["HOSPITAL_OWNER", "GLOBAL_ADMIN"]),
    }).strict(),
    startedAt: z.string().datetime({ offset: true }),
    id: z.string().uuid().transform((value) => value.toLowerCase()),
    issuedAt: z.number().int().nonnegative(),
    expiresAt: z.number().int().positive(),
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
    serviceDate: true,
    planAdjusted: true,
    hasObstacle: true,
    weight: true,
    waistCircumference: true,
    systolicBloodPressure: true,
    diastolicBloodPressure: true,
    bloodSugar: true,
    sourceGoalPlan: {
      select: {
        templateKey: true,
        templateVersion: true,
        items: { select: { activityCode: true, targetDays: true } },
      },
    },
    activityProgress: {
      orderBy: [{ goalActivityCode: "asc" }, { id: "asc" }],
      select: { goalActivityCode: true, status: true, achievedDays: true },
    },
  },
} satisfies Prisma.PatientProgramSelect["followups"];

const reportProgramFinalSelect = {
  select: {
    recordedAt: true,
    serviceDate: true,
    weight: true,
    waistCircumference: true,
    systolicBloodPressure: true,
    diastolicBloodPressure: true,
    bloodSugar: true,
    hba1c: true,
  },
} satisfies Prisma.PatientProgramSelect["finalAssessment"];

const reportProgramRoundVitalsSelect = {
  orderBy: { roundNumber: "asc" },
  select: {
    roundNumber: true,
    serviceDate: true,
    weight: true,
    heightCm: true,
    waistCircumference: true,
    systolicBloodPressure: true,
    diastolicBloodPressure: true,
    bloodSugar: true,
  },
} satisfies Prisma.PatientProgramSelect["roundVitals"];

const reportProgramScreeningSelect = {
  select: { submittedAt: true, result: true },
} satisfies Prisma.PatientProgramSelect["screeningAssessment"];

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
  roundVitals: reportProgramRoundVitalsSelect,
  screeningAssessment: reportProgramScreeningSelect,
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

function getCursorSigningSecret(): string {
  const secret = process.env[HOSPITAL_REPORTING_CURSOR_SECRET_ENV];
  if (!secret || Buffer.byteLength(secret, "utf8") < REPORT_CURSOR_SECRET_MIN_BYTES) {
    throw new InfrastructureError("Hospital reporting cursor signing is not configured");
  }
  return secret;
}

function encodeCursor(record: { startedAt: Date; id: string }, context: ReportCursorContext): string {
  const issuedAt = Date.now();
  const payload = Buffer.from(JSON.stringify({
    version: REPORT_CURSOR_VERSION,
    context: {
      actorId: context.actorId.toLowerCase(),
      hospitalId: context.hospitalId.toLowerCase(),
      pageSize: context.pageSize,
      ordering: REPORT_CURSOR_ORDERING,
      operation: context.operation,
    },
    startedAt: record.startedAt.toISOString(),
    id: record.id.toLowerCase(),
    issuedAt,
    expiresAt: issuedAt + REPORT_CURSOR_TTL_MS,
  }), "utf8").toString("base64url");
  const signature = createHmac("sha256", getCursorSigningSecret()).update(payload, "utf8").digest("base64url");
  return `${payload}.${signature}`;
}

function decodeCursor(value: string | undefined, context: ReportCursorContext): ReportCursor | null {
  if (!value) return null;

  try {
    const [encodedPayload, suppliedSignature, extra] = value.split(".");
    if (
      value.length > 512 ||
      extra !== undefined ||
      !encodedPayload ||
      !suppliedSignature ||
      !REPORT_CURSOR_PAYLOAD_PATTERN.test(encodedPayload) ||
      !REPORT_CURSOR_SIGNATURE_PATTERN.test(suppliedSignature)
    ) {
      throw new Error("Malformed reporting cursor");
    }

    const payloadBytes = Buffer.from(encodedPayload, "base64url");
    if (payloadBytes.toString("base64url") !== encodedPayload) throw new Error("Malformed reporting cursor");

    const expectedSignature = createHmac("sha256", getCursorSigningSecret())
      .update(encodedPayload, "utf8")
      .digest();
    const actualSignature = Buffer.from(suppliedSignature, "base64url");
    if (
      actualSignature.length !== expectedSignature.length ||
      actualSignature.toString("base64url") !== suppliedSignature ||
      !timingSafeEqual(actualSignature, expectedSignature)
    ) {
      throw new Error("Invalid reporting cursor signature");
    }

    const decoded: unknown = JSON.parse(payloadBytes.toString("utf8"));
    const parsed = cursorPayloadSchema.safeParse(decoded);
    if (!parsed.success) throw new Error("Invalid reporting cursor");
    const now = Date.now();
    const { data } = parsed;
    if (
      data.context.actorId !== context.actorId.toLowerCase() ||
      data.context.hospitalId !== context.hospitalId.toLowerCase() ||
      data.context.pageSize !== context.pageSize ||
      data.context.ordering !== REPORT_CURSOR_ORDERING ||
      data.context.operation !== context.operation ||
      data.expiresAt <= now ||
      data.issuedAt > now + 30_000 ||
      data.expiresAt <= data.issuedAt ||
      data.expiresAt - data.issuedAt > REPORT_CURSOR_TTL_MS
    ) {
      throw new Error("Reporting cursor context or expiry is invalid");
    }
    return { startedAt: new Date(data.startedAt), id: data.id };
  } catch (error: unknown) {
    if (error instanceof InfrastructureError) throw error;
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
      category: template?.activities.find((activity) => activity.code === item.activityCode)?.category ?? null,
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
  serviceDate: Date | null;
  planAdjusted: boolean | null;
  hasObstacle: boolean | null;
  weight: number | null;
  waistCircumference: number | null;
  systolicBloodPressure: number | null;
  diastolicBloodPressure: number | null;
  bloodSugar: number | null;
  sourceGoalPlan: {
    templateKey: string;
    templateVersion: string;
    items: readonly { activityCode: string; targetDays: number }[];
  } | null;
  activityProgress: readonly {
    goalActivityCode: string;
    status: HospitalReportFollowup["activityProgress"][number]["status"];
    achievedDays: number | null;
  }[];
}): HospitalReportFollowup {
  const template = record.sourceGoalPlan
    ? getGoalTemplate(record.sourceGoalPlan.templateKey, record.sourceGoalPlan.templateVersion)
    : null;
  return {
    id: record.id,
    roundNumber: record.roundNumber,
    recordedAt: record.recordedAt.toISOString(),
    serviceDate: record.serviceDate ? record.serviceDate.toISOString().slice(0, 10) : null,
    planAdjusted: record.planAdjusted,
    hasObstacle: record.hasObstacle,
    achievement: record.sourceGoalPlan
      ? computeFollowupAchievement(record.activityProgress, record.sourceGoalPlan.items)
      : null,
    measurements: toMeasurementSet(record),
    activityProgress: record.activityProgress.map((item) => ({
      activityCode: item.goalActivityCode,
      activityLabel: template?.activities.find((activity) => activity.code === item.goalActivityCode)?.label
        ?? "กิจกรรมที่บันทึก",
      status: item.status,
      achievedDays: item.achievedDays,
    })),
  };
}

type ReportRoundVitalsRecord = HospitalReportProgramRecord["roundVitals"][number];

function toRoundVitals(record: ReportRoundVitalsRecord | undefined): HospitalReportProgramRow["roundVitals"]["round1"] {
  return toRecord(
    record
      ? {
          serviceDate: record.serviceDate.toISOString().slice(0, 10),
          measurements: toMeasurementSet(record),
          heightCm: toFact(record.heightCm),
        }
      : null,
  );
}

function toBmiFact(weightKg: number | null, heightCm: number | null): HospitalReportFact<number> {
  return toFact(calculateBodyMassIndex(weightKg, heightCm));
}

function toScreeningRecord(
  screening: HospitalReportProgramRecord["screeningAssessment"],
): HospitalReportProgramRow["screening"] {
  const result = screening ? screeningResultSchema.safeParse(screening.result) : null;

  return toRecord(
    screening && result?.success
      ? {
          submittedAt: screening.submittedAt.toISOString(),
          pamScore: result.data.pamTotal,
          promsScore: result.data.promsTotal,
        }
      : null,
  );
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
  const round1 = record.roundVitals.find((vitals) => vitals.roundNumber === 1);
  const round2 = record.roundVitals.find((vitals) => vitals.roundNumber === 2);
  const latestHeightCm = round2?.heightCm ?? round1?.heightCm ?? baseline?.heightCm ?? null;

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
            serviceDate: finalAssessment.serviceDate ? finalAssessment.serviceDate.toISOString().slice(0, 10) : null,
            measurements: toMeasurementSet(finalAssessment),
            hba1c: toFact(finalAssessment.hba1c),
          }
        : null,
    ),
    roundVitals: { round1: toRoundVitals(round1), round2: toRoundVitals(round2) },
    latestHeightCm: toFact(latestHeightCm),
    bmi: {
      baseline: toBmiFact(baseline?.weight ?? null, baseline?.heightCm ?? null),
      after: toBmiFact(finalAssessment?.weight ?? null, latestHeightCm),
    },
    screening: toScreeningRecord(record.screeningAssessment),
    unavailable: {
      illnessDuration: "SOURCE_MISSING",
      baselineCvdRiskScore: "SOURCE_MISSING",
      afterCvdRiskScore: "SOURCE_MISSING",
      beforeWeeklyExercise: "NOT_PROGRAM_SCOPED",
      afterWeeklyExercise: "NOT_PROGRAM_SCOPED",
      achievementRate: "DERIVATION_UNAPPROVED",
      outcome: "SOURCE_MISSING",
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
): Promise<HospitalReportingSummary> {
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

type ParentChildHospitalReportingSourceSnapshot = {
  dashboard: HospitalReportingSummary;
  serviceProcess: {
    programsWithRoutineRecord: number;
    programsWithFloatingChartRecord: number;
    programsWithDreamCardRecord: number;
    programsWithConfidenceRecord: number;
  };
};

async function loadParentChildHospitalReportingSourceSnapshot(
  database: HospitalReportQueryDatabase,
  hospitalId: string,
): Promise<ParentChildHospitalReportingSourceSnapshot> {
  const programWhere = reportHospitalProgramWhere(hospitalId);
  const serviceProcessWhere = { patientProgram: { is: programWhere } };
  const [dashboard, programsWithRoutineRecord, programsWithFloatingChartRecord,
    programsWithDreamCardRecord, programsWithConfidenceRecord] = await Promise.all([
    loadSummary(database, hospitalId),
    database.patientProgramServiceOneRoutine.count({ where: serviceProcessWhere }),
    database.patientProgramServiceOneFloatingChart.count({ where: serviceProcessWhere }),
    database.patientProgramServiceOneDreamCard.count({ where: serviceProcessWhere }),
    database.patientProgramServiceOneConfidence.count({ where: serviceProcessWhere }),
  ]);

  return {
    dashboard,
    serviceProcess: {
      programsWithRoutineRecord,
      programsWithFloatingChartRecord,
      programsWithDreamCardRecord,
      programsWithConfidenceRecord,
    },
  };
}

function projectParentChildHospitalReportingContent(
  source: ParentChildHospitalReportingSourceSnapshot,
): ParentChildHospitalReportingProjection["content"] {
  return {
    state: "AVAILABLE",
    dashboard: { state: "AVAILABLE", value: source.dashboard },
    serviceProcess: {
      state: "AVAILABLE",
      value: {
        programsWithRoutineRecord: {
          grain: "PATIENT_PROGRAM",
          value: source.serviceProcess.programsWithRoutineRecord,
        },
        programsWithFloatingChartRecord: {
          grain: "PATIENT_PROGRAM",
          value: source.serviceProcess.programsWithFloatingChartRecord,
        },
        programsWithDreamCardRecord: {
          grain: "PATIENT_PROGRAM",
          value: source.serviceProcess.programsWithDreamCardRecord,
        },
        programsWithConfidenceRecord: {
          grain: "PATIENT_PROGRAM",
          value: source.serviceProcess.programsWithConfidenceRecord,
        },
      },
    },
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

type AuthorizedHospitalReportScope = {
  actor: ActorContext;
  hospital: {
    id: string;
    hospitalCode: string;
    name: string;
    status: HospitalStatus;
  };
  operation: ReportScopeOperation;
};

async function resolveAuthorizedHospitalReportScope(
  actor: ActorContext | null | undefined,
  hospitalId: string,
  operation: ReportScopeOperation,
  purpose: "page" | "export",
  database: HospitalReportQueryDatabase,
): Promise<AuthorizedHospitalReportScope> {
  if (operation === "GLOBAL_ADMIN") {
    const access = await resolveGlobalReportingAccessContext(
      actor,
      purpose === "export"
        ? GLOBAL_REPORTING_CAPABILITIES.export
        : GLOBAL_REPORTING_CAPABILITIES.hospitalRead,
      hospitalId,
      database,
    );
    if (!access.hospital) throw new NotFoundError();
    return { actor: access.actor, hospital: access.hospital, operation };
  }

  const access = await resolveHospitalReportingAccessContext(
    actor,
    hospitalId,
    purpose === "export"
      ? HOSPITAL_REPORT_CAPABILITIES.export
      : HOSPITAL_REPORT_CAPABILITIES.dashboardRead,
    database,
  );
  return { actor: access.actor, hospital: access.hospital, operation };
}

async function loadHospitalReportingPage(
  actor: ActorContext | null | undefined,
  request: ReturnType<typeof hospitalReportPageRequestSchema.parse>,
  database: HospitalReportQueryDatabase,
  operation: ReportScopeOperation,
): Promise<HospitalReportingPageProjection> {
  const access = await resolveAuthorizedHospitalReportScope(
    actor,
    request.hospitalId,
    operation,
    "page",
    database,
  );
  if (operation === "HOSPITAL_OWNER") {
    assertHospitalReportPolicy({
      actor: access.actor,
      capability: HOSPITAL_REPORT_CAPABILITIES.rowRead,
      target: { hospitalId: access.hospital.id, hospitalStatus: access.hospital.status },
    });
  }

  const pageSize = request.pageSize ?? HOSPITAL_REPORT_DEFAULT_PAGE_SIZE;
  const cursor = decodeCursor(request.cursor, {
    actorId: access.actor.userId,
    hospitalId: access.hospital.id,
    pageSize,
    operation: access.operation,
  });
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
      nextCursor: hasMore && lastRecord ? encodeCursor(lastRecord, {
        actorId: access.actor.userId,
        hospitalId: access.hospital.id,
        pageSize,
        operation: access.operation,
      }) : null,
    },
  };
}

async function getHospitalReportingPageForOperation(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: HospitalReportQueryDependencies = {},
  operation: ReportScopeOperation,
): Promise<HospitalReportingPageProjection> {
  const parsed = hospitalReportPageRequestSchema.safeParse(input);
  if (!parsed.success) throw new NotFoundError();

  try {
    const database = dependencies.database ?? getPrisma();
    const projection = await runConsistentRead(database, (transaction) =>
      loadHospitalReportingPage(actor, parsed.data, transaction, operation),
    );
    await resolveAuthorizedHospitalReportScope(
      actor,
      parsed.data.hospitalId,
      operation,
      "page",
      database,
    );
    return projection;
  } catch (error: unknown) {
    if (
      error instanceof ForbiddenError ||
      error instanceof NotFoundError ||
      error instanceof InfrastructureError
    ) {
      throw error;
    }
    throw new InfrastructureError("Hospital reporting data could not be loaded");
  }
}

export async function getHospitalReportingPage(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: HospitalReportQueryDependencies = {},
): Promise<HospitalReportingPageProjection> {
  return getHospitalReportingPageForOperation(actor, input, dependencies, "HOSPITAL_OWNER");
}

export async function getGlobalAdminHospitalReportingPage(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: HospitalReportQueryDependencies = {},
): Promise<HospitalReportingPageProjection> {
  return getHospitalReportingPageForOperation(actor, input, dependencies, "GLOBAL_ADMIN");
}

/**
 * Resolve one exact Child target and return only its approved Hospital-level summary fields.
 */
export async function getParentChildHospitalReportingPage(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: HospitalReportQueryDependencies = {},
): Promise<ParentChildHospitalReportingProjection> {
  const parsed = parentChildHospitalReportRequestSchema.safeParse(input);
  if (!parsed.success) throw new NotFoundError();

  const database = dependencies.database ?? getPrisma();
  let projection: ParentChildHospitalReportingProjection;
  try {
    projection = await runConsistentRead(database, async (transaction) => {
      const access = await resolveParentChildHospitalReportAccessContext(
        actor,
        parsed.data.parentHospitalId,
        parsed.data.hospitalId,
        transaction,
      );
      const target = await transaction.hospital.findFirst({
        where: {
          id: access.hospital.id,
          status: HospitalStatus.ACTIVE,
          parentHospitalId: access.parentHospitalId,
          parentHospital: {
            is: {
              id: access.parentHospitalId,
              status: HospitalStatus.ACTIVE,
              parentHospitalId: null,
            },
          },
        },
        select: {
          id: true,
          name: true,
          parentHospital: { select: { id: true, name: true } },
        },
      });
      if (!target?.parentHospital) throw new NotFoundError();

      const source = await loadParentChildHospitalReportingSourceSnapshot(transaction, target.id);

      return {
        operation: "PARENT_CHILD_REPORT",
        access: "PARENT_OWNER",
        parent: target.parentHospital,
        hospital: { id: target.id, name: target.name },
        content: projectParentChildHospitalReportingContent(source),
      } satisfies ParentChildHospitalReportingProjection;
    });

    await resolveParentChildHospitalReportAccessContext(
      actor,
      parsed.data.parentHospitalId,
      parsed.data.hospitalId,
      database,
    );
  } catch (error: unknown) {
    try {
      const denied = error instanceof ForbiddenError || error instanceof NotFoundError;
      await recordParentChildHospitalReportingAudit({
        actor,
        parentHospitalId: parsed.data.parentHospitalId,
        hospitalId: parsed.data.hospitalId,
        outcome: denied ? "denied" : "failed",
        reason: parentChildHospitalReportingAuditReasonForError(error),
      }, database);
    } catch {
      throw new InfrastructureError("Parent-to-Child Hospital report could not be loaded");
    }

    if (
      error instanceof ForbiddenError ||
      error instanceof NotFoundError ||
      error instanceof InfrastructureError
    ) {
      throw error;
    }
    throw new InfrastructureError("Parent-to-Child Hospital report could not be loaded");
  }

  try {
    await recordParentChildHospitalReportingAudit({
      actor,
      parentHospitalId: parsed.data.parentHospitalId,
      hospitalId: parsed.data.hospitalId,
      outcome: "read",
    }, database);
  } catch {
    throw new InfrastructureError("Parent-to-Child Hospital report could not be loaded");
  }

  return projection;
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
  operation: ReportScopeOperation,
): Promise<HospitalReportingDataset> {
  const access = await resolveAuthorizedHospitalReportScope(
    actor,
    hospitalId,
    operation,
    "export",
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

async function getHospitalReportingDatasetForOperation(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: HospitalReportQueryDependencies = {},
  operation: ReportScopeOperation,
): Promise<HospitalReportingDataset> {
  const parsed = hospitalReportExportRequestSchema.safeParse(input);
  if (!parsed.success) throw new NotFoundError();

  try {
    const database = dependencies.database ?? getPrisma();
    const dataset = await runConsistentRead(database, (transaction) =>
      loadHospitalReportingDataset(actor, parsed.data.hospitalId, transaction, operation),
    );
    if (operation === "GLOBAL_ADMIN") {
      await resolveAuthorizedHospitalReportScope(
        actor,
        parsed.data.hospitalId,
        operation,
        "export",
        database,
      );
    }
    return dataset;
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

export async function getHospitalReportingDatasetForExport(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: HospitalReportQueryDependencies = {},
): Promise<HospitalReportingDataset> {
  return getHospitalReportingDatasetForOperation(actor, input, dependencies, "HOSPITAL_OWNER");
}

export async function getGlobalAdminHospitalReportingDatasetForExport(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: HospitalReportQueryDependencies = {},
): Promise<HospitalReportingDataset> {
  return getHospitalReportingDatasetForOperation(actor, input, dependencies, "GLOBAL_ADMIN");
}

export const hospitalReportQueryInternals = {
  assertExportBounds,
  countExportSourceRows,
  countProgramRelatedRows,
  reportCursorWhere,
  reportHospitalProgramWhere,
  toFact,
  toHospitalReportProgramRow,
  toMeasurementSet,
  toUnavailable,
  hospitalReportPageProgramSelect,
  hospitalReportExportProgramSelect,
};
