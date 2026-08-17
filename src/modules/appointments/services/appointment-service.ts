import "server-only";

import {
  AppointmentStatus,
  MembershipStatus,
  Prisma,
  UserStatus,
  type PrismaClient,
} from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import {
  ApplicationError,
  ConflictError,
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors/application-error";

import { APPOINTMENT_MANAGE_CAPABILITY } from "../policies/appointment-policy";
import type { AppointmentLocationValue } from "../domain/appointment-definitions";
import {
  appointmentCreateRequestSchema,
  appointmentRescheduleRequestSchema,
  appointmentTransitionRequestSchema,
  type AppointmentCreateRequest,
  type AppointmentRescheduleRequest,
  type AppointmentTransitionRequest,
} from "../schemas/appointment-schemas";
import { resolveAppointmentAccessContext } from "./appointment-access-service";

export type AppointmentDatabase = PrismaClient;

export type AppointmentServiceDependencies = {
  database?: AppointmentDatabase;
  now?: () => Date;
  transactionRetries?: number;
};

export type AppointmentMutationResult = {
  appointmentId: string;
  patientHospitalRelationshipId: string;
  hospitalId: string;
  status: AppointmentStatus;
  createdAt: Date;
  updatedAt: Date;
};

type NormalizedAppointmentFields = {
  scheduledAt: Date;
  type: AppointmentCreateRequest["type"];
  responsibleUserId: string | null;
  durationMinutes: number | null;
  locationType: AppointmentLocationValue | null;
  locationDetail: string | null;
  note: string | null;
};

const DEFAULT_TRANSACTION_RETRIES = 2;

const appointmentRetrySelect = {
  id: true,
  patientHospitalRelationshipId: true,
  responsibleUserId: true,
  createdByUserId: true,
  type: true,
  scheduledAt: true,
  durationMinutes: true,
  locationType: true,
  locationDetail: true,
  note: true,
  status: true,
  submissionNonce: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PatientAppointmentSelect;

type AppointmentRetryRecord = Prisma.PatientAppointmentGetPayload<{
  select: typeof appointmentRetrySelect;
}>;

const appointmentMutationSelect = {
  id: true,
  patientHospitalRelationshipId: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PatientAppointmentSelect;

type AppointmentMutationRecord = Prisma.PatientAppointmentGetPayload<{
  select: typeof appointmentMutationSelect;
}>;

function getDatabase(dependencies: AppointmentServiceDependencies): AppointmentDatabase {
  return dependencies.database ?? getPrisma();
}

function getNow(dependencies: AppointmentServiceDependencies): Date {
  const now = dependencies.now ? dependencies.now() : new Date();
  const copy = new Date(now.getTime());

  if (Number.isNaN(copy.getTime())) {
    throw new InfrastructureError("Appointment time could not be resolved");
  }

  return copy;
}

function isKnownRequestError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

function isRetryableTransactionError(error: unknown): boolean {
  return isKnownRequestError(error, "P2034") || isKnownRequestError(error, "P2002");
}

function normalizeDatabaseError(error: unknown): ApplicationError {
  if (error instanceof ApplicationError) {
    return error;
  }

  if (isRetryableTransactionError(error)) {
    return new ConflictError("The Appointment operation conflicted with another request");
  }

  return new InfrastructureError("Appointment could not be saved");
}

async function runSerializable<T>(
  database: AppointmentDatabase,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  retryLimit: number,
): Promise<T> {
  let retryCount = 0;

  while (true) {
    try {
      return await database.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error: unknown) {
      if (!isRetryableTransactionError(error) || retryCount >= retryLimit) {
        throw error;
      }

      retryCount += 1;
    }
  }
}

function toDate(value: string, label: string): Date {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError(`${label} is invalid`);
  }

  return parsed;
}

function nullableText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeAppointmentFields(
  input: AppointmentCreateRequest | AppointmentRescheduleRequest,
): NormalizedAppointmentFields {
  return {
    scheduledAt: toDate(input.scheduledAt, "Appointment scheduled time"),
    type: input.type,
    responsibleUserId: input.responsibleUserId ?? null,
    durationMinutes: input.durationMinutes ?? null,
    locationType: input.locationType ?? null,
    locationDetail: nullableText(input.locationDetail),
    note: nullableText(input.note),
  };
}

function toMutationResult(
  record: AppointmentMutationRecord,
  hospitalId: string,
): AppointmentMutationResult {
  return {
    appointmentId: record.id,
    patientHospitalRelationshipId: record.patientHospitalRelationshipId,
    hospitalId,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function hasSameCreatePayload(
  existing: AppointmentRetryRecord,
  actor: ActorContext,
  input: AppointmentCreateRequest,
  fields: NormalizedAppointmentFields,
): boolean {
  return (
    existing.patientHospitalRelationshipId === input.patientHospitalRelationshipId &&
    existing.createdByUserId === actor.userId &&
    existing.submissionNonce === input.submissionNonce &&
    existing.type === fields.type &&
    existing.scheduledAt.getTime() === fields.scheduledAt.getTime() &&
    existing.responsibleUserId === fields.responsibleUserId &&
    existing.durationMinutes === fields.durationMinutes &&
    existing.locationType === fields.locationType &&
    existing.locationDetail === fields.locationDetail &&
    existing.note === fields.note
  );
}

async function assertResponsibleUserIsEligible(
  transaction: Prisma.TransactionClient,
  hospitalId: string,
  responsibleUserId: string | null,
): Promise<void> {
  if (!responsibleUserId) {
    return;
  }

  const membership = await transaction.hospitalMembership.findFirst({
    where: {
      userId: responsibleUserId,
      hospitalId,
      status: MembershipStatus.ACTIVE,
      user: { status: UserStatus.ACTIVE },
    },
    select: { userId: true },
  });

  if (!membership) {
    throw new ValidationError("The selected responsible person is not eligible for this Hospital");
  }
}

async function createInTransaction(
  transaction: Prisma.TransactionClient,
  actor: ActorContext,
  input: AppointmentCreateRequest,
  now: Date,
): Promise<AppointmentMutationResult> {
  const access = await resolveAppointmentAccessContext(
    actor,
    input.patientHospitalRelationshipId,
    APPOINTMENT_MANAGE_CAPABILITY,
    transaction,
  );
  const fields = normalizeAppointmentFields(input);

  await assertResponsibleUserIsEligible(transaction, access.target.hospitalId, fields.responsibleUserId);

  const existing = await transaction.patientAppointment.findUnique({
    where: { submissionNonce: input.submissionNonce },
    select: appointmentRetrySelect,
  });

  if (existing) {
    if (!hasSameCreatePayload(existing, actor, input, fields)) {
      throw new ConflictError("This Appointment submission token has already been used");
    }

    return toMutationResult(existing, access.target.hospitalId);
  }

  const appointment = await transaction.patientAppointment.create({
    data: {
      patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
      responsibleUserId: fields.responsibleUserId,
      createdByUserId: actor.userId,
      type: fields.type,
      scheduledAt: fields.scheduledAt,
      durationMinutes: fields.durationMinutes,
      locationType: fields.locationType,
      locationDetail: fields.locationDetail,
      note: fields.note,
      status: AppointmentStatus.SCHEDULED,
      submissionNonce: input.submissionNonce,
      createdAt: now,
      updatedAt: now,
    },
    select: appointmentMutationSelect,
  });

  await recordAuditEvent(
    {
      actorUserId: actor.userId,
      action: "appointment.created",
      resourceType: "PatientAppointment",
      resourceId: appointment.id,
      metadata: {
        appointmentId: appointment.id,
        patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
        hospitalId: access.target.hospitalId,
        toStatus: AppointmentStatus.SCHEDULED,
      },
    },
    transaction,
  );

  return toMutationResult(appointment, access.target.hospitalId);
}

export async function createAppointment(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: AppointmentServiceDependencies = {},
): Promise<AppointmentMutationResult> {
  const parsed = appointmentCreateRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Appointment submission data is invalid");
  }

  if (!actor) {
    throw new ForbiddenError();
  }

  try {
    return await runSerializable(
      getDatabase(dependencies),
      (transaction) => createInTransaction(transaction, actor, parsed.data, getNow(dependencies)),
      dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES,
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error);
  }
}

function nextUpdatedAt(current: Date, now: Date): Date {
  return new Date(Math.max(current.getTime() + 1, now.getTime()));
}

async function rescheduleInTransaction(
  transaction: Prisma.TransactionClient,
  actor: ActorContext,
  input: AppointmentRescheduleRequest,
  now: Date,
): Promise<AppointmentMutationResult> {
  const access = await resolveAppointmentAccessContext(
    actor,
    input.patientHospitalRelationshipId,
    APPOINTMENT_MANAGE_CAPABILITY,
    transaction,
  );
  const fields = normalizeAppointmentFields(input);
  const expectedUpdatedAt = toDate(input.expectedUpdatedAt, "Appointment version");

  await assertResponsibleUserIsEligible(transaction, access.target.hospitalId, fields.responsibleUserId);

  const current = await transaction.patientAppointment.findFirst({
    where: {
      id: input.appointmentId,
      patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
    },
    select: appointmentRetrySelect,
  });

  if (!current) {
    throw new NotFoundError();
  }

  if (current.status !== AppointmentStatus.SCHEDULED) {
    throw new ConflictError("Only a scheduled Appointment can be rescheduled");
  }

  if (current.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
    throw new ConflictError("This Appointment changed before it was rescheduled");
  }

  const updatedAt = nextUpdatedAt(current.updatedAt, now);
  const updated = await transaction.patientAppointment.updateMany({
    where: {
      id: current.id,
      patientHospitalRelationshipId: current.patientHospitalRelationshipId,
      status: AppointmentStatus.SCHEDULED,
      updatedAt: current.updatedAt,
    },
    data: {
      type: fields.type,
      scheduledAt: fields.scheduledAt,
      responsibleUserId: fields.responsibleUserId,
      durationMinutes: fields.durationMinutes,
      locationType: fields.locationType,
      locationDetail: fields.locationDetail,
      note: fields.note,
      updatedAt,
    },
  });

  if (updated.count !== 1) {
    throw new ConflictError("This Appointment changed before it was rescheduled");
  }

  const result = await transaction.patientAppointment.findFirst({
    where: { id: current.id, patientHospitalRelationshipId: current.patientHospitalRelationshipId },
    select: appointmentMutationSelect,
  });

  if (!result) {
    throw new InfrastructureError("The rescheduled Appointment could not be read");
  }

  await recordAuditEvent(
    {
      actorUserId: actor.userId,
      action: "appointment.rescheduled",
      resourceType: "PatientAppointment",
      resourceId: result.id,
      metadata: {
        appointmentId: result.id,
        patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
        hospitalId: access.target.hospitalId,
        fromStatus: AppointmentStatus.SCHEDULED,
        toStatus: AppointmentStatus.SCHEDULED,
      },
    },
    transaction,
  );

  return toMutationResult(result, access.target.hospitalId);
}

export async function rescheduleAppointment(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: AppointmentServiceDependencies = {},
): Promise<AppointmentMutationResult> {
  const parsed = appointmentRescheduleRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Appointment reschedule data is invalid");
  }

  if (!actor) {
    throw new ForbiddenError();
  }

  try {
    return await runSerializable(
      getDatabase(dependencies),
      (transaction) => rescheduleInTransaction(transaction, actor, parsed.data, getNow(dependencies)),
      dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES,
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error);
  }
}

type TerminalTransition = {
  status: AppointmentStatus;
  action: "appointment.cancelled" | "appointment.completed" | "appointment.no_show";
};

async function terminalTransitionInTransaction(
  transaction: Prisma.TransactionClient,
  actor: ActorContext,
  input: AppointmentTransitionRequest,
  transition: TerminalTransition,
  now: Date,
): Promise<AppointmentMutationResult> {
  const access = await resolveAppointmentAccessContext(
    actor,
    input.patientHospitalRelationshipId,
    APPOINTMENT_MANAGE_CAPABILITY,
    transaction,
  );
  const expectedUpdatedAt = toDate(input.expectedUpdatedAt, "Appointment version");
  const current = await transaction.patientAppointment.findFirst({
    where: {
      id: input.appointmentId,
      patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
    },
    select: appointmentRetrySelect,
  });

  if (!current) {
    throw new NotFoundError();
  }

  if (current.status === transition.status) {
    return toMutationResult(current, access.target.hospitalId);
  }

  if (current.status !== AppointmentStatus.SCHEDULED) {
    throw new ConflictError("This Appointment is already in a terminal state");
  }

  if (current.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
    throw new ConflictError("This Appointment changed before the status update");
  }

  if (transition.status === AppointmentStatus.NO_SHOW && current.scheduledAt.getTime() > now.getTime()) {
    throw new ConflictError("An Appointment cannot be marked no-show before its scheduled time");
  }

  const updatedAt = nextUpdatedAt(current.updatedAt, now);
  const updated = await transaction.patientAppointment.updateMany({
    where: {
      id: current.id,
      patientHospitalRelationshipId: current.patientHospitalRelationshipId,
      status: AppointmentStatus.SCHEDULED,
      updatedAt: current.updatedAt,
    },
    data: {
      status: transition.status,
      updatedAt,
    },
  });

  if (updated.count !== 1) {
    throw new ConflictError("This Appointment changed before the status update");
  }

  const result = await transaction.patientAppointment.findFirst({
    where: { id: current.id, patientHospitalRelationshipId: current.patientHospitalRelationshipId },
    select: appointmentMutationSelect,
  });

  if (!result) {
    throw new InfrastructureError("The Appointment status update could not be read");
  }

  await recordAuditEvent(
    {
      actorUserId: actor.userId,
      action: transition.action,
      resourceType: "PatientAppointment",
      resourceId: result.id,
      metadata: {
        appointmentId: result.id,
        patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
        hospitalId: access.target.hospitalId,
        fromStatus: AppointmentStatus.SCHEDULED,
        toStatus: transition.status,
      },
    },
    transaction,
  );

  return toMutationResult(result, access.target.hospitalId);
}

async function transitionAppointment(
  actor: ActorContext | null | undefined,
  input: unknown,
  transition: TerminalTransition,
  dependencies: AppointmentServiceDependencies,
): Promise<AppointmentMutationResult> {
  const parsed = appointmentTransitionRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Appointment status update data is invalid");
  }

  if (!actor) {
    throw new ForbiddenError();
  }

  try {
    return await runSerializable(
      getDatabase(dependencies),
      (transaction) =>
        terminalTransitionInTransaction(
          transaction,
          actor,
          parsed.data,
          transition,
          getNow(dependencies),
        ),
      dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES,
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error);
  }
}

export async function cancelAppointment(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: AppointmentServiceDependencies = {},
): Promise<AppointmentMutationResult> {
  return transitionAppointment(
    actor,
    input,
    { status: AppointmentStatus.CANCELLED, action: "appointment.cancelled" },
    dependencies,
  );
}

export async function completeAppointment(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: AppointmentServiceDependencies = {},
): Promise<AppointmentMutationResult> {
  return transitionAppointment(
    actor,
    input,
    { status: AppointmentStatus.COMPLETED, action: "appointment.completed" },
    dependencies,
  );
}

export async function markAppointmentNoShow(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: AppointmentServiceDependencies = {},
): Promise<AppointmentMutationResult> {
  return transitionAppointment(
    actor,
    input,
    { status: AppointmentStatus.NO_SHOW, action: "appointment.no_show" },
    dependencies,
  );
}

export const appointmentServiceInternals = {
  assertResponsibleUserIsEligible,
  createInTransaction,
  hasSameCreatePayload,
  isRetryableTransactionError,
  nextUpdatedAt,
  normalizeAppointmentFields,
  normalizeDatabaseError,
  runSerializable,
  terminalTransitionInTransaction,
};
