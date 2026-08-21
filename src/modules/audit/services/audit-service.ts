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

export async function recordAuditEvent(
  input: AuditEventInput,
  database?: AuditDatabase,
): Promise<void> {
  const parsed = auditEventInputSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Audit event data is invalid or contains sensitive values");
  }

  const metadata: Prisma.InputJsonObject | undefined = parsed.data.metadata
    ? (Object.fromEntries(Object.entries(parsed.data.metadata)) as Prisma.InputJsonObject)
    : undefined;

  try {
    const db = database ?? getPrisma();

    await db.auditEvent.create({
      data: {
        actorUserId: parsed.data.actorUserId,
        action: parsed.data.action,
        resourceType: parsed.data.resourceType,
        resourceId: parsed.data.resourceId,
        metadata,
      },
    });
  } catch (error: unknown) {
    // Let the enclosing serializable service transaction retry known write
    // conflicts instead of converting them into a terminal infrastructure error.
    if (isRetryableTransactionError(error)) {
      throw error;
    }

    throw new InfrastructureError("Audit event could not be persisted");
  }
}

export const auditServiceInternals = {
  isKnownRequestError,
  isRetryableTransactionError,
};
