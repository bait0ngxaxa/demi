import "server-only";

import { Prisma, UserStatus, type Role, type PrismaClient } from "@prisma/client";
import { isAuthError, isAuthSessionMissingError } from "@supabase/supabase-js";

import { getServerSupabaseClient } from "@/lib/auth/supabase-server";
import { getPrisma } from "@/lib/db/prisma";
import { InfrastructureError } from "@/shared/errors/application-error";

import type {
  ActorContext,
  ActorHospitalMembership,
  ActorOsmHospitalRelationship,
} from "../types/actor-context";

export type ActorUserRecord = {
  id: string;
  personId: string;
  status: UserStatus;
  roles: readonly Role[];
  hospitalMemberships: readonly ActorHospitalMembership[];
  osmHospitalRelationships: readonly ActorOsmHospitalRelationship[];
};

export type ActorContextStore = {
  findUserByAuthSubject(authSubject: string): Promise<ActorUserRecord | null>;
};

export type ActorContextUserIdStore = {
  findUserById(userId: string): Promise<ActorUserRecord | null>;
};

type ActorContextDatabase = PrismaClient | Prisma.TransactionClient;

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

const actorContextUserSelect = {
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
  osmHospitalRelationships: {
    select: {
      hospitalId: true,
      status: true,
      hospital: {
        select: { status: true },
      },
    },
  },
} satisfies Prisma.UserSelect;

type ActorContextUserProjection = Prisma.UserGetPayload<{
  select: typeof actorContextUserSelect;
}>;

function toActorUserRecord(user: ActorContextUserProjection): ActorUserRecord {
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
    osmHospitalRelationships: user.osmHospitalRelationships.map((relationship) => ({
      hospitalId: relationship.hospitalId,
      status: relationship.status,
      hospitalStatus: relationship.hospital.status,
    })),
  };
}

async function readActorUser(
  where: Prisma.UserWhereUniqueInput,
  database?: ActorContextDatabase,
): Promise<ActorUserRecord | null> {
  try {
    const user = await (database ?? getPrisma()).user.findUnique({
      where,
      select: actorContextUserSelect,
    });
    return user ? toActorUserRecord(user) : null;
  } catch {
    throw new InfrastructureError("Actor context could not be loaded");
  }
}

export function createActorContextStore(
  database?: ActorContextDatabase,
): ActorContextStore & ActorContextUserIdStore {
  return {
    findUserByAuthSubject(authSubject): Promise<ActorUserRecord | null> {
      return readActorUser({ authSubject }, database);
    },
    findUserById(userId): Promise<ActorUserRecord | null> {
      return readActorUser({ id: userId }, database);
    },
  };
}

const prismaActorContextStore = createActorContextStore();

function actorAccessFromRecord(user: ActorUserRecord | null): ActorSubjectAccess {
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
      osmHospitalRelationships: user.osmHospitalRelationships,
    },
  };
}

export async function resolveActorAccessByAuthSubject(
  authSubject: string,
  store: ActorContextStore = prismaActorContextStore,
): Promise<ActorSubjectAccess> {
  const normalizedSubject = authSubject.trim();

  if (!normalizedSubject) {
    return { status: "UNMAPPED" };
  }

  return actorAccessFromRecord(await store.findUserByAuthSubject(normalizedSubject));
}

export async function resolveActorAccessByUserId(
  userId: string,
  store: ActorContextUserIdStore = prismaActorContextStore,
): Promise<ActorSubjectAccess> {
  if (!userId.trim()) {
    return { status: "UNMAPPED" };
  }

  return actorAccessFromRecord(await store.findUserById(userId));
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
