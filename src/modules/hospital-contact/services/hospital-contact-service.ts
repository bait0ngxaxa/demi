import "server-only";

import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Prisma,
  Role,
  UserStatus,
  type PrismaClient,
} from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import {
  ConflictError,
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors/application-error";

import { decideHospitalContactMutation, nextHospitalContactVersion } from "../domain/hospital-contact-mutation";
import {
  assertHospitalContactPolicy,
  HOSPITAL_CONTACT_CAPABILITIES,
} from "../policies/hospital-contact-policy";
import {
  hospitalContactHospitalIdSchema,
  hospitalContactMutationSchema,
  type HospitalContactMutationInput,
} from "../schemas/hospital-contact-schemas";
import type {
  HospitalContactEditorProjection,
  HospitalContactMutationResult,
  HospitalContactOwnerHospital,
  PatientHospitalContactRead,
} from "../types/hospital-contact-projections";

export type HospitalContactDatabase = PrismaClient;
export type {
  HospitalContactEditorProjection,
  HospitalContactMutationResult,
  HospitalContactOwnerHospital,
  PatientHospitalContactProjection,
  PatientHospitalContactRead,
} from "../types/hospital-contact-projections";

export type HospitalContactServiceDependencies = {
  database?: HospitalContactDatabase;
  now?: () => Date;
  random?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
};

const MAX_TRANSACTION_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [25, 50] as const;

const hospitalContactEditorSelect = {
  id: true,
  hospitalCode: true,
  name: true,
  contact: {
    select: {
      addressText: true,
      phoneNumber: true,
      updatedAt: true,
    },
  },
} satisfies Prisma.HospitalSelect;

const patientContactSelect = {
  hospitalCode: true,
  name: true,
  status: true,
  contact: {
    select: {
      addressText: true,
      phoneNumber: true,
    },
  },
} satisfies Prisma.HospitalSelect;

type HospitalContactEditorRecord = Prisma.HospitalGetPayload<{
  select: typeof hospitalContactEditorSelect;
}>;

type LockedUserRow = { id: string; status: UserStatus; personId: string };
type LockedRoleRow = { userId: string; role: Role };
type LockedHospitalRow = { id: string; status: HospitalStatus };
type LockedMembershipRow = {
  id: string;
  membershipType: MembershipType;
  status: MembershipStatus;
};

class HospitalContactAuditFailure extends Error {
  constructor() {
    super("Hospital Contact audit failed");
    this.name = "HospitalContactAuditFailure";
  }
}

function getDatabase(dependencies: HospitalContactServiceDependencies): HospitalContactDatabase {
  return dependencies.database ?? getPrisma();
}

function isKnownPrismaError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

function getPostgresSqlState(error: unknown, visited = new Set<object>()): string | null {
  if (typeof error !== "object" || error === null || visited.has(error)) {
    return null;
  }

  visited.add(error);
  const record = error as Record<string, unknown>;
  const direct = record.sqlState ?? record.code;

  if (direct === "40P01") {
    return "40P01";
  }

  const meta = record.meta;

  if (typeof meta === "object" && meta !== null) {
    const metaRecord = meta as Record<string, unknown>;

    if (metaRecord.code === "40P01" || metaRecord.sqlState === "40P01") {
      return "40P01";
    }
  }

  return getPostgresSqlState(record.cause, visited);
}

function isRetryableTransactionFailure(error: unknown): boolean {
  return isKnownPrismaError(error, "P2034") || getPostgresSqlState(error) === "40P01";
}

function toEditorProjection(record: HospitalContactEditorRecord): HospitalContactEditorProjection {
  return {
    hospital: {
      id: record.id,
      hospitalCode: record.hospitalCode,
      name: record.name,
    },
    addressText: record.contact?.addressText ?? null,
    phoneNumber: record.contact?.phoneNumber ?? null,
    expectedUpdatedAt: record.contact?.updatedAt.toISOString() ?? null,
  };
}

function getActiveOwnerHospitalWhere(actor: ActorContext): Prisma.HospitalWhereInput {
  return {
    status: HospitalStatus.ACTIVE,
    memberships: {
      some: {
        userId: actor.userId,
        membershipType: MembershipType.OWNER,
        status: MembershipStatus.ACTIVE,
        user: {
          status: UserStatus.ACTIVE,
          personId: actor.personId,
          roles: { some: { role: Role.HOSPITAL } },
        },
      },
    },
  };
}

export async function listEligibleHospitalContactOwnerHospitals(
  actor: ActorContext | null | undefined,
  database: HospitalContactDatabase = getPrisma(),
): Promise<HospitalContactOwnerHospital[]> {
  assertHospitalContactPolicy({
    actor,
    capability: HOSPITAL_CONTACT_CAPABILITIES.read,
    scope: "DIRECT_HOSPITAL_OWNER",
  });

  if (!actor) {
    throw new ForbiddenError();
  }

  try {
    return await database.hospital.findMany({
      where: getActiveOwnerHospitalWhere(actor),
      orderBy: [{ name: "asc" }, { hospitalCode: "asc" }, { id: "asc" }],
      select: { id: true, hospitalCode: true, name: true },
    });
  } catch {
    throw new InfrastructureError("Hospital Contact directory could not be loaded");
  }
}

export async function readHospitalContactForOwner(
  actor: ActorContext | null | undefined,
  hospitalId: unknown,
  database: HospitalContactDatabase = getPrisma(),
): Promise<HospitalContactEditorProjection> {
  const parsedHospitalId = hospitalContactHospitalIdSchema.safeParse(hospitalId);

  if (!parsedHospitalId.success) {
    throw new NotFoundError();
  }

  assertHospitalContactPolicy({
    actor,
    capability: HOSPITAL_CONTACT_CAPABILITIES.read,
    scope: "DIRECT_HOSPITAL_OWNER",
    hospitalId: parsedHospitalId.data,
  });

  if (!actor) {
    throw new NotFoundError();
  }

  try {
    const hospital = await database.hospital.findFirst({
      where: {
        id: parsedHospitalId.data,
        ...getActiveOwnerHospitalWhere(actor),
      },
      select: hospitalContactEditorSelect,
    });

    if (!hospital) {
      throw new NotFoundError();
    }

    return toEditorProjection(hospital);
  } catch (error: unknown) {
    if (error instanceof NotFoundError) {
      throw error;
    }

    throw new InfrastructureError("Hospital Contact could not be loaded");
  }
}

async function lockAndRevalidateEditorAuthority(
  actor: ActorContext,
  hospitalId: string,
  transaction: Prisma.TransactionClient,
): Promise<void> {
  const users = await transaction.$queryRaw<LockedUserRow[]>(Prisma.sql`
    SELECT "id", "status", "personId"
    FROM "User"
    WHERE "id" = ${actor.userId}::uuid
    FOR SHARE
  `);
  const user = users[0];

  if (!user || user.status !== UserStatus.ACTIVE || user.personId !== actor.personId) {
    throw new ForbiddenError();
  }

  const roles = await transaction.$queryRaw<LockedRoleRow[]>(Prisma.sql`
    SELECT "userId", "role"
    FROM "UserRole"
    WHERE "userId" = ${actor.userId}::uuid AND "role" = ${Role.HOSPITAL}::"Role"
    FOR SHARE
  `);

  const hospitals = await transaction.$queryRaw<LockedHospitalRow[]>(Prisma.sql`
    SELECT "id", "status"
    FROM "Hospital"
    WHERE "id" = ${hospitalId}::uuid
    FOR UPDATE
  `);
  const hospital = hospitals[0];

  if (!hospital) {
    throw new NotFoundError();
  }

  const memberships = await transaction.$queryRaw<LockedMembershipRow[]>(Prisma.sql`
    SELECT "id", "membershipType", "status"
    FROM "HospitalMembership"
    WHERE "userId" = ${actor.userId}::uuid AND "hospitalId" = ${hospitalId}::uuid
    FOR SHARE
  `);
  const membership = memberships[0];

  const revalidated = await transaction.user.findFirst({
    where: {
      id: actor.userId,
      personId: actor.personId,
      status: UserStatus.ACTIVE,
      roles: { some: { role: Role.HOSPITAL } },
      memberships: {
        some: {
          hospitalId,
          membershipType: MembershipType.OWNER,
          status: MembershipStatus.ACTIVE,
          hospital: { status: HospitalStatus.ACTIVE },
        },
      },
    },
    select: { id: true },
  });

  if (
    roles.length !== 1 ||
    hospital.status !== HospitalStatus.ACTIVE ||
    !membership ||
    membership.membershipType !== MembershipType.OWNER ||
    membership.status !== MembershipStatus.ACTIVE ||
    !revalidated
  ) {
    throw new ForbiddenError();
  }
}

async function recordContactAudit(
  input: {
    actorUserId: string;
    action: "hospital_contact.created" | "hospital_contact.updated";
    resourceId: string;
    hospitalId: string;
  },
  transaction: Prisma.TransactionClient,
): Promise<void> {
  try {
    await recordAuditEvent(
      {
        actorUserId: input.actorUserId,
        action: input.action,
        resourceType: "HospitalContact",
        resourceId: input.resourceId,
        metadata: { hospitalId: input.hospitalId },
      },
      transaction,
    );
  } catch {
    throw new HospitalContactAuditFailure();
  }
}

async function updateHospitalContactInTransaction(
  actor: ActorContext,
  input: HospitalContactMutationInput,
  transaction: Prisma.TransactionClient,
  dependencies: HospitalContactServiceDependencies,
): Promise<HospitalContactMutationResult> {
  await lockAndRevalidateEditorAuthority(actor, input.hospitalId, transaction);

  const current = await transaction.hospitalContact.findUnique({
    where: { hospitalId: input.hospitalId },
    select: {
      id: true,
      hospitalId: true,
      addressText: true,
      phoneNumber: true,
      updatedAt: true,
    },
  });

  const decision = decideHospitalContactMutation({
    current: current
      ? {
          addressText: current.addressText,
          phoneNumber: current.phoneNumber,
          updatedAt: current.updatedAt,
        }
      : null,
    expectedUpdatedAt: input.expectedUpdatedAt,
    desired: { addressText: input.addressText, phoneNumber: input.phoneNumber },
  });

  if (decision.kind === "CONFLICT") {
    throw new ConflictError("Hospital Contact changed before this update");
  }

  if (decision.kind === "NOOP_ABSENT") {
    const hospital = await transaction.hospital.findUnique({
      where: { id: input.hospitalId },
      select: { id: true, hospitalCode: true, name: true },
    });

    if (!hospital) {
      throw new NotFoundError();
    }

    return {
      outcome: "NOOP",
      contact: {
        hospital,
        addressText: null,
        phoneNumber: null,
        expectedUpdatedAt: null,
      },
    };
  }

  if (decision.kind === "NOOP") {
    const hospital = await transaction.hospital.findUnique({
      where: { id: input.hospitalId },
      select: { id: true, hospitalCode: true, name: true },
    });

    if (!hospital || !current) {
      throw new InfrastructureError("Hospital Contact could not be confirmed");
    }

    return {
      outcome: "NOOP",
      contact: {
        hospital,
        addressText: current.addressText,
        phoneNumber: current.phoneNumber,
        expectedUpdatedAt: current.updatedAt.toISOString(),
      },
    };
  }

  if (decision.kind === "CREATE") {
    const now = dependencies.now?.() ?? new Date();

    if (!Number.isFinite(now.getTime())) {
      throw new InfrastructureError("Hospital Contact clock is invalid");
    }

    const created = await transaction.hospitalContact.create({
      data: {
        hospitalId: input.hospitalId,
        addressText: input.addressText,
        phoneNumber: input.phoneNumber,
        createdAt: new Date(now.getTime()),
        updatedAt: new Date(now.getTime()),
      },
      select: { id: true, updatedAt: true },
    });

    await recordContactAudit(
      {
        actorUserId: actor.userId,
        action: "hospital_contact.created",
        resourceId: created.id,
        hospitalId: input.hospitalId,
      },
      transaction,
    );

    const hospital = await transaction.hospital.findUnique({
      where: { id: input.hospitalId },
      select: { id: true, hospitalCode: true, name: true },
    });

    if (!hospital) {
      throw new InfrastructureError("Hospital Contact could not be confirmed");
    }

    return {
      outcome: "CREATED",
      contact: {
        hospital,
        addressText: input.addressText,
        phoneNumber: input.phoneNumber,
        expectedUpdatedAt: created.updatedAt.toISOString(),
      },
    };
  }

  if (!current) {
    throw new InfrastructureError("Hospital Contact could not be updated");
  }

  const now = dependencies.now?.() ?? new Date();
  let updatedAt: Date;

  try {
    updatedAt = nextHospitalContactVersion(now, current.updatedAt);
  } catch {
    throw new InfrastructureError("Hospital Contact clock is invalid");
  }

  const changed = await transaction.hospitalContact.updateMany({
    where: {
      id: current.id,
      hospitalId: input.hospitalId,
      updatedAt: current.updatedAt,
    },
    data: {
      addressText: input.addressText,
      phoneNumber: input.phoneNumber,
      updatedAt,
    },
  });

  if (changed.count !== 1) {
    throw new ConflictError("Hospital Contact changed before this update");
  }

  await recordContactAudit(
    {
      actorUserId: actor.userId,
      action: "hospital_contact.updated",
      resourceId: current.id,
      hospitalId: input.hospitalId,
    },
    transaction,
  );

  const hospital = await transaction.hospital.findUnique({
    where: { id: input.hospitalId },
    select: { id: true, hospitalCode: true, name: true },
  });

  if (!hospital) {
    throw new InfrastructureError("Hospital Contact could not be confirmed");
  }

  return {
    outcome: "UPDATED",
    contact: {
      hospital,
      addressText: input.addressText,
      phoneNumber: input.phoneNumber,
      expectedUpdatedAt: updatedAt.toISOString(),
    },
  };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function updateHospitalContact(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: HospitalContactServiceDependencies = {},
): Promise<HospitalContactMutationResult> {
  const parsed = hospitalContactMutationSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Hospital Contact input is invalid");
  }

  assertHospitalContactPolicy({
    actor,
    capability: HOSPITAL_CONTACT_CAPABILITIES.update,
    scope: "DIRECT_HOSPITAL_OWNER",
    hospitalId: parsed.data.hospitalId,
  });

  if (!actor) {
    throw new ForbiddenError();
  }

  const database = getDatabase(dependencies);

  for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    let callbackCompleted = false;

    try {
      return await database.$transaction(
        async (transaction): Promise<HospitalContactMutationResult> => {
          const result = await updateHospitalContactInTransaction(
            actor,
            parsed.data,
            transaction,
            dependencies,
          );
          callbackCompleted = true;
          return result;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          maxWait: 5_000,
          timeout: 10_000,
        },
      );
    } catch (error: unknown) {
      if (error instanceof HospitalContactAuditFailure) {
        throw new InfrastructureError("Hospital Contact could not be saved");
      }

      if (isKnownPrismaError(error, "P2002")) {
        throw new ConflictError("Hospital Contact changed before this update");
      }

      if (isRetryableTransactionFailure(error)) {
        if (attempt + 1 >= MAX_TRANSACTION_ATTEMPTS) {
          throw new ConflictError("Hospital Contact changed before this update");
        }

        const maxDelay = RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
        const randomValue = dependencies.random?.() ?? Math.random();
        const boundedRandom = Math.min(1, Math.max(0, randomValue));
        const milliseconds = Math.round(boundedRandom * maxDelay);
        await (dependencies.sleep ?? delay)(milliseconds);
        continue;
      }

      if (callbackCompleted) {
        return { outcome: "UNCONFIRMED" };
      }

      if (
        error instanceof ConflictError ||
        error instanceof ForbiddenError ||
        error instanceof NotFoundError ||
        error instanceof ValidationError ||
        error instanceof InfrastructureError
      ) {
        throw error;
      }

      throw new InfrastructureError("Hospital Contact could not be saved");
    }
  }

  throw new ConflictError("Hospital Contact changed before this update");
}

