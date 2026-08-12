import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { ConflictError, ValidationError } from "@/shared/errors/application-error";

import {
  createPerson,
  findPersonByIdentity,
  hashIdentityReference,
  resolvePerson,
  type IdentityStore,
  type PersonRecord,
} from "./identity-service";

function createMemoryStore(): IdentityStore {
  const persons = new Map<string, PersonRecord>();
  let sequence = 0;

  return {
    async findPersonByIdentityHash(identityKeyHash): Promise<PersonRecord | null> {
      return persons.get(identityKeyHash) ?? null;
    },
    async createPerson(input): Promise<PersonRecord> {
      if (persons.has(input.identityKeyHash)) {
        throw new ConflictError("A person with this identity already exists");
      }

      const now = new Date();
      const person: PersonRecord = {
        id: `person-${++sequence}`,
        identityKeyHash: input.identityKeyHash,
        givenName: input.givenName ?? null,
        familyName: input.familyName ?? null,
        createdAt: now,
        updatedAt: now,
      };

      persons.set(input.identityKeyHash, person);
      return person;
    },
  };
}

describe("identity service", () => {
  it("uses a deterministic keyed HMAC lookup key", () => {
    const identity = { namespace: "Trusted-Registry", value: " person-a " };
    const expected = createHmac(
      "sha256",
      "test-only-identity-hash-secret-32-characters",
    )
      .update("trusted-registry\u0000person-a", "utf8")
      .digest("hex");

    expect(hashIdentityReference(identity)).toBe(expected);
  });

  it("reuses the existing Person for a known identity", async () => {
    const store = createMemoryStore();
    const input = {
      identity: { namespace: "trusted-registry", value: "person-a" },
      givenName: "A",
    };

    const first = await resolvePerson(input, store);
    const second = await resolvePerson({ ...input, givenName: "Changed" }, store);

    expect(second.id).toBe(first.id);
    expect(second.givenName).toBe("A");
  });

  it("does not let createPerson bypass identity resolution", async () => {
    const store = createMemoryStore();
    const input = {
      identity: { namespace: "trusted-registry", value: "person-a" },
    };

    await createPerson(input, store);

    await expect(createPerson(input, store)).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects missing identity information instead of fabricating a key", async () => {
    const store = createMemoryStore();

    await expect(
      resolvePerson({ identity: { namespace: "", value: "" } }, store),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("finds a known Person without creating another record", async () => {
    const store = createMemoryStore();
    const input = {
      identity: { namespace: "trusted-registry", value: "person-a" },
    };
    const created = await createPerson(input, store);

    const found = await findPersonByIdentity(input.identity, store);

    expect(found?.id).toBe(created.id);
  });
});
