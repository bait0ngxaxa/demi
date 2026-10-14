import "server-only";

import { HospitalStatus, Prisma, Role, UserStatus, type PrismaClient } from "@prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import { ForbiddenError, InfrastructureError } from "@/shared/errors/application-error";

export type OwnMedicationLineReminderPreference = { enabled: boolean; canEnable: boolean };

function assertPatient(actor: ActorContext | null | undefined): asserts actor is ActorContext {
  if (!actor || !actor.roles.includes(Role.PATIENT)) throw new ForbiddenError();
}

async function eligiblePatient(actor: ActorContext, database: PrismaClient | Prisma.TransactionClient): Promise<boolean> {
  const user = await database.user.findFirst({ where: { id: actor.userId, personId: actor.personId, status: UserStatus.ACTIVE, roles: { some: { role: Role.PATIENT } } }, select: { id: true } });
  if (!user) return false;
  return Boolean(await database.patientHospitalRelationship.findFirst({ where: { patientProfile: { personId: actor.personId }, hospital: { status: HospitalStatus.ACTIVE } }, select: { id: true } }));
}

async function bindings(userId: string, database: PrismaClient | Prisma.TransactionClient) {
  return database.lineAccountBinding.findMany({ where: { userId, unlinkedAt: null }, orderBy: { id: "asc" }, take: 2, select: { id: true, lifecycleVersion: true, lineUserId: true } });
}

function enabledForBinding(preference: { enabled: boolean; bindingId: string; bindingLifecycleVersion: number } | null, current: readonly { id: string; lifecycleVersion: number; lineUserId: string | null }[]): boolean {
  const binding = current[0];
  return Boolean(preference?.enabled && current.length === 1 && binding?.lineUserId && preference.bindingId === binding.id && preference.bindingLifecycleVersion === binding.lifecycleVersion);
}

export async function getOwnMedicationLineReminderPreference(actor: ActorContext | null | undefined, database: PrismaClient = getPrisma()): Promise<OwnMedicationLineReminderPreference> {
  assertPatient(actor);
  if (!await eligiblePatient(actor, database)) throw new ForbiddenError();
  const [current, preference] = await Promise.all([
    bindings(actor.userId, database),
    database.lineMedicationReminderPreference.findUnique({ where: { userId: actor.userId }, select: { enabled: true, bindingId: true, bindingLifecycleVersion: true } }),
  ]);
  return { enabled: enabledForBinding(preference, current), canEnable: current.length === 1 && Boolean(current[0]?.lineUserId) };
}

export async function setOwnMedicationLineReminderPreference(actor: ActorContext | null | undefined, enabled: boolean, input: { database?: PrismaClient; now?: () => Date } = {}): Promise<OwnMedicationLineReminderPreference> {
  assertPatient(actor);
  const database = input.database ?? getPrisma();
  const now = new Date((input.now?.() ?? new Date()).getTime());
  if (!Number.isFinite(now.getTime())) throw new InfrastructureError();
  try {
    return await database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${actor.userId}::uuid FOR UPDATE`;
      if (!await eligiblePatient(actor, transaction)) throw new ForbiddenError();
      const current = await bindings(actor.userId, transaction);
      if (current.length > 1) throw new ForbiddenError();
      const binding = current[0] ?? null;
      if (enabled && (!binding?.lineUserId || current.length !== 1)) throw new ForbiddenError();
      if (binding) await transaction.$queryRaw`SELECT "id" FROM "LineAccountBinding" WHERE "id" = ${binding.id}::uuid FOR UPDATE`;
      const preference = await transaction.lineMedicationReminderPreference.findUnique({ where: { userId: actor.userId } });
      if (enabledForBinding(preference, current) === enabled) return { enabled, canEnable: Boolean(binding?.lineUserId) };
      if (enabled && binding) {
        await transaction.lineMedicationReminderPreference.upsert({
          where: { userId: actor.userId },
          create: { userId: actor.userId, bindingId: binding.id, bindingLifecycleVersion: binding.lifecycleVersion, preferenceVersion: (preference?.preferenceVersion ?? 0) + 1, enabled: true, changedAt: now, updatedAt: now },
          update: { bindingId: binding.id, bindingLifecycleVersion: binding.lifecycleVersion, preferenceVersion: { increment: 1 }, enabled: true, changedAt: now, updatedAt: now },
        });
      } else if (preference) {
        await transaction.lineMedicationReminderPreference.update({ where: { userId: actor.userId }, data: { preferenceVersion: { increment: 1 }, enabled: false, changedAt: now, updatedAt: now } });
      }
      await recordAuditEvent({ actorUserId: actor.userId, action: enabled ? "line.medication_reminders.opted_in" : "line.medication_reminders.opted_out", resourceType: "LineMedicationReminderPreference", resourceId: actor.userId, metadata: enabled && binding ? { bindingLifecycleVersion: binding.lifecycleVersion } : undefined }, transaction);
      return { enabled, canEnable: Boolean(binding?.lineUserId) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error: unknown) {
    if (error instanceof ForbiddenError || error instanceof InfrastructureError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") throw error;
    throw new InfrastructureError("Medication reminder preference could not be saved");
  }
}

export const medicationLineReminderPreferenceInternals = { enabledForBinding, eligiblePatient };
