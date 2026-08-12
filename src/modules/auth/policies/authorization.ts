import "server-only";

import { HospitalStatus, MembershipStatus, Role } from "@prisma/client";
import { z } from "zod";

import { ForbiddenError } from "@/shared/errors/application-error";

import type { ActorContext } from "../types/actor-context";

const capabilitySchema = z.string().trim().min(1).max(120);

const scopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("GLOBAL") }),
  z.object({ kind: z.literal("HOSPITAL"), hospitalId: z.string().trim().min(1) }),
  z.object({ kind: z.literal("SELF"), personId: z.string().trim().min(1) }),
  z.object({ kind: z.literal("DENIED") }),
]);

export type ScopeRequirement = z.infer<typeof scopeSchema>;

export type AuthorizationInput = {
  actor: ActorContext | null | undefined;
  capability: unknown;
  requiredRole: Role | null | undefined;
  scope: ScopeRequirement | null | undefined;
};

export type PolicyDecision =
  | { allowed: true; reason: "allowed" }
  | {
      allowed: false;
      reason:
        | "missing_actor"
        | "invalid_capability"
        | "missing_role_requirement"
        | "role_not_present"
        | "invalid_scope"
        | "scope_denied"
        | "hospital_membership_not_active"
        | "hospital_not_active"
        | "self_scope_mismatch";
    };

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

  if (!capabilitySchema.safeParse(input.capability).success) {
    return { allowed: false, reason: "invalid_capability" };
  }

  if (!input.requiredRole) {
    return { allowed: false, reason: "missing_role_requirement" };
  }

  if (!input.actor.roles.includes(input.requiredRole)) {
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
  capabilitySchema,
  scopeSchema,
};
