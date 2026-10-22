import "server-only";

import { HospitalStatus, MembershipStatus, MembershipType, Role, UserStatus, Prisma, type PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import { ApplicationError, ConflictError, ForbiddenError, InfrastructureError, ValidationError } from "@/shared/errors/application-error";

import { hospitalSelfRegistrationSettingSchema, type HospitalSelfRegistrationSettingInput } from "../schemas/hospital-self-registration-settings-schema";

export type HospitalSelfRegistrationSetting = {
  hospitalId: string;
  hospitalName: string;
  enabled: boolean;
};

export type HospitalSelfRegistrationSettingsDependencies = {
  database?: PrismaClient;
  transactionRetries?: number;
};

function getDatabase(dependencies: HospitalSelfRegistrationSettingsDependencies): PrismaClient {
  return dependencies.database ?? getPrisma();
}

function isRetryableTransactionError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2034" || error.code === "P2002");
}

async function runSerializable<T>(
  database: PrismaClient,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  retryLimit: number,
): Promise<T> {
  let retryCount = 0;
  while (true) {
    try {
      return await database.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error: unknown) {
      if (!isRetryableTransactionError(error) || retryCount >= retryLimit) throw error;
      retryCount += 1;
    }
  }
}

export async function listOwnedHospitalSelfRegistrationSettings(
  actor: ActorContext,
  dependencies: HospitalSelfRegistrationSettingsDependencies = {},
): Promise<HospitalSelfRegistrationSetting[]> {
  if (!actor.roles.includes(Role.HOSPITAL) || actor.roles.includes(Role.ADMIN)) return [];
  try {
    const hospitals = await getDatabase(dependencies).hospital.findMany({
      where: {
        status: HospitalStatus.ACTIVE,
        memberships: {
          some: {
            userId: actor.userId,
            membershipType: MembershipType.OWNER,
            status: MembershipStatus.ACTIVE,
            user: {
              status: UserStatus.ACTIVE,
              roles: { some: { role: Role.HOSPITAL }, none: { role: Role.ADMIN } },
            },
          },
        },
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: { id: true, name: true, selfRegistrationEnabled: true },
    });
    return hospitals.map(({ id, name, selfRegistrationEnabled }) => ({
      hospitalId: id,
      hospitalName: name,
      enabled: selfRegistrationEnabled,
    }));
  } catch (error: unknown) {
    if (error instanceof ApplicationError) throw error;
    throw new InfrastructureError("Hospital self-registration settings could not be loaded");
  }
}

export async function setHospitalSelfRegistrationEnabled(
  actor: ActorContext | null | undefined,
  input: HospitalSelfRegistrationSettingInput,
  dependencies: HospitalSelfRegistrationSettingsDependencies = {},
): Promise<{ enabled: boolean; changed: boolean }> {
  const parsed = hospitalSelfRegistrationSettingSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Hospital self-registration setting is invalid");
  if (!actor || !actor.roles.includes(Role.HOSPITAL) || actor.roles.includes(Role.ADMIN)) throw new ForbiddenError();

  try {
    return await runSerializable(
      getDatabase(dependencies),
      async (transaction) => {
        const hospital = await transaction.hospital.findUnique({
          where: { id: parsed.data.hospitalId },
          select: { id: true, status: true, selfRegistrationEnabled: true },
        });
        const ownerMembership = await transaction.hospitalMembership.findFirst({
          where: {
            userId: actor.userId,
            hospitalId: parsed.data.hospitalId,
            membershipType: MembershipType.OWNER,
            status: MembershipStatus.ACTIVE,
            hospital: { status: HospitalStatus.ACTIVE },
            user: {
              status: UserStatus.ACTIVE,
              roles: { some: { role: Role.HOSPITAL }, none: { role: Role.ADMIN } },
            },
          },
          select: { id: true },
        });
        if (!hospital || hospital.status !== HospitalStatus.ACTIVE || !ownerMembership) {
          throw new ForbiddenError();
        }
        if (hospital.selfRegistrationEnabled === parsed.data.enabled) {
          return { enabled: hospital.selfRegistrationEnabled, changed: false };
        }

        const updated = await transaction.hospital.updateMany({
          where: {
            id: hospital.id,
            status: HospitalStatus.ACTIVE,
            selfRegistrationEnabled: hospital.selfRegistrationEnabled,
          },
          data: { selfRegistrationEnabled: parsed.data.enabled },
        });
        if (updated.count !== 1) throw new ConflictError("Hospital self-registration setting changed concurrently");

        await recordAuditEvent({
          actorUserId: actor.userId,
          action: parsed.data.enabled ? "self_registration.setting_enabled" : "self_registration.setting_disabled",
          resourceType: "Hospital",
          resourceId: hospital.id,
          metadata: { enabled: parsed.data.enabled },
        }, transaction);
        return { enabled: parsed.data.enabled, changed: true };
      },
      dependencies.transactionRetries ?? 2,
    );
  } catch (error: unknown) {
    if (error instanceof ApplicationError) throw error;
    throw new InfrastructureError("Hospital self-registration setting could not be saved");
  }
}
