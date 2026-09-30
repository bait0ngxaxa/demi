import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockedCreateClient,
  mockedGetServerEnv,
  mockedGetServerSupabaseClient,
  mockedGetSupabaseAdminClient,
  mockedCreateProviderLoginAlias,
  authenticatedAuth,
  isolatedAuth,
  adminAuth,
  authenticatedClient,
  isolatedClient,
  adminClient,
} = vi.hoisted(() => {
  const authenticatedAuth = { getUser: vi.fn() };
  const isolatedAuth = { signInWithPassword: vi.fn(), updateUser: vi.fn(), signOut: vi.fn() };
  const adminAuth = { admin: { updateUserById: vi.fn(), signOut: vi.fn() } };
  const authenticatedClient = { auth: authenticatedAuth };
  const isolatedClient = { auth: isolatedAuth };
  const adminClient = { auth: adminAuth };

  return {
    mockedCreateClient: vi.fn(() => isolatedClient),
    mockedGetServerEnv: vi.fn(() => ({
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key",
    })),
    mockedGetServerSupabaseClient: vi.fn(async () => authenticatedClient),
    mockedGetSupabaseAdminClient: vi.fn(() => adminClient),
    mockedCreateProviderLoginAlias: vi.fn((id: string) => `${id}@login.demi.invalid`),
    authenticatedAuth,
    isolatedAuth,
    adminAuth,
    authenticatedClient,
    isolatedClient,
    adminClient,
  };
});

vi.mock("@supabase/supabase-js", () => ({ createClient: mockedCreateClient }));
vi.mock("@/lib/env/server", () => ({ getServerEnv: mockedGetServerEnv }));
vi.mock("@/lib/auth/supabase-server", () => ({
  getServerSupabaseClient: mockedGetServerSupabaseClient,
}));
vi.mock("@/lib/auth/supabase-admin", () => ({ getSupabaseAdminClient: mockedGetSupabaseAdminClient }));
vi.mock("@/modules/auth/services/provider-login-alias", () => ({
  createProviderLoginAlias: mockedCreateProviderLoginAlias,
}));

import {
  replacePasswordAndRevokeRecoverySessions,
  updateAuthenticatedPassword,
} from "./supabase-account-security-provider";

const authSubject = "88888888-8888-4888-8888-888888888888";
const targetUserId = "77777777-7777-4777-8777-777777777777";

