import "server-only";

import { UserStatus } from "@prisma/client";

import { getServerSupabaseClient } from "@/lib/auth/supabase-server";
import { getPrisma } from "@/lib/db/prisma";
import { InfrastructureError } from "@/shared/errors/application-error";

import type { ActorContext } from "../types/actor-context";

export type ActorContextStore = {
  findActiveUserByAuthSubject(authSubject: string): Promise<ActorContext | null>;
};

function isUnauthenticatedAuthError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const authError = error as { name?: unknown; status?: unknown };

  return (
    authError.name === "AuthSessionMissingError" ||
    authError.status === 401 ||
    authError.status === 404
  );
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
  const {
    data: { user },
    error,
  } = await (await getServerSupabaseClient()).auth.getUser();

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
