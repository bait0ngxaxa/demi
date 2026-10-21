import "server-only";

import { createHash, randomInt } from "node:crypto";

import {
  HospitalOnboardingApplicationStatus,
  HospitalRetirementEventKind,
  HospitalStatus,
  Prisma,
  Role,
  UserStatus,
  type PrismaClient,
} from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { recordAuditEvent, recordAuditEvents } from "@/modules/audit/services/audit-service";
import {
  ApplicationError,
  ConflictError,
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors/application-error";

import {
  HOSPITAL_BULK_REGISTRATION_LIMIT,
  HospitalRegistrationCsvParseError,
  normalizeHospitalName,
  parseHospitalRegistrationCsv,
  type HospitalRegistrationCsvError,
  type HospitalRegistrationCsvRow,
} from "../domain/hospital-registration-csv";
import {
  assertHospitalGovernanceCapability,
  HOSPITAL_GOVERNANCE_CAPABILITIES,
  type HospitalGovernanceCapability,
} from "../policies/hospital-governance-policy";
import {
  hospitalGovernanceBulkRegistrationApplySchema,
  hospitalGovernanceBulkRegistrationPreviewSchema,
  hospitalGovernanceBulkRetireSchema,
  hospitalGovernanceCreateSchema,
  hospitalGovernanceHospitalIdSchema,
  hospitalGovernanceMutationSchema,
  hospitalGovernanceRenameSchema,
  hospitalGovernanceRetirementSchema,
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
  retiredAt: Date | null;
  retiredReason: string | null;
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
  retiredAt: true,
  retiredReason: true,
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
    retiredAt: record.retiredAt,
    retiredReason: record.retiredReason,
  };
}

function parseExpectedUpdatedAt(value: string): Date {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError("Hospital governance version is invalid");
  }

  return parsed;
}

