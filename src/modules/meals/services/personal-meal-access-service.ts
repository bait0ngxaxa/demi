import "server-only";
import { Role, UserStatus, type Prisma, type PrismaClient } from "@prisma/client";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError } from "@/shared/errors/application-error";
import { assertPersonalMealSelf } from "../policies/personal-meal-policy";

export async function resolvePersonalMealOwner(actor: ActorContext | null | undefined, database: PrismaClient | Prisma.TransactionClient): Promise<string> {
  assertPersonalMealSelf(actor);
  const person = await database.person.findFirst({
    where: { id: actor.personId, user: { is: { id: actor.userId, status: UserStatus.ACTIVE, roles: { some: { role: Role.PATIENT } } } } },
    select: { patientProfile: { select: { id: true } } },
  });
  if (!person?.patientProfile) throw new ForbiddenError();
  return person.patientProfile.id;
}
