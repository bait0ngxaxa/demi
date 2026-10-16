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

import { isFamilyDelegatedAppointmentReadEnabled } from "@/lib/env/server";

import type { AppointmentLineNotificationRollout } from "../domain/appointment-line-notifications";
import { appointmentLineNotificationPreferenceInternals } from "./appointment-line-notification-preference-service";
import { resolveAdditionalAppointmentNotificationRecipients } from "./appointment-line-notification-recipient-service";

type SourceIntentInput = {
  appointmentId: string;
  patientHospitalRelationshipId: string;
  sourceUpdatedAt: Date;
  eventKind: AppointmentLineNotificationEventKind;
  patientUserId: string | null;
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
  rollout: AppointmentLineNotificationRollout,
  now: Date,
  familyAppointmentReadEnabled: boolean = isFamilyDelegatedAppointmentReadEnabled(),
): Promise<void> {
  if (!rollout.enabled || !rollout.generation) return;
  const generation = rollout.generation;

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

  const recipients = [
    { kind: AppointmentLineNotificationRecipientKind.PATIENT, userId: patientRecipientUserId, grantId: null },
    ...await resolveAdditionalAppointmentNotificationRecipients(transaction, {
      patientHospitalRelationshipId: input.patientHospitalRelationshipId,
      patientUserId: patientRecipientUserId,
      familyAppointmentReadEnabled,
    }),
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
      sourceUpdatedAt: input.sourceUpdatedAt,
      eventKind: input.eventKind,
      recipientKind: recipient.kind,
      // A suppressed Patient row keeps no recipient, as before; OSM/caregiver rows always name the User.
      recipientUserId: pending || recipient.kind !== AppointmentLineNotificationRecipientKind.PATIENT ? recipient.userId : null,
      recipientGrantId: recipient.grantId,
      bindingId: pending ? readiness.bindingId : null,
      bindingLifecycleVersion: pending ? readiness.bindingLifecycleVersion : null,
      preferenceVersion: pending ? readiness.preferenceVersion : null,
      rolloutGeneration: generation,
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
