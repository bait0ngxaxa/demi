import "server-only";

import {
  AppointmentLineNotificationEventKind,
  AppointmentLineNotificationOutcome,
  AppointmentLineNotificationState,
  Role,
  UserStatus,
  type Prisma,
} from "@prisma/client";
import { randomUUID } from "node:crypto";

import type { AppointmentLineNotificationRollout } from "../domain/appointment-line-notifications";
import { appointmentLineNotificationPreferenceInternals } from "./appointment-line-notification-preference-service";

type SourceIntentInput = {
  appointmentId: string;
  patientHospitalRelationshipId: string;
  sourceUpdatedAt: Date;
  eventKind: AppointmentLineNotificationEventKind;
  patientUserId: string | null;
};

export async function createAppointmentLineNotificationIntent(
  transaction: Prisma.TransactionClient,
  input: SourceIntentInput,
  rollout: AppointmentLineNotificationRollout,
  now: Date,
): Promise<void> {
  if (!rollout.enabled || !rollout.generation) return;

  let state: AppointmentLineNotificationState = AppointmentLineNotificationState.SUPPRESSED;
  let safeOutcome: AppointmentLineNotificationOutcome | null =
    AppointmentLineNotificationOutcome.PATIENT_INELIGIBLE_AT_SOURCE;
  let recipientUserId: string | null = null;
  let bindingId: string | null = null;
  let bindingLifecycleVersion: number | null = null;
  let preferenceVersion: number | null = null;

  if (input.patientUserId) {
    const patientUser = await transaction.user.findUnique({
      where: { id: input.patientUserId },
      select: { id: true, status: true, roles: { select: { role: true } } },
    });

    if (
      patientUser?.status === UserStatus.ACTIVE &&
      patientUser.roles.some(({ role }) => role === Role.PATIENT)
    ) {
      const bindings = await transaction.lineAccountBinding.findMany({
        where: { userId: patientUser.id, unlinkedAt: null },
        orderBy: { id: "asc" },
        take: 2,
        select: { id: true, lifecycleVersion: true, lineUserId: true },
      });

      if (bindings.length === 1 && bindings[0]?.lineUserId) {
        const binding = bindings[0];
        const preference = await transaction.lineAppointmentNotificationPreference.findUnique({
          where: { userId: patientUser.id },
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
          state = AppointmentLineNotificationState.PENDING;
          safeOutcome = null;
          recipientUserId = patientUser.id;
          bindingId = binding.id;
          bindingLifecycleVersion = binding.lifecycleVersion;
          preferenceVersion = preference.preferenceVersion;
        } else {
          safeOutcome = AppointmentLineNotificationOutcome.OPT_IN_REQUIRED_AT_SOURCE;
        }
      } else {
        safeOutcome = AppointmentLineNotificationOutcome.LINE_BINDING_INELIGIBLE_AT_SOURCE;
      }
    }
  }

  await transaction.appointmentLineNotification.create({
    data: {
      appointmentId: input.appointmentId,
      patientHospitalRelationshipId: input.patientHospitalRelationshipId,
      sourceUpdatedAt: input.sourceUpdatedAt,
      eventKind: input.eventKind,
      recipientUserId,
      bindingId,
      bindingLifecycleVersion,
      preferenceVersion,
      rolloutGeneration: rollout.generation,
      state,
      dueAt: now,
      retryKey: randomUUID(),
      safeOutcome,
      terminalAt: state === AppointmentLineNotificationState.SUPPRESSED ? now : null,
      createdAt: now,
      updatedAt: now,
    },
  });
}
