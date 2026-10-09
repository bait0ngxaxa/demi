import "server-only";

import {
  HospitalStatus,
  Prisma,
  Role,
  UserStatus,
  type PrismaClient,
} from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import { ForbiddenError, InfrastructureError } from "@/shared/errors/application-error";

type PreferenceDatabase = PrismaClient;
type PreferenceTransaction = Prisma.TransactionClient;

export type OwnAppointmentLineNotificationPreference = {
  enabled: boolean;
  canEnable: boolean;
};

function databaseOf(database?: PreferenceDatabase): PreferenceDatabase {
  return database ?? getPrisma();
}

function assertPatientSelfRole(actor: ActorContext | null | undefined): asserts actor is ActorContext {
  if (!actor || !actor.userId || !actor.personId || !actor.roles.includes(Role.PATIENT)) {
    throw new ForbiddenError();
  }
}

async function loadCurrentPatientUser(
  actor: ActorContext,
  database: PreferenceTransaction | PreferenceDatabase,
): Promise<{ id: string; personId: string } | null> {
  const user = await database.user.findUnique({
    where: { id: actor.userId },
    select: {
      id: true,
      personId: true,
      status: true,
      roles: { select: { role: true } },
    },
  });
  if (
    !user || user.status !== UserStatus.ACTIVE || user.personId !== actor.personId ||
    !user.roles.some(({ role }) => role === Role.PATIENT)
  ) {
    return null;
  }

  const activeRelationship = await database.patientHospitalRelationship.findFirst({
    where: {
      patientProfile: { personId: actor.personId },
      hospital: { status: HospitalStatus.ACTIVE },
    },
    select: { id: true },
  });
  return activeRelationship ? { id: user.id, personId: user.personId } : null;
}

async function currentBinding(
  userId: string,
  database: PreferenceTransaction | PreferenceDatabase,
): Promise<Array<{ id: string; lifecycleVersion: number; lineUserId: string | null }>> {
  return database.lineAccountBinding.findMany({
    where: { userId, unlinkedAt: null },
    orderBy: { id: "asc" },
    take: 2,
    select: { id: true, lifecycleVersion: true, lineUserId: true },
  });
}

function isPreferenceEnabledForCurrentBinding(
  preference: {
    enabled: boolean;
    bindingId: string;
    bindingLifecycleVersion: number;
  } | null,
  bindings: readonly { id: string; lifecycleVersion: number; lineUserId: string | null }[],
): boolean {
  const binding = bindings[0];
  return Boolean(
    preference?.enabled && bindings.length === 1 && binding?.lineUserId &&
    preference.bindingId === binding.id &&
    preference.bindingLifecycleVersion === binding.lifecycleVersion,
  );
}

export async function getOwnAppointmentLineNotificationPreference(
  actor: ActorContext | null | undefined,
  database?: PreferenceDatabase,
): Promise<OwnAppointmentLineNotificationPreference | null> {
  assertPatientSelfRole(actor);
  const db = databaseOf(database);
  const user = await loadCurrentPatientUser(actor, db);
  if (!user) return null;

  const [bindings, preference] = await Promise.all([
    currentBinding(user.id, db),
    db.lineAppointmentNotificationPreference.findUnique({
      where: { userId: user.id },
      select: { enabled: true, bindingId: true, bindingLifecycleVersion: true },
    }),
  ]);
  const enabled = isPreferenceEnabledForCurrentBinding(preference, bindings);
  const binding = bindings[0];
  return {
    enabled,
    canEnable: bindings.length === 1 && Boolean(binding?.lineUserId),
  };
}

async function lockPatientAndBinding(
  transaction: PreferenceTransaction,
  userId: string,
  bindingId: string | null,
): Promise<void> {
  await transaction.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
  if (bindingId) {
    await transaction.$queryRaw`SELECT "id" FROM "LineAccountBinding" WHERE "id" = ${bindingId}::uuid FOR UPDATE`;
  }
}

function isRetryableTransactionError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

export async function setOwnAppointmentLineNotificationPreference(
  actor: ActorContext | null | undefined,
  enabled: boolean,
  input: { database?: PreferenceDatabase; now?: () => Date } = {},
): Promise<OwnAppointmentLineNotificationPreference> {
  assertPatientSelfRole(actor);
  const db = databaseOf(input.database);
  const now = new Date((input.now?.() ?? new Date()).getTime());
  if (Number.isNaN(now.getTime())) throw new InfrastructureError("Preference time could not be resolved");

  let retryCount = 0;
  while (true) {
    try {
      return await db.$transaction(async (transaction) => {
        await lockPatientAndBinding(transaction, actor.userId, null);
        const currentUser = await loadCurrentPatientUser(actor, transaction);
        if (!currentUser) throw new ForbiddenError();

        const bindings = await currentBinding(actor.userId, transaction);
        if (bindings.length > 1) throw new ForbiddenError();
        const binding = bindings[0] ?? null;
        if (enabled && (!binding?.lineUserId || bindings.length !== 1)) throw new ForbiddenError();
        await lockPatientAndBinding(transaction, actor.userId, binding?.id ?? null);

        const preference = await transaction.lineAppointmentNotificationPreference.findUnique({
          where: { userId: actor.userId },
        });
        const currentlyEnabled = isPreferenceEnabledForCurrentBinding(preference, bindings);
        if (currentlyEnabled === enabled) {
          return { enabled, canEnable: Boolean(binding?.lineUserId) };
        }

        if (enabled && binding) {
          const preferenceVersion = (preference?.preferenceVersion ?? 0) + 1;
          await transaction.lineAppointmentNotificationPreference.upsert({
            where: { userId: actor.userId },
            create: {
              userId: actor.userId,
              bindingId: binding.id,
              bindingLifecycleVersion: binding.lifecycleVersion,
              preferenceVersion,
              enabled: true,
              changedAt: now,
            },
            update: {
              bindingId: binding.id,
              bindingLifecycleVersion: binding.lifecycleVersion,
              preferenceVersion,
              enabled: true,
              changedAt: now,
            },
          });
        } else if (preference) {
          await transaction.lineAppointmentNotificationPreference.update({
            where: { userId: actor.userId },
            data: {
              preferenceVersion: { increment: 1 },
              enabled: false,
              changedAt: now,
            },
          });
        }

        await recordAuditEvent({
          actorUserId: actor.userId,
          action: enabled ? "line.appointment_notifications.opted_in" : "line.appointment_notifications.opted_out",
          resourceType: "LineAppointmentNotificationPreference",
          resourceId: actor.userId,
          metadata: enabled && binding
            ? { bindingLifecycleVersion: binding.lifecycleVersion }
            : undefined,
        }, transaction);

        return { enabled, canEnable: Boolean(binding?.lineUserId) };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error: unknown) {
      if (!isRetryableTransactionError(error) || retryCount >= 2) throw error;
      retryCount += 1;
    }
  }
}

export const appointmentLineNotificationPreferenceInternals = {
  isPreferenceEnabledForCurrentBinding,
};
