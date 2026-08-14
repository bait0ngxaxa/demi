import { describe, expect, it, vi } from "vitest";

import { THAI_NATIONAL_IDENTITY_NAMESPACE } from "@/modules/identity/schemas/identity-schemas";
import { InfrastructureError } from "@/shared/errors/application-error";

import {
  resolvePasswordLoginIdentity,
  type PasswordLoginIdentityStore,
  type PasswordLoginPersonResolver,
} from "./password-login-identity-service";

const nationalId = "1000000000009";
const adminIdentifier = "DEMI-ADMIN-ROOT";
const personId = "22222222-2222-4222-8222-222222222222";
const userId = "11111111-1111-4111-8111-111111111111";

function createPersonResolver(
  result: { id: string } | null = { id: personId },
): PasswordLoginPersonResolver {
  return vi.fn().mockResolvedValue(result);
}

function createStore(
  result: { id: string; authSubject: string | null } | null = {
    id: userId,
    authSubject: "provider-subject-1",
  },
): PasswordLoginIdentityStore {
  return {
    findUserByPersonId: vi.fn().mockResolvedValue(result),
  };
}

describe("password login identity resolution", () => {
  it("resolves National ID through Person and User to an opaque provider alias", async () => {
    const findPerson = createPersonResolver();
    const store = createStore();

    await expect(
      resolvePasswordLoginIdentity(nationalId, { findPerson, store }),
    ).resolves.toEqual({
      authSubject: "provider-subject-1",
      providerLoginAlias: `${userId}@auth.demi.internal`,
    });
    expect(findPerson).toHaveBeenCalledWith({
      namespace: THAI_NATIONAL_IDENTITY_NAMESPACE,
      value: nationalId,
    });
    expect(store.findUserByPersonId).toHaveBeenCalledWith(personId);
    expect(JSON.stringify(vi.mocked(store.findUserByPersonId).mock.calls)).not.toContain(
      nationalId,
    );
  });

  it("resolves a custom first-admin identifier through the same identity namespace", async () => {
    const findPerson = createPersonResolver();
    const store = createStore();

    await expect(
      resolvePasswordLoginIdentity(adminIdentifier, { findPerson, store }),
    ).resolves.toMatchObject({
      authSubject: "provider-subject-1",
      providerLoginAlias: `${userId}@auth.demi.internal`,
    });

    expect(findPerson).toHaveBeenCalledWith({
      namespace: THAI_NATIONAL_IDENTITY_NAMESPACE,
      value: adminIdentifier,
    });
  });

  it("returns no login identity when the Person is unknown", async () => {
    const store = createStore();

    await expect(
      resolvePasswordLoginIdentity(nationalId, {
        findPerson: createPersonResolver(null),
        store,
      }),
    ).resolves.toBeNull();
    expect(store.findUserByPersonId).not.toHaveBeenCalled();
  });

  it.each([
    ["User is missing", null],
    ["provider subject is missing", { id: userId, authSubject: null }],
  ])("returns no login identity when the %s", async (_label, user) => {
    await expect(
      resolvePasswordLoginIdentity(nationalId, {
        findPerson: createPersonResolver(),
        store: createStore(user),
      }),
    ).resolves.toBeNull();
  });

  it("does not downgrade an identity database failure", async () => {
    const failure = new InfrastructureError("Identity database unavailable");
    const findPerson: PasswordLoginPersonResolver = vi.fn().mockRejectedValue(failure);

    await expect(
      resolvePasswordLoginIdentity(nationalId, { findPerson, store: createStore() }),
    ).rejects.toBe(failure);
  });
});
