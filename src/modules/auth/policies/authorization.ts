import "server-only";

import { HospitalStatus, MembershipStatus, Role } from "@prisma/client";
import { z } from "zod";

import { ForbiddenError } from "@/shared/errors/application-error";

import type { ActorContext } from "../types/actor-context";

const roleSchema = z.nativeEnum(Role);

const scopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("GLOBAL") }),
  z.object({ kind: z.literal("HOSPITAL"), hospitalId: z.string().trim().min(1) }),
  z.object({ kind: z.literal("SELF"), personId: z.string().trim().min(1) }),
  z.object({ kind: z.literal("DENIED") }),
]);

export type ScopeRequirement = z.infer<typeof scopeSchema>;

export type AuthorizationInput = {
  actor: ActorContext | null | undefined;
  requiredRole: unknown;
  scope: unknown;
};

export type PolicyDecision =
  | { allowed: true; reason: "allowed" }
  | {
      allowed: false;
      reason:
        | "missing_actor"
        | "missing_role_requirement"
        | "invalid_role_requirement"
        | "role_not_present"
        | "invalid_scope"
        | "scope_denied"
        | "hospital_membership_not_active"
        | "hospital_not_active"
        | "self_scope_mismatch";
    };

/**
 * Phase 1 only validates the trusted actor role and resolved resource scope.
 * Domain policies will add a confirmed capability matrix before allowing business actions.
 */

function hasActiveHospitalMembership(actor: ActorContext, hospitalId: string): boolean {
  return actor.hospitalMemberships.some(
    (membership) =>
      membership.hospitalId === hospitalId && membership.status === MembershipStatus.ACTIVE,
  );
}

function hasActiveHospital(actor: ActorContext, hospitalId: string): boolean {
  return actor.hospitalMemberships.some(
    (membership) =>
      membership.hospitalId === hospitalId && membership.hospitalStatus === HospitalStatus.ACTIVE,
  );
}

export function decidePolicy(input: AuthorizationInput): PolicyDecision {
  if (!input.actor) {
    return { allowed: false, reason: "missing_actor" };
  }

  if (input.requiredRole === null || input.requiredRole === undefined) {
    return { allowed: false, reason: "missing_role_requirement" };
  }

  const roleResult = roleSchema.safeParse(input.requiredRole);

  if (!roleResult.success) {
    return { allowed: false, reason: "invalid_role_requirement" };
  }

  if (!input.actor.roles.includes(roleResult.data)) {
    return { allowed: false, reason: "role_not_present" };
  }

  const scopeResult = scopeSchema.safeParse(input.scope);

  if (!scopeResult.success) {
    return { allowed: false, reason: "invalid_scope" };
  }

  const scope = scopeResult.data;

  if (scope.kind === "DENIED") {
    return { allowed: false, reason: "scope_denied" };
  }

  if (scope.kind === "SELF" && scope.personId !== input.actor.personId) {
    return { allowed: false, reason: "self_scope_mismatch" };
  }

  if (scope.kind === "HOSPITAL") {
    if (!hasActiveHospitalMembership(input.actor, scope.hospitalId)) {
      return { allowed: false, reason: "hospital_membership_not_active" };
    }

    if (!hasActiveHospital(input.actor, scope.hospitalId)) {
      return { allowed: false, reason: "hospital_not_active" };
    }
  }

  return { allowed: true, reason: "allowed" };
}

export function assertPolicy(input: AuthorizationInput): void {
  const decision = decidePolicy(input);

  if (!decision.allowed) {
    throw new ForbiddenError();
  }
}

export const authorizationInternals = {
  roleSchema,
  scopeSchema,
};
