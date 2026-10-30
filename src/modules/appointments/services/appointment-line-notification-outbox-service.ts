import "server-only";

import {
  AppointmentLineNotificationEventKind,
  AppointmentLineNotificationOutcome,
  AppointmentLineNotificationRecipientKind,
  AppointmentLineNotificationState,
  Role,
  UserStatus,
  type Prisma,
} from "@prisma/client";
import { randomUUID } from "node:crypto";

import { appointmentLineNotificationPreferenceInternals } from "./appointment-line-notification-preference-service";
import { resolveAdditionalAppointmentNotificationRecipients } from "./appointment-line-notification-recipient-service";

type SourceIntentInput = {
  appointmentId: string;
  patientHospitalRelationshipId: string;
  sourceUpdatedAt: Date;
  eventKind: AppointmentLineNotificationEventKind;
  patientUserId: string | null;
};

type SourceIntentOptions = {
  includeOsm?: boolean;
  onlyOsmUserId?: string;
  /**
   * ADR-0023 (SR-D2): `onlyOsmUserId` is the one-off visiting อสม. of an appointment from a service request,
   * whom the caller has checked; they are not among the patient's assignment-based recipients.
   */
  onlyOsmIsVisitOsm?: boolean;
};

type DeliveryReadiness =
  | {
      state: typeof AppointmentLineNotificationState.PENDING;
      bindingId: string;
      bindingLifecycleVersion: number;
      preferenceVersion: number;
    }
  | {
      state: typeof AppointmentLineNotificationState.SUPPRESSED;
      safeOutcome: AppointmentLineNotificationOutcome;
    };

/** LINE-bound and opted in for the current binding, evaluated at source for any recipient User. */
async function lineDeliveryReadiness(
  transaction: Prisma.TransactionClient,
  userId: string,
): Promise<DeliveryReadiness> {
  const bindings = await transaction.lineAccountBinding.findMany({
    where: { userId, unlinkedAt: null },
    orderBy: { id: "asc" },
    take: 2,
    select: { id: true, lifecycleVersion: true, lineUserId: true },
  });

  if (bindings.length !== 1 || !bindings[0]?.lineUserId) {
    return {
      state: AppointmentLineNotificationState.SUPPRESSED,
      safeOutcome: AppointmentLineNotificationOutcome.LINE_BINDING_INELIGIBLE_AT_SOURCE,
    };
  }

  const binding = bindings[0];
  const preference = await transaction.lineAppointmentNotificationPreference.findUnique({
    where: { userId },
    select: {
      enabled: true,
      bindingId: true,
      bindingLifecycleVersion: true,
      preferenceVersion: true,
    },
  });

  if (
    appointmentLineNotificationPreferenceInternals.isPreferenceEnabledForCurrentBinding(preference, bindings) &&
    preference?.bindingId === binding.id &&
    preference.preferenceVersion > 0
  ) {
    return {
      state: AppointmentLineNotificationState.PENDING,
      bindingId: binding.id,
      bindingLifecycleVersion: binding.lifecycleVersion,
      preferenceVersion: preference.preferenceVersion,
    };
  }

  return {
    state: AppointmentLineNotificationState.SUPPRESSED,
    safeOutcome: AppointmentLineNotificationOutcome.OPT_IN_REQUIRED_AT_SOURCE,
  };
}

