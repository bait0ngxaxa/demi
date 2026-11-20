import "server-only";

import { Role } from "@prisma/client";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError } from "@/shared/errors/application-error";

import { canUseFamilyWorkspace } from "../domain/family-access";

/**
 * Refused on the recipient's side only: invitation creation never reveals what kind of account a national ID has.
 * Call after `assertFamilyAuthenticatedActor`.
 */
export function assertCaregiverAcceptorIsNotPlatformAdmin(roles: readonly Role[]): void {
  if (!canUseFamilyWorkspace(roles)) {
    throw new ForbiddenError();
  }
}

export type FamilyPatientSelfDecision = {
  allowed: boolean;
  reason: "missing_actor" | "patient_role_required" | "authenticated_identity_required" | "patient_self";
};

export function decideFamilyPatientSelfPolicy(
  actor: ActorContext | null | undefined,
): FamilyPatientSelfDecision {
  if (!actor) {
    return { allowed: false, reason: "missing_actor" };
  }

  if (!actor.roles.includes(Role.PATIENT)) {
    return { allowed: false, reason: "patient_role_required" };
  }

  if (!actor.userId.trim() || !actor.personId.trim()) {
    return { allowed: false, reason: "authenticated_identity_required" };
  }

  return { allowed: true, reason: "patient_self" };
}

export function assertFamilyPatientSelf(actor: ActorContext | null | undefined): asserts actor is ActorContext {
  if (!decideFamilyPatientSelfPolicy(actor).allowed) {
    throw new ForbiddenError();
  }
}

export function assertFamilyAuthenticatedActor(
  actor: ActorContext | null | undefined,
): asserts actor is ActorContext {
  if (!actor?.userId.trim() || !actor.personId.trim()) {
    throw new ForbiddenError();
  }
}
