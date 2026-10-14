import "server-only";

import { Prisma, UserStatus, type PrismaClient } from "@prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import { ConflictError, ForbiddenError, InfrastructureError, ValidationError } from "@/shared/errors/application-error";
import { updateContactEmailSchema } from "../schemas/contact-setting-schema";

export type OwnContactSetting = { email: string | null; version: number };

export async function getOwnContactSetting(actor: ActorContext | null | undefined, database: PrismaClient = getPrisma()): Promise<OwnContactSetting> {
  if (!actor) throw new ForbiddenError();
  const user = await database.user.findFirst({ where: { id: actor.userId, personId: actor.personId, status: UserStatus.ACTIVE }, select: { id: true } });
  if (!user) throw new ForbiddenError();
  const setting = await database.userContactSetting.findUnique({ where: { userId: actor.userId }, select: { email: true, version: true } });
  return setting ?? { email: null, version: 0 };
}

export async function updateOwnContactEmail(actor: ActorContext | null | undefined, input: unknown, dependencies: { database?: PrismaClient; now?: () => Date } = {}): Promise<OwnContactSetting> {
  if (!actor) throw new ForbiddenError();
  const parsed = updateContactEmailSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Contact email is invalid");
  const database = dependencies.database ?? getPrisma();
  const now = new Date((dependencies.now?.() ?? new Date()).getTime());
  if (!Number.isFinite(now.getTime())) throw new InfrastructureError();
  try {
    return await database.$transaction(async (transaction) => {
      const users = await transaction.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "User" WHERE "id" = ${actor.userId}::uuid AND "personId" = ${actor.personId}::uuid AND "status" = 'ACTIVE'::"UserStatus" FOR UPDATE`;
      if (users.length !== 1) throw new ForbiddenError();
      const current = await transaction.userContactSetting.findUnique({ where: { userId: actor.userId } });
      const currentVersion = current?.version ?? 0;
      if (parsed.data.expectedVersion !== currentVersion) throw new ConflictError("Contact settings changed");
      if (current?.email === parsed.data.email) return { email: current.email, version: current.version };
      if (current) {
        const updated = await transaction.userContactSetting.update({ where: { userId: actor.userId }, data: { email: parsed.data.email, version: { increment: 1 }, updatedAt: now }, select: { email: true, version: true } });
        await recordAuditEvent({ actorUserId: actor.userId, action: "account.contact_email.updated", resourceType: "UserContactSetting", resourceId: actor.userId }, transaction);
        return updated;
      }
      const created = await transaction.userContactSetting.create({ data: { userId: actor.userId, email: parsed.data.email, version: 1, createdAt: now, updatedAt: now }, select: { email: true, version: true } });
      await recordAuditEvent({ actorUserId: actor.userId, action: "account.contact_email.updated", resourceType: "UserContactSetting", resourceId: actor.userId }, transaction);
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error: unknown) {
    if (error instanceof ForbiddenError || error instanceof ConflictError || error instanceof ValidationError || error instanceof InfrastructureError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || error.code === "P2034")) throw new ConflictError("Contact settings changed");
    throw new InfrastructureError("Contact settings could not be saved");
  }
}
