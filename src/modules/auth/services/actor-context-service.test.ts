import { HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";
import { AuthApiError, AuthSessionMissingError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getServerSupabaseClient } from "@/lib/auth/supabase-server";
import { InfrastructureError } from "@/shared/errors/application-error";

import type { ActorContext } from "../types/actor-context";
import {
  isUnauthenticatedAuthError,
  resolveActorContextByAuthSubject,
  resolveCurrentActorContext,
  type ActorContextStore,
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

describe("ActorContext resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes an authenticated provider subject before lookup", async () => {
    let receivedSubject = "";
    const store: ActorContextStore = {
      async findActiveUserByAuthSubject(authSubject): Promise<ActorContext | null> {
        receivedSubject = authSubject;
        return actor;
      },
    };

    const result = await resolveActorContextByAuthSubject("  supabase-user-1  ", store);

    expect(receivedSubject).toBe("supabase-user-1");
    expect(result).toBe(actor);
  });

  it("fails closed when the provider subject is empty", async () => {
    const store: ActorContextStore = {
      async findActiveUserByAuthSubject(): Promise<ActorContext | null> {
        throw new Error("The store must not be called");
      },
    };

    await expect(resolveActorContextByAuthSubject("  ", store)).resolves.toBeNull();
  });

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
