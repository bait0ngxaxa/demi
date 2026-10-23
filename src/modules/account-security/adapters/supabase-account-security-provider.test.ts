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
  const adminAuth = { admin: { updateUserById: vi.fn(), createUser: vi.fn(), deleteUser: vi.fn(), signOut: vi.fn(), getUserById: vi.fn(), listUsers: vi.fn() } };
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

vi.mock("@supabase/supabase-js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@supabase/supabase-js")>()),
  createClient: mockedCreateClient,
}));
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

import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";

import {
  deleteReplacedProviderIdentity,
  findProviderIdentityByLoginAlias,
  ProviderIdentityRejectedError,
  providerIdentityExists,
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

  it("treats a provider user that is already gone as deleted", async () => {
    adminAuth.admin.deleteUser.mockResolvedValue({ data: { user: null }, error: new AuthApiError("User not found", 404, "user_not_found") });
    await expect(deleteReplacedProviderIdentity(authSubject)).resolves.toBeUndefined();
  });

  it("separates definite createUser rejections from ambiguous outcomes", async () => {
    const input = { userId: targetUserId, resetId: "66666666-6666-4666-8666-666666666666", authSubject, newPassword: "new long password" };
    adminAuth.admin.createUser.mockResolvedValueOnce({ data: { user: null }, error: new AuthApiError("Password is known to be weak", 422, "weak_password") });
    await expect(replacePasswordAndRevokeRecoverySessions(input)).rejects.toEqual(expect.objectContaining({ name: "ProviderIdentityRejectedError", reason: "PASSWORD_POLICY" }));
    adminAuth.admin.createUser.mockResolvedValueOnce({ data: { user: null }, error: new AuthApiError("Invalid", 400, "validation_failed") });
    await expect(replacePasswordAndRevokeRecoverySessions(input)).rejects.toBeInstanceOf(ProviderIdentityRejectedError);

    for (const error of [
      new AuthApiError("Email exists", 422, "email_exists"),
      new AuthApiError("Degraded", 500, "unexpected_failure"),
      new AuthApiError("Rate limited", 429, "over_request_rate_limit"),
      new AuthRetryableFetchError("fetch failed", 0),
    ]) {
      adminAuth.admin.createUser.mockResolvedValueOnce({ data: { user: null }, error });
      const rejection = replacePasswordAndRevokeRecoverySessions(input);
      await expect(rejection).rejects.toMatchObject({ code: "INFRASTRUCTURE" });
      await expect(rejection).rejects.not.toBeInstanceOf(ProviderIdentityRejectedError);
    }
    adminAuth.admin.createUser.mockRejectedValueOnce(new Error("socket hang up"));
    await expect(replacePasswordAndRevokeRecoverySessions(input)).rejects.toMatchObject({ code: "INFRASTRUCTURE" });
  });

  it("confirms provider identity presence only by exact subject or user_not_found", async () => {
    adminAuth.admin.getUserById
      .mockResolvedValueOnce({ data: { user: { id: authSubject } }, error: null })
      .mockResolvedValueOnce({ data: { user: null }, error: new AuthApiError("User not found", 404, "user_not_found") })
      .mockResolvedValueOnce({ data: { user: null }, error: new AuthApiError("Degraded", 500, "unexpected_failure") });
    await expect(providerIdentityExists(authSubject)).resolves.toBe(true);
    await expect(providerIdentityExists(authSubject)).resolves.toBe(false);
    await expect(providerIdentityExists(authSubject)).rejects.toMatchObject({ code: "INFRASTRUCTURE" });
  });

  it("finds the replacement by alias across pages and treats a failed page as ambiguous", async () => {
    const alias = `${targetUserId}.66666666-6666-4666-8666-666666666666@auth.demi.internal`;
    const fullPage = Array.from({ length: 1000 }, (_, index) => ({ id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`, email: `other-${index}@auth.demi.internal` }));
    adminAuth.admin.listUsers
      .mockResolvedValueOnce({ data: { users: fullPage }, error: null })
      .mockResolvedValueOnce({ data: { users: [{ id: "99999999-9999-4999-8999-999999999999", email: alias }] }, error: null });
    await expect(findProviderIdentityByLoginAlias(alias)).resolves.toEqual({ authSubject: "99999999-9999-4999-8999-999999999999" });
    expect(adminAuth.admin.listUsers).toHaveBeenNthCalledWith(2, { page: 2, perPage: 1000 });

    adminAuth.admin.listUsers.mockResolvedValueOnce({ data: { users: [] }, error: null });
    await expect(findProviderIdentityByLoginAlias(alias)).resolves.toBeNull();

    adminAuth.admin.listUsers
      .mockResolvedValueOnce({ data: { users: fullPage }, error: null })
      .mockResolvedValueOnce({ data: { users: [] }, error: new AuthApiError("Degraded", 500, "unexpected_failure") });
    await expect(findProviderIdentityByLoginAlias(alias)).rejects.toMatchObject({ code: "INFRASTRUCTURE" });
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