export async function createAppointmentLineNotificationIntent(
  transaction: Prisma.TransactionClient,
  input: SourceIntentInput,
  now: Date,
  options: SourceIntentOptions = {},
): Promise<void> {

  let patientRecipientUserId: string | null = null;
  if (input.patientUserId) {
    const patientUser = await transaction.user.findUnique({
      where: { id: input.patientUserId },
      select: { id: true, status: true, roles: { select: { role: true } } },
    });
    if (
      patientUser?.status === UserStatus.ACTIVE &&
      patientUser.roles.some(({ role }) => role === Role.PATIENT)
    ) {
      patientRecipientUserId = patientUser.id;
    }
  }

  const additionalRecipients = await resolveAdditionalAppointmentNotificationRecipients(transaction, {
    patientHospitalRelationshipId: input.patientHospitalRelationshipId,
    patientUserId: patientRecipientUserId,
  });
  const selectedAdditionalRecipients = additionalRecipients.filter((recipient) => {
      if (options.onlyOsmUserId) {
        return recipient.kind === AppointmentLineNotificationRecipientKind.OSM && recipient.userId === options.onlyOsmUserId;
      }
      return options.includeOsm !== false || recipient.kind !== AppointmentLineNotificationRecipientKind.OSM;
    });
  const recipients = options.onlyOsmUserId
    ? options.onlyOsmIsVisitOsm
      ? [{ kind: AppointmentLineNotificationRecipientKind.OSM, userId: options.onlyOsmUserId, grantId: null }]
      : selectedAdditionalRecipients
    : [
        { kind: AppointmentLineNotificationRecipientKind.PATIENT, userId: patientRecipientUserId, grantId: null },
        ...selectedAdditionalRecipients,
      ];

  const rows: Prisma.AppointmentLineNotificationCreateManyInput[] = [];
  for (const recipient of recipients) {
    const readiness: DeliveryReadiness = recipient.userId
      ? await lineDeliveryReadiness(transaction, recipient.userId)
      : {
          state: AppointmentLineNotificationState.SUPPRESSED,
          safeOutcome: AppointmentLineNotificationOutcome.PATIENT_INELIGIBLE_AT_SOURCE,
        };
    const pending = readiness.state === AppointmentLineNotificationState.PENDING;

    rows.push({
      appointmentId: input.appointmentId,
      patientHospitalRelationshipId: input.patientHospitalRelationshipId,
      eventKey: `${input.eventKind}:${input.appointmentId}:${input.sourceUpdatedAt.getTime()}`,
      sourceUpdatedAt: input.sourceUpdatedAt,
      eventKind: input.eventKind,
      recipientKind: recipient.kind,
      // A suppressed Patient row keeps no recipient, as before; OSM/caregiver rows always name the User.
      recipientUserId: pending || recipient.kind !== AppointmentLineNotificationRecipientKind.PATIENT ? recipient.userId : null,
      recipientGrantId: recipient.grantId,
      bindingId: pending ? readiness.bindingId : null,
      bindingLifecycleVersion: pending ? readiness.bindingLifecycleVersion : null,
      preferenceVersion: pending ? readiness.preferenceVersion : null,
      state: readiness.state,
      dueAt: now,
      retryKey: randomUUID(),
      safeOutcome: pending ? null : readiness.safeOutcome,
      terminalAt: pending ? null : now,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Unique (event, recipient User) and (event, PATIENT) indexes make a duplicate source write fail the transaction.
  await transaction.appointmentLineNotification.createMany({ data: rows });
}

async function createUserIntent(
  transaction: Prisma.TransactionClient,
  input: {
    eventKind: AppointmentLineNotificationEventKind;
    eventKey: string;
    appointmentId: string | null;
    patientOsmAssignmentId?: string | null;
    rescheduleRequestId?: string | null;
    patientServiceRequestId?: string | null;
    patientHospitalRelationshipId: string;
    sourceUpdatedAt: Date;
    recipientKind: AppointmentLineNotificationRecipientKind;
    recipientUserId: string;
    now: Date;
  },
): Promise<void> {
  const readiness = await lineDeliveryReadiness(transaction, input.recipientUserId);
  const pending = readiness.state === AppointmentLineNotificationState.PENDING;
  await transaction.appointmentLineNotification.createMany({
    data: [{
      appointmentId: input.appointmentId,
      patientOsmAssignmentId: input.patientOsmAssignmentId ?? null,
      rescheduleRequestId: input.rescheduleRequestId ?? null,
      patientServiceRequestId: input.patientServiceRequestId ?? null,
      patientHospitalRelationshipId: input.patientHospitalRelationshipId,
      eventKey: input.eventKey,
      sourceUpdatedAt: input.sourceUpdatedAt,
      eventKind: input.eventKind,
      recipientKind: input.recipientKind,
      recipientUserId: input.recipientUserId,
      recipientGrantId: null,
      bindingId: pending ? readiness.bindingId : null,
      bindingLifecycleVersion: pending ? readiness.bindingLifecycleVersion : null,
      preferenceVersion: pending ? readiness.preferenceVersion : null,
      state: readiness.state,
      dueAt: input.now,
      retryKey: randomUUID(),
      safeOutcome: pending ? null : readiness.safeOutcome,
      terminalAt: pending ? null : input.now,
      createdAt: input.now,
      updatedAt: input.now,
    }],
  });
}

export async function createPatientOsmAssignmentLineNotificationIntent(
  transaction: Prisma.TransactionClient,
  input: {
    assignmentId: string;
    patientHospitalRelationshipId: string;
    osmUserId: string;
    sourceUpdatedAt: Date;
  },
  now: Date,
): Promise<void> {
  const assignment = await transaction.patientOsmAssignment.findFirst({
    where: {
      id: input.assignmentId,
      patientHospitalRelationshipId: input.patientHospitalRelationshipId,
      osmUserId: input.osmUserId,
      endedAt: null,
    },
    select: { id: true },
  });
  if (!assignment) return;
  await createUserIntent(transaction, {
    eventKind: AppointmentLineNotificationEventKind.OSM_PATIENT_ASSIGNED,
    eventKey: `${AppointmentLineNotificationEventKind.OSM_PATIENT_ASSIGNED}:${assignment.id}`,
    appointmentId: null,
    patientOsmAssignmentId: assignment.id,
    patientHospitalRelationshipId: input.patientHospitalRelationshipId,
    sourceUpdatedAt: input.sourceUpdatedAt,
    recipientKind: AppointmentLineNotificationRecipientKind.OSM,
    recipientUserId: input.osmUserId,
    now,
  });
}

/**
 * ADR-0023 (SR-B): tells the preferred อสม., or else the assigned อสม., about a new service request. The caller
 * picks the recipient; delivery re-checks it and that the request is still PENDING.
 */
export async function createPatientServiceRequestLineNotificationIntent(
  transaction: Prisma.TransactionClient,
  input: {
    serviceRequestId: string;
    patientHospitalRelationshipId: string;
    osmUserId: string;
    sourceUpdatedAt: Date;
  },
  now: Date,
): Promise<void> {
  await createUserIntent(transaction, {
    eventKind: AppointmentLineNotificationEventKind.OSM_SERVICE_REQUESTED,
    eventKey: `${AppointmentLineNotificationEventKind.OSM_SERVICE_REQUESTED}:${input.serviceRequestId}`,
    appointmentId: null,
    patientServiceRequestId: input.serviceRequestId,
    patientHospitalRelationshipId: input.patientHospitalRelationshipId,
    sourceUpdatedAt: input.sourceUpdatedAt,
    recipientKind: AppointmentLineNotificationRecipientKind.OSM,
    recipientUserId: input.osmUserId,
    now,
  });
}

export async function createOsmRescheduleRequestLineNotificationIntent(
  transaction: Prisma.TransactionClient,
  input: {
    appointmentId: string;
    rescheduleRequestId: string;
    patientHospitalRelationshipId: string;
    creatorUserId: string;
    sourceUpdatedAt: Date;
  },
  now: Date,
): Promise<void> {
  await createUserIntent(transaction, {
    eventKind: AppointmentLineNotificationEventKind.OSM_RESCHEDULE_REQUESTED,
    eventKey: `${AppointmentLineNotificationEventKind.OSM_RESCHEDULE_REQUESTED}:${input.rescheduleRequestId}`,
    appointmentId: input.appointmentId,
    rescheduleRequestId: input.rescheduleRequestId,
    patientHospitalRelationshipId: input.patientHospitalRelationshipId,
    sourceUpdatedAt: input.sourceUpdatedAt,
    recipientKind: AppointmentLineNotificationRecipientKind.STAFF_CREATOR,
    recipientUserId: input.creatorUserId,
    now,
  });
}
