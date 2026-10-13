import "server-only";

import { Prisma, type PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import { InfrastructureError, ValidationError } from "@/shared/errors/application-error";

import { auditEventInputSchema, type AuditEventInput } from "../schemas/audit-schemas";

export type AuditDatabase = Pick<PrismaClient, "auditEvent"> | Prisma.TransactionClient;

function isKnownRequestError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

function isRetryableTransactionError(error: unknown): boolean {
  return isKnownRequestError(error, "P2002") || isKnownRequestError(error, "P2034");
}

function toAuditCreateData(input: AuditEventInput): Prisma.AuditEventUncheckedCreateInput {
  const parsed = auditEventInputSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Audit event data is invalid or contains sensitive values");
  }

  const metadata: Prisma.InputJsonObject | undefined = parsed.data.metadata
    ? (Object.fromEntries(Object.entries(parsed.data.metadata)) as Prisma.InputJsonObject)
    : undefined;

  return {
    actorUserId: parsed.data.actorUserId,
    action: parsed.data.action,
    resourceType: parsed.data.resourceType,
    resourceId: parsed.data.resourceId,
    metadata,
  };
}

function toAuditPersistenceError(error: unknown): unknown {
  // Let the enclosing serializable service transaction retry known write
  // conflicts instead of converting them into a terminal infrastructure error.
  return isRetryableTransactionError(error)
    ? error
    : new InfrastructureError("Audit event could not be persisted");
}

export async function recordAuditEvent(
  input: AuditEventInput,
  database?: AuditDatabase,
): Promise<void> {
  await recordAuditEventWithId(input, database);
}

/** Same validation/persistence boundary, for transactional decision references. */
export async function recordAuditEventWithId(
  input: AuditEventInput,
  database?: AuditDatabase,
): Promise<string> {
  const data = toAuditCreateData(input);

  try {
    const db = database ?? getPrisma();

    const event = await db.auditEvent.create({ data });
    return event.id;
  } catch (error: unknown) {
    throw toAuditPersistenceError(error);
  }
}

/** Validates every event first, then persists them in one statement (all-or-nothing). */
export async function recordAuditEvents(
  inputs: readonly AuditEventInput[],
  database?: AuditDatabase,
): Promise<void> {
  const data = inputs.map(toAuditCreateData);

  if (data.length === 0) {
    return;
  }

  try {
    await (database ?? getPrisma()).auditEvent.createMany({ data });
  } catch (error: unknown) {
    throw toAuditPersistenceError(error);
  }
}

export const auditServiceInternals = {
  isKnownRequestError,
  isRetryableTransactionError,
};
