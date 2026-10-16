import "server-only";

import { Prisma, type PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import { runSerializableTransaction } from "@/lib/db/serializable-transaction";
import { APPOINTMENT_READ_CAPABILITY } from "@/modules/appointments/policies/appointment-policy";
import { resolveAppointmentAccessContext } from "@/modules/appointments/services/appointment-access-service";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { resolvePersonalExerciseOwner } from "@/modules/exercises/services/personal-exercise-access-service";
import {
  ApplicationError,
  ConflictError,
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors/application-error";

import {
  PATIENT_SELF_MEASUREMENT_CARE_TEAM_LIST_LIMIT,
  PATIENT_SELF_MEASUREMENT_DELETE_WINDOW_MS,
  PATIENT_SELF_MEASUREMENT_OWN_LIST_LIMIT,
  canDeletePatientSelfMeasurement,
  isAcceptablePatientSelfMeasurementTime,
  type PatientSelfMeasurementDto,
} from "../domain/patient-self-measurement";
import {
  patientSelfMeasurementCreateSchema,
  patientSelfMeasurementIdSchema,
} from "../schemas/patient-self-measurement-schemas";

type Dependencies = { database?: PrismaClient; now?: () => Date };

export type OwnPatientSelfMeasurement = PatientSelfMeasurementDto & { canDelete: boolean };

const measurementSelect = {
  id: true,
  measuredAt: true,
  weight: true,
  systolicBloodPressure: true,
  diastolicBloodPressure: true,
  bloodSugar: true,
  note: true,
  createdAt: true,
} satisfies Prisma.PatientSelfMeasurementSelect;

type MeasurementRow = Prisma.PatientSelfMeasurementGetPayload<{ select: typeof measurementSelect }>;

function toDto(row: MeasurementRow): PatientSelfMeasurementDto {
  return {
    measurementId: row.id,
    measuredAt: row.measuredAt,
    weight: row.weight,
    systolicBloodPressure: row.systolicBloodPressure,
    diastolicBloodPressure: row.diastolicBloodPressure,
    bloodSugar: row.bloodSugar,
    note: row.note,
    createdAt: row.createdAt,
  };
}

function serverNow(deps: Dependencies): Date {
  const now = deps.now?.() ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new InfrastructureError();
  return new Date(now.getTime());
}

function normalizeError(error: unknown, message: string): Error {
  if (error instanceof ApplicationError) return error;
  if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || error.code === "P2034")) {
    return new ConflictError();
  }
  return new InfrastructureError(message);
}

/** Patient SELF create; a replayed submission nonce returns the first entry (idempotent). */
export async function createOwnPatientSelfMeasurement(
  actor: ActorContext | null | undefined,
  input: unknown,
  deps: Dependencies = {},
): Promise<{ outcome: "CREATED" | "REPLAY"; item: PatientSelfMeasurementDto }> {
  const parsed = patientSelfMeasurementCreateSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Self measurement data is invalid");
  const now = serverNow(deps);
  if (!isAcceptablePatientSelfMeasurementTime(parsed.data.measuredAt, now)) {
    throw new ValidationError("Self measurement time is outside the allowed range");
  }

  try {
    return await runSerializableTransaction(deps.database ?? getPrisma(), async (transaction) => {
      const patientProfileId = await resolvePersonalExerciseOwner(actor, transaction);
      const existing = await transaction.patientSelfMeasurement.findUnique({
        where: { patientProfileId_submissionNonce: { patientProfileId, submissionNonce: parsed.data.submissionNonce } },
        select: measurementSelect,
      });
      if (existing) return { outcome: "REPLAY" as const, item: toDto(existing) };

      const row = await transaction.patientSelfMeasurement.create({
        data: {
          patientProfileId,
          submissionNonce: parsed.data.submissionNonce,
          measuredAt: parsed.data.measuredAt,
          weight: parsed.data.weight,
          systolicBloodPressure: parsed.data.systolicBloodPressure,
          diastolicBloodPressure: parsed.data.diastolicBloodPressure,
          bloodSugar: parsed.data.bloodSugar,
          note: parsed.data.note,
          createdAt: now,
        },
        select: measurementSelect,
      });
      await recordAuditEvent({
        actorUserId: actor!.userId,
        action: "patient_self_measurement.created",
        resourceType: "PatientSelfMeasurement",
        resourceId: row.id,
      }, transaction);
      return { outcome: "CREATED" as const, item: toDto(row) };
    });
  } catch (error: unknown) {
    throw normalizeError(error, "Self measurement could not be saved");
  }
}

