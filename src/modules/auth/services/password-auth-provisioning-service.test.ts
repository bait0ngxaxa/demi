import { AuthApiError } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  ConflictError,
  InfrastructureError,
  NotFoundError,
} from "@/shared/errors/application-error";

import {
  provisionPasswordAuthIdentity,
  type PasswordAuthAdminProvider,
  type PasswordAuthProvisioningStore,
} from "./password-auth-provisioning-service";

const userId = "11111111-1111-4111-8111-111111111111";
const providerSubject = "22222222-2222-4222-8222-222222222222";
const password = "user-owned-test-password";

function createStore(
  user: { id: string; authSubject: string | null } | null = {
    id: userId,
    authSubject: null,
  },
): PasswordAuthProvisioningStore {
  return {
    findUserById: vi.fn().mockResolvedValue(user),
    setAuthSubject: vi.fn().mockResolvedValue(true),
  };
}

function createProvider(): PasswordAuthAdminProvider {
  return {
    createUser: vi.fn().mockResolvedValue({
      data: { user: { id: providerSubject } },
      error: null,
    }),
    deleteUser: vi.fn().mockResolvedValue({ error: null }),
  };
}

describe("password auth identity provisioning", () => {
  it("creates an opaque confirmed provider identity and persists its subject", async () => {
    const provider = createProvider();
    const store = createStore();

    await expect(
      provisionPasswordAuthIdentity({ userId, password }, { provider, store }),
    ).resolves.toEqual({ userId, authSubject: providerSubject });
    expect(provider.createUser).toHaveBeenCalledWith({
      email: `${userId}@auth.demi.internal`,
      password,
      email_confirm: true,
    });
    expect(store.setAuthSubject).toHaveBeenCalledWith({
      userId,
      authSubject: providerSubject,
    });
    expect(store.findUserById).toHaveBeenCalledWith(userId);
    expect(JSON.stringify(vi.mocked(store.findUserById).mock.calls)).not.toContain(password);
    expect(JSON.stringify(vi.mocked(store.setAuthSubject).mock.calls)).not.toContain(password);
    expect(provider.deleteUser).not.toHaveBeenCalled();
  });

  it("does not create another provider account for an existing mapping", async () => {
    const provider = createProvider();
    const store = createStore({ id: userId, authSubject: providerSubject });

    await expect(
      provisionPasswordAuthIdentity({ userId, password }, { provider, store }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(provider.createUser).not.toHaveBeenCalled();
    expect(store.setAuthSubject).not.toHaveBeenCalled();
  });

  it("fails when the DEMI User does not exist", async () => {
    const provider = createProvider();
    const store = createStore(null);

    await expect(
      provisionPasswordAuthIdentity({ userId, password }, { provider, store }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(provider.createUser).not.toHaveBeenCalled();
  });

  it("does not modify DEMI data when provider creation fails", async () => {
    const provider = createProvider();
    const store = createStore();
    vi.mocked(provider.createUser).mockResolvedValue({
      data: { user: null },
      error: new AuthApiError("Provider unavailable", 503, "unexpected_failure"),
    });

    await expect(
      provisionPasswordAuthIdentity({ userId, password }, { provider, store }),
    ).rejects.toBeInstanceOf(InfrastructureError);
    expect(store.setAuthSubject).not.toHaveBeenCalled();
    expect(provider.deleteUser).not.toHaveBeenCalled();
  });

  it("fails closed when the provider alias already exists", async () => {
    const provider = createProvider();
    const store = createStore();
    vi.mocked(provider.createUser).mockResolvedValue({
      data: { user: null },
      error: new AuthApiError("User already registered", 422, "user_already_exists"),
    });

    await expect(
      provisionPasswordAuthIdentity({ userId, password }, { provider, store }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(store.setAuthSubject).not.toHaveBeenCalled();
    expect(provider.deleteUser).not.toHaveBeenCalled();
  });

  it.each([
    ["missing provider user", null],
    ["invalid provider subject", { id: "not-a-provider-uuid" }],
  ])("does not persist a malformed provider response with %s", async (_label, user) => {
    const provider = createProvider();
    const store = createStore();
    vi.mocked(provider.createUser).mockResolvedValue({
      data: { user },
      error: null,
    });

    await expect(
      provisionPasswordAuthIdentity({ userId, password }, { provider, store }),
    ).rejects.toBeInstanceOf(InfrastructureError);
    expect(store.setAuthSubject).not.toHaveBeenCalled();
    expect(provider.deleteUser).not.toHaveBeenCalled();
  });

  it("cleans up the provider account when persistence fails", async () => {
    const provider = createProvider();
    const store = createStore();
    vi.mocked(store.setAuthSubject).mockRejectedValue(
      new InfrastructureError("Database unavailable"),
    );

    await expect(
      provisionPasswordAuthIdentity({ userId, password }, { provider, store }),
    ).rejects.toBeInstanceOf(InfrastructureError);
    expect(provider.deleteUser).toHaveBeenCalledOnce();
    expect(provider.deleteUser).toHaveBeenCalledWith(providerSubject);
  });

  it("reports reconciliation when persistence and provider cleanup both fail", async () => {
    const provider = createProvider();
    const store = createStore();
    vi.mocked(store.setAuthSubject).mockRejectedValue(new Error("Database unavailable"));
    vi.mocked(provider.deleteUser).mockResolvedValue({
      error: new AuthApiError("Provider unavailable", 503, "unexpected_failure"),
    });

    await expect(
      provisionPasswordAuthIdentity({ userId, password }, { provider, store }),
    ).rejects.toMatchObject({
      code: "INFRASTRUCTURE",
      message: "Password authentication identity requires provider reconciliation",
    });
  });

  it("cleans up and reports a conflict when the DEMI mapping changed concurrently", async () => {
    const provider = createProvider();
    const store = createStore();
    vi.mocked(store.setAuthSubject).mockResolvedValue(false);

    await expect(
      provisionPasswordAuthIdentity({ userId, password }, { provider, store }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(provider.deleteUser).toHaveBeenCalledOnce();
    expect(provider.deleteUser).toHaveBeenCalledWith(providerSubject);
  });
});
