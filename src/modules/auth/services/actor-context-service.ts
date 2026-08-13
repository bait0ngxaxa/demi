import "server-only";

import { UserStatus } from "@prisma/client";
import { isAuthError, isAuthSessionMissingError } from "@supabase/supabase-js";

import { getServerSupabaseClient } from "@/lib/auth/supabase-server";
import { getPrisma } from "@/lib/db/prisma";
import { InfrastructureError } from "@/shared/errors/application-error";

import type { ActorContext } from "../types/actor-context";

export type ActorContextStore = {
  findActiveUserByAuthSubject(authSubject: string): Promise<ActorContext | null>;
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
  async findActiveUserByAuthSubject(authSubject): Promise<ActorContext | null> {
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

      if (!user || user.status !== UserStatus.ACTIVE) {
        return null;
      }

      return {
        userId: user.id,
        personId: user.personId,
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

export async function resolveActorContextByAuthSubject(
  authSubject: string,
  store: ActorContextStore = prismaActorContextStore,
): Promise<ActorContext | null> {
  const normalizedSubject = authSubject.trim();

  if (!normalizedSubject) {
    return null;
  }

  return store.findActiveUserByAuthSubject(normalizedSubject);
}

export async function resolveCurrentActorContext(
  store: ActorContextStore = prismaActorContextStore,
): Promise<ActorContext | null> {
  let authResponse: Awaited<
    ReturnType<Awaited<ReturnType<typeof getServerSupabaseClient>>["auth"]["getUser"]>
  >;

  try {
    authResponse = await (await getServerSupabaseClient()).auth.getUser();
  } catch (error) {
    if (isUnauthenticatedAuthError(error)) {
      return null;
    }

    throw new InfrastructureError("Authentication service could not be reached");
  }

  const {
    data: { user },
    error,
  } = authResponse;

  if (error) {
    if (isUnauthenticatedAuthError(error)) {
      return null;
    }

    throw new InfrastructureError("Authentication service could not be reached");
  }

  if (!user) {
    return null;
  }

  return resolveActorContextByAuthSubject(user.id, store);
}
