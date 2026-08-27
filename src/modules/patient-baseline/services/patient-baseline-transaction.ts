import "server-only";

import { PatientProgramStatus, Prisma } from "@prisma/client";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import { ConflictError } from "@/shared/errors/application-error";

import { PATIENT_BASELINE_CREATE_CAPABILITY } from "../policies/patient-baseline-policy";
import {
  dateOnlyToUtcDate,
  type PatientBaselineCreateRequest,
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

export const patientBaselineTransactionInternals = {
  normalizeInput,
  nullableText,
  toCreateResult,
};
