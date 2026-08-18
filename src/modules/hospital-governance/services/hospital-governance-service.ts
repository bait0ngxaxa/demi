import "server-only";

import { HospitalStatus, Prisma, Role, UserStatus, type PrismaClient } from "@prisma/client";

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
  assertHospitalGovernanceCapability,
  HOSPITAL_GOVERNANCE_CAPABILITIES,
} from "../policies/hospital-governance-policy";
import {
  hospitalGovernanceHospitalIdSchema,
  hospitalGovernanceMutationSchema,
  type HospitalGovernanceMutationInput,
} from "../schemas/hospital-governance-schemas";

export type HospitalGovernanceDatabase = PrismaClient;

export type HospitalGovernanceProjection = {
  id: string;
  hospitalCode: string;
  name: string;
  status: HospitalStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type HospitalGovernanceServiceDependencies = {
  database?: HospitalGovernanceDatabase;
  transactionRetries?: number;
};

const DEFAULT_DIRECTORY_LIMIT = 100;
const DEFAULT_TRANSACTION_RETRIES = 2;

const hospitalGovernanceSelect = {
  id: true,
  hospitalCode: true,
  name: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.HospitalSelect;

type HospitalGovernanceRecord = Prisma.HospitalGetPayload<{
  select: typeof hospitalGovernanceSelect;
}>;

type HospitalGovernanceStatusTransition = {
  capability:
    | (typeof HOSPITAL_GOVERNANCE_CAPABILITIES.suspend)
    | (typeof HOSPITAL_GOVERNANCE_CAPABILITIES.restore);
  expectedStatus: HospitalStatus;
  nextStatus: HospitalStatus;
  action: "hospital.suspended" | "hospital.restored";
};

function getDatabase(dependencies: HospitalGovernanceServiceDependencies): HospitalGovernanceDatabase {
  return dependencies.database ?? getPrisma();
}

function isKnownRequestError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

function isRetryableTransactionError(error: unknown): boolean {
  return isKnownRequestError(error, "P2034") || isKnownRequestError(error, "P2002");
}

function normalizeDatabaseError(error: unknown, fallbackMessage: string): ApplicationError {
  if (error instanceof ApplicationError) {
    return error;
  }

  if (isKnownRequestError(error, "P2002") || isKnownRequestError(error, "P2034")) {
    return new ConflictError("The Hospital governance operation conflicted with another request");
  }

  return new InfrastructureError(fallbackMessage);
}

async function runSerializable<T>(
  database: HospitalGovernanceDatabase,
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

function toProjection(record: HospitalGovernanceRecord): HospitalGovernanceProjection {
  return {
    id: record.id,
    hospitalCode: record.hospitalCode,
    name: record.name,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function parseExpectedUpdatedAt(value: string): Date {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError("Hospital governance version is invalid");
  }

  return parsed;
}

async function assertPlatformAdminInDatabase(
  transaction: Prisma.TransactionClient,
  actorUserId: string,
): Promise<void> {
  const actor = await transaction.user.findUnique({
    where: { id: actorUserId },
    select: {
      status: true,
      roles: { select: { role: true } },
    },
  });

  if (actor?.status !== UserStatus.ACTIVE || !actor.roles.some(({ role }) => role === Role.ADMIN)) {
    throw new ForbiddenError();
  }
}

async function transitionHospitalInTransaction(
  transaction: Prisma.TransactionClient,
  input: HospitalGovernanceMutationInput,
  actorUserId: string,
  transition: HospitalGovernanceStatusTransition,
): Promise<HospitalGovernanceProjection> {
  await assertPlatformAdminInDatabase(transaction, actorUserId);

  const current = await transaction.hospital.findUnique({
    where: { id: input.hospitalId },
    select: hospitalGovernanceSelect,
  });

  if (!current) {
    throw new NotFoundError("The Hospital was not found");
  }

  if (current.status !== transition.expectedStatus) {
    throw new ConflictError("The Hospital is not in the requested lifecycle state");
  }

  const expectedUpdatedAt = parseExpectedUpdatedAt(input.expectedUpdatedAt);

  if (current.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
    throw new ConflictError("The Hospital changed before this operation");
  }

  const updated = await transaction.hospital.updateMany({
    where: {
      id: current.id,
      status: transition.expectedStatus,
      updatedAt: current.updatedAt,
    },
    data: { status: transition.nextStatus },
  });

  if (updated.count !== 1) {
    throw new ConflictError("The Hospital changed before this operation");
  }

  const result = await transaction.hospital.findUnique({
    where: { id: current.id },
    select: hospitalGovernanceSelect,
  });

  if (!result) {
    throw new InfrastructureError("The updated Hospital could not be read");
  }

  await recordAuditEvent(
    {
      actorUserId,
      action: transition.action,
      resourceType: "Hospital",
      resourceId: result.id,
      metadata: {
        fromStatus: transition.expectedStatus,
        toStatus: transition.nextStatus,
      },
    },
    transaction,
  );

  return toProjection(result);
}

export async function listHospitalGovernanceDirectory(
  actor: ActorContext | null | undefined,
  database: HospitalGovernanceDatabase = getPrisma(),
): Promise<HospitalGovernanceProjection[]> {
  assertHospitalGovernanceCapability(
    actor,
    HOSPITAL_GOVERNANCE_CAPABILITIES.readGovernance,
  );

  try {
    const hospitals = await database.hospital.findMany({
      where: {
        status: { in: [HospitalStatus.ACTIVE, HospitalStatus.SUSPENDED] },
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: DEFAULT_DIRECTORY_LIMIT,
      select: hospitalGovernanceSelect,
    });

    return hospitals.map(toProjection);
  } catch (error: unknown) {
    throw normalizeDatabaseError(error, "Hospital governance directory could not be loaded");
  }
}

export async function getHospitalGovernanceDetail(
  actor: ActorContext | null | undefined,
  hospitalId: unknown,
  database: HospitalGovernanceDatabase = getPrisma(),
): Promise<HospitalGovernanceProjection> {
  assertHospitalGovernanceCapability(
    actor,
    HOSPITAL_GOVERNANCE_CAPABILITIES.readGovernance,
  );

  const parsedHospitalId = hospitalGovernanceHospitalIdSchema.safeParse(hospitalId);

  if (!parsedHospitalId.success) {
    throw new NotFoundError("The Hospital was not found");
  }

  try {
    const hospital = await database.hospital.findUnique({
      where: { id: parsedHospitalId.data },
      select: hospitalGovernanceSelect,
    });

    if (!hospital) {
      throw new NotFoundError("The Hospital was not found");
    }

    return toProjection(hospital);
  } catch (error: unknown) {
    throw normalizeDatabaseError(error, "Hospital governance detail could not be loaded");
  }
}

function getMutationActor(
  actor: ActorContext | null | undefined,
  capability: HospitalGovernanceStatusTransition["capability"],
): ActorContext {
  assertHospitalGovernanceCapability(actor, capability);

  if (!actor) {
    throw new ForbiddenError();
  }

  return actor;
}

async function transitionHospital(
  actor: ActorContext | null | undefined,
  input: unknown,
  transition: HospitalGovernanceStatusTransition,
  dependencies: HospitalGovernanceServiceDependencies,
): Promise<HospitalGovernanceProjection> {
  const parsed = hospitalGovernanceMutationSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Hospital governance transition data is invalid");
  }

  const currentActor = getMutationActor(actor, transition.capability);

  try {
    return await runSerializable(
      getDatabase(dependencies),
      (transaction) =>
        transitionHospitalInTransaction(transaction, parsed.data, currentActor.userId, transition),
      dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES,
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error, "Hospital governance lifecycle operation could not be completed");
  }
}

export async function suspendHospital(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: HospitalGovernanceServiceDependencies = {},
): Promise<HospitalGovernanceProjection> {
  return transitionHospital(
    actor,
    input,
    {
      capability: HOSPITAL_GOVERNANCE_CAPABILITIES.suspend,
      expectedStatus: HospitalStatus.ACTIVE,
      nextStatus: HospitalStatus.SUSPENDED,
      action: "hospital.suspended",
    },
    dependencies,
  );
}

export async function restoreHospital(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: HospitalGovernanceServiceDependencies = {},
): Promise<HospitalGovernanceProjection> {
  return transitionHospital(
    actor,
    input,
    {
      capability: HOSPITAL_GOVERNANCE_CAPABILITIES.restore,
      expectedStatus: HospitalStatus.SUSPENDED,
      nextStatus: HospitalStatus.ACTIVE,
      action: "hospital.restored",
    },
    dependencies,
  );
}

export const hospitalGovernanceServiceInternals = {
  DEFAULT_DIRECTORY_LIMIT,
  hospitalGovernanceSelect,
};