function patientRelationshipWhere(actor: ActorContext): Prisma.PersonWhereInput {
  return {
    id: actor.personId,
    user: {
      is: {
        id: actor.userId,
        status: UserStatus.ACTIVE,
        roles: { some: { role: Role.PATIENT } },
      },
    },
  };
}

function toPatientContactRead(input: {
  relationshipId: string;
  hospital: {
    hospitalCode: string;
    name: string;
    status: HospitalStatus;
    contact: { addressText: string | null; phoneNumber: string | null } | null;
  };
}): PatientHospitalContactRead {
  if (input.hospital.status !== HospitalStatus.ACTIVE) {
    return { relationshipId: input.relationshipId, availability: "UNAVAILABLE" };
  }

  return {
    relationshipId: input.relationshipId,
    availability: "AVAILABLE",
    contact: {
      hospital: {
        hospitalCode: input.hospital.hospitalCode,
        name: input.hospital.name,
      },
      addressText: input.hospital.contact?.addressText ?? null,
      phoneNumber: input.hospital.contact?.phoneNumber ?? null,
    },
  };
}

export async function readOwnPatientHospitalContact(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  database: HospitalContactDatabase = getPrisma(),
): Promise<PatientHospitalContactRead> {
  assertHospitalContactPolicy({
    actor,
    capability: HOSPITAL_CONTACT_CAPABILITIES.read,
    scope: "PATIENT_SELF_RELATIONSHIP",
  });

  const parsedRelationshipId = hospitalContactHospitalIdSchema.safeParse(relationshipId);

  if (!parsedRelationshipId.success || !actor) {
    throw new NotFoundError();
  }

  try {
    const person = await database.person.findFirst({
      where: patientRelationshipWhere(actor),
      select: {
        patientProfile: {
          select: {
            hospitalRelationships: {
              where: { id: parsedRelationshipId.data },
              select: {
                id: true,
                hospital: { select: patientContactSelect },
              },
            },
          },
        },
      },
    });
    const relationship = person?.patientProfile?.hospitalRelationships[0];

    if (!relationship || relationship.id !== parsedRelationshipId.data) {
      throw new NotFoundError();
    }

    return toPatientContactRead({ relationshipId: relationship.id, hospital: relationship.hospital });
  } catch (error: unknown) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) {
      throw error;
    }

    throw new InfrastructureError("Hospital Contact could not be loaded");
  }
}

