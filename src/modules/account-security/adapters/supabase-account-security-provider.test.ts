import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockedCreateClient,
  mockedGetServerEnv,
  mockedGetServerSupabaseClient,
  mockedGetSupabaseAdminClient,
  mockedCreateProviderLoginAlias,
  mockedCreateProviderResetLoginAlias,
  mockedGetPrisma,
  authenticatedAuth,
  isolatedAuth,
  adminAuth,
  authenticatedClient,
  isolatedClient,
  adminClient,
} = vi.hoisted(() => {
  const authenticatedAuth = { getUser: vi.fn() };
  const isolatedAuth = { signInWithPassword: vi.fn(), updateUser: vi.fn(), signOut: vi.fn() };
  const adminAuth = { admin: { updateUserById: vi.fn(), createUser: vi.fn(), deleteUser: vi.fn(), signOut: vi.fn() } };
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
    mockedCreateProviderResetLoginAlias: vi.fn((userId: string, resetId: string) => `${userId}.${resetId}@auth.demi.internal`),
    mockedGetPrisma: vi.fn(() => ({ user: { findUnique: vi.fn(async () => ({ authSubject: "88888888-8888-4888-8888-888888888888", providerLoginAlias: null })) } })),
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
vi.mock("@/lib/db/prisma", () => ({ getPrisma: mockedGetPrisma }));
vi.mock("@/lib/auth/supabase-admin", () => ({ getSupabaseAdminClient: mockedGetSupabaseAdminClient }));
vi.mock("@/modules/auth/services/provider-login-alias", () => ({
  createProviderLoginAlias: mockedCreateProviderLoginAlias,
  createProviderResetLoginAlias: mockedCreateProviderResetLoginAlias,
}));

import {
  deleteReplacedProviderIdentity,
  replacePasswordAndRevokeRecoverySessions,
  revokeProviderSessionsBySuspension,
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
    mockedCreateProviderResetLoginAlias.mockImplementation((userId, resetId) => `${userId}.${resetId}@auth.demi.internal`);
    mockedGetPrisma.mockImplementation(() => ({ user: { findUnique: vi.fn(async () => ({ authSubject, providerLoginAlias: null })) } }));
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

  it("creates a new provider identity bound to the reset operation id", async () => {
    const replacementSubject = "99999999-9999-4999-8999-999999999999";
    adminAuth.admin.createUser.mockResolvedValue({ data: { user: { id: replacementSubject } }, error: null });

    await expect(replacePasswordAndRevokeRecoverySessions({
      userId: targetUserId,
      resetId: "66666666-6666-4666-8666-666666666666",
      authSubject,
      newPassword: "new long password",
    })).resolves.toEqual({
      authSubject: replacementSubject,
      providerLoginAlias: `${targetUserId}.66666666-6666-4666-8666-666666666666@auth.demi.internal`,
    });
    expect(adminAuth.admin.createUser).toHaveBeenCalledWith({
      email: `${targetUserId}.66666666-6666-4666-8666-666666666666@auth.demi.internal`,
      password: "new long password",
      email_confirm: true,
    });
  });

  it("deletes the previous provider identity and treats an ambiguous delete as failure", async () => {
    adminAuth.admin.deleteUser.mockResolvedValueOnce({ error: null }).mockRejectedValueOnce(new Error("network"));
    await expect(deleteReplacedProviderIdentity(authSubject)).resolves.toBeUndefined();
    await expect(deleteReplacedProviderIdentity(authSubject)).rejects.toMatchObject({ code: "INFRASTRUCTURE" });
    expect(adminAuth.admin.deleteUser).toHaveBeenCalledTimes(2);
  });
});

describe("suspected takeover provider session revocation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetSupabaseAdminClient.mockImplementation(() => adminClient);
  });

  it("confirms only when the provider returns the exact banned subject", async () => {
    adminAuth.admin.updateUserById.mockResolvedValueOnce({ data: { user: { id: authSubject } }, error: null });

    await expect(revokeProviderSessionsBySuspension(authSubject)).resolves.toBe("CONFIRMED");
    expect(adminAuth.admin.updateUserById).toHaveBeenCalledWith(authSubject, { ban_duration: "876000h" });
  });

  it.each([
    ["a provider error", { data: { user: null }, error: new Error("unavailable") }],
    ["a different subject", { data: { user: { id: targetUserId } }, error: null }],
  ])("reports %s as ambiguous", async (_label, response) => {
    adminAuth.admin.updateUserById.mockResolvedValueOnce(response);

    await expect(revokeProviderSessionsBySuspension(authSubject)).resolves.toBe("AMBIGUOUS");
  });

  it("reports a thrown provider call as ambiguous", async () => {
    adminAuth.admin.updateUserById.mockRejectedValueOnce(new Error("network"));

    await expect(revokeProviderSessionsBySuspension(authSubject)).resolves.toBe("AMBIGUOUS");
  });
});