export async function assertPlatformAdminInDatabase(
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
  capability: HospitalGovernanceCapability,
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

// Unambiguous characters only (no 0/O, 1/I/L) so a generated code can be read aloud or typed back.
const GENERATED_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const GENERATED_CODE_ATTEMPTS = 5;

function generateHospitalCode(): string {
  let suffix = "";
  for (let index = 0; index < 6; index += 1) {
    suffix += GENERATED_CODE_ALPHABET[randomInt(GENERATED_CODE_ALPHABET.length)];
  }
  return `H-${suffix}`;
}

/** The requested code when free, else a generated `H-XXXXXX`; also used for Parent-registered Children (ADR-0018). */
export async function resolveNewHospitalCode(
  transaction: Prisma.TransactionClient,
  requested: string | undefined,
): Promise<string> {
  const candidates = requested ? [requested] : Array.from({ length: GENERATED_CODE_ATTEMPTS }, generateHospitalCode);
  for (const hospitalCode of candidates) {
    const existing = await transaction.hospital.findUnique({ where: { hospitalCode }, select: { id: true } });
    if (!existing) return hospitalCode;
  }
  throw new ConflictError(requested ? "A Hospital with this code already exists" : "A unique Hospital code could not be generated");
}

type HospitalRegistrationInput = {
  hospitalCode?: string;
  name: string;
  networkRole: "PARENT" | "CHILD";
  submissionNonce: string;
};

/**
 * N1-D5: a replayed nonce returns the Hospital it created when the same ADMIN sent the same registration;
 * any other use of the nonce is a conflict. Returns null while the nonce is unused.
 */
async function findReplayedRegistration(
  database: Pick<Prisma.TransactionClient, "hospital">,
  input: HospitalRegistrationInput,
  actorUserId: string,
): Promise<HospitalGovernanceProjection | null> {
  const existing = await database.hospital.findUnique({
    where: { registrationNonce: input.submissionNonce },
    select: {
      ...hospitalGovernanceSelect,
      registeredByUserId: true,
      serviceAreaEligibility: { select: { kind: true } },
    },
  });

  if (!existing) {
    return null;
  }

  if (
    existing.registeredByUserId !== actorUserId ||
    existing.name !== input.name ||
    existing.serviceAreaEligibility?.kind !== input.networkRole ||
    (input.hospitalCode !== undefined && existing.hospitalCode !== input.hospitalCode)
  ) {
    throw new ConflictError("This registration submission was already used for a different Hospital");
  }

  return toProjection(existing);
}

/**
 * ADR-0015/0017: Platform ADMIN registers every Hospital. It starts PENDING_VERIFICATION so the
 * onboarding approval stays the only activation path. Idempotent per submission nonce (N1-D5).
 */
export async function createHospital(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: HospitalGovernanceServiceDependencies = {},
): Promise<HospitalGovernanceProjection> {
  const parsed = hospitalGovernanceCreateSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Hospital registration data is invalid");
  }

  const currentActor = getMutationActor(actor, HOSPITAL_GOVERNANCE_CAPABILITIES.create);
  const database = getDatabase(dependencies);

  try {
    return await runSerializable(
      database,
      async (transaction) => {
        await assertPlatformAdminInDatabase(transaction, currentActor.userId);

        const replayed = await findReplayedRegistration(transaction, parsed.data, currentActor.userId);

        if (replayed) {
          return replayed;
        }

        const hospitalCode = await resolveNewHospitalCode(transaction, parsed.data.hospitalCode);

        const created = await transaction.hospital.create({
          data: {
            hospitalCode,
            name: parsed.data.name,
            status: HospitalStatus.PENDING_VERIFICATION,
            registrationNonce: parsed.data.submissionNonce,
            registeredByUserId: currentActor.userId,
            serviceAreaEligibility: {
              create: {
                kind: parsed.data.networkRole,
                verifiedAt: new Date(),
                classifiedByUserId: currentActor.userId,
              },
            },
          },
          select: hospitalGovernanceSelect,
        });

        await recordAuditEvent(
          {
            actorUserId: currentActor.userId,
            action: "hospital.created",
            resourceType: "Hospital",
            resourceId: created.id,
            metadata: {
              hospitalCode: created.hospitalCode,
              toStatus: created.status,
              networkRole: parsed.data.networkRole,
            },
          },
          transaction,
        );

        return toProjection(created);
      },
      // A duplicate code surfaces as a conflict, never a silent retry into success.
      0,
    );
  } catch (error: unknown) {
    if (isRetryableTransactionError(error)) {
      // A concurrent submit of the same nonce may have won: answer with its Hospital when it matches.
      let replayed: HospitalGovernanceProjection | null;

      try {
        replayed = await findReplayedRegistration(database, parsed.data, currentActor.userId);
      } catch (replayError: unknown) {
        throw normalizeDatabaseError(replayError, "Hospital registration could not be completed");
      }

      if (replayed) {
        return replayed;
      }
    }

    throw normalizeDatabaseError(error, "Hospital registration could not be completed");
  }
}

export type HospitalRetirementIneligibility = "NOT_FOUND" | "NOT_PENDING" | "ACTIVE_SERVICE_AREA" | "PENDING_APPLICATION";

export type HospitalRetirementIneligibleHospital = {
  hospitalId: string;
  hospitalCode: string | null;
  name: string | null;
  reason: HospitalRetirementIneligibility;
};

/** N1-D2/D4: nothing was retired; names every selected Hospital that blocked the operation. */
export class HospitalRetirementIneligibleError extends ConflictError {
  readonly ineligible: readonly HospitalRetirementIneligibleHospital[];

  constructor(ineligible: readonly HospitalRetirementIneligibleHospital[]) {
    super("Some selected Hospitals cannot be retired");
    this.name = "HospitalRetirementIneligibleError";
    this.ineligible = ineligible;
  }
}

type RetirementTarget = {
  hospitalIds: readonly string[];
  reason: string;
  /** Single-Hospital operation only (optimistic concurrency). */
  expectedUpdatedAt?: string;
};