describe("Supabase account security provider boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedGetServerEnv.mockReturnValue({
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key",
    });
    mockedGetServerSupabaseClient.mockResolvedValue(authenticatedClient);
    mockedGetSupabaseAdminClient.mockReturnValue(adminClient);
    mockedCreateClient.mockReturnValue(isolatedClient);
    mockedCreateProviderLoginAlias.mockImplementation((id) => `${id}@login.demi.invalid`);
    authenticatedAuth.getUser.mockResolvedValue({ data: { user: { id: authSubject } }, error: null });
    isolatedAuth.signInWithPassword.mockResolvedValue({
      data: { user: { id: authSubject }, session: { access_token: "temporary-access-jwt" } },
      error: null,
    });
    isolatedAuth.signOut.mockResolvedValue({ data: null, error: null });
  });

  it("verifies current password in an isolated provider session before authenticated auth.updateUser", async () => {
    isolatedAuth.updateUser.mockResolvedValue({ data: { user: { id: authSubject } }, error: null });

    await expect(
      updateAuthenticatedPassword({
        userId: targetUserId,
        currentPassword: "current password",
        newPassword: "new long password",
      }),
    ).resolves.toBeUndefined();

    expect(mockedGetServerSupabaseClient).toHaveBeenCalledWith({ requireWritableCookies: true });
    expect(mockedCreateProviderLoginAlias).toHaveBeenCalledWith(targetUserId);
    expect(isolatedAuth.signInWithPassword).toHaveBeenCalledWith({
      email: `${targetUserId}@login.demi.invalid`,
      password: "current password",
    });
    expect(isolatedAuth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(isolatedAuth.updateUser).toHaveBeenCalledWith({
      password: "new long password",
      current_password: "current password",
    });
  });

  it("hides current-password provider errors behind a generic service error", async () => {
    isolatedAuth.updateUser.mockResolvedValue({
      data: { user: null },
      error: { message: "invalid current password" },
    });

    await expect(
      updateAuthenticatedPassword({
        userId: targetUserId,
        currentPassword: "secret",
        newPassword: "new long password",
      }),
    ).rejects.toMatchObject({ message: "Account password could not be changed" });
  });

  it("does not claim success when the provider returns no updated User", async () => {
    isolatedAuth.updateUser.mockResolvedValue({ data: { user: null }, error: null });

    await expect(
      updateAuthenticatedPassword({
        userId: targetUserId,
        currentPassword: "secret",
        newPassword: "new long password",
      }),
    ).rejects.toMatchObject({ message: "Account password could not be changed" });
  });

  it("does not update a different or unverifiable authenticated account", async () => {
    isolatedAuth.signInWithPassword.mockResolvedValue({
      data: { user: { id: "99999999-9999-4999-8999-999999999999" }, session: { access_token: "other" } },
      error: null,
    });

    await expect(
      updateAuthenticatedPassword({
        userId: targetUserId,
        currentPassword: "secret",
        newPassword: "new long password",
      }),
    ).rejects.toMatchObject({ message: "Account password could not be changed" });
    expect(isolatedAuth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(isolatedAuth.updateUser).not.toHaveBeenCalled();
  });

  it("replaces the selected auth identity and globally signs out through an isolated client", async () => {
    adminAuth.admin.updateUserById.mockResolvedValue({
      data: { user: { id: authSubject } },
      error: null,
    });
    isolatedAuth.signInWithPassword.mockResolvedValue({
      data: { user: { id: authSubject }, session: { access_token: "target-access-jwt" } },
      error: null,
    });
    adminAuth.admin.signOut.mockResolvedValue({ data: null, error: null });

    await expect(
      replacePasswordAndRevokeRecoverySessions({
        userId: targetUserId,
        authSubject,
        newPassword: "new long password",
      }),
    ).resolves.toBeUndefined();

    expect(adminAuth.admin.updateUserById).toHaveBeenCalledWith(authSubject, {
      password: "new long password",
    });
    expect(mockedCreateProviderLoginAlias).toHaveBeenCalledWith(targetUserId);
    expect(isolatedAuth.signInWithPassword).toHaveBeenCalledWith({
      email: `${targetUserId}@login.demi.invalid`,
      password: "new long password",
    });
    expect(adminAuth.admin.signOut).toHaveBeenCalledWith("target-access-jwt", "global");
    expect(isolatedAuth.signOut).not.toHaveBeenCalled();
    expect(mockedCreateClient).toHaveBeenCalledWith(
      "https://project.supabase.co",
      "public-anon-key",
      {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
      },
    );
  });

  it("does not claim global invalidation when isolated authentication or sign-out is ambiguous", async () => {
    adminAuth.admin.updateUserById.mockResolvedValue({
      data: { user: { id: authSubject } },
      error: null,
    });
    isolatedAuth.signInWithPassword.mockResolvedValue({
      data: { user: { id: authSubject }, session: { access_token: "target-access-jwt" } },
      error: null,
    });
    adminAuth.admin.signOut.mockResolvedValue({
      data: null,
      error: { message: "global revoke unavailable" },
    });

    await expect(
      replacePasswordAndRevokeRecoverySessions({
        userId: targetUserId,
        authSubject,
        newPassword: "new long password",
      }),
    ).rejects.toMatchObject({ message: "Account recovery could not be completed" });
    expect(adminAuth.admin.signOut).toHaveBeenCalledWith("target-access-jwt", "global");
  });
});
