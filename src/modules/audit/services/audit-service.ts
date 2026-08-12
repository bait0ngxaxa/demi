import "server-only";

import { Prisma } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import { InfrastructureError, ValidationError } from "@/shared/errors/application-error";

import { auditEventInputSchema, type AuditEventInput } from "../schemas/audit-schemas";

export async function recordAuditEvent(input: AuditEventInput): Promise<void> {
  const parsed = auditEventInputSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Audit event data is invalid or contains sensitive values");
  }

  const metadata: Prisma.InputJsonObject | undefined = parsed.data.metadata
    ? (Object.fromEntries(Object.entries(parsed.data.metadata)) as Prisma.InputJsonObject)
    : undefined;

  try {
    await getPrisma().auditEvent.create({
      data: {
        actorUserId: parsed.data.actorUserId,
        action: parsed.data.action,
        resourceType: parsed.data.resourceType,
        resourceId: parsed.data.resourceId,
        metadata,
      },
    });
  } catch {
    throw new InfrastructureError("Audit event could not be persisted");
  }
}
