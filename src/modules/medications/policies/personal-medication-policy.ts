import { Role } from "@prisma/client";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError } from "@/shared/errors/application-error";

// This is only the initial gate. Persisted identity/profile must also be resolved.
export function assertPersonalMedicationSelf(
  actor: ActorContext | null | undefined,
): asserts actor is ActorContext {
  if (!actor?.roles.includes(Role.PATIENT) || !actor.userId.trim() || !actor.personId.trim()) {
    throw new ForbiddenError();
  }
}
