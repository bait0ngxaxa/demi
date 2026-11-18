import "server-only";

import { PatientProgramStatus, Prisma } from "@prisma/client";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import { ConflictError, NotFoundError } from "@/shared/errors/application-error";

import {
  PATIENT_BASELINE_LOCKED_MESSAGE,
  PATIENT_BASELINE_STALE_MESSAGE,
} from "../domain/patient-baseline-edit-lock";
import { PATIENT_BASELINE_CREATE_CAPABILITY } from "../policies/patient-baseline-policy";
import {
  dateOnlyToUtcDate,
  type PatientBaselineCreateRequest,
  type PatientBaselineUpdateRequest,
} from "../schemas/patient-baseline-schemas";
import { resolvePatientBaselineAccessContext } from "./patient-baseline-access-service";

export type PatientBaselineCreateResult = {
  patientBaselineId: string;
  patientHospitalRelationshipId: string;
  hospitalId: string;
  recordedByUserId: string;
  recordedOn: Date;
  createdAt: Date;
};

export type PatientBaselineCreateSource = "ROSTER_IMPORT";

const patientBaselineMutationSelect = {
  id: true,
  patientHospitalRelationshipId: true,
  recordedByUserId: true,
  recordedOn: true,
  createdAt: true,
} satisfies Prisma.PatientBaselineSelect;

type PatientBaselineMutationRecord = Prisma.PatientBaselineGetPayload<{
  select: typeof patientBaselineMutationSelect;
}>;

type NormalizedPatientBaselineRequest = {
  patientHospitalRelationshipId: string;
  recordedOn: Date;
  weight: number | null;
  heightCm: number | null;
  waistCircumference: number | null;
  bloodPressureSystolic: number | null;
  bloodPressureDiastolic: number | null;
  bloodSugarDtx: number | null;
  hba1c: number | null;
  cvdRiskScore: number | null;
  adaptationSummary: string | null;
  adaptationObstacles: string | null;
  adaptationOpportunities: string | null;
  confidenceScore: number | null;
  confidenceImprovementPlan: string | null;
  summary: string | null;
  recommendations: string | null;
};

function nullableText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

function normalizeInput(input: PatientBaselineCreateRequest): NormalizedPatientBaselineRequest {
  return {
    patientHospitalRelationshipId: input.patientHospitalRelationshipId.toLowerCase(),
    recordedOn: dateOnlyToUtcDate(input.recordedOn),
    weight: input.weight ?? null,
    heightCm: input.heightCm ?? null,
    waistCircumference: input.waistCircumference ?? null,
    bloodPressureSystolic: input.bloodPressureSystolic ?? null,
    bloodPressureDiastolic: input.bloodPressureDiastolic ?? null,
    bloodSugarDtx: input.bloodSugarDtx ?? null,
    hba1c: input.hba1c ?? null,
    cvdRiskScore: input.cvdRiskScore ?? null,
    adaptationSummary: nullableText(input.adaptationSummary),
    adaptationObstacles: nullableText(input.adaptationObstacles),
    adaptationOpportunities: nullableText(input.adaptationOpportunities),
    confidenceScore: input.confidenceScore ?? null,
    confidenceImprovementPlan: nullableText(input.confidenceImprovementPlan),
    summary: nullableText(input.summary),
    recommendations: nullableText(input.recommendations),
  };
}

function toCreateResult(
  record: PatientBaselineMutationRecord,
  hospitalId: string,
): PatientBaselineCreateResult {
  return {
    patientBaselineId: record.id,
    patientHospitalRelationshipId: record.patientHospitalRelationshipId,
    hospitalId,
    recordedByUserId: record.recordedByUserId,
    recordedOn: record.recordedOn,
    createdAt: record.createdAt,
  };
}