async function retireHospitalsInTransaction(
  transaction: Prisma.TransactionClient,
  target: RetirementTarget,
  actorUserId: string,
): Promise<HospitalGovernanceProjection[]> {
  await assertPlatformAdminInDatabase(transaction, actorUserId);

  const hospitalIds = [...target.hospitalIds];
  const current = await transaction.hospital.findMany({
    where: { id: { in: hospitalIds } },
    select: {
      ...hospitalGovernanceSelect,
      onboardingApplications: {
        where: { status: HospitalOnboardingApplicationStatus.PENDING },
        take: 1,
        select: { id: true },
      },
      // ADR-0018: a Hospital in an active network association (either side) is never retired here.
      managedServiceAreas: { where: { endedAt: null }, take: 1, select: { id: true } },
      serviceAreaAssignments: { where: { endedAt: null }, take: 1, select: { id: true } },
    },
  });
  const byId = new Map(current.map((hospital) => [hospital.id, hospital]));
  let expectedUpdatedAt: Date | undefined;

  if (target.expectedUpdatedAt !== undefined) {
    const single = byId.get(hospitalIds[0] ?? "");

    if (!single) {
      throw new NotFoundError("The Hospital was not found");
    }

    expectedUpdatedAt = parseExpectedUpdatedAt(target.expectedUpdatedAt);

    if (single.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
      throw new ConflictError("The Hospital changed before this operation");
    }
  }

  const ineligible: HospitalRetirementIneligibleHospital[] = [];

  for (const hospitalId of hospitalIds) {
    const hospital = byId.get(hospitalId);
    const reason: HospitalRetirementIneligibility | null = !hospital
      ? "NOT_FOUND"
      : hospital.status !== HospitalStatus.PENDING_VERIFICATION
        ? "NOT_PENDING"
        : hospital.managedServiceAreas.length > 0 || hospital.serviceAreaAssignments.length > 0
          ? "ACTIVE_SERVICE_AREA"
          : hospital.onboardingApplications.length > 0
            ? "PENDING_APPLICATION"
            : null;

    if (reason) {
      ineligible.push({
        hospitalId,
        hospitalCode: hospital?.hospitalCode ?? null,
        name: hospital?.name ?? null,
        reason,
      });
    }
  }

  if (ineligible.length > 0) {
    throw new HospitalRetirementIneligibleError(ineligible);
  }

  const retiredAt = new Date();
  const updated = await transaction.hospital.updateMany({
    where: {
      id: { in: hospitalIds },
      status: HospitalStatus.PENDING_VERIFICATION,
      ...(expectedUpdatedAt ? { updatedAt: expectedUpdatedAt } : {}),
    },
    data: {
      status: HospitalStatus.RETIRED,
      retiredAt,
      retiredByUserId: actorUserId,
      retiredReason: target.reason,
    },
  });

  if (updated.count !== hospitalIds.length) {
    throw new ConflictError("A selected Hospital changed before this operation");
  }

  await transaction.hospitalRetirementEvent.createMany({
    data: hospitalIds.map((hospitalId) => ({
      hospitalId,
      kind: HospitalRetirementEventKind.RETIRED,
      reason: target.reason,
      actorUserId,
      createdAt: retiredAt,
    })),
  });

  await recordAuditEvents(
    hospitalIds.map((hospitalId) => ({
      actorUserId,
      action: "hospital.retired",
      resourceType: "Hospital",
      resourceId: hospitalId,
      metadata: {
        hospitalCode: byId.get(hospitalId)?.hospitalCode ?? null,
        fromStatus: HospitalStatus.PENDING_VERIFICATION,
        toStatus: HospitalStatus.RETIRED,
        reasonStored: true,
      },
    })),
    transaction,
  );

  const result = await transaction.hospital.findMany({
    where: { id: { in: hospitalIds } },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: hospitalGovernanceSelect,
  });

  return result.map(toProjection);
}

/** N1-D1: withdraw one unclaimed (PENDING_VERIFICATION) Hospital from the onboarding list. Nothing is deleted. */
export async function retireHospital(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: HospitalGovernanceServiceDependencies = {},
): Promise<HospitalGovernanceProjection> {
  const parsed = hospitalGovernanceRetirementSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Hospital retirement data is invalid");
  }

  const currentActor = getMutationActor(actor, HOSPITAL_GOVERNANCE_CAPABILITIES.retire);

  try {
    const [retired] = await runSerializable(
      getDatabase(dependencies),
      (transaction) =>
        retireHospitalsInTransaction(
          transaction,
          {
            hospitalIds: [parsed.data.hospitalId],
            reason: parsed.data.reason,
            expectedUpdatedAt: parsed.data.expectedUpdatedAt,
          },
          currentActor.userId,
        ),
      dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES,
    );

    if (!retired) {
      throw new InfrastructureError("The retired Hospital could not be read");
    }

    return retired;
  } catch (error: unknown) {
    throw normalizeDatabaseError(error, "Hospital retirement could not be completed");
  }
}

