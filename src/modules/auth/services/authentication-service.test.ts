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
  type PasswordLoginIdentityResolver,
} from "./authentication-service";

const mockedGetServerSupabaseClient = vi.hoisted(() => vi.fn());
const mockedThrottle = vi.hoisted(() => ({
  isBlocked: vi.fn().mockResolvedValue(false),
  recordFailure: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/auth/supabase-server", () => ({
  getServerSupabaseClient: mockedGetServerSupabaseClient,
}));
vi.mock("./auth-attempt-throttle-service", () => ({ createAuthAttemptThrottle: () => mockedThrottle }));

const activeUser: ActorUserRecord = {
  id: "user-1",
  personId: "person-1",
  status: UserStatus.ACTIVE,
  roles: [],
  hospitalMemberships: [],
  osmHospitalRelationships: [],
};

const loginInput = {
  nationalId: "1000000000009",
  password: "valid-password",
};

const resolvedLoginIdentity = {
  authSubject: "provider-user-1",
  providerLoginAlias: "11111111-1111-4111-8111-111111111111@auth.demi.internal",
};

function createLoginIdentityResolver(
  result: typeof resolvedLoginIdentity | null = resolvedLoginIdentity,
): PasswordLoginIdentityResolver {
  return vi.fn().mockResolvedValue(result);
}

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
    mockedThrottle.isBlocked.mockResolvedValue(false);
    mockedThrottle.recordFailure.mockResolvedValue(undefined);
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
        { ...loginInput, password: "wrong-password" },
        { provider, actorStore: store, resolveLoginIdentity: createLoginIdentityResolver() },
      ),
    ).resolves.toEqual({ status: "INVALID_CREDENTIALS" });
    expect(store.findUserByAuthSubject).not.toHaveBeenCalled();
  });

  it("does not look up the identity or call Supabase after a throttle block", async () => {
    const provider = createProvider();
    const resolveLoginIdentity = createLoginIdentityResolver();
    mockedThrottle.isBlocked.mockResolvedValue(true);

    await expect(authenticateWithPassword(loginInput, {
      provider,
      actorStore: createStore(),
      resolveLoginIdentity,
      clientIpAddress: "192.0.2.1",
    })).resolves.toEqual({ status: "INVALID_CREDENTIALS" });

    expect(resolveLoginIdentity).not.toHaveBeenCalled();
    expect(provider.signInWithPassword).not.toHaveBeenCalled();
  });

  it("does not downgrade a provider failure to invalid credentials", async () => {
    const provider = createProvider();
    vi.mocked(provider.signInWithPassword).mockResolvedValue({
      data: { user: null },
      error: new AuthApiError("Provider unavailable", 503, "unexpected_failure"),
    });

    await expect(
      authenticateWithPassword(
        loginInput,
        {
          provider,
          actorStore: createStore(),
          resolveLoginIdentity: createLoginIdentityResolver(),
        },
      ),
    ).rejects.toBeInstanceOf(InfrastructureError);
  });

  it("validates the provider identity and DEMI actor after successful authentication", async () => {
    const provider = createProvider();
    const store = createStore();

    const result = await authenticateWithPassword(
      loginInput,
      { provider, actorStore: store, resolveLoginIdentity: createLoginIdentityResolver() },
    );

    expect(result).toEqual({
      status: "AUTHORIZED",
      actor: {
        userId: "user-1",
        personId: "person-1",
        roles: [],
        hospitalMemberships: [],
        osmHospitalRelationships: [],
      },
    });
    expect(provider.getUser).toHaveBeenCalledOnce();
    expect(provider.signInWithPassword).toHaveBeenCalledWith({
      email: resolvedLoginIdentity.providerLoginAlias,
      password: loginInput.password,
    });
    expect(store.findUserByAuthSubject).toHaveBeenCalledWith("provider-user-1");
  });

  it("returns the same invalid-credentials result for an unknown National ID", async () => {
    const provider = createProvider();
    vi.mocked(provider.signInWithPassword).mockResolvedValue({
      data: { user: null },
      error: new AuthApiError("Invalid login credentials", 400, "invalid_credentials"),
    });

    await expect(
      authenticateWithPassword(loginInput, {
        provider,
        actorStore: createStore(),
        resolveLoginIdentity: createLoginIdentityResolver(null),
      }),
    ).resolves.toEqual({ status: "INVALID_CREDENTIALS" });
    expect(provider.signInWithPassword).toHaveBeenCalledWith({
      email: "invalid-login@auth.demi.internal",
      password: loginInput.password,
    });
  });

  it("gives existing and unknown identities the same failure response and throttles both", async () => {
    const knownProvider = createProvider();
    const unknownProvider = createProvider();
    for (const provider of [knownProvider, unknownProvider]) {
      vi.mocked(provider.signInWithPassword).mockResolvedValue({
        data: { user: null },
        error: new AuthApiError("Invalid login credentials", 400, "invalid_credentials"),
      });
    }

    const knownResult = await authenticateWithPassword(loginInput, {
      provider: knownProvider,
      actorStore: createStore(),
      resolveLoginIdentity: createLoginIdentityResolver(),
      clientIpAddress: "192.0.2.1",
    });
    const unknownResult = await authenticateWithPassword(loginInput, {
      provider: unknownProvider,
      actorStore: createStore(),
      resolveLoginIdentity: createLoginIdentityResolver(null),
      clientIpAddress: "192.0.2.1",
    });

    expect(knownResult).toEqual(unknownResult);
    expect(knownResult).toEqual({ status: "INVALID_CREDENTIALS" });
    expect(mockedThrottle.recordFailure).toHaveBeenCalledTimes(2);
  });

  it("fails closed when provider authentication returns an unexpected subject", async () => {
    const provider = createProvider();
    const store = createStore();
    const resolveLoginIdentity = createLoginIdentityResolver({
      ...resolvedLoginIdentity,
      authSubject: "expected-provider-user",
    });

    await expect(
      authenticateWithPassword(loginInput, {
        provider,
        actorStore: store,
        resolveLoginIdentity,
      }),
    ).resolves.toEqual({
      status: "APPLICATION_ACCESS_DENIED",
      reason: "SUBJECT_MISMATCH",
    });
    expect(store.findUserByAuthSubject).not.toHaveBeenCalled();
    expect(provider.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("does not downgrade an identity lookup infrastructure failure", async () => {
    const provider = createProvider();
    const failure = new InfrastructureError("Identity database unavailable");
    const resolveLoginIdentity: PasswordLoginIdentityResolver = vi.fn().mockRejectedValue(failure);

    await expect(
      authenticateWithPassword(loginInput, {
        provider,
        actorStore: createStore(),
        resolveLoginIdentity,
      }),
    ).rejects.toBe(failure);
    expect(provider.signInWithPassword).not.toHaveBeenCalled();
  });

  it("uses a writable cookie context for provider-backed login", async () => {
    const provider = createProvider();
    mockedGetServerSupabaseClient.mockResolvedValue({ auth: provider });

    await expect(
      authenticateWithPassword(
        loginInput,
        {
          actorStore: createStore(),
          resolveLoginIdentity: createLoginIdentityResolver(),
        },
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
        loginInput,
        {
          provider,
          actorStore: createStore(null),
          resolveLoginIdentity: createLoginIdentityResolver(),
        },
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
          loginInput,
          {
            provider,
            actorStore: createStore({ ...activeUser, status }),
            resolveLoginIdentity: createLoginIdentityResolver(),
          },
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
        loginInput,
        { provider, actorStore: store, resolveLoginIdentity: createLoginIdentityResolver() },
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