export async function listOwnPatientSelfMeasurements(
  actor: ActorContext | null | undefined,
  deps: Dependencies = {},
): Promise<OwnPatientSelfMeasurement[]> {
  const database = deps.database ?? getPrisma();
  try {
    const patientProfileId = await resolvePersonalExerciseOwner(actor, database);
    const now = serverNow(deps);
    const rows = await database.patientSelfMeasurement.findMany({
      where: { patientProfileId, deletedAt: null },
      orderBy: [{ measuredAt: "desc" }, { id: "desc" }],
      take: PATIENT_SELF_MEASUREMENT_OWN_LIST_LIMIT,
      select: measurementSelect,
    });
    return rows.map((row) => ({ ...toDto(row), canDelete: canDeletePatientSelfMeasurement(row.createdAt, now) }));
  } catch (error: unknown) {
    throw normalizeError(error, "Self measurements could not be loaded");
  }
}

/** Patient SELF soft delete within 24 hours of recording; otherwise the entry is immutable. */
export async function deleteOwnPatientSelfMeasurement(
  actor: ActorContext | null | undefined,
  measurementId: unknown,
  deps: Dependencies = {},
): Promise<void> {
  const parsedId = patientSelfMeasurementIdSchema.safeParse(measurementId);
  if (!parsedId.success) throw new NotFoundError();

  try {
    await runSerializableTransaction(deps.database ?? getPrisma(), async (transaction) => {
      const patientProfileId = await resolvePersonalExerciseOwner(actor, transaction);
      const now = serverNow(deps);
      const current = await transaction.patientSelfMeasurement.findFirst({
        where: { id: parsedId.data, patientProfileId, deletedAt: null },
        select: { id: true, createdAt: true },
      });
      if (!current) throw new NotFoundError();
      if (!canDeletePatientSelfMeasurement(current.createdAt, now)) {
        throw new ConflictError("Self measurement can no longer be deleted");
      }

      const deleted = await transaction.patientSelfMeasurement.updateMany({
        where: {
          id: current.id,
          patientProfileId,
          deletedAt: null,
          createdAt: { gt: new Date(now.getTime() - PATIENT_SELF_MEASUREMENT_DELETE_WINDOW_MS) },
        },
        data: { deletedAt: now, deletedByUserId: actor!.userId },
      });
      if (deleted.count !== 1) throw new ConflictError();

      await recordAuditEvent({
        actorUserId: actor!.userId,
        action: "patient_self_measurement.deleted",
        resourceType: "PatientSelfMeasurement",
        resourceId: current.id,
      }, transaction);
    });
  } catch (error: unknown) {
    throw normalizeError(error, "Self measurement could not be deleted");
  }
}

/** Read-only for the currently assigned OSM and staff of the exact Hospital of this relationship. */
export async function listPatientSelfMeasurementsForCareTeam(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  deps: Dependencies = {},
): Promise<PatientSelfMeasurementDto[]> {
  const database = deps.database ?? getPrisma();
  try {
    const access = await resolveAppointmentAccessContext(actor, relationshipId, APPOINTMENT_READ_CAPABILITY, database);
    if (!access.scopes.exactOsmAssignment && !access.scopes.directHospital) throw new ForbiddenError();

    const rows = await database.patientSelfMeasurement.findMany({
      where: {
        deletedAt: null,
        patientProfile: { hospitalRelationships: { some: { id: access.patient.patientHospitalRelationshipId } } },
      },
      orderBy: [{ measuredAt: "desc" }, { id: "desc" }],
      take: PATIENT_SELF_MEASUREMENT_CARE_TEAM_LIST_LIMIT,
      select: measurementSelect,
    });
    return rows.map(toDto);
  } catch (error: unknown) {
    throw normalizeError(error, "Self measurements could not be loaded");
  }
}