export async function listOwnPatientHospitalContacts(
  actor: ActorContext | null | undefined,
  database: HospitalContactDatabase = getPrisma(),
): Promise<PatientHospitalContactRead[]> {
  assertHospitalContactPolicy({
    actor,
    capability: HOSPITAL_CONTACT_CAPABILITIES.read,
    scope: "PATIENT_SELF_RELATIONSHIP",
  });

  if (!actor) {
    throw new ForbiddenError();
  }

  try {
    const person = await database.person.findFirst({
      where: patientRelationshipWhere(actor),
      select: {
        patientProfile: {
          select: {
            hospitalRelationships: {
              orderBy: [{ hospital: { name: "asc" } }, { hospital: { hospitalCode: "asc" } }, { id: "asc" }],
              select: {
                id: true,
                hospital: { select: patientContactSelect },
              },
            },
          },
        },
      },
    });

    if (!person?.patientProfile) {
      throw new NotFoundError();
    }

    return person.patientProfile.hospitalRelationships.map((relationship) =>
      toPatientContactRead({ relationshipId: relationship.id, hospital: relationship.hospital }),
    );
  } catch (error: unknown) {
    if (error instanceof ForbiddenError || error instanceof NotFoundError) {
      throw error;
    }

    throw new InfrastructureError("Hospital Contact could not be loaded");
  }
}

export const hospitalContactServiceInternals = {
  MAX_TRANSACTION_ATTEMPTS,
  RETRY_DELAYS_MS,
  hospitalContactEditorSelect,
  patientContactSelect,
  getActiveOwnerHospitalWhere,
  isKnownPrismaError,
  getPostgresSqlState,
  isRetryableTransactionFailure,
  lockAndRevalidateEditorAuthority,
  toEditorProjection,
  toPatientContactRead,
};