export async function createPatientBaselineInTransaction(
  transaction: Prisma.TransactionClient,
  actor: ActorContext,
  input: PatientBaselineCreateRequest,
  now: Date,
  source?: PatientBaselineCreateSource,
): Promise<PatientBaselineCreateResult> {
  const normalized = normalizeInput(input);
  const access = await resolvePatientBaselineAccessContext(
    actor,
    normalized.patientHospitalRelationshipId,
    PATIENT_BASELINE_CREATE_CAPABILITY,
    transaction,
  );

  const existing = await transaction.patientBaseline.findUnique({
    where: {
      patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
    },
    select: { id: true },
  });

  if (existing) {
    throw new ConflictError("ข้อมูลตั้งต้นของความสัมพันธ์ผู้ป่วยนี้มีอยู่แล้ว");
  }

  const baseline = await transaction.patientBaseline.create({
    data: {
      patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
      recordedOn: normalized.recordedOn,
      recordedByUserId: access.actor.userId,
      weight: normalized.weight,
      heightCm: normalized.heightCm,
      waistCircumference: normalized.waistCircumference,
      bloodPressureSystolic: normalized.bloodPressureSystolic,
      bloodPressureDiastolic: normalized.bloodPressureDiastolic,
      bloodSugarDtx: normalized.bloodSugarDtx,
      hba1c: normalized.hba1c,
      cvdRiskScore: normalized.cvdRiskScore,
      adaptationSummary: normalized.adaptationSummary,
      adaptationObstacles: normalized.adaptationObstacles,
      adaptationOpportunities: normalized.adaptationOpportunities,
      confidenceScore: normalized.confidenceScore,
      confidenceImprovementPlan: normalized.confidenceImprovementPlan,
      summary: normalized.summary,
      recommendations: normalized.recommendations,
      createdAt: now,
    },
    select: patientBaselineMutationSelect,
  });

  // A Baseline may be recorded after an episode is opened. Link it only when
  // it has never been used by any episode, and only to the current ACTIVE
  // episode. Completed history is never retroactively changed.
  const previousUse = await transaction.patientProgram.findFirst({
    where: {
      patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
      initialBaselineId: baseline.id,
    },
    select: { id: true },
  });

  if (!previousUse) {
    await transaction.patientProgram.updateMany({
      where: {
        patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
        status: PatientProgramStatus.ACTIVE,
        initialBaselineId: null,
      },
      data: { initialBaselineId: baseline.id },
    });
  }

  await recordAuditEvent(
    {
      actorUserId: access.actor.userId,
      action: "patient_baseline.created",
      resourceType: "PatientBaseline",
      resourceId: baseline.id,
      metadata: {
        patientBaselineId: baseline.id,
        patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
        ...(source ? { source } : {}),
      },
    },
    transaction,
  );

  return toCreateResult(baseline, access.target.hospitalId);
}

/** Every value an edit replaces. The relationship and the recorder never change. */
const PATIENT_BASELINE_EDITABLE_FIELDS = [
  "recordedOn",
  "weight",
  "heightCm",
  "waistCircumference",
  "bloodPressureSystolic",
  "bloodPressureDiastolic",
  "bloodSugarDtx",
  "hba1c",
  "cvdRiskScore",
  "adaptationSummary",
  "adaptationObstacles",
  "adaptationOpportunities",
  "confidenceScore",
  "confidenceImprovementPlan",
  "summary",
  "recommendations",
] as const satisfies readonly (keyof NormalizedPatientBaselineRequest)[];

export type PatientBaselineEditableField = (typeof PATIENT_BASELINE_EDITABLE_FIELDS)[number];

const patientBaselineEditSelect = {
  id: true,
  updatedAt: true,
  recordedOn: true,
  weight: true,
  heightCm: true,
  waistCircumference: true,
  bloodPressureSystolic: true,
  bloodPressureDiastolic: true,
  bloodSugarDtx: true,
  hba1c: true,
  cvdRiskScore: true,
  adaptationSummary: true,
  adaptationObstacles: true,
  adaptationOpportunities: true,
  confidenceScore: true,
  confidenceImprovementPlan: true,
  summary: true,
  recommendations: true,
} satisfies Prisma.PatientBaselineSelect & Record<PatientBaselineEditableField, true>;

type PatientBaselineEditableValues = Pick<NormalizedPatientBaselineRequest, PatientBaselineEditableField>;

export type PatientBaselineUpdateResult = {
  outcome: "UPDATED" | "UNCHANGED";
  patientBaselineId: string;
  patientHospitalRelationshipId: string;
  hospitalId: string;
  recordedOn: Date;
  updatedAt: Date;
  changedFields: readonly PatientBaselineEditableField[];
};

function sameEditableValue(left: Date | number | string | null, right: Date | number | string | null): boolean {
  return left instanceof Date && right instanceof Date ? left.getTime() === right.getTime() : left === right;
}

function changedEditableFields(
  current: PatientBaselineEditableValues,
  next: PatientBaselineEditableValues,
): PatientBaselineEditableField[] {
  return PATIENT_BASELINE_EDITABLE_FIELDS.filter((field) => !sameEditableValue(current[field], next[field]));
}

