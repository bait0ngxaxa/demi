import { UserStatus } from "@prisma/client";
import { AuthApiError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InfrastructureError } from "@/shared/errors/application-error";

import {
  resolveCurrentActorAccess,
  type ActorContextStore,
  type ActorUserRecord,
} from "./actor-context-service";
import {
  authenticateWithPassword,
  signOutCurrentSession,
  type PasswordAuthenticationProvider,
} from "./authentication-service";

const mockedGetServerSupabaseClient = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/supabase-server", () => ({
  getServerSupabaseClient: mockedGetServerSupabaseClient,
}));

const activeUser: ActorUserRecord = {
  id: "user-1",
  personId: "person-1",
  status: UserStatus.ACTIVE,
  roles: [],
  hospitalMemberships: [],
};

function createStore(record: ActorUserRecord | null = activeUser): ActorContextStore {
  return {
    findUserByAuthSubject: vi.fn().mockResolvedValue(record),
  };
}

function createProvider(): PasswordAuthenticationProvider {
  return {
    signInWithPassword: vi.fn().mockResolvedValue({
      data: { user: { id: "provider-user-1" } },
      error: null,
    }),
    getUser: vi.fn().mockResolvedValue({
      data: { user: { id: "provider-user-1" } },
      error: null,
    }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
  };
}

describe("password authentication service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a safe invalid-credentials result", async () => {
    const provider = createProvider();
    vi.mocked(provider.signInWithPassword).mockResolvedValue({
      data: { user: null },
      error: new AuthApiError("Invalid login credentials", 400, "invalid_credentials"),
    });
    const store = createStore();

    await expect(
      authenticateWithPassword(
        { email: "user@example.com", password: "wrong-password" },
        { provider, actorStore: store },
      ),
    ).resolves.toEqual({ status: "INVALID_CREDENTIALS" });
    expect(store.findUserByAuthSubject).not.toHaveBeenCalled();
  });

  it("does not downgrade a provider failure to invalid credentials", async () => {
    const provider = createProvider();
    vi.mocked(provider.signInWithPassword).mockResolvedValue({
      data: { user: null },
      error: new AuthApiError("Provider unavailable", 503, "unexpected_failure"),
    });

    await expect(
      authenticateWithPassword(
        { email: "user@example.com", password: "valid-password" },
        { provider, actorStore: createStore() },
      ),
    ).rejects.toBeInstanceOf(InfrastructureError);
  });

  it("validates the provider identity and DEMI actor after successful authentication", async () => {
    const provider = createProvider();
    const store = createStore();

    const result = await authenticateWithPassword(
      { email: "user@example.com", password: "valid-password" },
      { provider, actorStore: store },
    );

    expect(result).toEqual({
      status: "AUTHORIZED",
      actor: {
        userId: "user-1",
        personId: "person-1",
        roles: [],
        hospitalMemberships: [],
      },
    });
    expect(provider.getUser).toHaveBeenCalledOnce();
    expect(store.findUserByAuthSubject).toHaveBeenCalledWith("provider-user-1");
  });

  it("uses a writable cookie context for provider-backed login", async () => {
    const provider = createProvider();
    mockedGetServerSupabaseClient.mockResolvedValue({ auth: provider });

    await expect(
      authenticateWithPassword(
        { email: "user@example.com", password: "valid-password" },
        { actorStore: createStore() },
      ),
    ).resolves.toMatchObject({ status: "AUTHORIZED" });

    expect(mockedGetServerSupabaseClient).toHaveBeenCalledWith({
      requireWritableCookies: true,
    });
  });

  it("uses a writable cookie context and local scope for provider-backed logout", async () => {
    const provider = createProvider();
    mockedGetServerSupabaseClient.mockResolvedValue({ auth: provider });

    await signOutCurrentSession();

    expect(mockedGetServerSupabaseClient).toHaveBeenCalledWith({
      requireWritableCookies: true,
    });
    expect(provider.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("denies and signs out a provider user with no mapped DEMI account", async () => {
    const provider = createProvider();

    await expect(
      authenticateWithPassword(
        { email: "user@example.com", password: "valid-password" },
        { provider, actorStore: createStore(null) },
      ),
    ).resolves.toEqual({ status: "APPLICATION_ACCESS_DENIED", reason: "UNMAPPED" });
    expect(provider.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it.each([UserStatus.PROVISIONED, UserStatus.INVITED, UserStatus.SUSPENDED])(
    "denies and signs out a mapped %s DEMI account",
    async (status) => {
      const provider = createProvider();

      await expect(
        authenticateWithPassword(
          { email: "user@example.com", password: "valid-password" },
          { provider, actorStore: createStore({ ...activeUser, status }) },
        ),
      ).resolves.toEqual({
        status: "APPLICATION_ACCESS_DENIED",
        reason: "ACCOUNT_NOT_ACTIVE",
      });
      expect(provider.signOut).toHaveBeenCalledWith({ scope: "local" });
    },
  );

  it("does not downgrade an actor lookup infrastructure failure", async () => {
    const provider = createProvider();
    const store: ActorContextStore = {
      async findUserByAuthSubject(): Promise<ActorUserRecord | null> {
        throw new InfrastructureError("Database unavailable");
      },
    };

    await expect(
      authenticateWithPassword(
        { email: "user@example.com", password: "valid-password" },
        { provider, actorStore: store },
      ),
    ).rejects.toBeInstanceOf(InfrastructureError);
  });

  it("makes the current session unusable after logout", async () => {
    let hasSession = true;
    const provider = createProvider();
    vi.mocked(provider.getUser).mockImplementation(async () => ({
      data: { user: hasSession ? { id: "provider-user-1" } : null },
      error: null,
    }));
    vi.mocked(provider.signOut).mockImplementation(async () => {
      hasSession = false;
      return { error: null };
    });

    await signOutCurrentSession(provider);

    expect(provider.signOut).toHaveBeenCalledWith({ scope: "local" });

    await expect(resolveCurrentActorAccess(createStore(), provider)).resolves.toEqual({
      status: "UNAUTHENTICATED",
    });
  });

  it("does not terminate another session during local logout", async () => {
    let currentSessionAvailable = true;
    const otherSessionAvailable = true;
    const provider = createProvider();
    vi.mocked(provider.signOut).mockImplementation(async (options) => {
      if (options?.scope !== "local") {
        throw new Error("logout scope must be local");
      }

      currentSessionAvailable = false;
      return { error: null };
    });

    await signOutCurrentSession(provider);

    expect(currentSessionAvailable).toBe(false);
    expect(otherSessionAvailable).toBe(true);
  });

  it("does not report logout success when the provider fails", async () => {
    const provider = createProvider();
    vi.mocked(provider.signOut).mockResolvedValue({
      error: new AuthApiError("Provider unavailable", 503, "unexpected_failure"),
    });

    await expect(signOutCurrentSession(provider)).rejects.toBeInstanceOf(InfrastructureError);
  });
});
