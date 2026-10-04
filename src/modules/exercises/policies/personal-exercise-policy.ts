import { Role } from "@prisma/client";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError } from "@/shared/errors/application-error";

// Presentation/session gate only. Current persisted SELF binding is also mandatory.
export function assertPersonalExerciseSelf(actor: ActorContext | null | undefined): asserts actor is ActorContext {
  if (!actor?.roles.includes(Role.PATIENT) || !actor.userId.trim() || !actor.personId.trim()) throw new ForbiddenError();
}
