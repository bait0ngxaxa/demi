import "server-only";

import { UserStatus, type Role } from "@prisma/client";
import { isAuthError, isAuthSessionMissingError } from "@supabase/supabase-js";

import { getServerSupabaseClient } from "@/lib/auth/supabase-server";
import { getPrisma } from "@/lib/db/prisma";
import { InfrastructureError } from "@/shared/errors/application-error";

import type { ActorContext, ActorHospitalMembership } from "../types/actor-context";

export type ActorUserRecord = {
  id: string;
  personId: string;
  status: UserStatus;
  roles: readonly Role[];
  hospitalMemberships: readonly ActorHospitalMembership[];
};

export type ActorContextStore = {
  findUserByAuthSubject(authSubject: string): Promise<ActorUserRecord | null>;
};

export type ActorAuthenticationProvider = {
  getUser(): Promise<{
    data: { user: { id: string } | null };
    error: unknown;
  }>;
};

export type ActorSubjectAccess =
  | { status: "AUTHORIZED"; actor: ActorContext }
  | { status: "UNMAPPED" }
  | { status: "ACCOUNT_NOT_ACTIVE"; accountStatus: UserStatus };

export type CurrentActorAccess =
  | { status: "UNAUTHENTICATED" }
  | { status: "AUTHORIZED"; actor: ActorContext }
  | {
      status: "APPLICATION_ACCESS_DENIED";
      reason: "UNMAPPED" | "ACCOUNT_NOT_ACTIVE" | "SUBJECT_MISMATCH";
    };

const unauthenticatedAuthErrorCodes = new Set([
  "bad_jwt",
  "invalid_jwt",
  "no_authorization",
  "refresh_token_already_used",
  "refresh_token_not_found",
  "session_expired",
  "session_not_found",
  "user_not_found",
]);

export function isUnauthenticatedAuthError(error: unknown): boolean {
  if (isAuthSessionMissingError(error)) {
    return true;
  }

  if (!isAuthError(error) || typeof error.code !== "string") {
    return false;
  }

  return unauthenticatedAuthErrorCodes.has(error.code);
}

const prismaActorContextStore: ActorContextStore = {
  async findUserByAuthSubject(authSubject): Promise<ActorUserRecord | null> {
    try {
      const user = await getPrisma().user.findUnique({
        where: { authSubject },
        select: {
          id: true,
          personId: true,
          status: true,
          roles: {
            select: { role: true },
          },
          memberships: {
            select: {
              hospitalId: true,
              membershipType: true,
              profession: true,
              status: true,
              hospital: {
                select: { status: true },
              },
            },
          },
        },
      });

      if (!user) {
        return null;
      }

      return {
        id: user.id,
        personId: user.personId,
        status: user.status,
        roles: user.roles.map(({ role }) => role),
        hospitalMemberships: user.memberships.map((membership) => ({
          hospitalId: membership.hospitalId,
          membershipType: membership.membershipType,
          profession: membership.profession,
          status: membership.status,
          hospitalStatus: membership.hospital.status,
        })),
      };
    } catch {
      throw new InfrastructureError("Actor context could not be loaded");
    }
  },
};

export async function resolveActorAccessByAuthSubject(
  authSubject: string,
  store: ActorContextStore = prismaActorContextStore,
): Promise<ActorSubjectAccess> {
  const normalizedSubject = authSubject.trim();

  if (!normalizedSubject) {
    return { status: "UNMAPPED" };
  }

  const user = await store.findUserByAuthSubject(normalizedSubject);

  if (!user) {
    return { status: "UNMAPPED" };
  }

  if (user.status !== UserStatus.ACTIVE) {
    return { status: "ACCOUNT_NOT_ACTIVE", accountStatus: user.status };
  }

  return {
    status: "AUTHORIZED",
    actor: {
      userId: user.id,
      personId: user.personId,
      roles: user.roles,
      hospitalMemberships: user.hospitalMemberships,
    },
  };
}

export async function resolveActorContextByAuthSubject(
  authSubject: string,
  store: ActorContextStore = prismaActorContextStore,
): Promise<ActorContext | null> {
  const access = await resolveActorAccessByAuthSubject(authSubject, store);

  return access.status === "AUTHORIZED" ? access.actor : null;
}

export async function resolveCurrentActorAccess(
  store: ActorContextStore = prismaActorContextStore,
  provider?: ActorAuthenticationProvider,
  expectedAuthSubject?: string,
): Promise<CurrentActorAccess> {
  let authResponse: Awaited<ReturnType<ActorAuthenticationProvider["getUser"]>>;

  try {
    const authProvider = provider ?? (await getServerSupabaseClient()).auth;
    authResponse = await authProvider.getUser();
  } catch (error) {
    if (isUnauthenticatedAuthError(error)) {
      return { status: "UNAUTHENTICATED" };
    }

    throw new InfrastructureError("Authentication service could not be reached");
  }

  const {
    data: { user },
    error,
  } = authResponse;

  if (error) {
    if (isUnauthenticatedAuthError(error)) {
      return { status: "UNAUTHENTICATED" };
    }

    throw new InfrastructureError("Authentication service could not be reached");
  }

  if (!user) {
    return { status: "UNAUTHENTICATED" };
  }

  if (expectedAuthSubject && user.id !== expectedAuthSubject) {
    return {
      status: "APPLICATION_ACCESS_DENIED",
      reason: "SUBJECT_MISMATCH",
    };
  }

  const actorAccess = await resolveActorAccessByAuthSubject(user.id, store);

  if (actorAccess.status === "AUTHORIZED") {
    return actorAccess;
  }

  return {
    status: "APPLICATION_ACCESS_DENIED",
    reason: actorAccess.status,
  };
}

export async function resolveCurrentActorContext(
  store: ActorContextStore = prismaActorContextStore,
  provider?: ActorAuthenticationProvider,
): Promise<ActorContext | null> {
  const access = await resolveCurrentActorAccess(store, provider);
  return access.status === "AUTHORIZED" ? access.actor : null;
}