/** N1-D4: retire up to 100 unclaimed Hospitals with one shared reason, all-or-nothing. */
export async function retireHospitals(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: HospitalGovernanceServiceDependencies = {},
): Promise<HospitalGovernanceProjection[]> {
  const parsed = hospitalGovernanceBulkRetireSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Hospital bulk retirement data is invalid");
  }

  const currentActor = getMutationActor(actor, HOSPITAL_GOVERNANCE_CAPABILITIES.retire);

  try {
    return await runSerializable(
      getDatabase(dependencies),
      (transaction) =>
        retireHospitalsInTransaction(
          transaction,
          { hospitalIds: parsed.data.hospitalIds, reason: parsed.data.reason },
          currentActor.userId,
        ),
      dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES,
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error, "Hospital bulk retirement could not be completed");
  }
}

/** N1-D1: put a RETIRED Hospital back on the onboarding list (PENDING_VERIFICATION). */
export async function restoreRetiredHospital(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: HospitalGovernanceServiceDependencies = {},
): Promise<HospitalGovernanceProjection> {
  const parsed = hospitalGovernanceRetirementSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Hospital restore data is invalid");
  }

  const currentActor = getMutationActor(actor, HOSPITAL_GOVERNANCE_CAPABILITIES.restoreRetired);

  try {
    return await runSerializable(
      getDatabase(dependencies),
      async (transaction) => {
        await assertPlatformAdminInDatabase(transaction, currentActor.userId);

        const current = await transaction.hospital.findUnique({
          where: { id: parsed.data.hospitalId },
          select: hospitalGovernanceSelect,
        });

        if (!current) {
          throw new NotFoundError("The Hospital was not found");
        }

        if (current.updatedAt.getTime() !== parseExpectedUpdatedAt(parsed.data.expectedUpdatedAt).getTime()) {
          throw new ConflictError("The Hospital changed before this operation");
        }

        if (current.status !== HospitalStatus.RETIRED) {
          throw new ConflictError("The Hospital is not in the requested lifecycle state");
        }

        const updated = await transaction.hospital.updateMany({
          where: { id: current.id, status: HospitalStatus.RETIRED, updatedAt: current.updatedAt },
          data: {
            status: HospitalStatus.PENDING_VERIFICATION,
            retiredAt: null,
            retiredByUserId: null,
            retiredReason: null,
          },
        });

        if (updated.count !== 1) {
          throw new ConflictError("The Hospital changed before this operation");
        }

        await transaction.hospitalRetirementEvent.create({
          data: {
            hospitalId: current.id,
            kind: HospitalRetirementEventKind.RESTORED,
            reason: parsed.data.reason,
            actorUserId: currentActor.userId,
          },
        });

        const result = await transaction.hospital.findUnique({
          where: { id: current.id },
          select: hospitalGovernanceSelect,
        });

        if (!result) {
          throw new InfrastructureError("The updated Hospital could not be read");
        }

        await recordAuditEvent(
          {
            actorUserId: currentActor.userId,
            action: "hospital.retired_restored",
            resourceType: "Hospital",
            resourceId: result.id,
            metadata: {
              hospitalCode: result.hospitalCode,
              fromStatus: HospitalStatus.RETIRED,
              toStatus: HospitalStatus.PENDING_VERIFICATION,
              reasonStored: true,
            },
          },
          transaction,
        );

        return toProjection(result);
      },
      dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES,
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error, "Hospital restore could not be completed");
  }
}

export async function renameHospital(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: HospitalGovernanceServiceDependencies = {},
): Promise<HospitalGovernanceProjection> {
  const parsed = hospitalGovernanceRenameSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Hospital rename data is invalid");
  }

  const currentActor = getMutationActor(actor, HOSPITAL_GOVERNANCE_CAPABILITIES.rename);

  try {
    return await runSerializable(
      getDatabase(dependencies),
      async (transaction) => {
        await assertPlatformAdminInDatabase(transaction, currentActor.userId);

        const current = await transaction.hospital.findUnique({
          where: { id: parsed.data.hospitalId },
          select: hospitalGovernanceSelect,
        });

        if (!current) {
          throw new NotFoundError("The Hospital was not found");
        }

        if (current.updatedAt.getTime() !== parseExpectedUpdatedAt(parsed.data.expectedUpdatedAt).getTime()) {
          throw new ConflictError("The Hospital changed before this operation");
        }

        if (current.name === parsed.data.name) {
          throw new ValidationError("The Hospital already has this name");
        }

        const updated = await transaction.hospital.updateMany({
          where: { id: current.id, updatedAt: current.updatedAt },
          data: { name: parsed.data.name },
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
            actorUserId: currentActor.userId,
            action: "hospital.renamed",
            resourceType: "Hospital",
            resourceId: result.id,
            metadata: { fromName: current.name, toName: result.name },
          },
          transaction,
        );

        return toProjection(result);
      },
      dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES,
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error, "Hospital rename could not be completed");
  }
}

