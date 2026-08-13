import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Role,
  UserStatus,
} from "@prisma/client";
import { AuthApiError, AuthSessionMissingError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getServerSupabaseClient } from "@/lib/auth/supabase-server";
import { InfrastructureError } from "@/shared/errors/application-error";

import type { ActorContext } from "../types/actor-context";
import {
  isUnauthenticatedAuthError,
  resolveActorAccessByAuthSubject,
  resolveActorContextByAuthSubject,
  resolveCurrentActorContext,
  type ActorContextStore,
  type ActorUserRecord,
} from "./actor-context-service";

vi.mock("@/lib/auth/supabase-server", () => ({
  getServerSupabaseClient: vi.fn(),
}));

const mockedGetServerSupabaseClient = vi.mocked(getServerSupabaseClient);

const actor: ActorContext = {
  userId: "user-1",
  personId: "person-1",
  roles: [Role.PATIENT],
  hospitalMemberships: [
    {
      hospitalId: "hospital-a",
      membershipType: MembershipType.MEMBER,
      profession: null,
      status: MembershipStatus.ACTIVE,
      hospitalStatus: HospitalStatus.ACTIVE,
    },
  ],
};

function createActorUserRecord(status: UserStatus = UserStatus.ACTIVE): ActorUserRecord {
  return {
    id: actor.userId,
    personId: actor.personId,
    status,
    roles: actor.roles,
    hospitalMemberships: actor.hospitalMemberships,
  };
}

describe("ActorContext resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes an authenticated provider subject before lookup", async () => {
    let receivedSubject = "";
    const store: ActorContextStore = {
      async findUserByAuthSubject(authSubject): Promise<ActorUserRecord | null> {
        receivedSubject = authSubject;
        return createActorUserRecord();
      },
    };

    const result = await resolveActorContextByAuthSubject("  supabase-user-1  ", store);

    expect(receivedSubject).toBe("supabase-user-1");
    expect(result).toEqual(actor);
  });

  it("fails closed when the provider subject is empty", async () => {
    const store: ActorContextStore = {
      async findUserByAuthSubject(): Promise<ActorUserRecord | null> {
        throw new Error("The store must not be called");
      },
    };

    await expect(resolveActorContextByAuthSubject("  ", store)).resolves.toBeNull();
  });

  it("allows an ACTIVE mapped DEMI user", async () => {
    const store: ActorContextStore = {
      async findUserByAuthSubject(): Promise<ActorUserRecord | null> {
        return createActorUserRecord();
      },
    };

    await expect(resolveActorAccessByAuthSubject("provider-user-1", store)).resolves.toEqual({
      status: "AUTHORIZED",
      actor,
    });
  });

  it("denies an unmapped provider user", async () => {
    const store: ActorContextStore = {
      async findUserByAuthSubject(): Promise<ActorUserRecord | null> {
        return null;
      },
    };

    await expect(resolveActorAccessByAuthSubject("provider-user-1", store)).resolves.toEqual({
      status: "UNMAPPED",
    });
  });

  it.each([UserStatus.PROVISIONED, UserStatus.INVITED, UserStatus.SUSPENDED])(
    "denies a mapped %s DEMI user",
    async (status) => {
      const store: ActorContextStore = {
        async findUserByAuthSubject(): Promise<ActorUserRecord | null> {
          return createActorUserRecord(status);
        },
      };

      await expect(resolveActorAccessByAuthSubject("provider-user-1", store)).resolves.toEqual({
        status: "ACCOUNT_NOT_ACTIVE",
        accountStatus: status,
      });
    },
  );

  it("treats a missing session as unauthenticated", async () => {
    const getUser = vi.fn().mockResolvedValue({
      data: { user: null },
      error: new AuthSessionMissingError(),
    });
    mockedGetServerSupabaseClient.mockResolvedValue({ auth: { getUser } } as unknown as Awaited<
      ReturnType<typeof getServerSupabaseClient>
    >);

    await expect(resolveCurrentActorContext()).resolves.toBeNull();
  });

  it.each([
    ["invalid JWT", "bad_jwt"],
    ["expired session", "session_expired"],
    ["revoked refresh token", "refresh_token_not_found"],
  ])("treats a known %s condition as unauthenticated", async (_label, code) => {
    const getUser = vi.fn().mockResolvedValue({
      data: { user: null },
      error: new AuthApiError("The session is no longer valid", 401, code),
    });
    mockedGetServerSupabaseClient.mockResolvedValue({ auth: { getUser } } as unknown as Awaited<
      ReturnType<typeof getServerSupabaseClient>
    >);

    await expect(resolveCurrentActorContext()).resolves.toBeNull();
  });

  it("does not classify a generic provider status as unauthenticated", async () => {
    const getUser = vi.fn().mockResolvedValue({
      data: { user: null },
      error: new AuthApiError("Unexpected provider failure", 401, "unexpected_failure"),
    });
    mockedGetServerSupabaseClient.mockResolvedValue({ auth: { getUser } } as unknown as Awaited<
      ReturnType<typeof getServerSupabaseClient>
    >);

    await expect(resolveCurrentActorContext()).rejects.toBeInstanceOf(InfrastructureError);
  });

  it("does not classify an untyped provider error as unauthenticated", async () => {
    const getUser = vi.fn().mockResolvedValue({
      data: { user: null },
      error: new Error("Auth provider is unavailable"),
    });
    mockedGetServerSupabaseClient.mockResolvedValue({ auth: { getUser } } as unknown as Awaited<
      ReturnType<typeof getServerSupabaseClient>
    >);

    await expect(resolveCurrentActorContext()).rejects.toBeInstanceOf(InfrastructureError);
  });

  it("does not classify auth client configuration failures as unauthenticated", async () => {
    mockedGetServerSupabaseClient.mockRejectedValue(new Error("Auth configuration is invalid"));

    await expect(resolveCurrentActorContext()).rejects.toBeInstanceOf(InfrastructureError);
  });

  it("uses stable auth identity and codes rather than HTTP status alone", () => {
    expect(isUnauthenticatedAuthError(new AuthSessionMissingError())).toBe(true);
    expect(isUnauthenticatedAuthError(new AuthApiError("expired", 401, "session_expired"))).toBe(
      true,
    );
    expect(isUnauthenticatedAuthError(new AuthApiError("unexpected", 404, "unexpected_failure"))).toBe(
      false,
    );
    expect(isUnauthenticatedAuthError({ status: 401 })).toBe(false);
  });
});
