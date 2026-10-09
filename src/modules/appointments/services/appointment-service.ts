import "server-only";

import { createHash } from "node:crypto";

import {
  AppointmentStatus,
  AppointmentCancellationRequestStatus,
  AppointmentInteractionSource,
  AppointmentLineNotificationEventKind,
  MembershipStatus,
  Prisma,
  Profession,
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

import {
  APPOINTMENT_ACKNOWLEDGE_CAPABILITY,
  APPOINTMENT_CREATE_CAPABILITY,
  APPOINTMENT_MANAGE_CAPABILITY,
  APPOINTMENT_RECORD_COORDINATION_CAPABILITY,
  APPOINTMENT_REQUEST_CANCEL_CAPABILITY,
} from "../policies/appointment-policy";
import type { AppointmentLocationValue } from "../domain/appointment-definitions";
import {
  getAppointmentLineNotificationRollout,
  type AppointmentLineNotificationRollout,
} from "../domain/appointment-line-notifications";
import {
  appointmentCreateRequestSchema,
  appointmentAcknowledgementRequestSchema,
  appointmentCancellationRequestSchema,
  appointmentCancellationReviewRequestSchema,
  appointmentCoordinationRequestSchema,
  appointmentRescheduleRequestSchema,
  appointmentTransitionRequestSchema,
  type AppointmentCreateRequest,
  type AppointmentRescheduleRequest,
  type AppointmentTransitionRequest,
} from "../schemas/appointment-schemas";
import { resolveAppointmentAccessContext } from "./appointment-access-service";
import { createAppointmentLineNotificationIntent } from "./appointment-line-notification-outbox-service";

export type AppointmentDatabase = PrismaClient;

export type AppointmentServiceDependencies = {
  database?: AppointmentDatabase;
  now?: () => Date;
  transactionRetries?: number;
  appointmentLineNotificationRollout?: AppointmentLineNotificationRollout;
};

export type AppointmentMutationResult = {
  appointmentId: string;
  patientHospitalRelationshipId: string;
  hospitalId: string;
  status: AppointmentStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type AppointmentAcknowledgementResult = {
  appointmentId: string;
  patientHospitalRelationshipId: string;
  source: AppointmentInteractionSource;
  sourceAppointmentUpdatedAt: Date;
  acknowledgedAt: Date;
};

export type AppointmentCancellationRequestResult = {
  requestId: string;
  appointmentId: string;
  patientHospitalRelationshipId: string;
  source: AppointmentInteractionSource;
  status: AppointmentCancellationRequestStatus;
  sourceAppointmentUpdatedAt: Date;
  submittedAt: Date;
};

export type AppointmentCoordinationResult = {
  eventId: string;
  appointmentId: string;
  patientHospitalRelationshipId: string;
  recordedAt: Date;
};

export type AppointmentCancellationReviewResult = {
  requestId: string;
  appointmentId: string;
  patientHospitalRelationshipId: string;
  requestStatus: AppointmentCancellationRequestStatus;
  appointmentStatus: AppointmentStatus;
  updatedAt: Date;
  wasSuperseded: boolean;
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
  createdByUserId: true,
  creationRequestHash: true,
  status: true,
  submissionNonce: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PatientAppointmentSelect;

type AppointmentRetryRecord = Prisma.PatientAppointmentGetPayload<{
  select: typeof appointmentRetrySelect;
}>;

const appointmentCurrentSelect = {
  id: true,
  patientHospitalRelationshipId: true,
  responsibleUserId: true,
  scheduledAt: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PatientAppointmentSelect;

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

function getNotificationRollout(dependencies: AppointmentServiceDependencies): AppointmentLineNotificationRollout {
  return dependencies.appointmentLineNotificationRollout ?? getAppointmentLineNotificationRollout();
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
    responsibleUserId: input.responsibleUserId?.toLowerCase() ?? null,
    durationMinutes: input.durationMinutes ?? null,
    locationType: input.locationType ?? null,
    locationDetail: nullableText(input.locationDetail),
    note: nullableText(input.note),
  };
}

function createAppointmentRequestHash(
  actor: ActorContext,
  patientHospitalRelationshipId: string,
  fields: NormalizedAppointmentFields,
): string {
  const canonicalPayload = {
    actorUserId: actor.userId,
    patientHospitalRelationshipId,
    scheduledAt: fields.scheduledAt.toISOString(),
    type: fields.type,
    responsibleUserId: fields.responsibleUserId,
    durationMinutes: fields.durationMinutes,
    locationType: fields.locationType,
    locationDetail: fields.locationDetail,
    note: fields.note,
  };

  return createHash("sha256").update(JSON.stringify(canonicalPayload), "utf8").digest("hex");
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

function hasSameCreateRequestIdentity(
  existing: AppointmentRetryRecord,
  actor: ActorContext,
  patientHospitalRelationshipId: string,
  creationRequestHash: string,
): boolean {
  return (
    existing.patientHospitalRelationshipId === patientHospitalRelationshipId &&
    existing.createdByUserId === actor.userId &&
    existing.creationRequestHash === creationRequestHash
  );
}

async function assertResponsibleUserIsEligible(
  transaction: Prisma.TransactionClient,
  hospitalId: string,
  responsibleUserId: string | null,
  unchangedResponsibleUserId: string | null = null,
): Promise<void> {
  if (!responsibleUserId || responsibleUserId === unchangedResponsibleUserId) {
    return;
  }

  const membership = await transaction.hospitalMembership.findFirst({
    where: {
      userId: responsibleUserId,
      hospitalId,
      status: MembershipStatus.ACTIVE,
      user: { status: UserStatus.ACTIVE },
      profession: { in: [Profession.DOCTOR, Profession.NURSE] },
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
  notificationRollout: AppointmentLineNotificationRollout,
): Promise<AppointmentMutationResult> {
  const access = await resolveAppointmentAccessContext(
    actor,
    input.patientHospitalRelationshipId,
    APPOINTMENT_CREATE_CAPABILITY,
    transaction,
  );
  const fields = normalizeAppointmentFields(input);
  const creationRequestHash = createAppointmentRequestHash(
    actor,
    access.patient.patientHospitalRelationshipId,
    fields,
  );

  const existing = await transaction.patientAppointment.findUnique({
    where: { submissionNonce: input.submissionNonce },
    select: appointmentRetrySelect,
  });

  if (existing) {
    if (
      !hasSameCreateRequestIdentity(
        existing,
        actor,
        access.patient.patientHospitalRelationshipId,
        creationRequestHash,
      )
    ) {
      throw new ConflictError("This Appointment submission token has already been used");
    }

    return toMutationResult(existing, access.target.hospitalId);
  }

  await assertResponsibleUserIsEligible(transaction, access.target.hospitalId, fields.responsibleUserId);

  const appointment = await transaction.patientAppointment.create({
    data: {
      patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
      osmAssignmentIdAtCreation: access.target.assignedOsmAssignmentId,
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
      creationRequestHash,
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

  await createAppointmentLineNotificationIntent(transaction, {
    appointmentId: appointment.id,
    patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
    sourceUpdatedAt: appointment.updatedAt,
    eventKind: AppointmentLineNotificationEventKind.CREATED,
    patientUserId: access.target.patientUserId,
  }, notificationRollout, now);

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
    const notificationRollout = getNotificationRollout(dependencies);
    return await runSerializable(
      getDatabase(dependencies),
      (transaction) => createInTransaction(transaction, actor, parsed.data, getNow(dependencies), notificationRollout),
      dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES,
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error);
  }
}

async function supersedePendingCancellationRequest(
  transaction: Prisma.TransactionClient,
  appointmentId: string,
  actorUserId: string,
  now: Date,
  exceptRequestId?: string,
): Promise<void> {
  const superseded = await transaction.patientAppointmentCancellationRequest.updateMany({
    where: {
      appointmentId,
      status: AppointmentCancellationRequestStatus.PENDING,
      ...(exceptRequestId ? { id: { not: exceptRequestId } } : {}),
    },
    data: {
      status: AppointmentCancellationRequestStatus.SUPERSEDED,
      resolvedByUserId: actorUserId,
      resolvedAt: now,
    },
  });

  if (superseded.count > 0) {
    await recordAuditEvent(
      {
        actorUserId,
        action: "appointment.cancellation_request.superseded",
        resourceType: "PatientAppointment",
        resourceId: appointmentId,
        metadata: { appointmentId, count: superseded.count },
      },
      transaction,
    );
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
  notificationRollout: AppointmentLineNotificationRollout,
): Promise<AppointmentMutationResult> {
  const access = await resolveAppointmentAccessContext(
    actor,
    input.patientHospitalRelationshipId,
    APPOINTMENT_MANAGE_CAPABILITY,
    transaction,
  );
  const fields = normalizeAppointmentFields(input);
  const expectedUpdatedAt = toDate(input.expectedUpdatedAt, "Appointment version");

  const current = await transaction.patientAppointment.findFirst({
    where: {
      id: input.appointmentId,
      patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
    },
    select: appointmentCurrentSelect,
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

  await assertResponsibleUserIsEligible(
    transaction,
    access.target.hospitalId,
    fields.responsibleUserId,
    current.responsibleUserId,
  );

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

  await supersedePendingCancellationRequest(transaction, current.id, actor.userId, now);

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

  if (current.scheduledAt.getTime() !== fields.scheduledAt.getTime()) {
    await createAppointmentLineNotificationIntent(transaction, {
      appointmentId: result.id,
      patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
      sourceUpdatedAt: result.updatedAt,
      eventKind: AppointmentLineNotificationEventKind.RESCHEDULED,
      patientUserId: access.target.patientUserId,
    }, notificationRollout, now);
  }

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
    const notificationRollout = getNotificationRollout(dependencies);
    return await runSerializable(
      getDatabase(dependencies),
      (transaction) => rescheduleInTransaction(transaction, actor, parsed.data, getNow(dependencies), notificationRollout),
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
  notificationRollout: AppointmentLineNotificationRollout,
  exceptCancellationRequestId?: string,
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
    select: appointmentCurrentSelect,
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

  await supersedePendingCancellationRequest(
    transaction,
    current.id,
    actor.userId,
    now,
    exceptCancellationRequestId,
  );

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

  if (transition.status === AppointmentStatus.CANCELLED) {
    await createAppointmentLineNotificationIntent(transaction, {
      appointmentId: result.id,
      patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
      sourceUpdatedAt: result.updatedAt,
      eventKind: AppointmentLineNotificationEventKind.CANCELLED,
      patientUserId: access.target.patientUserId,
    }, notificationRollout, now);
  }

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
    const notificationRollout = getNotificationRollout(dependencies);
    return await runSerializable(
      getDatabase(dependencies),
      (transaction) =>
        terminalTransitionInTransaction(
          transaction,
          actor,
          parsed.data,
          transition,
          getNow(dependencies),
          notificationRollout,
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

type AppointmentInteractionDependencies = AppointmentServiceDependencies;

function requireInteractionSource(
  scopes: { patientSelf: boolean; exactOsmAssignment: boolean },
  source: AppointmentInteractionSource,
): void {
  if (
    (source === AppointmentInteractionSource.PATIENT_SELF && scopes.patientSelf) ||
    (source === AppointmentInteractionSource.OSM_PROXY && scopes.exactOsmAssignment)
  ) {
    return;
  }

  throw new ForbiddenError();
}

async function acknowledgeAppointment(
  actor: ActorContext | null | undefined,
  input: unknown,
  source: AppointmentInteractionSource,
  dependencies: AppointmentInteractionDependencies,
): Promise<AppointmentAcknowledgementResult> {
  const parsed = appointmentAcknowledgementRequestSchema.safeParse(input);

  if (!parsed.success || !actor) {
    throw parsed.success ? new ForbiddenError() : new ValidationError("Appointment acknowledgement data is invalid");
  }

  try {
    return await runSerializable(
      getDatabase(dependencies),
      async (transaction) => {
        const access = await resolveAppointmentAccessContext(
          actor,
          parsed.data.patientHospitalRelationshipId,
          APPOINTMENT_ACKNOWLEDGE_CAPABILITY,
          transaction,
        );
        requireInteractionSource(access.scopes, source);

        const appointment = await transaction.patientAppointment.findFirst({
          where: {
            id: parsed.data.appointmentId,
            patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
          },
          select: { id: true, status: true, updatedAt: true },
        });

        if (!appointment) {
          throw new NotFoundError();
        }

        const expectedUpdatedAt = toDate(parsed.data.expectedUpdatedAt, "Appointment version");

        if (
          appointment.status !== AppointmentStatus.SCHEDULED ||
          appointment.updatedAt.getTime() !== expectedUpdatedAt.getTime()
        ) {
          throw new ConflictError("This Appointment changed before it was acknowledged");
        }

        const existing = await transaction.patientAppointmentAcknowledgement.findUnique({
          where: {
            appointmentId_sourceAppointmentUpdatedAt: {
              appointmentId: appointment.id,
              sourceAppointmentUpdatedAt: appointment.updatedAt,
            },
          },
        });

        if (existing) {
          return {
            appointmentId: appointment.id,
            patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
            source: existing.source,
            sourceAppointmentUpdatedAt: existing.sourceAppointmentUpdatedAt,
            acknowledgedAt: existing.acknowledgedAt,
          };
        }

        const now = getNow(dependencies);
        const acknowledgement = await transaction.patientAppointmentAcknowledgement.create({
          data: {
            appointmentId: appointment.id,
            sourceAppointmentUpdatedAt: appointment.updatedAt,
            recordedByUserId: actor.userId,
            source,
            acknowledgedAt: now,
          },
        });

        await recordAuditEvent(
          {
            actorUserId: actor.userId,
            action: "appointment.acknowledged",
            resourceType: "PatientAppointment",
            resourceId: appointment.id,
            metadata: {
              appointmentId: appointment.id,
              patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
              hospitalId: access.target.hospitalId,
              source,
              sourceAppointmentUpdatedAt: appointment.updatedAt.toISOString(),
            },
          },
          transaction,
        );

        return {
          appointmentId: appointment.id,
          patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
          source: acknowledgement.source,
          sourceAppointmentUpdatedAt: acknowledgement.sourceAppointmentUpdatedAt,
          acknowledgedAt: acknowledgement.acknowledgedAt,
        };
      },
      dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES,
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error);
  }
}

export function acknowledgeOwnPatientAppointment(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: AppointmentInteractionDependencies = {},
): Promise<AppointmentAcknowledgementResult> {
  return acknowledgeAppointment(actor, input, AppointmentInteractionSource.PATIENT_SELF, dependencies);
}

export function acknowledgeAppointmentOnBehalfOfPatient(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: AppointmentInteractionDependencies = {},
): Promise<AppointmentAcknowledgementResult> {
  return acknowledgeAppointment(actor, input, AppointmentInteractionSource.OSM_PROXY, dependencies);
}

async function requestAppointmentCancellation(
  actor: ActorContext | null | undefined,
  input: unknown,
  source: AppointmentInteractionSource,
  dependencies: AppointmentInteractionDependencies,
): Promise<AppointmentCancellationRequestResult> {
  const parsed = appointmentCancellationRequestSchema.safeParse(input);

  if (!parsed.success || !actor) {
    throw parsed.success ? new ForbiddenError() : new ValidationError("Appointment cancellation request data is invalid");
  }

  try {
    return await runSerializable(
      getDatabase(dependencies),
      async (transaction) => {
        const access = await resolveAppointmentAccessContext(
          actor,
          parsed.data.patientHospitalRelationshipId,
          APPOINTMENT_REQUEST_CANCEL_CAPABILITY,
          transaction,
        );
        requireInteractionSource(access.scopes, source);

        const appointment = await transaction.patientAppointment.findFirst({
          where: {
            id: parsed.data.appointmentId,
            patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
          },
          select: { id: true, status: true, updatedAt: true },
        });

        if (!appointment) {
          throw new NotFoundError();
        }

        const existingForNonce = await transaction.patientAppointmentCancellationRequest.findUnique({
          where: { submissionNonce: parsed.data.submissionNonce },
        });

        if (existingForNonce) {
          if (
            existingForNonce.appointmentId !== appointment.id ||
            existingForNonce.submittedByUserId !== actor.userId ||
            existingForNonce.source !== source ||
            existingForNonce.sourceAppointmentUpdatedAt.getTime() !==
              new Date(parsed.data.expectedUpdatedAt).getTime()
          ) {
            throw new ConflictError("This cancellation request token has already been used");
          }

          return {
            requestId: existingForNonce.id,
            appointmentId: appointment.id,
            patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
            source: existingForNonce.source,
            status: existingForNonce.status,
            sourceAppointmentUpdatedAt: existingForNonce.sourceAppointmentUpdatedAt,
            submittedAt: existingForNonce.submittedAt,
          };
        }

        const expectedUpdatedAt = toDate(parsed.data.expectedUpdatedAt, "Appointment version");

        if (
          appointment.status !== AppointmentStatus.SCHEDULED ||
          appointment.updatedAt.getTime() !== expectedUpdatedAt.getTime()
        ) {
          throw new ConflictError("This Appointment changed before the cancellation request was submitted");
        }

        const pending = await transaction.patientAppointmentCancellationRequest.findFirst({
          where: { appointmentId: appointment.id, status: AppointmentCancellationRequestStatus.PENDING },
          orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
        });

        if (pending) {
          if (pending.sourceAppointmentUpdatedAt.getTime() === appointment.updatedAt.getTime()) {
            return {
              requestId: pending.id,
              appointmentId: appointment.id,
              patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
              source: pending.source,
              status: pending.status,
              sourceAppointmentUpdatedAt: pending.sourceAppointmentUpdatedAt,
              submittedAt: pending.submittedAt,
            };
          }

          const now = getNow(dependencies);
          await transaction.patientAppointmentCancellationRequest.updateMany({
            where: { id: pending.id, status: AppointmentCancellationRequestStatus.PENDING },
            data: {
              status: AppointmentCancellationRequestStatus.SUPERSEDED,
              resolvedByUserId: actor.userId,
              resolvedAt: now,
            },
          });
          await recordAuditEvent(
            {
              actorUserId: actor.userId,
              action: "appointment.cancellation_request.superseded",
              resourceType: "PatientAppointmentCancellationRequest",
              resourceId: pending.id,
              metadata: { appointmentId: appointment.id, requestId: pending.id },
            },
            transaction,
          );
        }

        const now = getNow(dependencies);
        const request = await transaction.patientAppointmentCancellationRequest.create({
          data: {
            appointmentId: appointment.id,
            sourceAppointmentUpdatedAt: appointment.updatedAt,
            submittedByUserId: actor.userId,
            source,
            submissionNonce: parsed.data.submissionNonce,
            status: AppointmentCancellationRequestStatus.PENDING,
            submittedAt: now,
          },
        });

        await recordAuditEvent(
          {
            actorUserId: actor.userId,
            action: "appointment.cancellation_requested",
            resourceType: "PatientAppointmentCancellationRequest",
            resourceId: request.id,
            metadata: {
              appointmentId: appointment.id,
              patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
              hospitalId: access.target.hospitalId,
              source,
              sourceAppointmentUpdatedAt: appointment.updatedAt.toISOString(),
            },
          },
          transaction,
        );

        return {
          requestId: request.id,
          appointmentId: appointment.id,
          patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
          source: request.source,
          status: request.status,
          sourceAppointmentUpdatedAt: request.sourceAppointmentUpdatedAt,
          submittedAt: request.submittedAt,
        };
      },
      dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES,
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error);
  }
}

export function requestOwnPatientAppointmentCancellation(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: AppointmentInteractionDependencies = {},
): Promise<AppointmentCancellationRequestResult> {
  return requestAppointmentCancellation(actor, input, AppointmentInteractionSource.PATIENT_SELF, dependencies);
}

export function requestAppointmentCancellationOnBehalfOfPatient(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: AppointmentInteractionDependencies = {},
): Promise<AppointmentCancellationRequestResult> {
  return requestAppointmentCancellation(actor, input, AppointmentInteractionSource.OSM_PROXY, dependencies);
}

export async function recordAppointmentCoordination(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: AppointmentInteractionDependencies = {},
): Promise<AppointmentCoordinationResult> {
  const parsed = appointmentCoordinationRequestSchema.safeParse(input);

  if (!parsed.success || !actor) {
    throw parsed.success ? new ForbiddenError() : new ValidationError("Appointment coordination data is invalid");
  }

  try {
    return await runSerializable(
      getDatabase(dependencies),
      async (transaction) => {
        const access = await resolveAppointmentAccessContext(
          actor,
          parsed.data.patientHospitalRelationshipId,
          APPOINTMENT_RECORD_COORDINATION_CAPABILITY,
          transaction,
        );
        const appointment = await transaction.patientAppointment.findFirst({
          where: {
            id: parsed.data.appointmentId,
            patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
          },
          select: { id: true },
        });

        if (!appointment) {
          throw new NotFoundError();
        }

        const existing = await transaction.patientAppointmentCoordinationEvent.findUnique({
          where: { submissionNonce: parsed.data.submissionNonce },
        });

        if (existing) {
          if (existing.appointmentId !== appointment.id || existing.recordedByUserId !== actor.userId) {
            throw new ConflictError("This coordination token has already been used");
          }

          return {
            eventId: existing.id,
            appointmentId: appointment.id,
            patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
            recordedAt: existing.recordedAt,
          };
        }

        const now = getNow(dependencies);
        const event = await transaction.patientAppointmentCoordinationEvent.create({
          data: {
            appointmentId: appointment.id,
            recordedByUserId: actor.userId,
            submissionNonce: parsed.data.submissionNonce,
            recordedAt: now,
          },
        });

        await recordAuditEvent(
          {
            actorUserId: actor.userId,
            action: "appointment.coordination_recorded",
            resourceType: "PatientAppointment",
            resourceId: appointment.id,
            metadata: {
              appointmentId: appointment.id,
              patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
              hospitalId: access.target.hospitalId,
            },
          },
          transaction,
        );

        return {
          eventId: event.id,
          appointmentId: appointment.id,
          patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
          recordedAt: event.recordedAt,
        };
      },
      dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES,
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error);
  }
}

export async function reviewAppointmentCancellationRequest(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: AppointmentInteractionDependencies = {},
): Promise<AppointmentCancellationReviewResult> {
  const parsed = appointmentCancellationReviewRequestSchema.safeParse(input);

  if (!parsed.success || !actor) {
    throw parsed.success ? new ForbiddenError() : new ValidationError("Appointment cancellation review data is invalid");
  }

  try {
    const notificationRollout = getNotificationRollout(dependencies);
    return await runSerializable(
      getDatabase(dependencies),
      async (transaction) => {
        const access = await resolveAppointmentAccessContext(
          actor,
          parsed.data.patientHospitalRelationshipId,
          APPOINTMENT_MANAGE_CAPABILITY,
          transaction,
        );
        const appointment = await transaction.patientAppointment.findFirst({
          where: {
            id: parsed.data.appointmentId,
            patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
          },
          select: { id: true, status: true, updatedAt: true },
        });
        const request = await transaction.patientAppointmentCancellationRequest.findFirst({
          where: {
            id: parsed.data.requestId,
            appointmentId: parsed.data.appointmentId,
          },
        });

        if (!appointment || !request) {
          throw new NotFoundError();
        }

        if (request.status !== AppointmentCancellationRequestStatus.PENDING) {
          const sameDecisionAlreadyApplied =
            (parsed.data.decision === "APPROVE" &&
              request.status === AppointmentCancellationRequestStatus.APPROVED) ||
            (parsed.data.decision === "REJECT" &&
              request.status === AppointmentCancellationRequestStatus.REJECTED);

          if (
            !sameDecisionAlreadyApplied &&
            request.status !== AppointmentCancellationRequestStatus.SUPERSEDED
          ) {
            throw new ConflictError("This cancellation request was already reviewed");
          }

          return {
            requestId: request.id,
            appointmentId: appointment.id,
            patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
            requestStatus: request.status,
            appointmentStatus: appointment.status,
            updatedAt: appointment.updatedAt,
            wasSuperseded: request.status === AppointmentCancellationRequestStatus.SUPERSEDED,
          };
        }

        const now = getNow(dependencies);
        const isStale =
          appointment.status !== AppointmentStatus.SCHEDULED ||
          appointment.updatedAt.getTime() !== request.sourceAppointmentUpdatedAt.getTime();

        if (isStale) {
          await transaction.patientAppointmentCancellationRequest.updateMany({
            where: { id: request.id, status: AppointmentCancellationRequestStatus.PENDING },
            data: {
              status: AppointmentCancellationRequestStatus.SUPERSEDED,
              resolvedByUserId: actor.userId,
              resolvedAt: now,
            },
          });
          await recordAuditEvent(
            {
              actorUserId: actor.userId,
              action: "appointment.cancellation_request.superseded",
              resourceType: "PatientAppointmentCancellationRequest",
              resourceId: request.id,
              metadata: { appointmentId: appointment.id, requestId: request.id },
            },
            transaction,
          );

          return {
            requestId: request.id,
            appointmentId: appointment.id,
            patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
            requestStatus: AppointmentCancellationRequestStatus.SUPERSEDED,
            appointmentStatus: appointment.status,
            updatedAt: appointment.updatedAt,
            wasSuperseded: true,
          };
        }

        if (parsed.data.decision === "REJECT") {
          const resolved = await transaction.patientAppointmentCancellationRequest.updateMany({
            where: { id: request.id, status: AppointmentCancellationRequestStatus.PENDING },
            data: {
              status: AppointmentCancellationRequestStatus.REJECTED,
              resolvedByUserId: actor.userId,
              resolvedAt: now,
            },
          });

          if (resolved.count !== 1) {
            throw new ConflictError("This cancellation request was already reviewed");
          }

          await recordAuditEvent(
            {
              actorUserId: actor.userId,
              action: "appointment.cancellation_request.rejected",
              resourceType: "PatientAppointmentCancellationRequest",
              resourceId: request.id,
              metadata: { appointmentId: appointment.id, requestId: request.id },
            },
            transaction,
          );

          return {
            requestId: request.id,
            appointmentId: appointment.id,
            patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
            requestStatus: AppointmentCancellationRequestStatus.REJECTED,
            appointmentStatus: appointment.status,
            updatedAt: appointment.updatedAt,
            wasSuperseded: false,
          };
        }

        const transitionResult = await terminalTransitionInTransaction(
          transaction,
          actor,
          {
            patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
            appointmentId: appointment.id,
            expectedUpdatedAt: request.sourceAppointmentUpdatedAt.toISOString(),
          },
          { status: AppointmentStatus.CANCELLED, action: "appointment.cancelled" },
          now,
          notificationRollout,
          request.id,
        );
        const resolved = await transaction.patientAppointmentCancellationRequest.updateMany({
          where: { id: request.id, status: AppointmentCancellationRequestStatus.PENDING },
          data: {
            status: AppointmentCancellationRequestStatus.APPROVED,
            resolvedByUserId: actor.userId,
            resolvedAt: now,
          },
        });

        if (resolved.count !== 1) {
          throw new ConflictError("This cancellation request was already reviewed");
        }

        await recordAuditEvent(
          {
            actorUserId: actor.userId,
            action: "appointment.cancellation_request.approved",
            resourceType: "PatientAppointmentCancellationRequest",
            resourceId: request.id,
            metadata: { appointmentId: appointment.id, requestId: request.id },
          },
          transaction,
        );

        return {
          requestId: request.id,
          appointmentId: appointment.id,
          patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
          requestStatus: AppointmentCancellationRequestStatus.APPROVED,
          appointmentStatus: transitionResult.status,
          updatedAt: transitionResult.updatedAt,
          wasSuperseded: false,
        };
      },
      dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES,
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error);
  }
}

export const appointmentServiceInternals = {
  assertResponsibleUserIsEligible,
  createInTransaction,
  createAppointmentRequestHash,
  hasSameCreateRequestIdentity,
  isRetryableTransactionError,
  nextUpdatedAt,
  normalizeAppointmentFields,
  normalizeDatabaseError,
  runSerializable,
  terminalTransitionInTransaction,
};