export type HospitalBulkRowStatus = "OK" | "INVALID" | "DUPLICATE_CODE_IN_FILE" | "CODE_EXISTS" | "SIMILAR_NAME";

export type HospitalBulkSimilarMatch = {
  source: "EXISTING" | "FILE";
  name: string;
  hospitalCode: string | null;
  /** EXISTING only. */
  status: HospitalStatus | null;
};

export type HospitalBulkPreviewRow = {
  rowNumber: number;
  name: string;
  hospitalCode: string | null;
  status: HospitalBulkRowStatus;
  similarTo: HospitalBulkSimilarMatch[];
};

export type HospitalBulkRegistrationResult = { hospitals: HospitalGovernanceProjection[]; replayed: boolean };

const BLOCKING_ROW_STATUSES: readonly HospitalBulkRowStatus[] = ["INVALID", "DUPLICATE_CODE_IN_FILE", "CODE_EXISTS"];

/** O1-A: nothing was registered. `rows` is the re-evaluated preview; `fileError` a file-level problem. */
export class HospitalBulkRegistrationRejectedError extends ValidationError {
  readonly rows: readonly HospitalBulkPreviewRow[];
  readonly fileError: HospitalRegistrationCsvError | null;
  readonly unconfirmedRowNumbers: readonly number[];

  constructor(input: { rows?: readonly HospitalBulkPreviewRow[]; fileError?: HospitalRegistrationCsvError; unconfirmedRowNumbers?: readonly number[] }) {
    super("The Hospital registration file cannot be applied");
    this.name = "HospitalBulkRegistrationRejectedError";
    this.rows = input.rows ?? [];
    this.fileError = input.fileError ?? null;
    this.unconfirmedRowNumbers = input.unconfirmedRowNumbers ?? [];
  }
}

function readRegistrationRows(csvText: string): HospitalRegistrationCsvRow[] {
  try {
    return parseHospitalRegistrationCsv(csvText);
  } catch (error: unknown) {
    if (error instanceof HospitalRegistrationCsvParseError) {
      throw new HospitalBulkRegistrationRejectedError({ fileError: error.reason });
    }
    throw error;
  }
}

/**
 * Per-row preview status. Blocking: invalid, a code repeated in the file, a code already registered. Not blocking but
 * needing explicit confirmation: a name equal (whitespace/case-normalised) to an existing Hospital or another row.
 */
async function evaluateRegistrationRows(
  database: Pick<Prisma.TransactionClient, "hospital">,
  rows: readonly HospitalRegistrationCsvRow[],
): Promise<HospitalBulkPreviewRow[]> {
  const codeCounts = new Map<string, number>();
  for (const row of rows) {
    if (row.valid && row.hospitalCode) codeCounts.set(row.hospitalCode, (codeCounts.get(row.hospitalCode) ?? 0) + 1);
  }
  // Whole registry by design: similarity is a normalised comparison, not an indexed lookup (ADMIN-only, bounded).
  const existing = await database.hospital.findMany({ select: { hospitalCode: true, name: true, status: true } });
  const existingCodes = new Set(existing.map(({ hospitalCode }) => hospitalCode));
  const existingByName = new Map<string, HospitalBulkSimilarMatch[]>();
  for (const hospital of existing) {
    const key = normalizeHospitalName(hospital.name);
    existingByName.set(key, [...(existingByName.get(key) ?? []), { source: "EXISTING", name: hospital.name, hospitalCode: hospital.hospitalCode, status: hospital.status }]);
  }
  const fileByName = new Map<string, HospitalRegistrationCsvRow[]>();
  for (const row of rows) {
    if (!row.valid) continue;
    const key = normalizeHospitalName(row.name);
    fileByName.set(key, [...(fileByName.get(key) ?? []), row]);
  }

  return rows.map((row) => {
    if (!row.valid) return { rowNumber: row.rowNumber, name: row.name, hospitalCode: row.hospitalCode, status: "INVALID", similarTo: [] };
    const key = normalizeHospitalName(row.name);
    const similarTo = [
      ...(existingByName.get(key) ?? []),
      ...(fileByName.get(key) ?? [])
        .filter(({ rowNumber }) => rowNumber !== row.rowNumber)
        .map((other): HospitalBulkSimilarMatch => ({ source: "FILE", name: other.name, hospitalCode: other.hospitalCode, status: null })),
    ];
    const status: HospitalBulkRowStatus = row.hospitalCode && (codeCounts.get(row.hospitalCode) ?? 0) > 1
      ? "DUPLICATE_CODE_IN_FILE"
      : row.hospitalCode && existingCodes.has(row.hospitalCode)
        ? "CODE_EXISTS"
        : similarTo.length > 0 ? "SIMILAR_NAME" : "OK";
    return { rowNumber: row.rowNumber, name: row.name, hospitalCode: row.hospitalCode, status, similarTo };
  });
}

