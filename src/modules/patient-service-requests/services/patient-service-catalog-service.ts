import "server-only";

import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  PatientServiceCode,
  Prisma,
  Role,
  UserStatus,
  type PrismaClient,
} from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import { runSerializableTransaction } from "@/lib/db/serializable-transaction";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import {
  ConflictError,
  ForbiddenError,
  InfrastructureError,
  ValidationError,
} from "@/shared/errors/application-error";

import {
  PATIENT_SERVICE_REQUEST_CAPABILITIES,
  decidePatientServiceRequestPolicy,
} from "../policies/patient-service-request-policy";
import {
  hospitalServiceOfferingMutationSchema,
} from "../schemas/patient-service-request-schemas";

export type PatientServiceCatalogDatabase = PrismaClient;

export type PatientServiceCatalogDependencies = {
  database?: PatientServiceCatalogDatabase;
  transactionRetries?: number;
};

export type ManagedHospitalServiceCatalog = {
  hospitalId: string;
  hospitalCode: string;
  hospitalName: string;
  offerings: readonly { code: PatientServiceCode; enabled: boolean }[];
};

const supportedServiceCodes = Object.values(PatientServiceCode);

function getDatabase(dependencies: PatientServiceCatalogDependencies): PrismaClient {
  return dependencies.database ?? getPrisma();
}

function normalizeDatabaseError(error: unknown): Error {
  if (
    error instanceof ValidationError ||
    error instanceof ForbiddenError ||
    error instanceof ConflictError ||
    error instanceof InfrastructureError
  ) {
    return error;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002" || error.code === "P2034") {
      return new ConflictError("Hospital service settings changed concurrently");
    }
  }

  return new InfrastructureError("Hospital service settings could not be saved");
}

function assertCatalogPolicy(actor: ActorContext | null | undefined, hospitalId: string): void {
  const decision = decidePatientServiceRequestPolicy({
    actor,
    capability: PATIENT_SERVICE_REQUEST_CAPABILITIES.manageCatalog,
    hospitalId,
  });

  if (!decision.allowed) {
    throw new ForbiddenError();
  }
}

async function assertPersistedOwnerScope(
  transaction: Prisma.TransactionClient,
  userId: string,
  hospitalId: string,
): Promise<void> {
  const user = await transaction.user.findUnique({
    where: { id: userId },
    select: { status: true, roles: { select: { role: true } } },
  });

  if (
    !user ||
    user.status !== UserStatus.ACTIVE ||
    !user.roles.some(({ role }) => role === Role.HOSPITAL) ||
    user.roles.some(({ role }) => role === Role.ADMIN)
  ) {
    throw new ForbiddenError();
  }

  const membership = await transaction.hospitalMembership.findFirst({
    where: {
      userId,
      hospitalId,
      membershipType: MembershipType.OWNER,
      status: MembershipStatus.ACTIVE,
      hospital: { status: HospitalStatus.ACTIVE },
    },
    select: { id: true },
  });

  if (!membership) {
    throw new ForbiddenError();
  }
}

export async function listManagedHospitalServiceCatalog(
  actor: ActorContext | null | undefined,
  dependencies: PatientServiceCatalogDependencies = {},
): Promise<readonly ManagedHospitalServiceCatalog[]> {
  if (!actor) {
    throw new ForbiddenError();
  }

  const database = getDatabase(dependencies);

  try {
    const persistedActor = await database.user.findUnique({
      where: { id: actor.userId },
      select: { status: true, roles: { select: { role: true } } },
    });

    if (
      !persistedActor ||
      persistedActor.status !== UserStatus.ACTIVE ||
      !persistedActor.roles.some(({ role }) => role === Role.HOSPITAL) ||
      persistedActor.roles.some(({ role }) => role === Role.ADMIN)
    ) {
      throw new ForbiddenError();
    }

    const memberships = await database.hospitalMembership.findMany({
      where: {
        userId: actor.userId,
        membershipType: MembershipType.OWNER,
        status: MembershipStatus.ACTIVE,
        hospital: { status: HospitalStatus.ACTIVE },
      },
      select: {
        hospital: {
          select: {
            id: true,
            hospitalCode: true,
            name: true,
            serviceOfferings: { select: { code: true, enabled: true } },
          },
        },
      },
      orderBy: { hospital: { name: "asc" } },
    });

    return memberships.map(({ hospital }) => {
      const configured = new Map(
        hospital.serviceOfferings.map((offering) => [offering.code, offering.enabled]),
      );

      return {
        hospitalId: hospital.id,
        hospitalCode: hospital.hospitalCode,
        hospitalName: hospital.name,
        offerings: supportedServiceCodes.map((code) => ({
          code,
          enabled: configured.get(code) ?? false,
        })),
      };
    });
  } catch (error: unknown) {
    throw normalizeDatabaseError(error);
  }
}

export async function setHospitalServiceOffering(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: PatientServiceCatalogDependencies = {},
): Promise<void> {
  const parsed = hospitalServiceOfferingMutationSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Hospital service catalog input is invalid");
  }

  assertCatalogPolicy(actor, parsed.data.hospitalId);

  if (!actor) {
    throw new ForbiddenError();
  }

  try {
    await runSerializableTransaction(
      getDatabase(dependencies),
      async (transaction) => {
        await assertPersistedOwnerScope(transaction, actor.userId, parsed.data.hospitalId);

        const current = await transaction.hospitalServiceOffering.findUnique({
          where: {
            hospitalId_code: {
              hospitalId: parsed.data.hospitalId,
              code: parsed.data.code,
            },
          },
          select: { id: true, enabled: true },
        });

        if (current?.enabled === parsed.data.enabled) {
          return;
        }

        await transaction.hospitalServiceOffering.upsert({
          where: {
            hospitalId_code: {
              hospitalId: parsed.data.hospitalId,
              code: parsed.data.code,
            },
          },
          create: {
            hospitalId: parsed.data.hospitalId,
            code: parsed.data.code,
            enabled: parsed.data.enabled,
            createdByUserId: actor.userId,
            updatedByUserId: actor.userId,
          },
          update: {
            enabled: parsed.data.enabled,
            updatedByUserId: actor.userId,
          },
          select: { id: true },
        });

        await recordAuditEvent(
          {
            actorUserId: actor.userId,
            action: "HOSPITAL_SERVICE_OFFERING_CHANGED",
            resourceType: "HospitalServiceOffering",
            resourceId: current?.id ?? `${parsed.data.hospitalId}:${parsed.data.code}`,
            metadata: {
              hospitalId: parsed.data.hospitalId,
              serviceCode: parsed.data.code,
              enabled: parsed.data.enabled,
            },
          },
          transaction,
        );
      },
      dependencies.transactionRetries,
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error);
  }
}

export const patientServiceCatalogInternals = {
  assertPersistedOwnerScope,
  assertCatalogPolicy,
  normalizeDatabaseError,
};