function pickEditableValues(normalized: NormalizedPatientBaselineRequest): PatientBaselineEditableValues {
  return {
    recordedOn: normalized.recordedOn,
    weight: normalized.weight,
    heightCm: normalized.heightCm,
    waistCircumference: normalized.waistCircumference,
    bloodPressureSystolic: normalized.bloodPressureSystolic,
    bloodPressureDiastolic: normalized.bloodPressureDiastolic,
    bloodSugarDtx: normalized.bloodSugarDtx,
    hba1c: normalized.hba1c,
    cvdRiskScore: normalized.cvdRiskScore,
    adaptationSummary: normalized.adaptationSummary,
    adaptationObstacles: normalized.adaptationObstacles,
    adaptationOpportunities: normalized.adaptationOpportunities,
    confidenceScore: normalized.confidenceScore,
    confidenceImprovementPlan: normalized.confidenceImprovementPlan,
    summary: normalized.summary,
    recommendations: normalized.recommendations,
  };
}

/** True when a Program uses this Baseline as its initial Baseline: the Baseline is then read-only. */
export async function isPatientBaselineLinkedToProgram(
  transaction: Prisma.TransactionClient,
  patientBaselineId: string,
): Promise<boolean> {
  const program = await transaction.patientProgram.findFirst({
    where: { initialBaselineId: patientBaselineId },
    select: { id: true },
  });

  return program !== null;
}

/**
 * Replaces the editable values of a Baseline that no Program links yet. Must run inside a
 * Serializable transaction: opening a Program reads the Baseline and this edit reads the Program
 * link, so the two cannot both commit against stale views.
 */
export async function updatePatientBaselineInTransaction(
  transaction: Prisma.TransactionClient,
  actor: ActorContext,
  input: PatientBaselineUpdateRequest,
  now: Date,
): Promise<PatientBaselineUpdateResult> {
  const { expectedUpdatedAt, ...fields } = input;
  const normalized = normalizeInput(fields);
  const access = await resolvePatientBaselineAccessContext(
    actor,
    normalized.patientHospitalRelationshipId,
    PATIENT_BASELINE_CREATE_CAPABILITY,
    transaction,
  );
  const current = await transaction.patientBaseline.findUnique({
    where: { patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId },
    select: patientBaselineEditSelect,
  });

  if (!current) {
    throw new NotFoundError();
  }

  if (await isPatientBaselineLinkedToProgram(transaction, current.id)) {
    throw new ConflictError(PATIENT_BASELINE_LOCKED_MESSAGE);
  }

  const next = pickEditableValues(normalized);
  const changedFields = changedEditableFields(current, next);
  const expectedVersion = new Date(expectedUpdatedAt);
  const unchanged = {
    outcome: "UNCHANGED" as const,
    patientBaselineId: current.id,
    patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
    hospitalId: access.target.hospitalId,
    recordedOn: current.recordedOn,
    updatedAt: current.updatedAt,
    changedFields: [],
  };

  if (changedFields.length === 0) {
    // Nothing to write; a resend after an unconfirmed save that already applied lands here too.
    return unchanged;
  }

  // Strictly increasing, so two edits in the same millisecond still get distinct versions.
  const updatedAt = new Date(Math.max(now.getTime(), current.updatedAt.getTime() + 1));
  const written = await transaction.patientBaseline.updateMany({
    where: { id: current.id, updatedAt: expectedVersion },
    data: { ...next, updatedAt },
  });

  if (written.count !== 1) {
    throw new ConflictError(PATIENT_BASELINE_STALE_MESSAGE);
  }

  await recordAuditEvent(
    {
      actorUserId: access.actor.userId,
      action: "patient_baseline.updated",
      resourceType: "PatientBaseline",
      resourceId: current.id,
      metadata: {
        patientBaselineId: current.id,
        patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
        hospitalId: access.target.hospitalId,
        // Names only, never values. All 16 names joined are 251 characters (metadata limit 256).
        changedFields: changedFields.join(","),
      },
    },
    transaction,
  );

  return { ...unchanged, outcome: "UPDATED", recordedOn: next.recordedOn, updatedAt, changedFields };
}

export const patientBaselineTransactionInternals = {
  changedEditableFields,
  normalizeInput,
  pickEditableValues,
  nullableText,
  toCreateResult,
};