/**
 * O1-A idempotency without a second token framework: row `index` of batch `nonce` is stored as an N1
 * `registrationNonce` derived deterministically (RFC 9562 version-8 layout of a SHA-256 digest).
 */
export function deriveBulkRegistrationRowNonce(batchNonce: string, index: number): string {
  const hex = createHash("sha256").update(`hospital-bulk-registration:${batchNonce.toLowerCase()}:${index}`, "utf8").digest("hex");
  const variant = ((Number.parseInt(hex[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** The original result of a replayed batch by the same ADMIN with the same rows; any other use is a conflict. */
async function findReplayedBulkRegistration(
  database: Pick<Prisma.TransactionClient, "hospital">,
  rows: readonly HospitalRegistrationCsvRow[],
  batchNonce: string,
  actorUserId: string,
): Promise<HospitalGovernanceProjection[] | null> {
  // One extra derived nonce detects an original batch with more rows than this one.
  const nonces = Array.from({ length: rows.length + 1 }, (_, index) => deriveBulkRegistrationRowNonce(batchNonce, index));
  const existing = await database.hospital.findMany({
    where: { registrationNonce: { in: nonces } },
    select: { ...hospitalGovernanceSelect, registrationNonce: true, registeredByUserId: true, serviceAreaEligibility: { select: { kind: true } } },
  });
  if (existing.length === 0) return null;

  const byNonce = new Map(existing.map((hospital) => [hospital.registrationNonce, hospital]));
  const matched = rows.map((row, index) => {
    const hospital = byNonce.get(nonces[index] ?? "");
    return hospital &&
      hospital.registeredByUserId === actorUserId &&
      hospital.name === row.name &&
      hospital.serviceAreaEligibility?.kind === "PARENT" &&
      (row.hospitalCode === null || hospital.hospitalCode === row.hospitalCode)
      ? hospital
      : null;
  });
  if (existing.length !== rows.length || matched.some((hospital) => hospital === null)) {
    throw new ConflictError("This registration batch was already used for different Hospitals");
  }
  return matched.flatMap((hospital) => (hospital ? [toProjection(hospital)] : []));
}

/** O1-A preview: parses and evaluates the file; nothing is written. */
export async function previewHospitalBulkRegistration(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: HospitalGovernanceServiceDependencies = {},
): Promise<HospitalBulkPreviewRow[]> {
  const parsed = hospitalGovernanceBulkRegistrationPreviewSchema.safeParse(input);

  if (!parsed.success) {
    throw new HospitalBulkRegistrationRejectedError({ fileError: "EMPTY" });
  }

  const currentActor = getMutationActor(actor, HOSPITAL_GOVERNANCE_CAPABILITIES.create);
  const rows = readRegistrationRows(parsed.data.csvText);

  try {
    return await runSerializable(
      getDatabase(dependencies),
      async (transaction) => {
        await assertPlatformAdminInDatabase(transaction, currentActor.userId);
        return evaluateRegistrationRows(transaction, rows);
      },
      dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES,
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error, "Hospital registration preview could not be completed");
  }
}

/**
 * O1-A apply: every row becomes a PENDING_VERIFICATION Hospital with network role PARENT in ONE serializable
 * transaction, all-or-nothing. Rows are re-evaluated here; a blocking row or an unconfirmed similar name rejects the
 * whole file. One `hospital.created` per row plus one `hospital.bulk_registered` summary (row count only).
 */
export async function applyHospitalBulkRegistration(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: HospitalGovernanceServiceDependencies = {},
): Promise<HospitalBulkRegistrationResult> {
  const parsed = hospitalGovernanceBulkRegistrationApplySchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Hospital bulk registration data is invalid");
  }

  const currentActor = getMutationActor(actor, HOSPITAL_GOVERNANCE_CAPABILITIES.create);
  const rows = readRegistrationRows(parsed.data.csvText);
  const confirmed = new Set(parsed.data.confirmedRowNumbers);
  const database = getDatabase(dependencies);

  try {
    return await runSerializable(
      database,
      async (transaction) => {
        await assertPlatformAdminInDatabase(transaction, currentActor.userId);

        const replayed = await findReplayedBulkRegistration(transaction, rows, parsed.data.submissionNonce, currentActor.userId);
        if (replayed) return { hospitals: replayed, replayed: true };

        const evaluated = await evaluateRegistrationRows(transaction, rows);
        const unconfirmedRowNumbers = evaluated
          .filter(({ status, rowNumber }) => status === "SIMILAR_NAME" && !confirmed.has(rowNumber))
          .map(({ rowNumber }) => rowNumber);
        if (evaluated.some(({ status }) => BLOCKING_ROW_STATUSES.includes(status)) || unconfirmedRowNumbers.length > 0) {
          throw new HospitalBulkRegistrationRejectedError({ rows: evaluated, unconfirmedRowNumbers });
        }

        // A generated code must not take a code another row of this file asks for.
        const requestedCodes = new Set(rows.flatMap(({ hospitalCode }) => (hospitalCode ? [hospitalCode] : [])));
        const verifiedAt = new Date();
        const created: HospitalGovernanceProjection[] = [];
        for (const [index, row] of rows.entries()) {
          let hospitalCode = await resolveNewHospitalCode(transaction, row.hospitalCode ?? undefined);
          while (!row.hospitalCode && requestedCodes.has(hospitalCode)) {
            hospitalCode = await resolveNewHospitalCode(transaction, undefined);
          }
          const hospital = await transaction.hospital.create({
            data: {
              hospitalCode,
              name: row.name,
              status: HospitalStatus.PENDING_VERIFICATION,
              registrationNonce: deriveBulkRegistrationRowNonce(parsed.data.submissionNonce, index),
              registeredByUserId: currentActor.userId,
              serviceAreaEligibility: { create: { kind: "PARENT", verifiedAt, classifiedByUserId: currentActor.userId } },
            },
            select: hospitalGovernanceSelect,
          });
          created.push(toProjection(hospital));
        }

        await recordAuditEvents(
          [
            ...created.map((hospital) => ({
              actorUserId: currentActor.userId,
              action: "hospital.created",
              resourceType: "Hospital",
              resourceId: hospital.id,
              metadata: { hospitalCode: hospital.hospitalCode, toStatus: hospital.status, networkRole: "PARENT", source: "bulk_registration" },
            })),
            {
              actorUserId: currentActor.userId,
              action: "hospital.bulk_registered",
              resourceType: "HospitalBulkRegistration",
              resourceId: parsed.data.submissionNonce,
              metadata: { rowCount: created.length },
            },
          ],
          transaction,
        );

        return { hospitals: created, replayed: false };
      },
      // A conflicting code or a concurrent replay surfaces as a conflict, never a silent retry into success.
      0,
    );
  } catch (error: unknown) {
    if (isRetryableTransactionError(error)) {
      let replayed: HospitalGovernanceProjection[] | null;

      try {
        replayed = await findReplayedBulkRegistration(database, rows, parsed.data.submissionNonce, currentActor.userId);
      } catch (replayError: unknown) {
        throw normalizeDatabaseError(replayError, "Hospital bulk registration could not be completed");
      }

      if (replayed) {
        return { hospitals: replayed, replayed: true };
      }
    }

    throw normalizeDatabaseError(error, "Hospital bulk registration could not be completed");
  }
}

export { HOSPITAL_BULK_REGISTRATION_LIMIT };

export const hospitalGovernanceServiceInternals = {
  DEFAULT_DIRECTORY_LIMIT,
  hospitalGovernanceSelect,
};
